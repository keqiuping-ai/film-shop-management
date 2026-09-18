const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const http=require('node:http');const vm=require('node:vm');const crypto=require('node:crypto');const {DatabaseSync}=require('node:sqlite');
const {createPrivateChat}=require('../lib/gelianghao');
const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
function extract(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
const context={crypto,setInterval,clearInterval,Date,Buffer,JSON,Set};vm.createContext(context);
vm.runInContext(extract('function hashPassword(','function base64Url(')+extract('function openEventStream(','function notifyDataChanged('),context);
function factory(dir,callTransport){return createPrivateChat({callTransport,dataDir:dir,publicDir:path.join(__dirname,'../public/gelianghao'),hashPassword:context.hashPassword,verifyPassword:context.verifyPassword,openEventStream:context.openEventStream,authorizeSetup:(req,b)=>b.ownerPassword==='test-owner-only'});}
test('friends chat: invitation, membership, protected files, persistence, retention and backup isolation',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'glh-test-'));const business={users:[{id:'business-only'}],customerSecret:'BUSINESS_ONLY'};fs.writeFileSync(path.join(dir,'db.json'),JSON.stringify(business));let mod=factory(dir);const server=http.createServer((req,res)=>mod.handle(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/gelianghao/api`;const clients={};
 async function call(who,p,method='GET',body,extra={}){const res=await fetch(base+p,{method,headers:{...(clients[who]?{Cookie:clients[who]}:{}),...(body&&typeof body==='object'&&!Buffer.isBuffer(body)?{'Content-Type':'application/json'}:{}),...extra},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body)});if(res.headers.get('set-cookie'))clients[who]=res.headers.get('set-cookie').split(';')[0];const data=await res.text();return {status:res.status,headers:res.headers,data:res.headers.get('content-type')?.includes('json')?JSON.parse(data):data};}
 try{
 assert.equal((await call('anon','/rooms')).status,401);
 assert.equal((await call('a','/setup','POST',{name:'甲',username:'alice',password:'longpassword1',ownerPassword:'wrong'})).status,403);
 const a=await call('a','/setup','POST',{name:'甲',username:'alice',password:'longpassword1',ownerPassword:'test-owner-only'});assert.equal(a.status,201);const aid=a.data.user.id;
 assert.equal((await call('a','/setup','POST',{})).status,409);
 const inv=await call('a','/invites','POST',{label:'乙'});assert.equal(inv.status,201);
 const b=await call('b','/register','POST',{name:'乙',username:'bob',password:'longpassword2',invite:inv.data.code});assert.equal(b.status,201);const bid=b.data.user.id;
 assert.equal((await call('bad','/register','POST',{name:'重复',username:'duplicate',password:'longpassword2',invite:inv.data.code})).status,400);
 const invc=(await call('a','/invites','POST',{label:'丙'})).data;const c=await call('c','/register','POST',{name:'丙',username:'charlie',password:'longpassword3',invite:invc.code});assert.equal(c.status,201);
 assert.equal((await call('b','/invites','POST',{})).status,403);
 assert.equal((await call('a','/users')).data.users.some(x=>x.id==='business-only'),false);
 const privateRoom=(await call('a','/rooms','POST',{kind:'direct',members:[bid]})).data.id;
 assert.equal((await call('b','/rooms','POST',{kind:'direct',members:[aid]})).data.id,privateRoom);
 assert.equal((await call('c',`/rooms/${privateRoom}/messages`)).status,404);
 const streamAbort=new AbortController();const stream=await fetch(base+'/events',{headers:{Cookie:clients.b},signal:streamAbort.signal});assert.equal(stream.status,200);assert.match(stream.headers.get('content-type'),/event-stream/);const reader=stream.body.getReader();await reader.read();
 const message={text:'FRIENDS_ONLY_PRIVATE_TEXT',clientId:crypto.randomUUID()};const sent=await call('a',`/rooms/${privateRoom}/messages`,'POST',message);assert.equal(sent.status,201);
 const event=await Promise.race([reader.read(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('SSE timeout')),2000))]);assert.match(Buffer.from(event.value).toString(),/data-changed/);streamAbort.abort();
 assert.equal((await call('a',`/rooms/${privateRoom}/messages`,'POST',message)).status,200);
 let msgs=(await call('b',`/rooms/${privateRoom}/messages`)).data.messages;assert.equal(msgs.length,1);
 assert.equal((await call('b','/rooms')).data.rooms.find(r=>r.id===privateRoom).unread,1);
 await call('b',`/rooms/${privateRoom}/read`,'POST',{seq:msgs[0].seq});assert.equal((await call('b','/rooms')).data.rooms.find(r=>r.id===privateRoom).unread,0);
 const up=await call('a',`/rooms/${privateRoom}/upload`,'POST',Buffer.from('PRIVATE_FILE_CONTENT'),{'Content-Type':'text/plain','X-File-Name':encodeURIComponent('朋友文件.txt')});assert.equal(up.status,201);
 assert.equal((await call('b',`/files/${up.data.id}`)).status,404);
 const attachment=await call('a',`/rooms/${privateRoom}/messages`,'POST',{text:'',fileId:up.data.id,clientId:crypto.randomUUID()});assert.equal(attachment.status,201);
 assert.equal((await call('b',`/files/${up.data.id}`)).data,'PRIVATE_FILE_CONTENT');assert.equal((await call('c',`/files/${up.data.id}`)).status,404);assert.equal((await call('anon',`/files/${up.data.id}`)).status,401);
 const range=await call('b',`/files/${up.data.id}`,'GET',undefined,{Range:'bytes=0-6'});assert.equal(range.status,206);assert.equal(range.data,'PRIVATE');
 assert.equal((await call('a',`/rooms/${privateRoom}/messages`,'POST',{text:'csrf',clientId:crypto.randomUUID()},{Origin:'https://evil.example'})).status,403);
 const group=(await call('a','/rooms','POST',{name:'二人群',kind:'group',members:[bid]})).data.id;assert.equal((await call('c',`/rooms/${group}/messages`)).status,404);

 // Sender-only deletion removes every attachment kind for the whole room.
 const deleteAbort=new AbortController();const deleteStream=await fetch(base+'/events',{headers:{Cookie:clients.b},signal:deleteAbort.signal});const deleteReader=deleteStream.body.getReader();await deleteReader.read();
 for(const mime of ['image/png','video/mp4','audio/webm','application/octet-stream']){
  const upload=await call('a',`/rooms/${group}/upload`,'POST',Buffer.from('DELETE_THIS_ATTACHMENT'),{'Content-Type':mime,'X-File-Name':'delete-test'});assert.equal(upload.status,201);
  const sentDelete=await call('a',`/rooms/${group}/messages`,'POST',{text:'wrong message',fileId:upload.data.id,clientId:crypto.randomUUID()});const mid=sentDelete.data.id,url=`/rooms/${group}/messages/${mid}`;
  assert.equal((await call('anon',url,'DELETE')).status,401);assert.equal((await call('c',url,'DELETE')).status,404);assert.equal((await call('b',url,'DELETE')).status,403);
  assert.equal((await call('a',url,'DELETE',undefined,{Origin:'https://evil.example'})).status,403);
  assert.equal((await call('b',`/files/${upload.data.id}`)).status,200);
  assert.equal((await call('a',url,'DELETE')).status,200);assert.equal((await call('a',url,'DELETE')).status,200);
  assert.equal((await call('b',`/rooms/${group}/messages`)).data.messages.some(m=>m.id===mid),false);
  assert.equal((await call('b',`/files/${upload.data.id}`)).status,404);assert.equal(fs.existsSync(path.join(dir,'gelianghao/files',upload.data.id)),false);
 }
 let deleteEvents='';while(!deleteEvents.includes('event: message-deleted')){const event=await deleteReader.read();deleteEvents+=Buffer.from(event.value).toString();}deleteAbort.abort();
 assert.equal((await call('b','/rooms')).data.rooms.find(r=>r.id===group).unread,0);
 assert.equal((await call('a','/rooms')).data.rooms.find(r=>r.id===group).last_text,null);
 const directDelete=await call('a',`/rooms/${privateRoom}/messages`,'POST',{text:'remove direct message',clientId:crypto.randomUUID()});assert.equal((await call('a',`/rooms/${privateRoom}/messages/${directDelete.data.id}`,'DELETE')).status,200);
 mod.close();mod=factory(dir);assert.equal((await call('b',`/rooms/${privateRoom}/messages`)).data.messages.length,2);
 const db=new DatabaseSync(path.join(dir,'gelianghao/chat.sqlite'));db.prepare('UPDATE messages SET created=? WHERE room_id=?').run(Date.now()-86400000-1,privateRoom);db.close();
 assert.equal((await call('b',`/rooms/${privateRoom}/messages`)).data.messages.length,0);assert.equal((await call('a',`/rooms/${privateRoom}/messages`)).data.messages.length,0);assert.equal((await call('b',`/files/${up.data.id}`)).status,404);assert.equal(fs.existsSync(path.join(dir,'gelianghao/files',up.data.id)),false);
 // Real backup function writes only the supplied company DB, never private storage.
 const backupContext={fs,BACKUP_DIR:path.join(dir,'backups'),dateInTimezone:()=> '2026-09-18',backupFileName:()=> 'backup.json',backupPath:n=>path.join(dir,'backups',n),audit:()=>{},writeDb:()=>{},pruneExpiredBackups:()=>{}};vm.createContext(backupContext);vm.runInContext(extract('function createDatabaseBackup(','function applyStartupPasswordReset('),backupContext);backupContext.createDatabaseBackup(business,'manual');const backup=fs.readFileSync(path.join(dir,'backups/backup.json'),'utf8');assert.doesNotMatch(backup,/FRIENDS_ONLY|PRIVATE_FILE|alice|bob/);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'db.json'),'utf8')),business);
 const expired=new DatabaseSync(path.join(dir,'gelianghao/chat.sqlite'));assert.equal(expired.prepare('SELECT COUNT(*) n FROM messages WHERE room_id=?').get(privateRoom).n,0);expired.close();
 assert.equal((await call('a','/password','POST',{oldPassword:'longpassword1',password:'newpassword123'})).status,200);await call('a','/logout','POST',{});assert.equal((await call('a','/rooms')).status,401);assert.equal((await call('a','/login','POST',{username:'alice',password:'newpassword123'})).status,200);
 }finally{mod.close();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
test('existing company SSE keeps its default connection collection',()=>{
 context.eventClients=new Set();const {EventEmitter}=require('node:events');const req=new EventEmitter();const output=[];const res={writeHead:()=>{},write:text=>output.push(text)};
 context.openEventStream(req,res,{id:'company-user'});
 assert.equal(context.eventClients.size,1);assert.match(output[0],/event: ready/);
 req.emit('close');assert.equal(context.eventClients.size,0);
});
test('friend calls: strict room membership, accept/token/decline, groups, expiry, heartbeat and isolated SSE',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'glh-calls-'));const ended=[],removed=[];
 const mod=factory(dir,{configured:()=>true,origins:()=>[],token:async(c,u)=>({url:'ws://localhost:7880',token:`test-${u.id}-${c.roomName}`}),end:async c=>ended.push(c.id),remove:async(c,id)=>removed.push(id)});
 const server=http.createServer((req,res)=>mod.handle(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/gelianghao/api`,cookies={};
 async function req(w,p,method='GET',data){const r=await fetch(base+p,{method,headers:{Cookie:cookies[w]||'','Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});if(r.headers.get('set-cookie'))cookies[w]=r.headers.get('set-cookie').split(';')[0];return {status:r.status,...await r.json()};}
 const db=new DatabaseSync(path.join(dir,'gelianghao/chat.sqlite'));
 function alter(id,fn){const c=JSON.parse(db.prepare('SELECT payload FROM friend_calls WHERE id=?').get(id).payload);fn(c);db.prepare('UPDATE friend_calls SET payload=?,created=? WHERE id=?').run(JSON.stringify(c),Date.parse(c.createdAt),id);}
 try{
 const a=(await req('a','/setup','POST',{name:'A',username:'alice',password:'password1234',ownerPassword:'test-owner-only'})).user;
 const people={a};for(const w of ['b','c']){const inv=await req('a','/invites','POST',{});people[w]=(await req(w,'/register','POST',{name:w,username:w.repeat(3),password:'password1234',invite:inv.code})).user;}
 const r=(await req('a','/rooms','POST',{kind:'direct',members:[people.b.id]})).id;
 assert.equal((await req('anon','/voice-calls')).status,401);
 assert.equal((await req('c','/voice-calls','POST',{roomId:r,participantUserIds:[a.id]})).status,404);
 assert.equal((await req('a','/voice-calls','POST',{roomId:r,participantUserIds:[people.c.id]})).status,404);
 const ab=new AbortController();const st=await fetch(base+'/events',{headers:{Cookie:cookies.b},signal:ab.signal});const reader=st.body.getReader();await reader.read();
 const c1=(await req('a','/voice-calls','POST',{roomId:r,participantUserIds:[people.b.id]})).call;assert.match(c1.roomName,/^glh-/);
 const event=await reader.read();assert.match(Buffer.from(event.value).toString(),/event: voice-call/);ab.abort();
 assert.equal((await req('c','/voice-calls')).calls.length,0);
 assert.equal((await req('c',`/voice-calls/${c1.id}/token`,'POST',{})).status,404);
 assert.equal((await req('b',`/voice-calls/${c1.id}/token`,'POST',{})).status,403);
 assert.equal((await req('a','/voice-calls','POST',{roomId:r,participantUserIds:[people.b.id]})).status,409);
 assert.equal((await req('b',`/voice-calls/${c1.id}`,'PUT',{action:'accept'})).call.status,'active');
 assert.equal((await req('b',`/voice-calls/${c1.id}/token`,'POST',{})).status,200);
 assert.equal((await req('b',`/voice-calls/${c1.id}`,'PUT',{action:'end'})).status,403);
 assert.equal((await req('a',`/voice-calls/${c1.id}`,'PUT',{action:'recording',enabled:true})).status,400);
 assert.equal((await req('a',`/voice-calls/${c1.id}`,'PUT',{action:'invite',participantUserIds:[people.c.id]})).status,404);
 await req('b',`/voice-calls/${c1.id}/heartbeat`,'POST',{});
 assert.equal((await req('b',`/voice-calls/${c1.id}`,'PUT',{action:'leave'})).call.status,'ended');
 assert.equal((await req('a',`/voice-calls/${c1.id}/token`,'POST',{})).status,403);
 assert.ok(ended.includes(c1.id));assert.ok(removed.includes(people.b.id));
 const c2=(await req('a','/voice-calls','POST',{roomId:r,participantUserIds:[people.b.id]})).call;
 assert.equal((await req('b',`/voice-calls/${c2.id}`,'PUT',{action:'decline'})).call.status,'declined');
 const c3=(await req('a','/voice-calls','POST',{roomId:r,participantUserIds:[people.b.id]})).call;
 alter(c3.id,c=>{c.invitedAt[people.b.id]=Date.now()-46000;});assert.equal((await req('a','/voice-calls')).calls.find(c=>c.id===c3.id).status,'missed');
 const g=(await req('a','/rooms','POST',{kind:'group',name:'朋友群',members:[people.b.id,people.c.id]})).id;
 const c4=(await req('a','/voice-calls','POST',{roomId:g,participantUserIds:[people.b.id,people.c.id]})).call;
 for(const w of ['b','c'])assert.equal((await req(w,`/voice-calls/${c4.id}`,'PUT',{action:'accept'})).status,200);
 assert.equal((await req('a',`/voice-calls/${c4.id}`,'PUT',{action:'leave'})).call.status,'active');
 alter(c4.id,c=>{c.lastSeen[people.b.id]=Date.now()-91000;});assert.equal((await req('c','/voice-calls')).calls.find(c=>c.id===c4.id).status,'ended');
 alter(c1.id,c=>{c.createdAt=new Date(Date.now()-86400001).toISOString();});assert.equal((await req('a','/voice-calls')).calls.some(c=>c.id===c1.id),false);assert.equal(db.prepare('SELECT COUNT(*) n FROM friend_calls WHERE id=?').get(c1.id).n,0);
 // A message still inside 24h remains; after 24h both sides and files lose access.
 const message=(await req('a',`/rooms/${r}/messages`,'POST',{text:'24 hour boundary',clientId:crypto.randomUUID()}));assert.equal(message.status,201);
 db.prepare('UPDATE messages SET created=?').run(Date.now()-86300000);assert.equal((await req('b',`/rooms/${r}/messages`)).messages.length,1);
 db.prepare('UPDATE messages SET created=?').run(Date.now()-86400001);assert.equal((await req('b',`/rooms/${r}/messages`)).messages.length,0);
 }finally{db.close();mod.close();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
test('real LiveKit SDK produces audio-only namespaced short-lived grants',async()=>{
 const keys=['LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET'],saved=keys.map(k=>process.env[k]);
 try{process.env.LIVEKIT_URL='ws://127.0.0.1:7880';process.env.LIVEKIT_API_KEY='devkey';process.env.LIVEKIT_API_SECRET='secret';
 const result=await require('../lib/gelianghao-calls').liveKitTransport().token({id:'fixture',roomName:'glh-room-fixture'},{id:'friend-fixture',name:'测试'});
 const claims=JSON.parse(Buffer.from(result.token.split('.')[1],'base64url').toString());assert.equal(claims.sub,'glh-friend-fixture');assert.equal(claims.video.room,'glh-room-fixture');assert.deepEqual(claims.video.canPublishSources,['microphone']);assert.equal(claims.video.canPublishData,false);assert.ok(claims.exp-Math.floor(Date.now()/1000)<=300);
 }finally{keys.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];});}
});
