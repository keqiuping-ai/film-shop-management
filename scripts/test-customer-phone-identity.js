const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const crypto=require('node:crypto');const {spawn}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'quad-phone-identity-'));
const port=49000+Math.floor(Math.random()*500),base=`http://127.0.0.1:${port}`;
let child,output='',token='';
const db=()=>JSON.parse(fs.readFileSync(path.join(dir,'db.json'),'utf8'));
async function start(){child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{PATH:process.env.PATH,DATA_DIR:dir,HOST:'127.0.0.1',PORT:String(port),ENABLE_CLOUD_DAILY_BACKUPS:'false',META_APP_SECRET:'test-only',CUSTOMER_CONVERSATION_IMPORT_TOKEN_META:'test-import'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error(output);}
async function stop(){if(child){child.kill();await new Promise(r=>child.once('exit',r));child=null;}}
async function request(url,body,method='POST',headers={}){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
async function hook(mid,text){const body={object:'page',entry:[{id:'test-page',messaging:[{sender:{id:'test-psid'},recipient:{id:'test-page'},timestamp:Date.now(),message:{mid,text}}]}]};return request('/api/meta/webhook',body,'POST',{'x-hub-signature-256':'sha256='+crypto.createHmac('sha256','test-only').update(JSON.stringify(body)).digest('hex')});}
(async()=>{try{
 await start();token=(await request('/api/login',{email:'admin@filmshop.local',password:'admin123'})).body.token;assert.ok(token);
 const input={date:'2026-10-06',source:'Meta / Facebook',customer:'Adik',phone:'+16195493277',vehicle:'BMW X7',externalId:'meta-leadgen:test-lead',conversationMessages:[{id:'lead',text:'BMW quote',speaker:'customer'}]};
 let r=await request('/api/import/customer-conversations',input,'POST',{'X-Import-Token':'test-import'});assert.equal(r.status,200,JSON.stringify(r.body));
 const original=db().customerConversations.find(x=>x.phone===input.phone);assert.ok(original);
 r=await hook('m1','Full name: Adik\nPhone number: (619) 549-3277\nPlease send a quote');assert.equal(r.status,200,JSON.stringify(r.body));
 let rows=db().customerConversations.filter(x=>x.phone.replace(/\D/g,'').endsWith('6195493277'));assert.equal(rows.length,1);assert.equal(rows[0].id,original.id);assert.equal(rows[0].customer,'Adik');assert.equal(rows[0].metaPsid,'test-psid');assert.ok(rows[0].conversationMessages.some(x=>x.text.includes('Please send a quote')));
 const alias=rows[0].mergedDuplicateIds[0];assert.ok(alias);assert.ok(db().customerConversationMergeArchive.some(x=>x.original.id===alias));
 const staleProfile=JSON.parse(JSON.stringify(rows[0]));
 await hook('m2','Can I visit tomorrow?');rows=db().customerConversations.filter(x=>x.id===original.id);assert.equal(rows[0].conversationMessages.filter(x=>x.providerSid==='m2').length,1);
 await hook('m2','Can I visit tomorrow?');assert.equal(db().customerConversations.find(x=>x.id===original.id).conversationMessages.filter(x=>x.providerSid==='m2').length,1);
 r=await request('/api/customerConversations',{...input,customer:'Meta Customer',phone:'(619) 549-3277'});assert.equal(r.status,200);assert.equal(db().customerConversations.filter(x=>x.phone.replace(/\D/g,'').endsWith('6195493277')).length,1);
 r=await request('/api/customerConversations/'+alias,{customer:'stale edit'},'PUT');assert.equal(r.status,409);
 r=await request('/api/customerConversations/'+alias,null,'DELETE');assert.equal(r.status,409);
 r=await request('/api/customerConversations/'+original.id,{...staleProfile,ownerName:'Staff test'},'PUT');assert.equal(r.status,200);assert.ok(db().customerConversations.find(x=>x.id===original.id).conversationMessages.some(x=>x.providerSid==='m2'));
 r=await request('/api/customer-messages/customerConversations/'+original.id+'/meta-m2',null,'DELETE');assert.equal(r.status,200);
 r=await request('/api/customerConversations/'+original.id,staleProfile,'PUT');assert.equal(r.status,200);assert.ok(!db().customerConversations.find(x=>x.id===original.id).conversationMessages.some(x=>x.providerSid==='m2'));
 // Phone edits also enforce the same invariant.
 r=await request('/api/customerConversations',{...input,externalId:'other',customer:'Another',phone:'+13105550123'});assert.equal(r.status,200);
 const other=db().customerConversations.find(x=>x.phone==='+13105550123');assert.ok(other);
 r=await request('/api/customerConversations/'+other.id,{phone:'6195493277'},'PUT');assert.equal(r.status,200);assert.equal(db().customerConversations.filter(x=>x.phone.replace(/\D/g,'').endsWith('6195493277')).length,1);
 // Simulate a pre-release DB and verify startup backup + historical consolidation.
 await stop();const historical=db();delete historical.customerPhoneIdentityVersion;historical.customerConversations.push({...input,id:'historical',phone:'6195493277',conversationMessages:[{id:'legacy',speaker:'customer',text:'Historical message'}]});fs.writeFileSync(path.join(dir,'db.json'),JSON.stringify(historical));await start();assert.equal(db().customerPhoneIdentityVersion,'2026-10-06-v1');assert.ok(db().customerConversations.find(x=>x.id===original.id).conversationMessages.some(x=>x.id==='legacy'));assert.ok(fs.readdirSync(path.join(dir,'backups')).length);
 console.log('Customer phone identity HTTP tests passed: import, Meta webhook/replay, manual create, phone edit, stale IDs, historical backup/migration.');
}finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
