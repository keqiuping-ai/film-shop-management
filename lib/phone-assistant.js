'use strict';
const crypto = require('node:crypto');
const {createPhoneRealtime,streamUrl}=require('./phone-realtime');
const PREFIX = '/api/phone-assistant';
const TEST_NUMBER = '+16265864446';
const TERMINAL = new Set(['completed','canceled','failed','busy','no-answer']);
const xml = value => String(value ?? '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const say = text => `<Say language="zh-CN" voice="Polly.Zhiyu">${xml(text)}</Say>`;
const response = body => `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
const hangup = text => response(say(text) + '<Hangup/>');
const phone = value => { const n=String(value||'').replace(/[\s()-]/g,''); return /^\+1\d{10}$/.test(n)?n:''; };
const fail = (code,message) => Object.assign(new Error(message),{statusCode:code});
function createPhoneAssistant({getConfig, aiReply, readRawBody, readBody, send, validateSignature, now=Date.now, fetchImpl=globalThis.fetch,realtimeConfig,realtimeService}) {
 const sessions=new Map();
 const realtime=realtimeService||(realtimeConfig?createPhoneRealtime({getConfig:realtimeConfig,now}):null);
 const retentionTimer=setInterval(()=>clean(),60000);retentionTimer.unref?.();
 function clean(){for(const [id,s] of sessions)if(now()-s.createdAt>3_600_000){s.streamShutdown?.();sessions.delete(id);};}
 function config(){const c=getConfig();return {...c,allowedNumbers:[TEST_NUMBER],baseUrl:String(c.baseUrl||'').replace(/\/$/,'')};}
 function configured(c){return Boolean(c.aiConfigured&&c.accountSid&&c.authToken&&phone(c.fromNumber)&&/^https:\/\//.test(c.baseUrl));}
 function snapshot(s){return {id:s.id,task:s.task,to:s.to,from:s.from,createdAt:s.createdAt,status:s.status,callSid:s.callSid||'',duration:s.duration||0,voiceMode:s.voiceMode,audioStats:s.audioStats||null,consented:s.consented,turn:s.turn,transcript:s.transcript,error:s.error||'',report:report(s)};}
 function report(s){return `QUAD FILM 中文电话测试汇报\n${s.started?'这是实际电话测试，非模拟。服务商状态不证明由本人接听。':'尚未真实拨号。'}\n任务：${s.task.goal}\n背景（用户提供、未核实）：${s.task.background}\n必问问题：\n${s.task.questions}\n授权边界：${s.task.boundary}\n先问用户：${s.task.escalation}\n语音模式：${s.voiceMode==='realtime'?'实时自然语音（可插话）':'逐句识别与播报'}\n主叫：${s.from}\n被叫：${s.to}\n服务商状态：${s.status}\n接听后同意语音识别：${s.consented?'已按1同意':'尚未同意'}\n通话时长：${s.duration||0} 秒\n${s.audioStats?`实时语音连接：${s.audioStats.connected?'连接中':'已断开'}；插话清音次数：${s.audioStats.interruptions}；模型首段音频生成等待（毫秒，非用户听到的总延迟）：${s.audioStats.firstAudioMs.join('、')||'暂无'}\n`:''}\n逐轮记录（识别文字可能有误；AI回答并非外部业务事实）：\n${s.transcript.map(x=>`${x.role==='user'?'用户（识别）':'AI'}：${x.text}${x.interrupted?'（被打断，部分生成内容可能未听到）':''}`).join('\n')}\n\n回答状态：本次只测试中文对话；所有真实报价、档期和外部联系结果均未知。\n下一步：核对识别内容和中文声音；正式对外业务需另行授权。\n待用户确认：预订、付款、接受报价、折扣批准、合同变更均未执行。\n${s.error?'测试异常：'+s.error:''}`;}
 function hook(s,kind,turn=s.turn){return `${s.baseUrl}${PREFIX}/hooks/${s.id}/${kind}?turn=${turn}`;}
 function listen(s,text){return response(`${say(text)}<Gather input="speech dtmf" language="cmn-Hans-CN" speechModel="googlev2_chirp_3" speechTimeout="2" timeout="8" numDigits="1" actionOnEmptyResult="true" action="${xml(hook(s,'gather'))}" method="POST"/>`);}
 function wait(s,turn=s.turn){return response(`<Pause length="2"/><Redirect method="POST">${xml(hook(s,'wait',turn))}</Redirect>`);}
 function ended(s){return s.canceled||TERMINAL.has(s.status)||now()-s.createdAt>900_000;}
 function end(s,text){s.logicalEnded=true;return hangup(text);}
 async function twilio(c,path,form){
  const r=await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.accountSid)}/${path}`,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${c.accountSid}:${c.authToken}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:(()=>{const b=new URLSearchParams();for(const [k,v] of Object.entries(form))for(const item of Array.isArray(v)?v:[v])b.append(k,item);return b;})(),signal:AbortSignal.timeout(12000)});
  const data=await r.json();if(!r.ok)throw fail(502,`电话服务拒绝请求（${Number(data.code)||r.status}）`);return data;
 }
 async function publicRoute(req,res,url){
  const match=url.pathname.match(/^\/api\/phone-assistant\/hooks\/([a-f0-9]{36})\/(answer|consent|gather|wait|status)$/);if(!match)return false;
  if(req.method!=='POST'){send(res,405,{error:'仅支持 POST'});return true;}
  const raw=await readRawBody(req,20000);const params=Object.fromEntries(new URLSearchParams(raw));
  if(!validateSignature(req,params)){send(res,403,{error:'Invalid signature'});return true;}
  const s=sessions.get(match[1]);const c=config();
  if(!s){send(res,200,hangup('测试已过期，请重新发起。'),'text/xml; charset=utf-8');return true;}
  if(params.AccountSid!==c.accountSid||phone(params.To)!==s.to||phone(params.From)!==s.from||!/^CA[a-f0-9]{32}$/.test(params.CallSid||'')||(s.callSid&&s.callSid!==params.CallSid)){send(res,403,{error:'Call mismatch'});return true;}
  s.callSid=params.CallSid;
  const kind=match[2];const turn=Number(url.searchParams.get('turn'));
  const reply=body=>send(res,200,body,'text/xml; charset=utf-8');
  if(kind==='status'){
   const status=String(params.CallStatus||'');const seq=Number(params.SequenceNumber);
   if((!Number.isFinite(seq)||seq>=(s.statusSeq??-1))&&(!TERMINAL.has(s.status)||TERMINAL.has(status))){if(Number.isFinite(seq))s.statusSeq=seq;if(['queued','initiated','ringing','in-progress',...TERMINAL].includes(status))s.status=status;}
   if(TERMINAL.has(s.status))s.streamShutdown?.();
   if(params.CallDuration&&/^\d+$/.test(params.CallDuration))s.duration=Number(params.CallDuration);
   reply(response(''));return true;
  }
  if(ended(s)||s.logicalEnded){reply(hangup('本次测试已结束。'));return true;}
  if(kind==='answer'){
   reply(response(`<Gather input="dtmf" numDigits="1" timeout="10" action="${xml(hook(s,'consent',0))}" method="POST">${say(s.voiceMode==='realtime'?'您好，这是QUAD中文AI测试。语音将交给电话和OpenAI服务处理，本系统不存录音，文字保留一小时。同意请按1。':'您好，这是QUAD FILM中文AI电话测试。说话将由电话服务识别为文字，并交给OpenAI生成回答。不保存录音，文字记录保留一小时。同意请按1，不同意请直接挂断。')}</Gather><Hangup/>`));return true;
  }
  if(kind==='consent'){
   if(params.Digits!=='1'){reply(end(s,'未确认同意，测试结束。'));return true;}
   s.consented=true;if(s.voiceMode==='realtime'){if(s.streamClaimed){reply(hangup('测试音频已连接，请勿重复启动。'));return true;}s.streamToken=s.streamToken||crypto.randomBytes(24).toString('hex');reply(response(`<Connect><Stream url="${xml(streamUrl(s))}"><Parameter name="token" value="${s.streamToken}"/></Stream></Connect><Hangup/>`));return true;}reply(listen(s,'柯老板您好，请用中文说一句话。每次说完稍等，我会回答。说结束测试或按9可以退出。'));return true;
  }
  if(!s.consented){reply(end(s,'尚未同意识别语音，测试结束。'));return true;}
  if(kind==='wait'){
   if(s.turnResults.has(turn)){reply(s.turnResults.get(turn));return true;}
   if(turn!==s.turn){reply(hangup('会话已更新，测试结束。'));return true;}
   if(s.pending){if(now()-s.pendingAt>35000){s.generation++;s.pending=false;s.error='AI 响应超时';reply(end(s,'AI回复超时，请稍后重新测试。'));}else reply(wait(s));}
   else if(s.replyXml)reply(s.replyXml);else reply(end(s,'会话状态已失效。'));
   return true;
  }
  if(turn!==s.turn){const cached=s.turnResults.get(turn);reply(cached||hangup('重复或过期的请求，测试结束。'));return true;}
  if(s.pending){reply(wait(s));return true;}
  if(params.Digits==='9'||/^(?:结束(?:测试|通话)?|停止(?:测试|通话)?|挂断(?:电话)?|再见)[。！!\s]*$/.test(String(params.SpeechResult||'').trim())){reply(end(s,'好的，测试结束。请在页面查看文字记录，再见。'));return true;}
  const text=String(params.SpeechResult||'').trim().slice(0,1500);
  if(!text){s.silence++;if(s.silence>=2)reply(end(s,'连续没有听到内容，测试结束。'));else reply(listen(s,'没有听清，请再说一句中文。'));return true;}
  s.silence=0;if(s.turn>=8){reply(end(s,'已达到八轮测试上限，再见。'));return true;}
  s.transcript.push({role:'user',text});s.pending=true;s.pendingAt=now();const generation=++s.generation;const current=s.turn;
  // Return promptly; Twilio voice webhooks have a short response deadline.
  Promise.resolve().then(()=>aiReply({task:s.task,messages:s.transcript.slice(-16)})).then(answer=>{
   if(s.generation!==generation||s.canceled||s.logicalEnded||ended(s))return;
   const spoken=String(answer||'').trim().slice(0,350);if(!spoken)throw new Error('empty');
   s.transcript.push({role:'assistant',text:spoken});s.turn++;s.replyXml=listen(s,spoken);s.turnResults.set(current,s.replyXml);s.pending=false;
  }).catch(()=>{if(s.generation!==generation||s.canceled||ended(s))return;s.pending=false;s.error='AI 服务暂不可用，未生成有效回答';s.logicalEnded=true;s.replyXml=hangup('AI服务暂时不可用，本次测试结束。');});
  reply(wait(s,current));return true;
 }
 async function adminRoute(req,res,url,user){
  if(!url.pathname.startsWith(PREFIX+'/'))return false;
  if(user?.role!=='owner'){send(res,403,{error:'仅老板可使用电话测试'});return true;}
  clean();const c=config();
  try{
   if(req.method==='GET'&&url.pathname===PREFIX+'/config'){send(res,200,{ready:configured(c)&&(!realtime||realtime.checked()),realtime:Boolean(realtime),aiConfigured:Boolean(c.aiConfigured),phoneConfigured:Boolean(c.accountSid&&c.authToken&&phone(c.fromNumber)),from:c.fromNumber,allowedNumbers:c.allowedNumbers,mode:realtime?'中文实时自然语音':'中文逐句对话测试',retention:'文字记录仅在服务器内存保留一小时；重启会丢失；不录音。'});return true;}
   if(req.method==='POST'&&url.pathname===PREFIX+'/realtime-check'){if(!configured(c)||!realtime)throw fail(503,'实时语音或原有服务配置不完整');const result=await realtime.probe();send(res,result.ok?200:503,result.ok?result:{error:result.error});return true;}
   if(req.method==='POST'&&url.pathname===PREFIX+'/sessions'){
    if(!configured(c))throw fail(503,'AI、电话或 HTTPS 回调配置不完整');
    const b=await readBody(req);if(b.to!==TEST_NUMBER)throw fail(400,'当前只允许已授权的测试号码');
    if([...sessions.values()].some(s=>s.started&&!TERMINAL.has(s.status)&&now()-s.createdAt<900_000))throw fail(409,'已有测试正在进行，请先结束');
    if(sessions.size>=100)throw fail(429,'测试记录过多，请稍后再试');
    const task={};for(const field of ['goal','background','questions','boundary','escalation']){if(typeof b[field]!=='string'||!b[field].trim()||b[field].length>3000)throw fail(400,'请完整填写任务、背景、问题、边界和确认条件');task[field]=b[field].trim();}
    const s={id:crypto.randomBytes(18).toString('hex'),createdAt:now(),owner:user.id,to:b.to,from:phone(c.fromNumber),baseUrl:c.baseUrl,task,voiceMode:realtime?'realtime':'turn-based',status:'ready',transcript:[],turn:0,turnResults:new Map(),generation:0,silence:0,consented:false,started:false};sessions.set(s.id,s);send(res,201,snapshot(s));return true;
   }
   const match=url.pathname.match(/^\/api\/phone-assistant\/sessions\/([a-f0-9]{36})(?:\/(start|cancel|report))?$/);if(!match)throw fail(404,'找不到电话测试接口');
   const s=sessions.get(match[1]);if(!s||s.owner!==user.id)throw fail(404,'测试不存在或已过期');
   if(req.method==='GET'&&!match[2]){send(res,200,snapshot(s));return true;}
   if(req.method==='GET'&&match[2]==='report'){send(res,200,report(s),'text/plain; charset=utf-8');return true;}
   if(req.method==='POST'&&match[2]==='start'){
    const body=await readBody(req);if(body.confirm!==true)throw fail(400,'请确认真实拨号');
    if(s.started){send(res,200,snapshot(s));return true;}
    if(realtime&&!realtime.checked())throw fail(409,'请先检查实时语音服务，再确认拨号');
    if(ended(s))throw fail(409,'测试已结束');
    if([...sessions.values()].some(other=>other.id!==s.id&&other.started&&!TERMINAL.has(other.status)&&now()-other.createdAt<900_000))throw fail(409,'已有测试进行中');
    s.started=true;s.status='starting';
    try{const result=await twilio(c,'Calls.json',{To:s.to,From:s.from,Url:hook(s,'answer'),Method:'POST',StatusCallback:hook(s,'status'),StatusCallbackMethod:'POST','StatusCallbackEvent':['initiated','ringing','answered','completed'],Timeout:'20',TimeLimit:'180',Record:'false'});if(!/^CA[a-f0-9]{32}$/.test(result.sid||''))throw new Error('invalid call response');if(!s.callSid)s.callSid=result.sid;if(s.status==='starting')s.status=result.status||'queued';if(s.canceled){try{await twilio(c,`Calls/${s.callSid}.json`,{Status:'canceled'});s.status='canceled';}catch{s.status='cancel-unknown';s.error='终止未确认，请直接挂断并核对日志';}}}
    catch(e){s.error=e.statusCode?'电话服务拒绝请求':'外呼结果未知，请核对Twilio日志，勿重复拨号';s.status=e.statusCode?'failed':'start-unknown';}
    send(res,200,snapshot(s));return true;
   }
   if(req.method==='POST'&&match[2]==='cancel'){
    if(TERMINAL.has(s.status)){send(res,200,snapshot(s));return true;}
    s.canceled=true;s.streamShutdown?.();s.generation++;s.pending=false;
    if(s.callSid){try{await twilio(c,`Calls/${s.callSid}.json`,{Status:['ready','starting','queued','ringing','initiated'].includes(s.status)?'canceled':'completed'});s.status='canceled';}catch{s.error='终止请求未确认，请直接挂断并核对Twilio日志';s.status='cancel-unknown';}}
    else if(!s.started)s.status='canceled';else{s.status='cancel-unknown';s.error='电话尚无可核实ID，请直接挂断；系统不会自动重试。';}
    send(res,200,snapshot(s));return true;
   }
   throw fail(405,'请求方法不支持');
  }catch(e){send(res,e.statusCode||500,{error:e.statusCode?e.message:'电话测试异常，请稍后重试'});return true;}
 }
 return {publicRoute,adminRoute,attach(server){realtime?.attach(server,id=>{const s=sessions.get(id);return s&&s.started&&s.consented&&s.voiceMode==='realtime'&&!ended(s)&&!s.logicalEnded&&s.streamToken?s:null;});}};
}
module.exports={createPhoneAssistant,xml,phone};
