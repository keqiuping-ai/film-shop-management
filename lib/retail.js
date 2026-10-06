'use strict';
const crypto=require('node:crypto');
const pricing=require('../public/retail/ppf-pricing');
const links=require('./retail-payment-links.json');
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const clean=(s,n=2000)=>String(s||'').trim().slice(0,n);
const now=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID();
const validProducts=new Set(['ppf','wrap','tint','building','home']);
module.exports=function createRetail(ctx){
 const limits=new Map();
 function rate(req,key,max){const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'').split(',')[0].trim();const k=key+ip,t=Date.now();let row=limits.get(k);if(!row||t-row.t>60000){row={t,n:0};limits.set(k,row)}if(limits.size>10000)for(const [id,r]of limits)if(t-r.t>60000)limits.delete(id);return ++row.n<=max}
 function record(db,s){let row=(db[s.collection]||[]).find(r=>r.id===s.customerId&&!r.deletedAt);if(row?.promotedProspectId){const next=(db.prospects||[]).find(r=>r.id===row.promotedProspectId&&!r.deletedAt);if(next)return next}return row}
 function ensureRecord(db,s){let row=record(db,s);if(row)return row;if(s.customerId)throw Error('This conversation is no longer available. Contact the shop.');db.customerConversations ||= [];row={id:uid(),date:now().slice(0,10),customer:s.profile?.name||'Retail visitor '+s.id.slice(0,8),phone:s.profile?.phone||'',source:'Retail web',status:'新意向',intentLevel:'待判断',need:'Retail product consultation',service:'ppf',createdAt:now(),updatedAt:now(),conversationMessages:[],retailSessionId:s.id};s.collection='customerConversations';s.customerId=row.id;db.customerConversations.unshift(row);return row}
 function message(row,s,text,speaker,actor,requestId){const old=(row.conversationMessages||[]).find(m=>m.channel==='retail'&&m.retailSessionId===s.id&&m.clientMessageId===requestId&&m.speaker===speaker);if(old){if(old.text!==text)throw Error('Message retry content changed.');return old}const m={id:uid(),speaker,speakerName:speaker==='shop'?(actor?.name||'QUAD FILM'):(s.profile?.name||'Customer'),direction:speaker==='shop'?'outbound':'inbound',channel:'retail',text,timestamp:now(),status:'sent',retailSessionId:s.id,clientMessageId:requestId};row.conversationMessages ||= [];row.conversationMessages.push(m);row.updatedAt=m.timestamp;if(speaker==='customer'){row.lastCustomerMessageAt=m.timestamp;row.customerUnread=true;row.status=['已预约','已到店','已转施工单'].includes(row.status)?row.status:'新意向';}else row.lastShopMessageAt=m.timestamp;return m}
 function snapshot(db,s){const row=record(db,s);return {id:s.id,linked:!!s.invited,profile:s.profile||{},quotes:s.quotes||[],events:[],messages:(row?.conversationMessages||[]).filter(m=>m.channel==='retail'&&m.retailSessionId===s.id).slice(-300).map(m=>({id:m.id,role:m.speaker==='shop'?'staff':'customer',text:m.text,at:m.timestamp}))}}
 function cookie(req,res,token){res.setHeader('Set-Cookie',`quad_retail=${token}; HttpOnly; SameSite=Lax; Path=/api/retail; Max-Age=2592000${req.headers['x-forwarded-proto']==='https'||req.socket?.encrypted?'; Secure':''}`)}
 async function handle(req,res,url){
 if(!url.pathname.startsWith('/api/retail/'))return false;
 const send=(status,data)=>{res.setHeader('Cache-Control','no-store');ctx.send(res,status,data);return true};
 res.setHeader('Referrer-Policy','no-referrer');
 if(!['GET','POST'].includes(req.method))return send(405,{error:'Method not allowed'});
 const origin=req.headers.origin;if(origin){let host;try{host=new URL(origin).host}catch{return send(403,{error:'Origin rejected'})}if(host!==req.headers.host)return send(403,{error:'Origin rejected'})}
 const route=url.pathname.slice('/api/retail/'.length);
 if(!rate(req,req.method==='GET'?'read':'write',req.method==='GET'?300:60))return send(429,{error:'Too many requests. Try again shortly.'});
 let body={};if(req.method==='POST'){try{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>24000)return send(413,{error:'Request too large'})}body=JSON.parse(raw||'{}');if(!body||Array.isArray(body)||typeof body!=='object')return send(400,{error:'Invalid request'})}catch{return send(400,{error:'Invalid request'})}}
 const db=ctx.readDb();db.retailSessions ||= [];
 if(route.startsWith('staff/')){
 const user=ctx.currentUser(req,db);if(!user)return send(401,{error:'Please sign in.'});
 if(!ctx.canAccess(user,req.method==='GET'?'prospectsView':'prospectsEdit'))return send(403,{error:'Customer access required.'});
 const collection=clean(body.collection||url.searchParams.get('collection'),40),customerId=clean(body.customerId||url.searchParams.get('customerId'),100);
 if(!['customerConversations','prospects'].includes(collection))return send(400,{error:'Invalid customer type.'});
 const row=(db[collection]||[]).find(r=>r.id===customerId&&!r.deletedAt);if(!row||!ctx.canAccessCollectionBranch(db,user,collection,row.branchId))return send(404,{error:'Customer not found.'});
 let s=db.retailSessions.find(s=>s.customerId===customerId&&s.collection===collection)||db.retailSessions.find(s=>record(db,s)?.id===customerId);
 if(route==='staff/thread'&&req.method==='GET')return send(200,{...(s?snapshot(db,s):{messages:[],quotes:[]}),hasLink:!!s?.inviteHash,expiresAt:s?.inviteExpiresAt||null});
 if(route==='staff/link'&&req.method==='POST'){
 if(!s){s={id:uid(),collection,customerId,created:now(),updated:now(),quotes:[],events:[],profile:{},auth:[]};db.retailSessions.push(s)}
 if(body.retainExisting===true){s.previousInvites=(s.previousInvites||[]).filter(i=>Date.parse(i.expiresAt)>Date.now());if(s.inviteHash)s.previousInvites.push({hash:s.inviteHash,expiresAt:s.inviteExpiresAt});}else{s.previousInvites=[];s.auth=[];}
 const token=crypto.randomBytes(32).toString('base64url');s.inviteHash=hash(token);s.inviteExpiresAt=new Date(Date.now()+90*86400000).toISOString();s.invited=true;s.updated=now();ctx.writeDb(db);ctx.notify('retail-link',customerId);
 return send(200,{url:ctx.publicBaseUrl(req)+'/retail/index.html#invite/'+token,expiresAt:s.inviteExpiresAt});}
 if(route==='staff/revoke'&&req.method==='POST'){if(s){delete s.inviteHash;s.previousInvites=[];s.auth=[];ctx.writeDb(db)}return send(200,{ok:true})}
 if(route==='staff/reply'&&req.method==='POST'){
 if(!s)return send(404,{error:'No retail conversation yet.'});const text=clean(body.text),key=clean(body.requestKey,100);if(!text||!key)return send(400,{error:'Message and request ID required.'});
 try{message(record(db,s),s,text,'shop',user,key)}catch(e){return send(409,{error:e.message})}s.updated=now();ctx.writeDb(db);ctx.notify('retail-message',customerId);return send(200,{ok:true});}
 return send(404,{error:'Not found'});
 }
 if(route==='payment-options'&&req.method==='GET')return send(200,{available:[100,200,500].filter(n=>links[n])});
 const token=clean((req.headers.cookie||'').match(/(?:^|;\s*)quad_retail=([A-Za-z0-9_-]+)/)?.[1],100);let s=token?db.retailSessions.find(s=>(s.auth||[]).some(a=>a.hash===hash(token)&&a.expires>Date.now())):null;
 if(route==='redeem'&&req.method==='POST'){
 if(!rate(req,'redeem',15))return send(429,{error:'Too many link attempts.'});const inviteDigest=hash(clean(body.token,100));const inviteExpiry=s=>s.inviteHash===inviteDigest?s.inviteExpiresAt:(s.previousInvites||[]).find(i=>i.hash===inviteDigest)?.expiresAt;s=db.retailSessions.find(s=>Date.parse(inviteExpiry(s))>Date.now());if(!s||!record(db,s))return send(403,{error:'This link has expired or was replaced. Ask the shop for a new link.'});
 const auth=crypto.randomBytes(32).toString('base64url');s.auth=(s.auth||[]).filter(a=>a.expires>Date.now()).slice(-19);s.auth.push({hash:hash(auth),expires:Math.min(Date.now()+30*86400000,Date.parse(inviteExpiry(s)))});cookie(req,res,auth);ctx.writeDb(db);return send(200,{ok:true});}
 if(!s){if(route!=='session'||req.method!=='GET')return send(401,{error:'Please reopen your customer link.'});if(!rate(req,'new',20))return send(429,{error:'Too many new sessions.'});const auth=crypto.randomBytes(32).toString('base64url');s={id:uid(),created:now(),updated:now(),auth:[{hash:hash(auth),expires:Date.now()+30*86400000}],profile:{},quotes:[],events:[]};db.retailSessions.push(s);cookie(req,res,auth);ctx.writeDb(db)}
 if(route==='session'&&req.method==='GET')return send(200,snapshot(db,s));
 if(req.method!=='POST')return send(404,{error:'Not found'});
 if(route==='profile'){s.profile={name:clean(body.name,80),phone:clean(body.phone,40)};const row=ensureRecord(db,s);if(!s.invited){row.customer=s.profile.name||row.customer;row.phone=s.profile.phone||row.phone}row.retailContact=s.profile;}
 else if(route==='events'){s.events=(s.events||[]).concat({type:clean(body.type,80),value:clean(body.value,300),at:now()}).slice(-50);}
 else if(route==='messages'){const text=clean(body.text),key=clean(body.requestKey,100);if(!text||!key)return send(400,{error:'Message and request ID required.'});const row=ensureRecord(db,s);try{message(row,s,text,'customer',null,key)}catch(e){return send(409,{error:e.message})}}
 else if(route==='quotes'){
 const key=clean(body.requestKey,80);if(!key)return send(400,{error:'Request ID required.'});
 const payload={name:clean(body.name,80),contact:clean(body.contact,120),vehicle:clean(body.vehicle,200),product:body.product,finish:clean(body.finish,20),parts:[...new Set(Array.isArray(body.parts)?body.parts:[])].sort(),year:clean(body.year,4),address:clean(body.address,200),deposit:Number(body.deposit),tint:null,wrapCodes:[...new Set(Array.isArray(body.wrapCodes)?body.wrapCodes.map(x=>clean(x,60)).slice(0,30):[])]};
 if(!validProducts.has(payload.product)||!payload.name||payload.contact.replace(/\D/g,'').length<7||!payload.vehicle||![100,200,500].includes(payload.deposit))return send(400,{error:'Enter your name, phone, vehicle or project, and deposit.'});
 if(['ppf','wrap','tint'].includes(payload.product)&&(!/^\d{4}$/.test(payload.year)||+payload.year<1900||+payload.year>new Date().getFullYear()+2))return send(400,{error:'Enter a valid vehicle year.'});
 if(payload.product==='ppf'&&(!['亮面','缎面','哑光'].includes(payload.finish)||!payload.parts.length||payload.parts.some(x=>!pricing.parts.some(p=>p[0]===x))||(payload.parts.includes('full')&&payload.parts.length!==1)||(payload.finish!=='亮面'&&!payload.parts.includes('full'))))return send(400,{error:'Select valid PPF coverage.'});
 let tintEstimate=null;
 if(payload.product==='tint'){
 const catalogs={basic:{total:350,models:['P20','P10']},nano:{total:650,models:['NA70','NA28','NA15','NA10']},premium:{total:850,models:['SP70','SP50','SP20','SP10']}};
 const areas=['前挡','后挡','左前门','右前门','左后门','右后门'],t=body.tint,catalog=catalogs[t?.series];
 if(!catalog||!catalog.models.includes(t.model)||!Array.isArray(t.areas)||!t.areas.length||t.areas.some(a=>!areas.includes(a)))return send(400,{error:'Select valid window film and windows.'});
 payload.tint={series:t.series,model:t.model,areas:areas.filter(a=>t.areas.includes(a))};
 const cents=catalog.total*100,third=Math.round(cents/3),remaining=cents-third*2,each=Math.floor(remaining/4),prices=[third,third,...Array.from({length:4},(_,i)=>each+(i<remaining%4?1:0))];
 tintEstimate=areas.reduce((sum,a,i)=>sum+(payload.tint.areas.includes(a)?prices[i]:0),0)/100;
 }
 const digest=hash(JSON.stringify(payload)),old=s.quotes.find(q=>q.requestKey===key);if(old)return send(old.payloadHash===digest?200:409,old.payloadHash===digest?{ok:true,id:old.id}:{error:'Booking changed. Please submit again.'});
 const q={...payload,id:'R-'+crypto.randomBytes(8).toString('hex').toUpperCase(),requestKey:key,payloadHash:digest,estimate:payload.product==='ppf'?pricing.total(payload.parts):tintEstimate,status:'appointment_requested',paymentStatus:'awaiting_payment',at:now()};s.quotes.push(q);s.profile={name:payload.name,phone:payload.contact};const row=ensureRecord(db,s);row.retailContact=s.profile;row.retailQuoteIds=[...new Set([...(row.retailQuoteIds||[]),q.id])];message(row,s,`Booking ${q.id}: ${payload.product} · ${payload.vehicle} ${payload.year} · $${q.deposit} deposit selected (payment not confirmed).`,'customer',null,'quote-'+q.id);s.updated=now();ctx.writeDb(db);ctx.notify('retail-booking',row.id);return send(200,{ok:true,id:q.id});
 }
 else if(route==='checkout'){const q=s.quotes.find(q=>q.id===body.quoteId);if(!q||!links[q.deposit])return send(404,{error:'Booking not found.'});const u=new URL(links[q.deposit]);if(u.protocol!=='https:'||u.hostname!=='buy.stripe.com'||u.pathname.includes('test_'))return send(503,{error:'Payment link unavailable.'});u.searchParams.set('client_reference_id',q.id);u.searchParams.set('locale',['en','es','ja','ko','zh'].includes(body.locale)?body.locale:'en');return send(200,{url:u.href});}
 else return send(404,{error:'Not found'});
 s.updated=now();ctx.writeDb(db);if(s.customerId&&route!=='events')ctx.notify('retail-message',s.customerId);return send(200,{ok:true});
 }
 return {handle};
};
