'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const net=require('node:net');const crypto=require('node:crypto');
test('实际管理服务器：静态页、认证、服务配置、任务准备和签名拒绝',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'quad-phone-http-'));const root=path.join(__dirname,'..');
 const block=path.join(temp,'block.cjs');fs.writeFileSync(block,"globalThis.fetch=async()=>{throw Error('All provider traffic blocked in test')};require("+JSON.stringify(require.resolve('ws'))+").WebSocket=class {constructor(){throw Error('WebSocket provider traffic blocked in test')}};");
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const child=spawn(process.execPath,['--require',block,'server.js'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:temp,OPENAI_API_KEY:'fixture-not-real',TWILIO_ACCOUNT_SID:'AC'+'b'.repeat(32),TWILIO_AUTH_TOKEN:'fixture-not-real',TWILIO_FROM_NUMBER:'+17252412586',TWILIO_WEBHOOK_BASE_URL:'https://example.test'},stdio:'ignore'});
 const base='http://127.0.0.1:'+port;let token='';
 const request=(p,body)=>fetch(base+p,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try{
  let up=false;for(let i=0;i<160;i++){try{if((await request('/phone-assistant.html')).ok){up=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(up,'server started');
  assert.equal((await request('/api/phone-assistant/config')).status,401);
  const login=await request('/api/login',{email:'admin@filmshop.local',password:'admin123'});assert.equal(login.status,200);token=(await login.json()).token;assert.ok(token);
  const cfg=await (await request('/api/phone-assistant/config')).json();assert.equal(cfg.ready,false);assert.equal(cfg.realtime,true);assert.equal(cfg.from,'+17252412586');assert.equal('authToken' in cfg,false);assert.equal('apiKey' in cfg,false);
  const prepared=await request('/api/phone-assistant/sessions',{to:'+16265864446',goal:'中文对话',background:'测试',questions:'你好？',boundary:'不付款',escalation:'先问我'});assert.equal(prepared.status,201);const session=await prepared.json();assert.equal(session.status,'ready');
  const hook=await fetch(base+'/api/phone-assistant/hooks/'+session.id+'/answer?turn=0',{method:'POST',body:new URLSearchParams({CallSid:'CA'+'a'.repeat(32)})});assert.equal(hook.status,403);
  const params={AccountSid:'AC'+'b'.repeat(32),CallSid:'CA'+'a'.repeat(32),To:'+16265864446',From:'+17252412586'};
  const route='/api/phone-assistant/hooks/'+session.id+'/answer?turn=0';
  let payload='https://example.test'+route;for(const key of Object.keys(params).sort())payload+=key+params[key];
  const signature=crypto.createHmac('sha1','fixture-not-real').update(payload).digest('base64');
  const signed=await fetch(base+route,{method:'POST',headers:{'x-twilio-signature':signature},body:new URLSearchParams(params)});assert.equal(signed.status,200);assert.match(await signed.text(),/同意请按1/);
  const js=await request('/phone-assistant.js');assert.equal(js.status,200);assert.match(await js.text(),/filmShopCloud.token/);
  console.log('isolated HTTP integration passed; all provider traffic blocked');
 }finally{if(child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}fs.rmSync(temp,{recursive:true,force:true});}
});
