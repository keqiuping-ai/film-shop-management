'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const create = require('../lib/operations');
function fixture() {
 let db={users:[{id:'owner',role:'owner',active:true,name:'Owner'},{id:'a',role:'sales',active:true,name:'Assigned'},{id:'b',role:'sales',active:true,name:'Other'}]};
 const route=create({readDb:()=>db,writeDb:v=>{db=structuredClone(v);},readBody:async req=>req.body,send:(res,status,body)=>Object.assign(res,{status,body}),audit:()=>{},notifyDataChanged:()=>{}});
 async function call(path,method='GET',body={},who='owner'){const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(bytes){this.bytes=bytes;}};await route({method,body},res,new URL('http://local/api/operations'+path),db.users.find(u=>u.id===who));return res;}
 return {call,db:()=>db};
}
async function setup(){
 const f=fixture();const entity=(await f.call('/entities','POST',{name:'Las Vegas',city:'Las Vegas',status:'待核实'})).body.item;
 const contact=(await f.call('/contacts','POST',{entityId:entity.id,name:'Accountant',phone:'test-only'})).body.item;
 const taskBody={entityId:entity.id,title:'Property tax',category:'Tax',applicability:'unverified',status:'pending',assignedUserIds:['a'],contactIds:[contact.id],dueDate:'2026-01-01',reviewDate:'2026-01-31',reviewMonths:1,details:'Verify',evidence:''};
 const task=(await f.call('/tasks','POST',taskBody)).body.item;return {...f,entity,contact,task,taskBody};
}
test('owners create records; assigned staff see only their linked records',async()=>{
 const f=await setup();assert.equal(f.entity.legalName,'');
 const a=(await f.call('','GET',{},'a')).body;assert.equal(a.tasks.length,1);assert.equal(a.entities.length,1);assert.equal(a.contacts.length,1);
 const b=(await f.call('','GET',{},'b')).body;assert.deepEqual(b.tasks,[]);assert.deepEqual(b.entities,[]);assert.deepEqual(b.contacts,[]);
 assert.equal((await f.call('/tasks','POST',f.taskBody,'a')).status,403);
 assert.equal((await f.call(`/tasks/${f.task.id}/review`,'POST',{version:1,status:'completed',note:'attempt'},'b')).status,403);
});
test('review preserves history and deadline, advances schedule, rejects stale edits',async()=>{
 const f=await setup();const res=await f.call(`/tasks/${f.task.id}/review`,'POST',{version:1,status:'completed',note:'Receipt confirmed',evidence:'Local test reference'},'a');
 assert.equal(res.status,200);assert.equal(res.body.item.history.length,1);assert.equal(res.body.item.history[0].previousStatus,'pending');assert.equal(res.body.item.history[0].userId,'a');assert.equal(res.body.item.dueDate,'2026-01-01');assert(res.body.item.reviewDate>create.today());
 assert.equal((await f.call(`/tasks/${f.task.id}`,'PUT',{...f.taskBody,version:1})).status,409);
 assert.equal((await f.call(`/tasks/${f.task.id}/review`,'POST',{version:2,status:'completed',note:''},'a')).status,400);
});
test('invalid input and cross-company contacts do not persist',async()=>{
 const f=await setup();const count=f.db().operations.tasks.length;
 for(const change of [{dueDate:'2026-02-30'},{assignedUserIds:['unknown']},{contactIds:['unknown']},{reviewDate:''},{reviewMonths:-1}])assert.equal((await f.call('/tasks','POST',{...f.taskBody,...change})).status,400);
 const other=(await f.call('/entities','POST',{name:'Los Angeles'})).body.item;
 assert.equal((await f.call('/tasks','POST',{...f.taskBody,entityId:other.id})).status,400);assert.equal(f.db().operations.tasks.length,count);
 assert.equal((await f.call(`/contacts/${f.contact.id}`,'PUT',{...f.contact,entityId:other.id,version:1})).status,400);
});
test('starter checklist is unverified, owner-only and idempotent',async()=>{
 const f=await setup();const path=`/entities/${f.entity.id}/starter`;
 assert.equal((await f.call(path,'POST',{},'a')).status,403);assert.equal((await f.call(path,'POST')).body.added,16);assert.equal((await f.call(path,'POST')).body.added,0);
 assert(f.db().operations.tasks.filter(t=>t.templateKey).every(t=>t.status==='unverified'&&t.applicability==='unverified'&&!t.assignedUserIds.length&&!t.dueDate));
});
test('recurrence handles month ends, leap years, future and one-time dates',()=>{
 assert.equal(create.nextReview('2026-01-31',1,'2026-01-31'),'2026-02-28');assert.equal(create.nextReview('2028-01-31',1,'2028-01-31'),'2028-02-29');assert.equal(create.nextReview('2026-01-31',1,'2026-02-28'),'2026-03-31');assert.equal(create.nextReview('2026-01-01',3,'2026-11-23'),'2027-01-01');assert.equal(create.nextReview('2026-12-01',1,'2026-11-23'),'2026-12-01');assert.equal(create.nextReview('2026-01-31',0),'');
});

test('private attachments persist without binary data in snapshots; downloads require current assignment',async()=>{
 const f=await setup(); const bytes=Buffer.from('%PDF-1.4\nlocal-test-document\n%%EOF');
 const body={name:'营业执照.pdf',type:'application/pdf',kind:'license',description:'测试执照复印件',documentDate:'2026-11-23',contentBase64:bytes.toString('base64'),requestId:'upload-1'};
 const path=`/tasks/${f.task.id}/attachments`;
 const uploaded=await f.call(path,'POST',body,'a');assert.equal(uploaded.status,201);
 const file=uploaded.body.item.attachments[0];assert.equal(file.description,body.description);assert.equal(file.contentBase64,undefined);
 assert.equal(f.db().operations.tasks[0].attachments[0].contentBase64,body.contentBase64);
 const snapshot=(await f.call('','GET',{},'a')).body;assert.equal(snapshot.tasks[0].attachments[0].contentBase64,undefined);
 const downloaded=await f.call(path+'/'+file.id,'GET',{},'a');assert.equal(downloaded.status,200);assert.deepEqual(downloaded.bytes,bytes);assert.equal(downloaded.headers['Cache-Control'],'private, no-store');
 assert.equal((await f.call(path+'/'+file.id,'GET',{},'b')).status,404);
 assert.equal((await f.call(path,'POST',body,'b')).status,404);
 assert.equal((await f.call(path,'POST',body,'a')).status,200);assert.equal(f.db().operations.tasks[0].attachments.length,1);
 await f.call(path,'POST',{...body,requestId:'upload-2'},'a');assert.equal(f.db().operations.tasks[0].attachments.length,2);
 const current=f.db().operations.tasks[0];
 assert.equal((await f.call(`/tasks/${f.task.id}`,'PUT',{...f.taskBody,assignedUserIds:[],version:current.version})).status,200);
 assert.equal((await f.call(path+'/'+file.id,'GET',{},'a')).status,404);
});
test('documents reject spoofed or invalid input without saving',async()=>{
 const f=await setup(); const body={name:'bill.pdf',type:'application/pdf',kind:'bill',contentBase64:Buffer.from('%PDF-1.4 test').toString('base64'),requestId:'upload'};
 for(const change of [{type:'text/html'},{name:'bad.html'},{contentBase64:Buffer.from('<html>test</html>').toString('base64')},{contentBase64:'invalid!=='},{documentDate:'2026-02-30'},{kind:'unknown'},{requestId:''},{contentBase64:'A'.repeat(Math.ceil(8*1024*1024/3)*4+4)}]) assert.equal((await f.call(`/tasks/${f.task.id}/attachments`,'POST',{...body,...change},'a')).status,400);
 assert.equal(f.db().operations.tasks[0].attachments,undefined);
});
test('bill text and append-only comments survive edits and reviews; retries do not duplicate',async()=>{
 const f=await setup();let updated=await f.call(`/tasks/${f.task.id}`,'PUT',{...f.taskBody,billDetails:'2026年11月账单：待核实',version:1});assert.equal(updated.status,200);
 const path=`/tasks/${f.task.id}/comments`,body={text:'已联系代办人，等待文件。',requestId:'comment-1'};
 assert.equal((await f.call(path,'POST',body,'a')).status,201);assert.equal((await f.call(path,'POST',body,'a')).status,200);
 assert.equal((await f.call(path,'POST',body,'b')).status,404);assert.equal((await f.call(path,'POST',{text:'',requestId:'comment-2'},'a')).status,400);
 let current=f.db().operations.tasks[0];assert.equal(current.comments.length,1);assert.equal(current.comments[0].userId,'a');assert.equal(current.billDetails,'2026年11月账单：待核实');
 updated=await f.call(`/tasks/${f.task.id}/review`,'POST',{version:current.version,status:'waiting',note:'等待代办'},'a');assert.equal(updated.status,200);assert.equal(updated.body.item.comments.length,1);assert.equal(updated.body.item.billDetails,current.billDetails);
 current=f.db().operations.tasks[0];
 updated=await f.call(`/tasks/${f.task.id}`,'PUT',{...f.taskBody,version:current.version,comments:[],attachments:[]});assert.equal(updated.status,200);assert.equal(updated.body.item.comments.length,1);assert.equal(updated.body.item.billDetails,current.billDetails);
});
test('periodic bills separate payer from responsible user and preserve updates and next-year dates',async()=>{
 const f=await setup(),path=`/tasks/${f.task.id}/bills`;
 const body={label:'Starlink monthly service',provider:'Starlink',amount:'120.00',currency:'USD',status:'unpaid',dueDate:'2026-12-01',periodStart:'2026-12-01',periodEnd:'2026-12-31',paidThroughDate:'',nextDueDate:'2027-01-01',paidBy:'',paidDate:'',paymentMethod:'',reference:'',note:'Awaiting invoice verification',attachmentIds:[],requestId:'bill-1'};
 const created=await f.call(path,'POST',body,'a');assert.equal(created.status,201);let b=created.body.item.bills[0];assert.equal(b.nextDueDate,'2027-01-01');assert.equal(b.userId,'a');
 assert.equal((await f.call(path,'POST',body,'a')).status,200);assert.equal(f.db().operations.tasks[0].bills.length,1);
 assert.equal((await f.call(path,'POST',body,'b')).status,404);
 const update={...body,status:'paid',paidBy:'Owner paid personally',paidDate:'2026-11-23',paidThroughDate:'2026-12-31',paymentMethod:'Bank transfer',reference:'demo-reference',requestId:'bill-paid',version:b.version};
 const paid=await f.call(path+'/'+b.id,'PUT',update,'owner');assert.equal(paid.status,200);b=paid.body.item.bills[0];assert.equal(b.paidBy,'Owner paid personally');assert.equal(b.userId,'a');assert.equal(b.history.length,1);assert.equal(b.history[0].before.status,'unpaid');assert.equal(b.history[0].before.history,undefined);
 assert.equal((await f.call(path+'/'+b.id,'PUT',update,'owner')).status,200);
 assert.equal((await f.call(path+'/'+b.id,'PUT',{...update,requestId:'stale'},'owner')).status,409);
 const next=await f.call(path,'POST',{...body,label:'Starlink January 2027',periodStart:'2027-01-01',periodEnd:'2027-01-31',nextDueDate:'2027-02-01',requestId:'bill-next'},'a');assert.equal(next.status,201);assert.equal(next.body.item.bills.length,2);assert.equal(next.body.item.bills[0].paidThroughDate,'2026-12-31');
});
test('billing rejects incomplete paid claims, invalid money, dates and foreign receipts',async()=>{
 const f=await setup(),path=`/tasks/${f.task.id}/bills`,body={label:'Internet',provider:'Starlink',amount:'120',currency:'USD',status:'unpaid',requestId:'test',attachmentIds:[]};
 for(const change of [{status:'paid'},{amount:'-1'},{amount:'NaN'},{amount:'10.123'},{periodStart:'2027-02-01',periodEnd:'2027-01-01'},{nextDueDate:'2027-02-30'},{attachmentIds:['another-task-file']},{currency:'US'}])assert.equal((await f.call(path,'POST',{...body,...change},'a')).status,400);
 assert.equal(f.db().operations.tasks[0].bills,undefined);
});
