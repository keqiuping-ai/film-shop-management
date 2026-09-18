// Private chat mounted in the existing QUAD HTTP server. No second listener or service.
const { randomBytes,randomUUID,createHash }=require('crypto');
const { mkdirSync,readFileSync,writeFileSync,existsSync,createReadStream,unlinkSync }=require('fs');
const path=require('path');
function createPrivateChat(options){
const { DatabaseSync }=require('node:sqlite');
const root=options.publicDir;
const dir=path.join(options.dataDir,'gelianghao');
mkdirSync(dir,{recursive:true,mode:0o700}); mkdirSync(path.join(dir,'files'),{recursive:true,mode:0o700});
const db=new DatabaseSync(path.join(dir,'chat.sqlite'));
db.exec(`PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS invites(id TEXT PRIMARY KEY,hash TEXT UNIQUE NOT NULL,label TEXT,expires INTEGER NOT NULL,used_by TEXT,revoked INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL,owner TEXT REFERENCES users(id),direct_key TEXT UNIQUE,created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS members(room_id TEXT REFERENCES rooms(id),user_id TEXT REFERENCES users(id),last_read INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(room_id,user_id));
CREATE TABLE IF NOT EXISTS messages(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,room_id TEXT REFERENCES rooms(id),sender TEXT REFERENCES users(id),text TEXT NOT NULL,client_id TEXT NOT NULL,created INTEGER NOT NULL,UNIQUE(sender,client_id));
CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,room_id TEXT REFERENCES rooms(id),owner TEXT REFERENCES users(id),name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,message_id TEXT REFERENCES messages(id),created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS message_room_seq ON messages(room_id,seq);
CREATE INDEX IF NOT EXISTS file_message ON files(message_id);
`);
const q=(sql,...args)=>db.prepare(sql).get(...args), all=(sql,...args)=>db.prepare(sql).all(...args), run=(sql,...args)=>db.prepare(sql).run(...args);
const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
const hash=s=>createHash('sha256').update(s).digest('hex');
const packPassword=options.hashPassword;
const checkPassword=options.verifyPassword;
const dummyPassword=packPassword(randomBytes(32).toString('hex'));
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const safeUser=u=>({id:u.id,username:u.username,name:u.name,role:u.role});
const MAX_FILE=20*1024*1024;
const RETENTION_MS=24*60*60*1000;
const eventClients=new Set();
function notify(room){const ids=room?new Set(all('SELECT user_id FROM members WHERE room_id=?',room).map(x=>x.user_id)):null;for(const client of eventClients){if(!ids||ids.has(client.userId)){try{client.res.write('event: data-changed\ndata: {}\n\n');}catch{eventClients.delete(client);}}}}
function closeUserStreams(id){for(const c of eventClients)if(c.userId===id){c.res.end();eventClients.delete(c);}}
const limits=new Map();
function limit(key,max,ms){const now=Date.now(),v=limits.get(key);if(!v||v.end<now){limits.set(key,{n:1,end:now+ms});return;}if(++v.n>max)fail(429,'操作太频繁，请稍后再试');}
const calls=require('./gelianghao-calls').createFriendCalls({db,member,fail,body,json,limit,clients:eventClients,transport:options.callTransport});
function purgeExpired(){
 calls.expire();
 const cutoff=Date.now()-RETENTION_MS;
 const expired=all('SELECT id FROM messages WHERE created<=?',cutoff);
 const doomed=all('SELECT f.id FROM files f LEFT JOIN messages m ON m.id=f.message_id WHERE m.created<=? OR (f.message_id IS NULL AND f.created<?)',cutoff,Date.now()-86400000);
 for(const f of doomed){try{unlinkSync(path.join(dir,'files',f.id));}catch(e){if(e.code!=='ENOENT')throw e;}}
 if(expired.length||doomed.length){tx(()=>{for(const f of doomed)run('DELETE FROM files WHERE id=?',f.id);run('DELETE FROM messages WHERE created<=?',cutoff);});notify();}
}
purgeExpired();
const cleanup=setInterval(()=>{try{const now=Date.now();for(const [k,v] of limits)if(v.end<now)limits.delete(k);run('DELETE FROM sessions WHERE expires < ?',now);purgeExpired();}catch{console.error('Private chat retention cleanup needs retry');}},60000).unref();

function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function bytes(req,max){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>max)fail(413,'文件或消息过大');chunks.push(chunk);}return Buffer.concat(chunks);}
async function body(req){if(!(req.headers['content-type']||'').startsWith('application/json'))fail(415,'需要 JSON 请求');try{return JSON.parse((await bytes(req,24000)).toString());}catch(e){if(e.status)throw e;fail(400,'请求格式错误');}}
function current(req){const token=/(?:^|;\s*)glh_session=([a-f0-9]+)/.exec(req.headers.cookie||'')?.[1];if(!token)return null;return q('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?',hash(token),Date.now());}
function session(req,res,user){const token=randomBytes(32).toString('hex');run('INSERT INTO sessions VALUES(?,?,?)',hash(token),user.id,Date.now()+30*86400000);res.setHeader('Set-Cookie',`glh_session=${token}; HttpOnly; SameSite=Strict; Path=/gelianghao/; Max-Age=2592000${req.socket.encrypted||req.headers['x-forwarded-proto']==='https'?'; Secure':''}`);}
function member(room,user){const row=q('SELECT * FROM members WHERE room_id=? AND user_id=?',room,user);if(!row)fail(404,'会话不存在或你没有访问权限');return row;}
function validateAccount(b){const username=String(b.username||'').toLowerCase().trim(),name=String(b.name||'').trim(),password=String(b.password||'');if(!/^[a-z0-9_]{3,32}$/.test(username))fail(400,'账号需为 3–32 位字母、数字或下划线');if(!name||name.length>30)fail(400,'昵称需为 1–30 个字');if(password.length<10||password.length>128)fail(400,'密码需为 10–128 个字符');return {username,name,password};}
function listRooms(user){return all(`SELECT r.*,m.last_read,(SELECT MAX(seq) FROM messages WHERE room_id=r.id) latest_seq,(SELECT text FROM messages WHERE room_id=r.id ORDER BY seq DESC LIMIT 1) last_text,(SELECT created FROM messages WHERE room_id=r.id ORDER BY seq DESC LIMIT 1) last_time,(SELECT COUNT(*) FROM messages WHERE room_id=r.id AND seq>m.last_read AND sender<>?) unread FROM rooms r JOIN members m ON m.room_id=r.id WHERE m.user_id=? ORDER BY COALESCE(last_time,r.created) DESC`,user.id,user.id).map(r=>({...r,members:all('SELECT u.id,u.name,u.username,m.last_read FROM users u JOIN members m ON m.user_id=u.id WHERE m.room_id=?',r.id)}));}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const handle=async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' ${calls.origins().join(' ')} wss://*.livekit.cloud https://*.livekit.cloud; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
 try{
 purgeExpired();
 const url=new URL(req.url,'http://localhost'),p=url.pathname.replace(/^\/gelianghao(?=\/|$)/,'')||'/',method=req.method;
 if(!['GET','HEAD'].includes(method)){
  const origin=req.headers.origin;
  if(origin&&new URL(origin).host!==req.headers.host)fail(403,'请求来源不匹配');
  if(req.headers['sec-fetch-site']==='cross-site')fail(403,'不允许跨站请求');
 }
 if(p==='/api/health')return json(res,200,{ok:true,name:'哥俩好',voiceConfigured:calls.configured(),retentionHours:24,version:'2026.09.18.delete-install-24h'});
 if(p==='/api/status'&&method==='GET')return json(res,200,{setupNeeded:!q('SELECT id FROM users LIMIT 1'),maxFile:MAX_FILE});
 if(p==='/api/setup'&&method==='POST'){
  limit(`setup:${req.socket.remoteAddress}`,5,60000);
  const b=await body(req);
  if(q('SELECT id FROM users LIMIT 1'))fail(409,'管理员已经创建');
  if(!options.authorizeSetup(req,b))fail(403,'请使用贴膜店老板账号验证开通权限');
  const v=validateAccount(b),id=randomUUID(),room=randomUUID();
  tx(()=>{run('INSERT INTO users VALUES(?,?,?,?,?,?)',id,v.username,v.name,packPassword(v.password),'admin',Date.now());run('INSERT INTO rooms VALUES(?,?,?,?,?,?)',room,'哥俩好 · 朋友群','group',id,null,Date.now());run('INSERT INTO members(room_id,user_id) VALUES(?,?)',room,id);});
  const u=q('SELECT * FROM users WHERE id=?',id);session(req,res,u);notify();return json(res,201,{user:safeUser(u)});
 }
 if(p==='/api/register'&&method==='POST'){
  limit(`register:${req.socket.remoteAddress}`,12,600000);const b=await body(req),v=validateAccount(b),id=randomUUID();
  const invite=q('SELECT * FROM invites WHERE hash=? AND used_by IS NULL AND revoked=0 AND expires>?',hash(String(b.invite||'').trim()),Date.now());
  if(!invite)fail(400,'邀请码无效、已使用或已过期');if(q('SELECT id FROM users WHERE username=?',v.username))fail(409,'这个账号已被使用');
  tx(()=>{run('INSERT INTO users VALUES(?,?,?,?,?,?)',id,v.username,v.name,packPassword(v.password),'member',Date.now());run('UPDATE invites SET used_by=? WHERE id=?',id,invite.id);const lounge=q("SELECT id FROM rooms WHERE kind='group' ORDER BY created LIMIT 1");if(lounge)run('INSERT INTO members(room_id,user_id) VALUES(?,?)',lounge.id,id);});
  const u=q('SELECT * FROM users WHERE id=?',id);session(req,res,u);notify();return json(res,201,{user:safeUser(u)});
 }
 if(p==='/api/login'&&method==='POST'){
  limit(`login:${req.socket.remoteAddress}`,25,600000);const b=await body(req),username=String(b.username||'').toLowerCase().trim();limit(`account:${username}`,12,600000);
  const u=q('SELECT * FROM users WHERE username=?',username),pass=String(b.password||'');if(pass.length>128||!checkPassword(pass,u?.password||dummyPassword)||!u)fail(401,'账号或密码不正确');session(req,res,u);return json(res,200,{user:safeUser(u)});
 }
 if(p.startsWith('/api/')){
  const user=current(req);if(!user)fail(401,'请先登录');
  if(await calls.handle(req,res,user,p))return;
  if(p==='/api/events'&&method==='GET')return options.openEventStream(req,res,user,eventClients,()=>Boolean(current(req)));
  if(p==='/api/me'&&method==='GET')return json(res,200,{user:safeUser(user)});
  if(p==='/api/logout'&&method==='POST'){const token=/(?:^|;\s*)glh_session=([a-f0-9]+)/.exec(req.headers.cookie||'')?.[1];if(token)run('DELETE FROM sessions WHERE token=?',hash(token));closeUserStreams(user.id);res.setHeader('Set-Cookie','glh_session=; HttpOnly; SameSite=Strict; Path=/gelianghao/; Max-Age=0');return json(res,200,{ok:true});}
  if(p==='/api/password'&&method==='POST'){const b=await body(req);limit(`password:${user.id}`,5,600000);if(String(b.oldPassword||'').length>128||!checkPassword(String(b.oldPassword||''),user.password))fail(400,'原密码不正确');const v=validateAccount({...user,password:b.password});run('UPDATE users SET password=? WHERE id=?',packPassword(v.password),user.id);run('DELETE FROM sessions WHERE user_id=?',user.id);closeUserStreams(user.id);session(req,res,user);return json(res,200,{ok:true});}
  if(p==='/api/invites'){
   if(user.role!=='admin')fail(403,'只有管理员能邀请新朋友');
   if(method==='GET')return json(res,200,{invites:all('SELECT id,label,expires,used_by,revoked,created FROM invites ORDER BY created DESC LIMIT 100')});
   if(method==='POST'){limit(`invite:${user.id}`,30,60000);const b=await body(req),code=randomBytes(18).toString('base64url'),id=randomUUID();run('INSERT INTO invites(id,hash,label,expires,created) VALUES(?,?,?,?,?)',id,hash(code),String(b.label||'朋友').slice(0,40),Date.now()+7*86400000,Date.now());return json(res,201,{code,id});}
  }
  if(p.startsWith('/api/invites/')&&method==='DELETE'){if(user.role!=='admin')fail(403,'没有权限');run('UPDATE invites SET revoked=1 WHERE id=?',p.split('/')[3]);return json(res,200,{ok:true});}
  if(p==='/api/users'&&method==='GET')return json(res,200,{users:all('SELECT id,username,name,role FROM users ORDER BY created')});
  if(p==='/api/rooms'&&method==='GET')return json(res,200,{rooms:listRooms(user)});
  if(p==='/api/rooms'&&method==='POST'){
   limit(`room:${user.id}`,30,60000);const b=await body(req),ids=[...new Set([user.id,...(Array.isArray(b.members)?b.members:[])])];
   if(ids.length<2||ids.length>30||ids.some(id=>typeof id!=='string'||!q('SELECT id FROM users WHERE id=?',id)))fail(400,'请选择 1–29 位已加入的朋友');
   const kind=b.kind==='direct'?'direct':'group';if(kind==='direct'&&ids.length!==2)fail(400,'私聊只能有两个人');
   const key=kind==='direct'?ids.sort().join(':'):null,existing=key?q('SELECT id FROM rooms WHERE direct_key=?',key):null;if(existing)return json(res,200,existing);
   const name=kind==='group'?String(b.name||'').trim().slice(0,40):'';if(kind==='group'&&!name)fail(400,'请输入群名');const id=randomUUID();
   tx(()=>{run('INSERT INTO rooms VALUES(?,?,?,?,?,?)',id,name,kind,user.id,key,Date.now());for(const uid of ids)run('INSERT INTO members(room_id,user_id) VALUES(?,?)',id,uid);});notify(id);return json(res,201,{id});
  }
  const deletion=p.match(/^\/api\/rooms\/([^/]+)\/messages\/([^/]+)$/);
  if(deletion&&method==='DELETE'){
   const [,room,id]=deletion;member(room,user.id);limit(`delete:${user.id}`,120,60000);
   const message=q('SELECT sender FROM messages WHERE id=? AND room_id=?',id,room);
   if(message&&message.sender!==user.id)fail(403,'只能删除自己发送的消息');
   if(message){
    const files=all('SELECT id FROM files WHERE message_id=?',id);
    for(const file of files){try{unlinkSync(path.join(dir,'files',file.id));}catch(e){if(e.code!=='ENOENT')throw e;}}
    tx(()=>{run('DELETE FROM files WHERE message_id=?',id);run('DELETE FROM messages WHERE id=? AND room_id=?',id,room);});
   }
   const ids=new Set(all('SELECT user_id FROM members WHERE room_id=?',room).map(m=>m.user_id));
   for(const client of eventClients)if(ids.has(client.userId)){try{client.res.write(`event: message-deleted\ndata: ${JSON.stringify({roomId:room,id})}\n\n`);}catch{eventClients.delete(client);}}
   notify(room);return json(res,200,{ok:true});
  }
  const match=p.match(/^\/api\/rooms\/([^/]+)\/(messages|read|upload)$/);
  if(match){const [,room,action]=match;member(room,user.id);
   if(action==='messages'&&method==='GET'){
    const before=Number(url.searchParams.get('before'))||Number.MAX_SAFE_INTEGER;
    const rows=all('SELECT m.*,u.name sender_name FROM messages m JOIN users u ON u.id=m.sender WHERE m.room_id=? AND m.seq<? ORDER BY m.seq DESC LIMIT 100',room,before).reverse();
    for(const m of rows)m.files=all('SELECT id,name,mime,size FROM files WHERE message_id=?',m.id);
    return json(res,200,{messages:rows,hasMore:rows.length===100,members:all('SELECT user_id,last_read FROM members WHERE room_id=?',room)});
   }
   if(action==='read'&&method==='POST'){const b=await body(req),seq=Number(b.seq);if(!Number.isSafeInteger(seq)||seq<0)fail(400,'消息位置无效');const oldRead=member(room,user.id).last_read;const max=q('SELECT COALESCE(MAX(seq),0) seq FROM messages WHERE room_id=?',room).seq;run('UPDATE members SET last_read=MAX(last_read,?) WHERE room_id=? AND user_id=?',Math.min(seq,max),room,user.id);if(Math.min(seq,max)>oldRead)notify(room);return json(res,200,{ok:true});}
   if(action==='upload'&&method==='POST'){
    limit(`upload:${user.id}`,30,60000);const declared=Number(req.headers['content-length']);if(declared>MAX_FILE)fail(413,'单个文件最大 20 MB');
    const name=String(decodeURIComponent(req.headers['x-file-name']||'文件')).replace(/[\r\n\/\\]/g,'_').slice(0,180),mime=String(req.headers['content-type']||'application/octet-stream').split(';')[0];
    const safeMime=/^(image\/(png|jpeg|gif|webp)|video\/(mp4|webm|quicktime)|audio\/(webm|ogg|mp4|mpeg|wav|x-m4a))$/.test(mime)?mime:'application/octet-stream';
    const data=await bytes(req,MAX_FILE);if(!data.length)fail(400,'不能发送空文件');const id=randomUUID();writeFileSync(path.join(dir,'files',id),data,{mode:0o600});
    try{run('INSERT INTO files VALUES(?,?,?,?,?,?,?,?)',id,room,user.id,name,safeMime,data.length,null,Date.now());}catch(e){unlinkSync(path.join(dir,'files',id));throw e;}return json(res,201,{id,name,mime:safeMime,size:data.length});
   }
   if(action==='messages'&&method==='POST'){
    limit(`message:${user.id}`,120,60000);const b=await body(req),text=String(b.text||'').trim(),client=String(b.clientId||'');
    if(!/^[a-zA-Z0-9-]{16,80}$/.test(client))fail(400,'消息标识无效');if(text.length>5000||(!text&&!b.fileId))fail(400,'消息不能为空，且最多 5000 字');
    const prev=q('SELECT id,room_id FROM messages WHERE sender=? AND client_id=?',user.id,client);if(prev){if(prev.room_id!==room)fail(409,'消息标识重复');return json(res,200,{id:prev.id});}
    if(b.fileId&&!q('SELECT id FROM files WHERE id=? AND owner=? AND room_id=? AND message_id IS NULL',String(b.fileId),user.id,room))fail(400,'附件不可用，请重新上传');
    const id=randomUUID();tx(()=>{const result=run('INSERT INTO messages(id,room_id,sender,text,client_id,created) VALUES(?,?,?,?,?,?)',id,room,user.id,text,client,Date.now());if(b.fileId)run('UPDATE files SET message_id=? WHERE id=?',id,b.fileId);run('UPDATE members SET last_read=? WHERE room_id=? AND user_id=?',Number(result.lastInsertRowid),room,user.id);});notify(room);return json(res,201,{id});
   }
  }
  if(p.startsWith('/api/files/')&&['GET','HEAD'].includes(method)){
   const f=q('SELECT * FROM files WHERE id=?',p.split('/')[3]);if(!f)fail(404,'文件不存在');member(f.room_id,user.id);if(!f.message_id&&f.owner!==user.id)fail(404,'文件不存在');
   const filename=path.join(dir,'files',f.id);if(!existsSync(filename))fail(404,'文件不存在');
   const download=url.searchParams.has('download')||f.mime==='application/octet-stream';res.setHeader('Content-Type',f.mime);res.setHeader('Content-Disposition',`${download?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);res.setHeader('Accept-Ranges','bytes');
   let start=0,end=f.size-1,status=200;
   if(req.headers.range){const r=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!r||(!r[1]&&!r[2])){res.setHeader('Content-Range',`bytes */${f.size}`);return res.writeHead(416).end();}if(!r[1])start=Math.max(0,f.size-Number(r[2]));else{start=Number(r[1]);if(r[2])end=Math.min(end,Number(r[2]));}if(start>end||start>=f.size){res.setHeader('Content-Range',`bytes */${f.size}`);return res.writeHead(416).end();}status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${f.size}`);}
   res.setHeader('Content-Length',end-start+1);res.writeHead(status);if(method==='HEAD')return res.end();return createReadStream(filename,{start,end}).pipe(res);
  }
  fail(404,'接口不存在');
 }
 if(!['GET','HEAD'].includes(method))fail(405,'不支持此请求');
 const file=p==='/'?'index.html':p.slice(1);if(!['index.html','app.js','style.css','icon.svg','manifest.webmanifest','calls.js','install.js','icon-180.png','icon-192.png','icon-512.png'].includes(file))fail(404,'页面不存在');
 res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.writeHead(200);res.end(method==='HEAD'?undefined:readFileSync(path.join(root,file)));
 }catch(e){if(res.headersSent){res.destroy();return;}if(!e.status)console.error('Request failed:',e.code||e.name);json(res,e.status||500,{error:e.status?e.message:'暂时无法完成，请稍后重试'});}
};
return {handle,purgeExpired,close(){clearInterval(cleanup);for(const c of eventClients)c.res.end();db.close();}};
}
module.exports={createPrivateChat};
