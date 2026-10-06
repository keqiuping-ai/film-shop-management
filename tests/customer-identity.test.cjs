const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const identity = require('../lib/customer-identity');
const source = fs.readFileSync('server.js','utf8');
function fn(name) { const start=source.indexOf(`function ${name}(`); assert.ok(start>=0,name); const end=source.indexOf('\nfunction ',start+1); return source.slice(start,end<0?undefined:end); }
const ctx=vm.createContext({customerIdentity:identity, console, Date, TextDecoder,
  inferProspectIntent:(item,value)=>value||'普通',inferProspectIntentReason:()=>'',
  normalizeProspectSpeaker:(value)=>value||'customer',cleanImportedText:v=>String(v||'').trim(),cleanImportedConversationText:v=>String(v||'').trim(),
  prospectTextKey:v=>String(v||'').trim().toLowerCase(),normalizedPhone:v=>String(v||'').replace(/\D/g,'').slice(-10),prospectMessagesToText:rows=>rows.map(x=>x.text).join('\n')});
for(const name of ['parseMaybeJsonArray','normalizeProspectMessages','prospectMessageKey','mergeProspectMessages','appendUniqueText','mergeProspect','prospectIdentityKey','customerConversationSafeDuplicateKey','findProspectDuplicate','findMetaConversation']) vm.runInContext(fn(name),ctx);
const merge=(a,b)=>ctx.mergeProspect(a,b);
const enrich=(db,item)=>{item.phone ||= item.formPhone||'';};
const run=db=>identity.reconcile(db,{merge,enrich});
const msg=(id,text,extra={})=>({id,text,speaker:'customer',channel:'meta',timestamp:'2026-10-06T01:00:00Z',...extra});
const record=(id,extra={})=>({id,phone:'+1 619-549-3277',customer:'Adik',source:'Meta / Facebook',vehicle:'BMW X7',createdAt:id==='a'?'2026-10-01':'2026-10-02',...extra});
test('US formatting variants share identity; foreign numbers, short numbers and extensions do not collide',()=>{
 for(const phone of ['+1 619-549-3277','(619) 549-3277','6195493277','0016195493277']) assert.equal(identity.phoneKey(phone),'16195493277');
 assert.notEqual(identity.phoneKey('+44 6195493277'),identity.phoneKey('+1 6195493277'));
 for(const phone of ['', '12345', '0000000000', '+1 6195493277 ext 12']) assert.equal(identity.phoneKey(phone),'');
});
test('lead ad and placeholder messenger record match by phone despite different names/IDs',()=>{
 const a=record('a',{externalId:'meta-leadgen:123'}), b=record('b',{customer:'Meta Customer',phone:'(619) 549-3277',externalId:'meta-messenger:456'});
 assert.equal(ctx.findProspectDuplicate([a],b),a);
});
test('merge keeps both histories, media, metadata, true name, followup, appointment and channel bindings',()=>{
 const a=record('a',{status:'已预约',ownerId:'employee',followUpDate:'2026-10-08',conversationMessages:[msg('one','hello',{attachment:{url:'/a.jpg'},aiExperienceIds:['experience']})]});
 const b=record('b',{customer:'Meta Customer',vehicle:'',status:'新意向',externalId:'meta-messenger:psid',externalBusinessId:'page',conversationMessages:[msg('two','quote')]});
 const db={customerConversations:[b,a]};assert.equal(run(db),1);const r=db.customerConversations[0];
 assert.equal(r.id,'a');assert.equal(r.customer,'Adik');assert.equal(r.status,'已预约');assert.equal(r.ownerId,'employee');assert.equal(r.followUpDate,'2026-10-08');
 assert.equal(r.conversationMessages.length,2);assert.equal(r.conversationMessages[0].attachment.url,'/a.jpg');assert.equal(r.conversationMessages[0].aiExperienceIds[0],'experience');
 assert.equal(r.metaPsid,'psid');assert.equal(identity.resolveId(db,'b'),'a');assert.equal(db.customerConversationMergeArchive[0].original.id,'b');
});
test('repeat reconciliation is idempotent; new messages append once',()=>{
 const db={customerConversations:[record('a',{conversationMessages:[msg('one','hello')]}),record('b',{conversationMessages:[msg('one','hello'),msg('two','quote')]})]};
 run(db);const json=JSON.stringify(db);assert.equal(run(db),0);assert.equal(JSON.stringify(db),json);
 db.customerConversations.push(record('c',{conversationMessages:[msg('two','quote'),msg('three','new')]}));run(db);assert.equal(db.customerConversations[0].conversationMessages.length,3);
});
test('distinct vehicles are retained without recursively growing combined names',()=>{
 let a=record('a');a=merge(a,record('b',{vehicle:'Tesla Y'}));assert.equal(a.vehicle,'Tesla Y');assert.equal(a.customerVehicles.length,2);
 for(let i=0;i<5;i++) a=merge(a,record('b',{vehicle:'Tesla Y'}));assert.equal(a.vehicle,'Tesla Y');assert.equal(a.customerVehicles.length,2);
});
test('phone revealed later by webhook merges and resolves old platform IDs on both platforms',()=>{
 const a=record('a',{externalId:'meta-leadgen:lead'}),b=record('b',{phone:'',formPhone:'6195493277',externalId:'meta-instagram:ig',source:'Meta / Instagram',externalBusinessId:'ig-page',metaPlatform:'instagram'});
 const db={customerConversations:[a,b]};run(db);assert.equal(ctx.findMetaConversation(db,'ig-page','ig','instagram').item.id,'a');assert.equal(ctx.findMetaConversation(db,'other-page','ig','instagram'),null);
 const c=record('c',{externalId:'meta-messenger:fb',externalBusinessId:'fb-page'});db.customerConversations.push(c);run(db);
 assert.equal(ctx.findMetaConversation(db,'ig-page','ig','instagram').item.id,'a');assert.equal(ctx.findMetaConversation(db,'fb-page','fb','facebook').item.id,'a');
});
test('a later lead form cannot erase messenger routing; Yelp keeps its own ID',()=>{
 let a=record('a',{externalId:'meta-messenger:psid',externalBusinessId:'page'});
 a=merge(a,record('b',{externalId:'meta-leadgen:lead',externalBusinessId:'lead-page'}));assert.equal(a.metaPsid,'psid');assert.equal(a.externalBusinessId,'page');
 a=merge(a,record('c',{source:'Yelp',externalId:'yelp-lead',externalBusinessId:'yelp-biz'}));assert.equal(identity.yelpIdentity(a).externalId,'yelp-lead');assert.equal(a.externalBusinessId,'page');
});
test('rewires customer references, retains historical audit and synchronizes appointment conversations',()=>{
 const db={customerConversations:[record('a'),record('b')],prospects:[{id:'p',promotedFromConversationId:'b',conversationMessages:[msg('p','appointment')]}],tasks:[{collection:'customerConversations',recordId:'b'}],auditLog:[{collection:'customerConversations',recordId:'b'}]};
 run(db);assert.equal(db.tasks[0].recordId,'a');assert.equal(db.auditLog[0].recordId,'b');assert.equal(db.prospects[0].promotedFromConversationId,'a');assert.equal(db.customerConversations[0].conversationMessages[0].text,'appointment');
 db.customerConversations[0].conversationMessages.push(msg('new','reply'));run(db);assert.equal(db.prospects[0].conversationMessages.length,2);
});
test('unidentified or differing valid phones are never coalesced',()=>{
 const db={customerConversations:[record('a',{phone:''}),record('b',{phone:''}),record('c',{phone:'+44 6195493277'}),record('d')]};assert.equal(run(db),0);assert.equal(db.customerConversations.length,4);
});

test('a provider response on a record merged while awaiting network is retained',()=>{
 const old=record('b',{conversationMessages:[msg('old','old')]});
 const db={customerPhoneIdentityVersion:'v1',customerConversations:[record('a'),old]};
 run(db);old.conversationMessages.push(msg('delayed','provider completed',{direction:'outbound',speaker:'shop'}));run(db);
 assert.ok(db.customerConversations[0].conversationMessages.some(x=>x.id==='delayed'));
});

test('a deleted message stays deleted across appointment copies and later merges',()=>{
 const db={customerConversations:[record('a',{conversationMessages:[msg('delete','old')],deletedCustomerMessageIds:['delete']})],prospects:[{id:'p',promotedFromConversationId:'a',conversationMessages:[msg('delete','old')]}]};
 run(db);assert.equal(db.customerConversations[0].conversationMessages.length,0);assert.equal(db.prospects[0].conversationMessages.length,0);
});
