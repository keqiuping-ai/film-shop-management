const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');
const source = fs.readFileSync('server.js','utf8');
function fixture() {
  let calls = 0, release;
  let persisted = {prospects:[{id:'p', conversationMessages:[{direction:'inbound',text:'Hello world'},{direction:'outbound',text:'Shop reply'}]}]};
  const context = vm.createContext({crypto, Map, Date,
    customerServiceMessageRole:m=>m.direction === 'inbound'?'customer':'shop',
    isYelpSystemNotificationMessage:()=>false,
    readDb:()=>structuredClone(persisted), writeDb:db=>{persisted=db;},
    translateInternalMessageWithAi:async(db,text,options)=>{calls++;assert.equal(options.customer,true); await new Promise(resolve=>{release=resolve}); return {text:'你好世界',targetLanguage:'zh'};}
  });
  vm.runInContext(source.slice(source.indexOf('const customerTranslationJobs ='),source.indexOf('function customerAiReplyModel(')),context);
  return {context, db:()=>persisted, calls:()=>calls, release:()=>release()};
}
test('deduplicates concurrent requests, caches, and preserves concurrent edits',async()=>{
 const f=fixture();
 const a=f.context.customerMessageTranslation(f.db(),'prospects','p','Hello world');
 const b=f.context.customerMessageTranslation(f.db(),'prospects','p','Hello world');
 assert.equal(f.calls(),1);
 f.db().prospects[0].customer='Updated while translating';
 f.db().prospects[0].conversationMessages.push({direction:'inbound',text:'New message'});
 f.release(); await Promise.all([a,b]);
 assert.equal(f.db().prospects[0].customer,'Updated while translating');
 assert.equal(f.db().prospects[0].conversationMessages.length,3);
 await f.context.customerMessageTranslation(f.db(),'prospects','p','Hello world');
 assert.equal(f.calls(),1);
});
test('rejects shop and arbitrary text; does not persist deleted source',async()=>{
 const f=fixture();
 await assert.rejects(f.context.customerMessageTranslation(f.db(),'prospects','p','Shop reply'));
 await assert.rejects(f.context.customerMessageTranslation(f.db(),'prospects','p','Invented text'));
 const a=f.context.customerMessageTranslation(f.db(),'prospects','p','Hello world');
 f.db().prospects[0].conversationMessages=[]; f.release();
 assert.equal(await a,null);
 assert.equal(f.db().prospects[0].customerMessageTranslations,undefined);
});
test('UI only translates customer language content and escapes translation',()=>{
 const app=fs.readFileSync('public/app.js','utf8');
 const context=vm.createContext({escapeHtml:s=>s.replaceAll('<','&lt;')});
 vm.runInContext(app.slice(app.indexOf('function customerTranslationEligible('),app.indexOf('async function translateCustomerMessages(')),context);
 for(const text of ['你好！','12345','https://example.com','Meta attachment: template']) assert.equal(context.customerTranslationEligible({role:'customer',text}),false,text);
 for(const text of ['Hello','Hola','你好 hello','こんにちは']) assert.equal(context.customerTranslationEligible({role:'customer',text}),true,text);
 assert.equal(context.customerTranslationEligible({role:'shop',text:'Hello'}),false);
 const html=context.customerTranslationHtml({customerMessageTranslations:{a:{sourceText:'Hello',text:'<你好>'}}},{role:'customer',text:'Hello'},0);
 assert.match(html,/&lt;你好>/); assert.match(html,/AI 中文/);
});
