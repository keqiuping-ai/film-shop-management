const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');
const server=fs.readFileSync('server.js','utf8');
test('all 107 stock colors have full-size images and distinct codes',()=>{
 const rows=JSON.parse(fs.readFileSync('public/retail/wrap-examples.json')).filter(x=>x.group==='stock');
 assert.equal(rows.length,107);assert.equal(new Set(rows.map(x=>x.id)).size,107);
 for(const row of rows){assert.ok(fs.existsSync('public'+row.image)); assert.ok(fs.existsSync('public'+row.thumbnail));}
});
function fixture({success=true}={}) {
 let key='customerConversations:a', calls=0, release;
 const fields={prospectReplyInput:{value:''},prospectReplyChannel:{value:'sms'},prospectSendSmsButton:{}};
 const context=vm.createContext({Map,Set,Image:function(){},document:{getElementById:id=>fields[id]},alert:()=>{},
  customerReplyContainsChinese:()=>false,captureProspectWorkspaceDraft:()=>{},renderProspectWorkspace:()=>{},
  activeCustomerWorkspaceItem:()=>({collection:key.split(':')[0],item:{id:key.split(':')[1]}}),
  sendProspectMessageCore:async()=>{calls++;return success;}
 });
 vm.runInContext('let prospectPendingAttachment=null;'+app.slice(app.indexOf('let wrapReplyCatalog ='),app.indexOf('function openReplyReferenceLibrary(')),context);
 vm.runInContext(`wrapReplyQueues.set('customerConversations:a',[{id:'one',attachment:{url:'a',type:'image/jpeg'}},{id:'two',attachment:{url:'b',type:'image/jpeg'}}]);`,context);
 return {context,fields,calls:()=>calls,switch:()=>{key='customerConversations:b';},queue:()=>vm.runInContext("wrapReplyQueues.get('customerConversations:a').map(x=>x.id)",context)};
}
test('one click sends one image and removes only successful image',async()=>{
 const f=fixture();await f.context.sendProspectMessage();assert.equal(f.calls(),1);assert.deepEqual([...f.queue()],['two']);
});
test('failed send retains selected image and subsequent images',async()=>{
 const f=fixture({success:false});await f.context.sendProspectMessage();assert.deepEqual([...f.queue()],['one','two']);
});
test('switching customer during image preparation prevents send',async()=>{
 const f=fixture();let release;f.context.prepareWrapReplyImage=()=>new Promise(r=>release=r);
 const job=f.context.sendProspectMessage();f.switch();release({url:'image',type:'image/jpeg'});await job;assert.equal(f.calls(),0);assert.equal(f.queue().length,2);
});
test('double click cannot send the same queued image concurrently',async()=>{
 const f=fixture();let release;f.context.prepareWrapReplyImage=()=>new Promise(r=>release=r);
 const job=f.context.sendProspectMessage();await f.context.sendProspectMessage();release({url:'image',type:'image/jpeg'});await job;assert.equal(f.calls(),1);
});
test('Meta route sends image once and persists image metadata',async()=>{
 const route=server.slice(server.indexOf("  if (req.method === 'POST' && url.pathname === '/api/meta/send')"),server.indexOf("  if (req.method === 'POST' && url.pathname === '/api/twilio/send')"));
 let imageCalls=0,textCalls=0,saved,response;
 const db={customerConversations:[{id:'a',conversationMessages:[]}]};
 const context=vm.createContext({req:{method:'POST'},res:{},url:{pathname:'/api/meta/send'},db,user:{name:'Tester'},
 canAccess:()=>true,readBody:async()=>({collection:'customerConversations',id:'a',text:'',attachment:{url:'https://test/customer-media/abcdef123456.jpg',type:'image/jpeg',name:'TPUQD45.jpg',size:100}}),
 send:(res,status,body)=>{response={status,body};},customerServiceRequiredReplyChannel:()=>'',metaPsidFromItem:()=> 'psid',requestPublicBaseUrl:()=> 'https://test',customerOutboundLanguageError:()=>'',
 sendMetaMessengerImage:async()=>{imageCalls++;return {messageId:'image-1'};},sendMetaMessengerReply:async()=>{textCalls++;},
 appendMetaMessengerMessage:item=>item.conversationMessages.push({id:'image-1'}),audit:()=>{},writeDb:value=>{saved=value;},notifyDataChanged:()=>{},sanitizeDbForUser:x=>x});
 await vm.runInContext('(async()=>{'+route+'})()',context);
 assert.equal(response.status,200);assert.equal(imageCalls,1);assert.equal(textCalls,0);assert.equal(saved.customerConversations[0].conversationMessages[0].attachment.kind,'image');
});
