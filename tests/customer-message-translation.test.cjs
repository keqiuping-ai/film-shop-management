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

test('Meta customer lead form accepts its exact displayed City-header projection',async()=>{
 const f=fixture();
 const form='full_name: Example Customer\nwhat_service_are_you_looking_for?: vinyl_color_change_wrap\ncity: Redlands Ca';
 const item=f.db().prospects[0];
 item.source='Meta / Facebook';
 item.conversationMessages.push({speaker:'system',messageType:'lead-form',channel:'meta',text:form});
 item.chatContext='City: Redlands Ca\n'+form;
 assert.ok(f.context.customerTranslationTexts(item).includes(item.chatContext));
 const request=f.context.customerMessageTranslation(f.db(),'prospects','p',item.chatContext);
 f.release(); assert.equal((await request).text,'你好世界');
 item.chatContext='Unrelated staff note';
 assert.ok(!f.context.customerTranslationTexts(item).includes(item.chatContext));
});
test('customer translation forces Chinese structured output while internal chat keeps its direction',async()=>{
 const requests=[];
 const context=vm.createContext({
  openAiCustomerReplyKey:()=> 'test-only', customerAiReplyModel:()=> 'gpt-5-mini',process:{env:{}},
  parseAiBossDraft:JSON.parse,
  fetchAiJson:async(url,options)=>{const request=JSON.parse(options.body); requests.push(request); return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({translatedText:request.response_format.type==='json_schema'?'服务：全车改色，亮面':'Hello'})}}]};}
 });
 vm.runInContext(source.slice(source.indexOf('async function translateInternalMessageWithAi'),source.indexOf('// Translation is internal display')),context);
 const customer=await context.translateInternalMessageWithAi({},'service: vinyl_color_change_wrap',{customer:true});
 assert.equal(customer.targetLanguage,'zh');
 assert.equal(customer.text,'服务：全车改色，亮面');
 assert.equal(requests[0].response_format.json_schema.strict,true);
 const internal=await context.translateInternalMessageWithAi({},'你好');
 assert.equal(internal.targetLanguage,'en');
 assert.equal(requests[1].response_format.type,'json_object');
});
