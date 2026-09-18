const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const http=require('node:http');const vm=require('node:vm');const crypto=require('node:crypto');const {DatabaseSync}=require('node:sqlite');
const {createPrivateChat}=require('../lib/gelianghao');
const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
function extract(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
const context={crypto,setInterval,clearInterval,Date,Buffer,JSON,Set};vm.createContext(context);
vm.runInContext(extract('function hashPassword(','function base64Url(')+extract('function openEventStream(','function notifyDataChanged('),context);
function factory(dir){return createPrivateChat({dataDir:dir,publicDir:path.join(__dirname,'../public/gelianghao'),hashPassword:context.hashPassword,verifyPassword:context.verifyPassword,openEventStream:context.openEventStream,authorizeSetup:(req,b)=>b.ownerPassword==='test-owner-only'});}
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
 mod.close();mod=factory(dir);assert.equal((await call('b',`/rooms/${privateRoom}/messages`)).data.messages.length,2);
 const db=new DatabaseSync(path.join(dir,'gelianghao/chat.sqlite'));db.prepare('UPDATE messages SET created=? WHERE room_id=?').run(Date.now()-15*86400000-1,privateRoom);db.close();
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
