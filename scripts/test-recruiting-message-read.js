'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecruitingService } = require('../lib/recruiting');

function fixture() {
  const db = {
    users:[], recruitingInterviews:[], recruitingAudit:[], recruitingQuarantine:[],
    recruitingCandidates:[{
      id:'candidate-1', name:'Synthetic Candidate', phone:'+15005550006', email:'', messages:[
        { id:'outbound-1', direction:'outbound', text:'Hello', timestamp:'2026-09-18T10:00:00.000Z', status:'delivered' },
        { id:'inbound-1', direction:'inbound', text:'Yes', timestamp:'2026-09-18T10:01:00.000Z', status:'received' }
      ]
    }]
  };
  let sent;
  const service = createRecruitingService({
    readDb:() => db, writeDb:() => {}, readBody:async () => ({}),
    send:(_res, status, body) => { sent = { status, body }; },
    canAccess:(actor, permission) => permission === 'recruitingView' || Boolean(actor.edit),
    sendSms:async () => ({}), smsConfigured:() => false, publicBaseUrl:() => 'https://quad.example',
    dataDir:'/tmp/quad-recruiting-message-read-fixture', notify:() => {}
  });
  const call = async actor => {
    sent = null;
    await service.handle({ method:'POST' }, {}, new URL('https://quad.example/api/recruiting/candidates/candidate-1/messages-read'), actor);
    return sent;
  };
  return { db, call };
}

test('opening recruiting messages marks inbound replies read only for the current user', async () => {
  const { db, call } = fixture();
  const owner = await call({ id:'owner-1', name:'Owner', edit:false });
  assert.equal(owner.status, 200);
  assert.equal(owner.body.marked, 1);
  assert.deepEqual(db.recruitingCandidates[0].messages[1].readByUserIds, ['owner-1']);
  assert.equal(db.recruitingCandidates[0].messages[0].readByUserIds, undefined);

  const repeated = await call({ id:'owner-1', name:'Owner', edit:false });
  assert.equal(repeated.body.marked, 0);
  const coworker = await call({ id:'coworker-1', name:'Coworker', edit:false });
  assert.equal(coworker.body.marked, 1);
  assert.deepEqual(db.recruitingCandidates[0].messages[1].readByUserIds, ['owner-1', 'coworker-1']);
});
