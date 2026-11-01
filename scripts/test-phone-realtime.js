'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');const crypto=require('node:crypto');
const {createPhoneRealtime,sessionUpdate,streamUrl}=require('../lib/phone-realtime');
const settle=()=>new Promise(r=>setImmediate(r));
const cfg={apiKey:'fixture-not-real',authToken:'fixture-twilio',accountSid:'AC'+'b'.repeat(32),model:'gpt-realtime'};
function fixture({autoReady=true}={}){
 const instances=[];
 class Socket extends EventEmitter{constructor(){super();this.readyState=1;this.bufferedAmount=0;this.sent=[];}send(data){this.sent.push(JSON.parse(data));}close(){if(this.readyState===3)return;this.readyState=3;this.emit('close');}}
 class AI extends Socket{constructor(url,opts){super();this.url=url;this.opts=opts;instances.push(this);queueMicrotask(()=>this.emit('open'));}send(data){super.send(data);if(JSON.parse(data).type==='session.update'&&autoReady)queueMicrotask(()=>this.emit('message',Buffer.from('{"type":"session.updated"}')));}}
 const realtime=createPhoneRealtime({getConfig:()=>cfg,WebSocketImpl:AI});const twilio=new Socket();
 const s={id:'a'.repeat(36),baseUrl:'https://example.test',callSid:'CA'+'c'.repeat(32),streamToken:'token-once',transcript:[],task:{goal:'中文自然对话'},turn:0};
 const start={event:'start',streamSid:'MZ'+'d'.repeat(32),start:{accountSid:cfg.accountSid,callSid:s.callSid,customParameters:{token:s.streamToken},mediaFormat:{encoding:'audio/x-mulaw',sampleRate:8000,channels:1}}};
 const incoming=e=>twilio.emit('message',Buffer.from(JSON.stringify(e)));
 const aiEvent=e=>instances.at(-1).emit('message',Buffer.from(JSON.stringify(e)));
 return {realtime,twilio,s,start,incoming,aiEvent,instances};
}
test('实时配置为直接音频，短回答，中文行业词，自动打断且无工具',()=>{const e=sessionUpdate();assert.deepEqual(e.session.audio.input.format,{type:'audio/pcmu'});assert.equal(e.session.audio.output.voice,'marin');assert.equal(e.session.audio.output.speed,1.1);assert.equal(e.session.audio.input.turn_detection.interrupt_response,true);assert.deepEqual(e.session.tools,[]);assert.match(e.session.instructions,/15到35/);assert.match(e.session.audio.input.transcription.prompt,/改色膜/);});
test('无音频预检只协商配置，不创建回复，不向电话传递密钥',async()=>{const f=fixture();const r=await f.realtime.probe();assert.equal(r.ok,true);assert.equal(f.instances.length,1);assert.equal(f.instances[0].sent.filter(e=>e.type==='response.create').length,0);assert.equal(JSON.stringify(r).includes('fixture-not-real'),false);assert.equal(f.realtime.checked(),true);await f.realtime.probe();assert.equal(f.instances.length,1);});
test('WebSocket校验固定wss地址签名，不信任传入主机',()=>{const f=fixture();const sig=crypto.createHmac('sha1',cfg.authToken).update(streamUrl(f.s)).digest('base64');assert.equal(f.realtime.verify({headers:{host:'evil.test','x-twilio-signature':sig}},f.s),true);assert.equal(f.realtime.verify({headers:{'x-twilio-signature':'wrong'}},f.s),false);});
test('音频起始身份和一次性令牌错误时，不连接AI',()=>{const f=fixture();f.realtime.bridge(f.twilio,f.s);f.start.start.customParameters.token='wrong';f.incoming(f.start);assert.equal(f.instances.length,0);assert.equal(f.twilio.readyState,3);assert.match(f.s.error,/校验未通过/);});
test('双向音频原样流转，字幕保留，不保存音频',async()=>{const f=fixture();f.realtime.bridge(f.twilio,f.s);f.incoming(f.start);await settle();assert.equal(f.s.streamToken,'');assert.equal(f.s.audioStats.connected,true);const audio=Buffer.alloc(160,255).toString('base64');f.incoming({event:'media',media:{timestamp:'1000',payload:audio}});assert.equal(f.instances[0].sent.at(-1).audio,audio);f.aiEvent({type:'response.created'});f.aiEvent({type:'response.output_audio.delta',item_id:'assistant-1',delta:audio});assert.equal(f.twilio.sent.find(e=>e.event==='media').media.payload,audio);f.aiEvent({type:'conversation.item.input_audio_transcription.completed',item_id:'user-1',transcript:'改色膜多少钱？'});f.aiEvent({type:'response.output_audio_transcript.done',item_id:'assistant-1',transcript:'您是什么车型？'});assert.equal(f.s.transcript.length,2);assert.equal(f.s.turn,1);assert.equal(JSON.stringify(f.s).includes(audio),false);f.s.streamShutdown();assert.equal(f.instances[0].readyState,3);});
test('插话立即clear并截断已播放时间，旧音频不会继续发给电话',async()=>{const f=fixture();f.realtime.bridge(f.twilio,f.s);f.incoming(f.start);await settle();const audio=Buffer.alloc(8000).toString('base64');f.incoming({event:'media',media:{timestamp:'1000',payload:'//8='}});f.aiEvent({type:'response.output_audio.delta',item_id:'old',delta:audio});f.incoming({event:'media',media:{timestamp:'1450',payload:'//8='}});f.aiEvent({type:'input_audio_buffer.speech_started'});assert.equal(f.twilio.sent.at(-1).event,'clear');const truncate=f.instances[0].sent.find(e=>e.type==='conversation.item.truncate');assert.equal(truncate.audio_end_ms,450);const count=f.twilio.sent.filter(e=>e.event==='media').length;f.aiEvent({type:'response.output_audio.delta',item_id:'old',delta:audio});assert.equal(f.twilio.sent.filter(e=>e.event==='media').length,count);f.aiEvent({type:'response.output_audio_transcript.done',item_id:'old',transcript:'被打断的话'});assert.equal(f.s.transcript[0].interrupted,true);assert.equal(f.s.audioStats.interruptions,1);f.s.streamShutdown();});
test('准备前音频有界；按9、口头结束和AI错误均关闭连接',async()=>{for(const mode of ['buffer','dtmf','spoken','error']){const f=fixture({autoReady:mode!=='buffer'});f.realtime.bridge(f.twilio,f.s);f.incoming(f.start);await settle();if(mode==='buffer')for(let i=0;i<101;i++)f.incoming({event:'media',media:{timestamp:String(i*20),payload:'//8='}});else if(mode==='dtmf')f.incoming({event:'dtmf',dtmf:{digit:'9'}});else if(mode==='spoken')f.aiEvent({type:'conversation.item.input_audio_transcription.completed',item_id:'u',transcript:'结束测试。'});else f.aiEvent({type:'error',error:{code:'invalid_value',param:'session.audio.output.speed',message:'sensitive-not-shown'}});assert.equal(f.twilio.readyState,3);assert.equal(f.instances[0].readyState,3);assert.equal((f.s.error||'').includes('sensitive-not-shown'),false);}});
test('字幕重放不增加轮次，结束后不追加晚到内容',async()=>{const f=fixture();f.realtime.bridge(f.twilio,f.s);f.incoming(f.start);await settle();const event={type:'conversation.item.input_audio_transcription.completed',item_id:'u',transcript:'你好'};f.aiEvent(event);f.aiEvent(event);assert.equal(f.s.turn,1);f.s.streamShutdown();f.aiEvent({type:'response.output_audio_transcript.done',item_id:'late',transcript:'迟到'});assert.equal(f.s.transcript.length,1);});
test('实际WebSocket升级：无签名拒绝，有签名且起始身份匹配才连接AI',async()=>{
 const http=require('node:http');const {WebSocket:Client}=require('ws');const f=fixture();
 const server=http.createServer();f.realtime.attach(server,id=>id===f.s.id?f.s:null);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='ws://127.0.0.1:'+server.address().port+'/api/phone-assistant/stream/'+f.s.id;
 let client;
 try{
  await new Promise((resolve,reject)=>{const bad=new Client(url);bad.on('error',()=>{});bad.on('unexpected-response',(req,res)=>{assert.equal(res.statusCode,403);res.resume();bad.terminate();resolve();});bad.on('open',()=>reject(Error('unsigned socket accepted')));});
  assert.equal(f.instances.length,0);
  const signature=crypto.createHmac('sha1',cfg.authToken).update(streamUrl(f.s)).digest('base64');
  client=new Client(url,{headers:{'x-twilio-signature':signature}});client.on('error',()=>{});await new Promise((resolve,reject)=>{client.once('open',resolve);client.once('error',reject);});
  assert.equal(f.instances.length,0);client.send(JSON.stringify(f.start));
  for(let i=0;i<30&&f.instances.length===0;i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(f.instances.length,1);assert.equal(f.s.streamToken,'');
 }finally{client?.terminate();f.s.streamShutdown?.();await new Promise(r=>server.close(r));}
});
