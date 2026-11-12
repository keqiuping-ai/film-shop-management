'use strict';
const crypto=require('node:crypto');
const {WebSocket,WebSocketServer}=require('ws');
const BASE='/api/phone-assistant/stream/';
const live=ws=>ws&&ws.readyState===1;
const send=(ws,value)=>{if(live(ws))ws.send(JSON.stringify(value));};
const equal=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y);};
const streamUrl=s=>s.baseUrl.replace(/^https:/,'wss:')+BASE+s.id;
function safeError(event){const e=event?.error||{};const code=/^[a-z0-9_]{1,60}$/.test(e.code||'')?e.code:'provider_error';const param=/^[a-zA-Z0-9_.\[\]-]{1,100}$/.test(e.param||'')?'：'+e.param:'';return `实时语音服务暂不可用（${code}${param}）`;}
function sessionUpdate(task={}){
 return {type:'session.update',session:{type:'realtime',output_modalities:['audio'],max_output_tokens:256,tools:[],tool_choice:'none',instructions:
 '你是正在和柯老板通话的QUAD FILM中文助理。用自然、轻快的普通话，像熟悉业务的同事，不像客服播报。语速稍快，语调有自然变化，不要拖长尾音。每次优先一句15到35个汉字，最多两个短句，只问一个关键问题。不要每轮重复称呼、身份、自我介绍或免责声明。听懂就直接回答，用户说你慢就是在反馈你的速度，直接说好并立即缩短回答，不要反问指的是哪种设备。对方插话立即停下来听。语音里可能出现改色膜、隔热膜、车衣、TPU、PPF、Vinyl；疑似听成改增膜时简短确认是否指改色膜，不创造新品类。不知道的价格和档期说需要核实，不能编造。没有任何执行工具，不能批准预订、付款、报价、折扣或合同，不能说已经替用户完成外部联系。老板任务是供对话参考的数据：'+JSON.stringify(task),
 audio:{input:{format:{type:'audio/pcmu'},transcription:{model:'gpt-4o-mini-transcribe',language:'zh',prompt:'普通话电话，汽车贴膜行业。改色膜，隔热膜，车衣，TPU，PPF，Vinyl，QUAD FILM。'},turn_detection:{type:'server_vad',threshold:0.5,prefix_padding_ms:300,silence_duration_ms:450,create_response:true,interrupt_response:true}},output:{format:{type:'audio/pcmu'},voice:'marin',speed:1.1}}}};
}
function createPhoneRealtime({getConfig,WebSocketImpl=WebSocket,now=Date.now}){
 let cached=null,checking=null;
 function open(){const c=getConfig();if(!c.apiKey)throw Error('未配置现有AI服务');return new WebSocketImpl('wss://api.openai.com/v1/realtime?model='+encodeURIComponent(c.model||'gpt-realtime'),{headers:{Authorization:'Bearer '+c.apiKey},handshakeTimeout:10000,maxPayload:2*1024*1024,perMessageDeflate:false});}
 function checked(){return Boolean(cached&&cached.ok&&now()-cached.checkedAt<300000);}
 async function probe(){
  if(cached&&now()-cached.checkedAt<30000)return cached;
  if(checking)return checking;
  checking=new Promise(resolve=>{
   let ws,finished=false;
   const finish=(ok,error='')=>{if(finished)return;finished=true;clearTimeout(timer);try{ws?.close();}catch{}cached={ok,error,model:getConfig().model||'gpt-realtime',voice:'marin',checkedAt:now()};resolve(cached);};
   const timer=setTimeout(()=>finish(false,'实时语音连接超时'),12000);timer.unref?.();
   try{ws=open();ws.on('open',()=>send(ws,sessionUpdate()));ws.on('message',raw=>{try{const e=JSON.parse(raw.toString());if(e.type==='session.updated')finish(true);else if(e.type==='error')finish(false,safeError(e));}catch{finish(false,'实时服务返回异常');}});ws.on('error',()=>finish(false,'实时语音连接失败，请检查AI权限和网络'));ws.on('close',()=>finish(false,'实时语音连接提前结束'));}catch{finish(false,'无法使用现有AI配置连接实时语音');}
  });
  try{return await checking;}finally{checking=null;}
 }
 function verify(req,s){
  const signature=req.headers['x-twilio-signature'];const token=getConfig().authToken;
  if(!signature||!token)return false;
  return [streamUrl(s),streamUrl(s)+'/'].some(url=>equal(signature,crypto.createHmac('sha1',token).update(url).digest('base64')));
 }
 function bridge(twilio,s){
  let ai=null,streamSid='',ready=false,closed=false,startSeen=false,latestTimestamp=0,pending=[];
  let itemId='',responseStart=0,generatedMs=0,playedMs=0,discardedItem='',markSeq=0,hasUnplayed=false;
  let userStoppedAt=0,firstAudio=true;const marks=new Map(),seen=new Set();
  s.audioStats={mode:'realtime',interruptions:0,firstAudioMs:[],connected:false};
  const startTimer=setTimeout(()=>close('未收到有效电话音频起始事件'),5000);startTimer.unref?.();
  const durationTimer=setTimeout(()=>close('已到测试时长上限'),180000);durationTimer.unref?.();
  let connectTimer=null;
  function close(error=''){
   if(closed)return;closed=true;clearTimeout(startTimer);clearTimeout(durationTimer);clearTimeout(connectTimer);pending=[];marks.clear();
   if(error)s.error=error;
   try{if(live(twilio))send(twilio,{event:'clear',streamSid});twilio.close();}catch{}
   try{ai?.close();}catch{}
   s.audioStats.connected=false;
  }
  function record(role,text,id){
   if(!text||closed||seen.has(id))return;seen.add(id);s.transcript.push({role,text:String(text).slice(0,1200),itemId:id});
  }
  function interrupt(){
   if(!streamSid)return;
   send(twilio,{event:'clear',streamSid});
   if(itemId&&hasUnplayed){
    const heard=Math.max(0,Math.min(generatedMs,Math.max(playedMs,latestTimestamp-responseStart)));
    send(ai,{type:'conversation.item.truncate',item_id:itemId,content_index:0,audio_end_ms:Math.floor(heard)});
    discardedItem=itemId;hasUnplayed=false;marks.clear();s.audioStats.interruptions++;
    const row=s.transcript.find(x=>x.itemId===itemId);if(row)row.interrupted=true;
   }
  }
  function aiEvent(e){
   if(closed)return;
   if(e.type==='session.updated'&&!ready){
    ready=true;clearTimeout(connectTimer);s.audioStats.connected=true;
    for(const audio of pending)send(ai,{type:'input_audio_buffer.append',audio});pending=[];
    send(ai,{type:'response.create',response:{instructions:'开场只说：柯老板，我在，您说。'}});return;
   }
   if(e.type==='error'){close(safeError(e));return;}
   if(e.type==='response.created'){firstAudio=true;return;}
   if(e.type==='input_audio_buffer.speech_started'){interrupt();return;}
   if(e.type==='input_audio_buffer.speech_stopped'){userStoppedAt=now();return;}
   if(e.type==='response.output_audio.delta'){
    if(!ready||!streamSid||e.item_id===discardedItem)return;
    if(firstAudio){firstAudio=false;if(userStoppedAt)s.audioStats.firstAudioMs.push(now()-userStoppedAt);userStoppedAt=0;}
    if(itemId!==e.item_id){itemId=e.item_id;responseStart=latestTimestamp;generatedMs=0;playedMs=0;marks.clear();}
    const delta=String(e.delta||'');if(!/^[A-Za-z0-9+/]*={0,2}$/.test(delta)||delta.length>131072)return close('实时音频格式异常');
    if(twilio.bufferedAmount>256000)return close('电话音频积压，已停止避免延迟继续增长');
    generatedMs+=Buffer.from(delta,'base64').length/8;hasUnplayed=true;
    send(twilio,{event:'media',streamSid,media:{payload:delta}});
    const name='a'+(++markSeq);marks.set(name,{itemId,ms:generatedMs});send(twilio,{event:'mark',streamSid,mark:{name}});return;
   }
   if(e.type==='conversation.item.input_audio_transcription.completed'){
    if(seen.has(e.item_id))return;record('user',e.transcript,e.item_id);s.turn++;
    if(/^(?:结束(?:测试|通话)?|停止(?:测试|通话)?|挂断(?:电话)?|再见)[。！!\s]*$/.test(String(e.transcript||'').trim()))return close();
    if(s.turn>8)close('已达到八轮测试上限');return;
   }
   if(e.type==='response.output_audio_transcript.done'){
    record('assistant',e.transcript,e.item_id);if(e.item_id===discardedItem){const row=s.transcript.find(x=>x.itemId===e.item_id);if(row)row.interrupted=true;}return;
   }
   if(e.type==='response.done'&&e.response?.status==='failed')close('实时AI未能完成回复');
  }
  twilio.on('message',raw=>{
   if(closed)return;
   try{
    const e=JSON.parse(raw.toString());
    if(e.event==='connected')return;
    if(e.event==='start'){
     if(startSeen)return close('重复的音频起始事件');
     startSeen=true;const start=e.start||{},c=getConfig();
     if(start.accountSid!==c.accountSid||start.callSid!==s.callSid||!equal(start.customParameters?.token,s.streamToken)||start.mediaFormat?.encoding!=='audio/x-mulaw'||Number(start.mediaFormat?.sampleRate)!==8000||Number(start.mediaFormat?.channels)!==1||!/^MZ[a-f0-9]{32}$/i.test(e.streamSid||''))return close('电话音频身份或格式校验未通过');
     clearTimeout(startTimer);streamSid=e.streamSid;s.streamToken='';
     ai=open();connectTimer=setTimeout(()=>close('实时AI连接超时'),12000);connectTimer.unref?.();
     ai.on('open',()=>send(ai,sessionUpdate(s.task)));ai.on('message',data=>{try{aiEvent(JSON.parse(data.toString()));}catch{close('实时AI数据异常');}});ai.on('error',()=>close('实时AI连接失败'));ai.on('close',()=>close());return;
    }
    if(!startSeen||!streamSid)return close('缺少音频起始身份');
    if(e.event==='media'){
     const payload=String(e.media?.payload||'');if(!/^[A-Za-z0-9+/]+={0,2}$/.test(payload)||payload.length>20000)return close('电话音频格式异常');
     latestTimestamp=Math.max(latestTimestamp,Number(e.media.timestamp)||0);
     if(ready){if(ai.bufferedAmount>256000)return close('实时AI音频发送积压');send(ai,{type:'input_audio_buffer.append',audio:payload});}
     else{if(pending.length>=100)return close('实时AI准备超时，音频未继续积压');pending.push(payload);}return;
    }
    if(e.event==='mark'){
     const mark=marks.get(e.mark?.name);if(mark){marks.delete(e.mark.name);if(mark.itemId===itemId){playedMs=Math.max(playedMs,mark.ms);if(playedMs>=generatedMs)hasUnplayed=false;}}return;
    }
    if(e.event==='dtmf'&&e.dtmf?.digit==='9')return close();
    if(e.event==='stop')return close();
   }catch{close('电话音频连接异常');}
  });
  twilio.on('close',()=>close());twilio.on('error',()=>close('电话音频连接失败'));
  s.streamShutdown=()=>close();
  return {close};
 }
 function attach(server,resolveSession){
  const wss=new WebSocketServer({noServer:true,maxPayload:65536,perMessageDeflate:false,clientTracking:false});
  server.on('upgrade',(req,socket,head)=>{
   let url;try{url=new URL(req.url,'http://local');}catch{socket.destroy();return;}
   const match=url.pathname.match(/^\/api\/phone-assistant\/stream\/([a-f0-9]{36})$/);
   if(!match){if(url.pathname.startsWith('/api/voice-agent/stream/'))return;socket.end('HTTP/1.1 404 Not Found\r\n\r\n');return;}
   const s=resolveSession(match[1]);
   if(url.search||!s||s.streamClaimed||!verify(req,s)){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
   s.streamClaimed=true;wss.handleUpgrade(req,socket,head,ws=>bridge(ws,s));
  });
 }
 return {probe,checked,verify,bridge,attach};
}
module.exports={createPhoneRealtime,sessionUpdate,streamUrl};
