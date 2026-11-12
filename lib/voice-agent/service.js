'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {providers,phone,xml,twiml,signature,equal}=require('./providers');
const {rules,reportRules,validatePlan,evidenceReport,validateTask,localDate}=require('./planning');
const {createPhoneRealtime,streamUrl}=require('./realtime');
const BASE='/api/voice-agent';
const terminal=new Set(['completed','failed','busy','no-answer','canceled','simulated']);
const active=c=>!terminal.has(c.status);
const error=(status,message)=>Object.assign(Error(message),{status});
const audit=(s,action,actor,data={})=>s.audit.push({id:crypto.randomUUID(),at:new Date().toISOString(),action,actor,...data});
async function body(req,limit=20000){let data='';for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>limit)throw error(413,'请求过大');}return data;}
function send(res,status,value,type='application/json; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(type.startsWith('application/json')?JSON.stringify(value):value);}
async function createService({store,getConfig,authorize,provider,WebSocketImpl}){
 const p=provider||providers(getConfig);const sessions=new Map();let tickBusy=false;
 const persist=s=>store.mutate(db=>{const c=db.calls.find(c=>c.id===s.id);if(c){c.transcript=structuredClone(s.transcript);c.usage=s.usage||[];c.audioStats=s.audioStats;c.error=s.error||c.error;}}).catch(()=>{s.error='文字记录保存失败，已停止通话';s.streamShutdown?.();});
 const realtime=createPhoneRealtime({getConfig,WebSocketImpl,onChange:persist,onClose:s=>{persist(s).then(()=>{const timer=setTimeout(()=>finalize(s.id).catch(()=>{}),2500);timer.unref?.();});}});
 function ready(){const c=getConfig();return Boolean(c.liveEnabled&&c.apiKey&&c.accountSid&&c.authToken&&phone(c.fromNumber)&&/^https:\/\//.test(c.baseUrl));}
 function hook(c,kind){return getConfig().baseUrl+BASE+'/hooks/'+c.id+'/'+kind;}
 async function generateReport(id){const db=await store.read(),c=db.calls.find(x=>x.id===id);if(!c||!terminal.has(c.status)||c.reportStatus==='ready')return;
  await store.mutate(s=>{s.calls.find(x=>x.id===id).reportStatus='generating';});
  try{let report;if(!c.transcript.some(x=>x.role==='user'))report={summary_zh:'没有取得已同意处理的对方发言，无法确认报价、预约或任务完成。',completed:false,facts:[],follow_up_zh:['核实接听及同意情况'],next_step_zh:'由老板决定是否重新联系。'};
   else report=evidenceReport(await p.json(reportRules,{transcript:c.transcript,telephonyStatus:c.status}),c);
   await store.mutate(s=>{const x=s.calls.find(x=>x.id===id);x.report={...report,generatedAt:new Date().toISOString(),mode:c.mode};x.reportStatus='ready';audit(s,'report.generated','system',{callId:id});});
  }catch{await store.mutate(s=>{const x=s.calls.find(x=>x.id===id);x.reportStatus='failed';x.reportError='中文报告生成失败；英文原文已保留，可手动重试。';});}
 }
 async function cost(id){try{const db=await store.read(),c=db.calls.find(x=>x.id===id);if(!c?.sid||c.mode!=='live')return;const d=await p.twilio('Calls/'+c.sid+'.json');await store.mutate(s=>{const x=s.calls.find(x=>x.id===id);x.duration=Number(d.duration)||x.duration||0;x.providerPrice=d.price===null||d.price===undefined?null:Math.abs(Number(d.price));x.priceUnit=d.price_unit||'USD';x.costStatus=x.providerPrice===null?'pending':'available';});}catch{await store.mutate(s=>{s.calls.find(x=>x.id===id).costStatus='unavailable';});}}
 async function finalize(id){await store.mutate(s=>{const c=s.calls.find(x=>x.id===id);if(!c||terminal.has(c.status))return;if(!c.sid){c.error=c.error||'外呼结果未知，需核对Twilio；不会自动重拨';c.status='start-unknown';return;}});const db=await store.read(),c=db.calls.find(x=>x.id===id);if(!c)return;if(terminal.has(c.status)){await generateReport(id);await cost(id);} }
 async function stopCall(id,actor='owner'){
  let c=await store.mutate(s=>{const c=s.calls.find(x=>x.id===id);if(!c)throw error(404,'通话不存在');c.stopRequested=true;audit(s,'call.stop',actor,{callId:id});return c;});
  sessions.get(id)?.streamShutdown?.();
  if(!terminal.has(c.status)){
   if(c.sid){try{await p.twilio('Calls/'+c.sid+'.json',{Status:['queued','initiated','ringing'].includes(c.status)?'canceled':'completed'});await store.mutate(s=>{const x=s.calls.find(x=>x.id===id);x.status='canceled';x.endedAt=new Date().toISOString();const task=s.tasks.find(t=>t.id===x.taskId);if(task)task.status='canceled';});}catch{await store.mutate(s=>{const x=s.calls.find(x=>x.id===id);x.status='stop-unknown';x.error='服务商尚未确认挂断，请核对Twilio控制台';});}}
   else await store.mutate(s=>{const x=s.calls.find(x=>x.id===id);x.error='外呼ID尚未返回；已标记停止，取得ID后立即挂断。';});
  }
  await finalize(id);
 }
 async function start(id,actor='owner'){
  if(!ready())throw error(503,'真实外呼未启用，或门店现有AI/电话/HTTPS配置不可用');
  const cfg=getConfig();const db=await store.read();const task=db.tasks.find(x=>x.id===id);if(!task)throw error(404,'任务不存在');
  if(![...(cfg.allowedNumbers||[]),...(db.authorizedNumbers||[])].includes(task.to))throw error(403,'接听号码不在服务器人工授权白名单中');
  const probe=await realtime.probe();if(!probe.ok)throw error(503,probe.error);
  const c=await store.mutate(s=>{
   const t=s.tasks.find(x=>x.id===id);if(s.stopped)throw error(409,'外呼紧急开关处于关闭状态');if(t.status!=='ready'||!t.approved||t.plan.missing.length)throw error(409,'任务须完成解析、补齐资料并确认英文目标');
   if(!s.employees.find(e=>e.id===t.employee)?.enabled)throw error(403,'员工已停用');
   const existing=s.calls.find(x=>x.taskId===id&&x.mode==='live');if(existing)throw error(409,'此任务已有拨号记录；系统不会重复拨打');
   if(s.calls.some(active))throw error(409,'已有进行中或结果未知的通话，须先核对');
   if(s.calls.some(x=>x.to===t.to&&Date.now()-Date.parse(x.createdAt)<30*60000&&x.mode==='live'))throw error(429,'同号码30分钟内不重复拨打');
   const today=s.calls.filter(x=>x.mode==='live'&&localDate(new Date(x.createdAt))===localDate());
   const reserve=Math.ceil(s.limits.maxSeconds/60)*s.limits.reservePerMinute;
   if(today.length>=s.limits.dailyCalls||today.reduce((n,x)=>n+x.budgetReservation,0)+reserve>s.limits.dailyBudget)throw error(429,'已到今日通话数量或保守预算上限');
   const c={id:crypto.randomBytes(18).toString('hex'),taskId:t.id,to:t.to,from:cfg.fromNumber,company:t.company,ownerId:t.ownerId,mode:'live',createdAt:new Date().toISOString(),status:'starting',transcript:[],consented:false,duration:0,budgetReservation:reserve,maxSeconds:s.limits.maxSeconds,providerPrice:null,costStatus:'pending',reportStatus:'pending'};
   s.calls.push(c);t.status='running';audit(s,'call.start',actor,{callId:c.id,taskId:id,to:t.to});return c;
  });
  try{
   const before=await store.read();if(before.stopped||before.calls.find(x=>x.id===c.id).stopRequested){await store.mutate(s=>{const call=s.calls.find(x=>x.id===c.id);call.status='canceled';s.tasks.find(t=>t.id===call.taskId).status='canceled';});return c;}
   const d=await p.twilio('Calls.json',{To:c.to,From:c.from,Url:hook(c,'answer'),Method:'POST',StatusCallback:hook(c,'status'),StatusCallbackMethod:'POST',StatusCallbackEvent:['initiated','ringing','answered','completed'],Timeout:20,TimeLimit:c.maxSeconds,Record:false,MachineDetection:'Enable'});
   if(!/^CA[a-f0-9]{32}$/i.test(d.sid||''))throw Error('invalid sid');
   const updated=await store.mutate(s=>{const x=s.calls.find(x=>x.id===c.id);if(x.sid&&x.sid!==d.sid)throw Error('sid mismatch');x.sid=d.sid;if(x.status==='starting')x.status=d.status||'queued';return x;});
   if(updated.stopRequested||(await store.read()).stopped)await stopCall(c.id);
  }catch(e){await store.mutate(s=>{const x=s.calls.find(x=>x.id===c.id);if(!terminal.has(x.status)){x.status=e.definitive?'failed':'start-unknown';if(e.definitive)s.tasks.find(t=>t.id===x.taskId).status='failed';x.error=e.definitive?'服务商拒绝外呼':'外呼结果未知，禁止自动重试；请核对Twilio日志';}});}
  await finalize(c.id);return (await store.read()).calls.find(x=>x.id===c.id);
 }
 async function webhook(req,res,url){
  const m=url.pathname.match(/^\/api\/voice-agent\/hooks\/([a-f0-9]{36})\/(answer|consent|status)$/);if(!m)return false;
  if(req.method!=='POST'){send(res,405,{error:'POST required'});return true;}
  const params=Object.fromEntries(new URLSearchParams(await body(req)));const cfg=getConfig();
  if(!cfg.authToken||!equal(req.headers['x-twilio-signature'],signature(cfg.authToken,cfg.baseUrl+url.pathname+url.search,params))){send(res,403,{error:'Invalid signature'});return true;}
  let db=await store.read(),c=db.calls.find(x=>x.id===m[1]);
  if(!c||params.AccountSid!==cfg.accountSid||phone(params.To)!==c.to||phone(params.From)!==c.from||!/^CA[a-f0-9]{32}$/i.test(params.CallSid||'')||(c.sid&&c.sid!==params.CallSid)){send(res,403,{error:'Call mismatch'});return true;}
  const reply=x=>send(res,200,twiml(x),'text/xml; charset=utf-8');
  if(m[2]==='status'){
   await store.mutate(s=>{const x=s.calls.find(x=>x.id===c.id);x.sid=params.CallSid;const seq=Number(params.SequenceNumber);if(!Number.isInteger(seq)||seq<(x.seq??-1)||terminal.has(x.status))return;x.seq=seq;const st=params.CallStatus;if(['queued','initiated','ringing','in-progress',...terminal].includes(st))x.status=st;if(params.CallDuration&&/^\d+$/.test(params.CallDuration))x.duration=Number(params.CallDuration);if(st==='in-progress')x.startedAt=x.startedAt||new Date().toISOString();if(terminal.has(x.status)){x.endedAt=new Date().toISOString();const t=s.tasks.find(t=>t.id===x.taskId);t.status=x.status==='completed'?'finished':'failed';audit(s,'call.ended','twilio',{callId:x.id,status:x.status});}});
   reply('');const nowCall=(await store.read()).calls.find(x=>x.id===c.id);if(terminal.has(nowCall.status)){sessions.get(c.id)?.streamShutdown?.();await persistIfSession(c.id);sessions.delete(c.id);await finalize(c.id);}return true;
  }
  if(db.stopped||c.stopRequested||terminal.has(c.status)){reply('<Hangup/>');return true;}
  await store.mutate(s=>{s.calls.find(x=>x.id===c.id).sid=params.CallSid;});c.sid=params.CallSid;
  if(m[2]==='answer'){
   if(params.AnsweredBy&&params.AnsweredBy!=='human'){await store.mutate(s=>{s.calls.find(x=>x.id===c.id).answeringMachine=params.AnsweredBy;});reply('<Hangup/>');return true;}
   reply(`<Gather input="dtmf" numDigits="1" timeout="10" action="${xml(hook(c,'consent'))}" method="POST"><Say language="en-US">Hello, this is an AI assistant calling on behalf of QUAD. With your permission, this conversation will be processed by our phone and AI providers, and a written transcript will be saved. We do not record audio. Press 1 to agree, or hang up to decline.</Say></Gather><Hangup/>`);return true;
  }
  if(params.Digits!=='1'){reply('<Hangup/>');return true;}
  if(sessions.has(c.id)){reply('<Hangup/>');return true;}
  const s={...c,callSid:c.sid,baseUrl:cfg.baseUrl,task:db.tasks.find(t=>t.id===c.taskId).plan,streamToken:crypto.randomBytes(24).toString('hex'),turn:0,transcript:[]};sessions.set(c.id,s);
  await store.mutate(db=>{const c=db.calls.find(x=>x.id===s.id);c.consented=true;c.consentAt=new Date().toISOString();audit(db,'call.consent','callee',{callId:s.id});});
  reply(`<Connect><Stream url="${xml(streamUrl(s))}"><Parameter name="token" value="${s.streamToken}"/></Stream></Connect><Hangup/>`);return true;
 }
 async function persistIfSession(id){if(sessions.has(id))await persist(sessions.get(id));}
 async function handle(req,res){const url=new URL(req.url,'http://local');if(!url.pathname.startsWith(BASE+'/')&&url.pathname!==BASE)return false;
  try{
   if(await webhook(req,res,url))return true;
   const identity=await authorize(req);if(!identity){send(res,401,{error:'请先登录有业务权限的账号'});return true;}
   const actor=typeof identity==='string'?identity:String(identity.id);const admin=typeof identity==='string'?['owner','local-demo'].includes(identity):identity.role==='owner';const canSee=x=>admin||x.ownerId===actor;
   // Avoid cookie-authenticated cross-origin writes; never trust forwarded host.
   const origin=req.headers.origin;if(req.method!=='GET'&&origin){const expected=getConfig().browserOrigin||getConfig().baseUrl;if(expected&&origin!==expected)throw error(403,'跨域操作被拒绝');}
   const b=req.method==='POST'||req.method==='PUT'?JSON.parse(await body(req)||'{}'):{};
   if(req.method==='GET'&&url.pathname===BASE){const db=await store.read(),c=getConfig();send(res,200,{...db,viewer:{id:actor,admin},tasks:db.tasks.filter(canSee),calls:db.calls.filter(canSee),searches:(db.searches||[]).filter(canSee),audit:admin?db.audit:db.audit.filter(x=>x.actor===actor),authorizedNumbers:admin?(db.authorizedNumbers||[]):[],config:{demo:Boolean(c.demo),ready:ready(),from:c.fromNumber,allowedNumbers:c.allowedNumbers||[],aiConfigured:Boolean(c.apiKey),phoneConfigured:Boolean(c.accountSid&&c.authToken),liveEnabled:Boolean(c.liveEnabled),storage:store.databaseUrl?'PostgreSQL':'本地持久化文件（仅单实例）',timezone:'America/Los_Angeles'}});return true;}
   if(req.method==='POST'&&url.pathname===BASE+'/stop-mine'){for(const c of (await store.read()).calls.filter(x=>x.ownerId===actor&&active(x)))await stopCall(c.id,actor);send(res,200,{ok:true});return true;}
   if(req.method==='POST'&&url.pathname===BASE+'/authorize-number'){if(!admin)throw error(403,'仅老板可授权真实接听号码');const to=phone(b.to);if(!to||b.confirm!==true)throw error(400,'须人工核实美国号码并确认授权');await store.mutate(s=>{s.authorizedNumbers=s.authorizedNumbers||[];if(!s.authorizedNumbers.includes(to))s.authorizedNumbers.push(to);audit(s,'number.authorized',actor,{to});});send(res,200,{ok:true});return true;}
   if(req.method==='POST'&&url.pathname===BASE+'/search'){if(typeof b.query!=='string'||!b.query.trim()||b.query.length>2000)throw error(400,'请输入2000字以内查找要求');const record=await store.mutate(s=>{s.searches=s.searches||[];if(s.searches.filter(x=>x.ownerId===actor&&localDate(new Date(x.createdAt))===localDate()).length>=20)throw error(429,'今日AI查找已到20次上限');const r={id:crypto.randomUUID(),ownerId:actor,query:b.query.trim(),createdAt:new Date().toISOString(),status:'searching'};s.searches.push(r);audit(s,'search.started',actor,{searchId:r.id});return r;});try{const result=await p.search(record.query);await store.mutate(s=>Object.assign(s.searches.find(x=>x.id===record.id),result,{status:'completed'}));send(res,200,{...record,...result,status:'completed'});}catch{await store.mutate(s=>{const x=s.searches.find(x=>x.id===record.id);x.status='failed';x.error='联网查找未完成；请检查现有AI模型的搜索权限或更换关键词';});throw error(502,'联网查找失败，未编造公司或电话号码；记录已保存');}return true;}
   if(req.method==='POST'&&url.pathname===BASE+'/tasks'){
    let t;try{t=validateTask(b);}catch(e){throw error(400,e.message);}const input={...t,localDate:localDate(),timezone:'America/Los_Angeles'};let plan;try{plan=validatePlan(await p.json(rules,input));}catch{throw error(502,'任务解析失败；请检查门店现有AI服务和模型权限');}
    const task={...t,ownerId:actor,id:crypto.randomUUID(),createdAt:new Date().toISOString(),plan,status:'draft',approved:false};await store.mutate(s=>{s.tasks.push(task);audit(s,'task.created',actor,{taskId:task.id});});send(res,201,task);return true;
   }
   const m=url.pathname.match(/^\/api\/voice-agent\/tasks\/([a-f0-9-]+)\/(approve|start|simulate|cancel)$/);
   if(req.method==='POST'&&m){const task=(await store.read()).tasks.find(x=>x.id===m[1]&&canSee(x));if(!task)throw error(404,'任务不存在');
    if(m[2]==='approve'){if(b.confirm!==true)throw error(400,'须确认英文目标和外呼授权');await store.mutate(s=>{const t=s.tasks.find(x=>x.id===m[1]);if(!t)throw error(404,'任务不存在');if(t.status!=='draft'||t.plan.missing.length)throw error(409,'任务缺少资料或已执行，请补齐后重新创建');t.approved=true;t.status='ready';t.approvedAt=new Date().toISOString();audit(s,'task.approved',actor,{taskId:t.id});});send(res,200,{ok:true});return true;}
    if(m[2]==='start'){if(b.confirmRealCall!==true)throw error(400,'须确认真实外呼');send(res,200,await start(m[1],actor));return true;}
    if(m[2]==='simulate'){const c=await store.mutate(s=>{const t=s.tasks.find(x=>x.id===m[1]);if(!t)throw error(404,'任务不存在');const c={id:crypto.randomBytes(18).toString('hex'),taskId:t.id,ownerId:t.ownerId,company:t.company,to:t.to,mode:'simulation',status:'simulated',createdAt:new Date().toISOString(),endedAt:new Date().toISOString(),duration:0,budgetReservation:0,providerPrice:0,reportStatus:'ready',transcript:[{id:'fixture-user',role:'user',text:'This is a simulated test. No real availability or price is confirmed.',at:new Date().toISOString()}],report:{summary_zh:'模拟流程测试已结束，未拨打电话，未取得真实报价或预约。',completed:false,facts:[],follow_up_zh:['需要授权的真人通话验收'],next_step_zh:'配置并核验测试接听号码。'}};s.calls.push(c);audit(s,'call.simulated',actor,{callId:c.id});return c;});send(res,200,c);return true;}
    await store.mutate(s=>{const t=s.tasks.find(x=>x.id===m[1]);if(!t)throw error(404,'任务不存在');if(t.status==='running')throw error(409,'请使用停止通话');t.status='canceled';t.approved=false;audit(s,'task.canceled',actor,{taskId:t.id});});send(res,200,{ok:true});return true;
   }
   const cm=url.pathname.match(/^\/api\/voice-agent\/calls\/([a-f0-9]{36})\/(stop|report|cost|reconcile)$/);
   if(req.method==='POST'&&cm){const c=(await store.read()).calls.find(x=>x.id===cm[1]);if(!c||!canSee(c))throw error(404,'通话不存在');if(cm[2]==='stop')await stopCall(c.id,actor);else if(cm[2]==='cost')await cost(c.id);else if(cm[2]==='report'){await store.mutate(s=>{s.calls.find(x=>x.id===c.id).reportStatus='pending';});await generateReport(c.id);}else {
     if(!c.sid)throw error(409,'未知拨号无CallSid，须人工核对Twilio日志；系统不会重拨');const d=await p.twilio('Calls/'+c.sid+'.json');if(d.to!==c.to||d.from!==c.from)throw error(409,'服务商号码不匹配');await store.mutate(s=>{const x=s.calls.find(x=>x.id===c.id);if(['queued','ringing','in-progress','initiated',...terminal].includes(d.status))x.status=d.status;if(terminal.has(x.status))x.endedAt=x.endedAt||new Date().toISOString();const task=s.tasks.find(t=>t.id===x.taskId);if(terminal.has(x.status))task.status=x.status==='completed'?'finished':x.status==='canceled'?'canceled':'failed';audit(s,'call.reconciled',actor,{callId:c.id,status:x.status});});await finalize(c.id);
    }send(res,200,{ok:true});return true;}
   if(req.method==='POST'&&url.pathname===BASE+'/control'){
    if(!admin)throw error(403,'仅老板可管理全局外呼开关');if(typeof b.stopped!=='boolean')throw error(400,'开关参数无效');await store.mutate(s=>{s.stopped=b.stopped;if(b.stopped)for(const t of s.tasks)if(t.scheduledAt&&t.status==='ready'){t.approved=false;t.status='draft';}audit(s,b.stopped?'outbound.disabled':'outbound.enabled',actor);});if(b.stopped){for(const c of (await store.read()).calls.filter(active))await stopCall(c.id,actor);}send(res,200,{ok:true});return true;
   }
   if(req.method==='POST'&&url.pathname===BASE+'/employee'){if(!admin)throw error(403,'仅老板可管理AI员工权限');if(typeof b.enabled!=='boolean')throw error(400,'参数无效');await store.mutate(s=>{s.employees[0].enabled=b.enabled;audit(s,'employee.permission',actor,{enabled:b.enabled});});send(res,200,{ok:true});return true;}
   throw error(404,'接口不存在');
  }catch(e){send(res,e.status||500,{error:e.status?e.message:'操作失败；数据已保留，请核对服务状态'});return true;}
 }
 async function tick(){if(tickBusy)return;tickBusy=true;try{const db=await store.read();if(!db.stopped&&ready()){const t=db.tasks.find(x=>x.approved&&x.status==='ready'&&x.scheduledAt&&Date.parse(x.scheduledAt)<=Date.now());if(t){if(Date.now()-Date.parse(t.scheduledAt)>15*60000)await store.mutate(s=>{const task=s.tasks.find(x=>x.id===t.id);task.status='draft';task.approved=false;task.scheduleError='错过执行时间超过15分钟，请重新确认';audit(s,'schedule.expired','scheduler',{taskId:t.id});});else try{await start(t.id,'scheduler');}catch{}}}for(const c of db.calls){if(terminal.has(c.status)&&c.reportStatus==='pending')await generateReport(c.id);if(active(c)&&Date.now()-Date.parse(c.createdAt)>(c.maxSeconds||180)*1000+60000&&c.sid)await stopCall(c.id,'watchdog');}}finally{tickBusy=false;}}
 const timer=setInterval(()=>tick().catch(()=>{}),10000);timer.unref();
 return {handle,start,stopCall,generateReport,tick,realtime,attach(server){realtime.attach(server,id=>sessions.get(id)||null);},async close(){clearInterval(timer);for(const s of sessions.values())s.streamShutdown?.();await store.close();}};
}
module.exports={createService,body,send};
