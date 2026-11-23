'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const create = require('../lib/operations');
function fixture() {
 let db={users:[{id:'owner',role:'owner',active:true,name:'Owner'},{id:'a',role:'sales',active:true,name:'Assigned'},{id:'b',role:'sales',active:true,name:'Other'}]};
 const route=create({readDb:()=>db,writeDb:v=>{db=structuredClone(v);},readBody:async req=>req.body,send:(res,status,body)=>Object.assign(res,{status,body}),audit:()=>{},notifyDataChanged:()=>{}});
 async function call(path,method='GET',body={},who='owner'){const res={};await route({method,body},res,new URL('http://local/api/operations'+path),db.users.find(u=>u.id===who));return res;}
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
 assert.equal((await f.call(path,'POST',{},'a')).status,403);assert.equal((await f.call(path,'POST')).body.added,11);assert.equal((await f.call(path,'POST')).body.added,0);
 assert(f.db().operations.tasks.filter(t=>t.templateKey).every(t=>t.status==='unverified'&&t.applicability==='unverified'&&!t.assignedUserIds.length&&!t.dueDate));
});
test('recurrence handles month ends, leap years, future and one-time dates',()=>{
 assert.equal(create.nextReview('2026-01-31',1,'2026-01-31'),'2026-02-28');assert.equal(create.nextReview('2028-01-31',1,'2028-01-31'),'2028-02-29');assert.equal(create.nextReview('2026-01-31',1,'2026-02-28'),'2026-03-31');assert.equal(create.nextReview('2026-01-01',3,'2026-11-23'),'2027-01-01');assert.equal(create.nextReview('2026-12-01',1,'2026-11-23'),'2026-12-01');assert.equal(create.nextReview('2026-01-31',0),'');
});
