'use strict';

// Synthetic, in-memory tests only: no production data, credentials, filesystem
// writes, Twilio requests, or real text messages are used by this suite.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createRecruitingService, sharedPhoneTestActive, ingestInbound, ingestStatus, phoneKey
} = require('../lib/recruiting');

const OWNER = { id:'synthetic-owner', name:'Synthetic Owner', role:'owner', view:true, edit:true };
const EDITOR = { id:'synthetic-editor', name:'Synthetic Editor', role:'manager', view:true, edit:true };
const VIEWER = { id:'synthetic-viewer', name:'Synthetic Viewer', role:'staff', view:true, edit:false };
const NO_ACCESS = { id:'synthetic-no-access', role:'staff', view:false, edit:false };
const PHONE = '+15005554446';
const CANDIDATE_ID = 'synthetic-shared-test';
const CANDIDATE_PATH = `/api/recruiting/candidates/${CANDIDATE_ID}`;
const TEST_PATH = `${CANDIDATE_PATH}/test-sms`;
const MESSAGE_PATH = `${CANDIDATE_PATH}/messages`;
const HOUR = 3600000;
const clone = value => JSON.parse(JSON.stringify(value));

function fixture({ configured = true, shared = true } = {}) {
  let db = {
    users:[OWNER, EDITOR, VIEWER, NO_ACCESS],
    recruitingCandidates:[{
      id:CANDIDATE_ID, name:'Synthetic Test Candidate', phone:PHONE, email:'test-candidate@example.invalid',
      status:'new', smsConsent:true, smsConsentNote:'Synthetic recipient explicitly authorized this test.', smsOptedOut:false,
      resumeText:'Synthetic private resume evidence.', messages:[]
    }],
    recruitingInterviews:[], recruitingAudit:[], recruitingQuarantine:[],
    customerConversations:shared ? [{ id:'synthetic-customer', customer:'Synthetic customer', phone:'(500) 555-4446', conversationMessages:[{ text:'Private original customer history', providerSid:'SMsynthetic-old-customer' }] }] : [],
    prospects:[], portalCustomers:[], jobs:[]
  };
  let writes = 0;
  const providerCalls = [], notifications = [];
  const service = createRecruitingService({
    readDb:() => clone(db), writeDb:value => { writes++; db = clone(value); },
    canAccess:(actor, permission) => Boolean(actor?.[permission === 'recruitingView' ? 'view' : 'edit']),
    readBody:async req => req.body,
    send:(res, status, body) => { res.status = status; res.body = body; },
    sendSms:async payload => {
      providerCalls.push(clone(payload));
      return { sid:`SMsynthetic-outbound-${providerCalls.length}`, status:'queued' };
    },
    smsConfigured:() => configured, publicBaseUrl:() => 'https://fixture.invalid',
    dataDir:'/not-accessed-by-shared-phone-test-suite',
    notify:(...args) => notifications.push(args)
  });
  const request = async (method, pathname, body, actor = OWNER) => {
    const response = {};
    const handled = await service.handle({ method, body }, response, new URL(pathname, 'https://fixture.invalid'), actor);
    assert.equal(handled, true);
    return response;
  };
  const enable = (body = {}, actor = OWNER) => request('POST', TEST_PATH, {
    enabled:true, expectedPhone:PHONE, reason:'Owner confirms this synthetic number is for a bounded recruiting test.', ...body
  }, actor);
  const send = (body = {}, actor = OWNER) => request('POST', MESSAGE_PATH, {
    text:'Hello, this is a synthetic recruiting test.', clientMessageId:'synthetic-message-001', expectedPhone:PHONE, ...body
  }, actor);
  return {
    get db() { return db; }, service, request, enable, send, providerCalls, notifications,
    candidate:() => db.recruitingCandidates.find(row => row.id === CANDIDATE_ID),
    stats:() => ({ writes, providerCalls:providerCalls.length })
  };
}

function inbound(f, { text = 'Synthetic test reply.', sid = 'SMsynthetic-inbound-001', at, from = PHONE, ...extra } = {}) {
  const approved = f.candidate().smsSharedPhoneTest?.approvedAt;
  return ingestInbound(f.db, {
    From:from, To:'+15005550001', Body:text, MessageSid:sid,
    DateSent:at || (approved ? new Date(Date.parse(approved) + 1).toISOString() : new Date().toISOString()), ...extra
  });
}

test('owner approval binds one full phone and record for 24 hours without granting consent or sending', async () => {
  const f = fixture();
  const beforeConsent = [f.candidate().smsConsent, f.candidate().smsConsentNote, f.candidate().smsOptedOut];
  const customerBefore = JSON.stringify(f.db.customerConversations);
  const response = await f.enable({ expectedPhone:'(500) 555-4446', reason:'  Synthetic own-number test.  ' });
  assert.equal(response.status, 200);
  const approval = f.candidate().smsSharedPhoneTest;
  assert.equal(approval.enabled, true);
  assert.equal(approval.candidateId, CANDIDATE_ID);
  assert.equal(approval.phoneKey, '5005554446');
  assert.equal(approval.reason, 'Synthetic own-number test.');
  assert.equal(approval.approvedByUserId, OWNER.id);
  assert.equal(approval.approvedByRole, 'owner');
  assert.equal(Date.parse(approval.expiresAt) - Date.parse(approval.approvedAt), 24 * HOUR);
  assert.equal(response.body.candidate.smsCustomerPhoneConflict, true);
  assert.equal(response.body.candidate.smsSharedPhoneTestActive, true);
  assert.deepEqual([f.candidate().smsConsent, f.candidate().smsConsentNote, f.candidate().smsOptedOut], beforeConsent);
  assert.equal(JSON.stringify(f.db.customerConversations), customerBefore);
  assert.deepEqual(f.stats(), { writes:1, providerCalls:0 });
  assert.equal(f.db.recruitingAudit[0].action, 'enable-recruiting-test-sms');
  assert.equal(f.db.recruitingAudit[0].userId, OWNER.id);
  assert.equal(f.db.recruitingAudit[0].recordId, CANDIDATE_ID);
  assert.equal(f.db.recruitingAudit[0].details.reason, 'Synthetic own-number test.');
  assert.equal(f.db.recruitingAudit[0].details.phoneKey, '5005554446');
  assert.equal(f.db.recruitingAudit[0].details.approvedByUserId, OWNER.id);
  assert.deepEqual(f.notifications[0][2], [OWNER.id, EDITOR.id, VIEWER.id]);
});

test('test approval requires owner role and both recruiting permissions', async () => {
  for (const actor of [EDITOR, VIEWER, NO_ACCESS, { ...OWNER, view:false }, { ...OWNER, edit:false }, null]) {
    const f = fixture(), before = JSON.stringify(f.db);
    const response = await f.enable({}, actor);
    assert.equal(response.status, 403);
    assert.equal(JSON.stringify(f.db), before);
    assert.deepEqual(f.stats(), { writes:0, providerCalls:0 });
  }
  const f = fixture();
  const response = await f.enable({}, EDITOR);
  assert.equal(response.body.code, 'SMS_TEST_OWNER_REQUIRED');
  assert.equal((await f.request('GET', TEST_PATH)).status, 405);
});

test('approval rejects unbound phones, invalid forms and client-forged approval metadata', async () => {
  for (const body of [
    { enabled:'true' }, { enabled:null }, { reason:'' }, { reason:' \n ' }, { reason:null }, { reason:'x'.repeat(1001) },
    { expectedPhone:'4446' }, { expectedPhone:'+15006664446' }, { expectedPhone:'' }, { expectedPhone:null },
    { approvedByUserId:'forged-owner' }, { expiresAt:'2099-01-01T00:00:00.000Z' }, { candidateId:'another-id' }
  ]) {
    const f = fixture(), before = JSON.stringify(f.db);
    const response = await f.enable(body);
    assert.ok([400, 409].includes(response.status), JSON.stringify(body));
    assert.equal(JSON.stringify(f.db), before);
    assert.deepEqual(f.stats(), { writes:0, providerCalls:0 });
  }
  const f = fixture();
  assert.equal((await f.enable({ expectedPhone:'+15006664446' })).body.code, 'SMS_RECIPIENT_CHANGED');
  assert.equal((await f.enable({ reason:'' })).body.code, 'SMS_TEST_REASON_REQUIRED');
  assert.equal((await f.request('POST', '/api/recruiting/candidates/missing/test-sms', { enabled:true, expectedPhone:PHONE, reason:'Test' })).status, 404);
});

test('approval cannot create consent, clear STOP or enable duplicate candidate phones', async () => {
  for (const [changes, code] of [
    [{ smsConsent:false }, 'SMS_CONSENT_REQUIRED'],
    [{ smsConsentNote:'' }, 'SMS_CONSENT_REQUIRED'],
    [{ smsConsentNote:'   ' }, 'SMS_CONSENT_REQUIRED'],
    [{ smsOptedOut:true }, 'SMS_OPTED_OUT']
  ]) {
    const f = fixture(); Object.assign(f.candidate(), changes);
    const before = JSON.stringify(f.db), response = await f.enable();
    assert.equal(response.status, 409);
    assert.equal(response.body.code, code);
    assert.equal(JSON.stringify(f.db), before);
    assert.equal(f.providerCalls.length, 0);
  }
  const f = fixture();
  f.db.recruitingCandidates.push({ id:'synthetic-duplicate', phone:'5005554446', messages:[] });
  assert.equal((await f.enable()).body.code, 'PHONE_AMBIGUOUS');
  assert.equal(f.stats().writes, 0);
});

test('ordinary candidate writes cannot mass-assign approval or computed snapshot fields', async () => {
  const f = fixture();
  for (const field of ['smsSharedPhoneTest', 'smsSharedPhoneTestActive', 'smsCustomerPhoneConflict', 'smsCustomerOptedOut']) {
    const before = JSON.stringify(f.db);
    assert.equal((await f.request('PATCH', CANDIDATE_PATH, { [field]:true })).status, 400);
    assert.equal((await f.request('POST', '/api/recruiting/candidates', { name:'Synthetic forged approval', [field]:true })).status, 400);
    assert.equal(JSON.stringify(f.db), before);
  }
  assert.deepEqual(f.stats(), { writes:0, providerCalls:0 });
});

test('active-test helper fails closed on identity, phone, approval and window mismatches', () => {
  const f = fixture(), candidate = f.candidate(), now = Date.now();
  const valid = {
    enabled:true, candidateId:CANDIDATE_ID, phoneKey:phoneKey(PHONE), reason:'Synthetic owner test',
    approvedByUserId:OWNER.id, approvedByRole:'owner',
    approvedAt:new Date(now - HOUR).toISOString(), expiresAt:new Date(now + 23 * HOUR).toISOString()
  };
  candidate.smsSharedPhoneTest = clone(valid);
  assert.equal(sharedPhoneTestActive(f.db, candidate), true);
  assert.equal(sharedPhoneTestActive(f.db, candidate, valid.approvedAt), true);
  assert.equal(sharedPhoneTestActive(f.db, candidate, Date.parse(valid.approvedAt) - 1), false);
  assert.equal(sharedPhoneTestActive(f.db, candidate, valid.expiresAt), false);
  assert.equal(sharedPhoneTestActive(f.db, candidate, 'invalid-time'), false);
  assert.equal(sharedPhoneTestActive(f.db, null), false);
  for (const change of [
    { enabled:false }, { enabled:'true' }, { candidateId:'copied-record' }, { phoneKey:'5006664446' }, { phoneKey:'' },
    { approvedByUserId:'' }, { approvedByRole:'manager' }, { reason:'' }, { reason:'  ' }, { reason:{} }, { reason:123 },
    { approvedAt:'invalid' }, { expiresAt:'invalid' }, { expiresAt:new Date(now - 1).toISOString() },
    { approvedAt:new Date(now + HOUR).toISOString() }, { expiresAt:new Date(now + 24 * HOUR).toISOString() }
  ]) {
    candidate.smsSharedPhoneTest = { ...valid, ...change };
    assert.equal(sharedPhoneTestActive(f.db, candidate), false, JSON.stringify(change));
  }
  candidate.smsSharedPhoneTest = clone(valid);
  const copied = { ...candidate, id:'other-record' };
  assert.equal(sharedPhoneTestActive(f.db, copied), false, 'Copying a record never copies authorization');
  candidate.phone = '+15006664446';
  assert.equal(sharedPhoneTestActive(f.db, candidate), false, 'Matching last four digits is insufficient');
  candidate.phone = '500-555-4446';
  assert.equal(sharedPhoneTestActive(f.db, candidate), true, 'Equivalent full US phone formatting is valid');
  f.db.recruitingCandidates.push({ id:'synthetic-duplicate', phone:PHONE });
  assert.equal(sharedPhoneTestActive(f.db, candidate), false, 'Duplicate candidate records disable the exception');
});

test('snapshot enriches only recruiting responses without persisting derived flags or leaking to denied readers', async () => {
  const f = fixture();
  let response = await f.request('GET', '/api/recruiting');
  assert.equal(response.body.candidates[0].smsCustomerPhoneConflict, true);
  assert.equal(response.body.candidates[0].smsCustomerOptedOut, false);
  assert.equal(response.body.candidates[0].smsSharedPhoneTestActive, false);
  await f.enable();
  response = await f.request('GET', '/api/recruiting', undefined, VIEWER);
  assert.equal(response.status, 200);
  assert.equal(response.body.candidates[0].smsSharedPhoneTestActive, true);
  assert.equal(response.body.settings.smsSharedPhoneTestHours, 24);
  assert.equal(Object.hasOwn(f.candidate(), 'smsSharedPhoneTestActive'), false);
  assert.equal(Object.hasOwn(f.candidate(), 'smsCustomerPhoneConflict'), false);
  assert.equal(Object.hasOwn(f.candidate(), 'smsCustomerOptedOut'), false);
  const denied = await f.request('GET', '/api/recruiting', undefined, NO_ACCESS);
  assert.equal(denied.status, 403);
  assert.doesNotMatch(JSON.stringify(denied.body), /Synthetic Test Candidate|private resume|5005554446/);
  const normal = fixture({ shared:false });
  assert.equal((await normal.request('GET', '/api/recruiting')).body.candidates[0].smsCustomerPhoneConflict, false);
});

test('unapproved shared number remains blocked; approved manual send is audited, bound and idempotent', async () => {
  const f = fixture(), customerBefore = JSON.stringify(f.db.customerConversations);
  let response = await f.send();
  assert.equal(response.status, 409);
  assert.equal(response.body.code, 'PHONE_CUSTOMER_CONFLICT');
  assert.deepEqual(f.stats(), { writes:0, providerCalls:0 });
  await f.enable();
  response = await f.send();
  assert.equal(response.status, 201);
  assert.equal(f.providerCalls.length, 1);
  assert.equal(f.providerCalls[0].to, PHONE);
  assert.equal(f.providerCalls[0].purpose, 'recruiting');
  assert.match(f.providerCalls[0].statusCallback, /candidateId=synthetic-shared-test&recruitingMessageId=/);
  assert.equal(response.body.message.sharedPhoneTest.approvedByUserId, OWNER.id);
  assert.equal(response.body.message.status, 'queued');
  assert.ok(f.db.recruitingAudit.some(row => row.action === 'send-recruiting-test-sms' && row.recordId === CANDIDATE_ID));
  assert.equal((await f.send()).body.duplicate, true);
  assert.equal((await f.send({ clientMessageId:'synthetic-new-id-same-text' })).body.duplicate, true);
  assert.equal(f.providerCalls.length, 1);
  assert.equal((await f.send({ text:'Different body, same ID.' })).body.code, 'MESSAGE_ID_CONFLICT');
  const sent = response.body.message;
  assert.equal(ingestStatus(f.db, { MessageSid:sent.providerSid, MessageStatus:'delivered', To:PHONE }, new URLSearchParams()), true);
  assert.equal(f.candidate().messages[0].status, 'delivered');
  assert.equal(JSON.stringify(f.db.customerConversations), customerBefore);
});

test('approved test never bypasses recipient, English, consent, opt-out, channel or permissions protections', async () => {
  for (const [body, changes, expected] of [
    [{ expectedPhone:'+15006664446' }, {}, 'SMS_RECIPIENT_CHANGED'],
    [{ text:'Hello 你好' }, {}, 'SMS_ENGLISH_REQUIRED'],
    [{ text:'Hello 𠀀' }, {}, 'SMS_ENGLISH_REQUIRED'],
    [{ text:'' }, {}, 'RECRUITING_VALIDATION'],
    [{ text:'x'.repeat(1601) }, {}, 'RECRUITING_VALIDATION'],
    [{}, { smsConsent:false }, 'SMS_CONSENT_REQUIRED'],
    [{}, { smsConsentNote:'' }, 'SMS_CONSENT_REQUIRED'],
    [{}, { smsOptedOut:true }, 'SMS_OPTED_OUT']
  ]) {
    const f = fixture(); await f.enable(); Object.assign(f.candidate(), changes);
    const before = JSON.stringify(f.db), response = await f.send(body);
    assert.equal(response.body.code, expected);
    assert.equal(f.providerCalls.length, 0);
    assert.equal(JSON.stringify(f.db), before);
  }
  const unavailable = fixture({ configured:false }); await unavailable.enable();
  assert.equal((await unavailable.send()).body.code, 'SMS_NOT_CONFIGURED');
  assert.equal(unavailable.providerCalls.length, 0);
  const denied = fixture(); await denied.enable();
  assert.equal((await denied.send({}, VIEWER)).status, 403);
  assert.equal(denied.providerCalls.length, 0);
  const duplicate = fixture(); await duplicate.enable();
  duplicate.db.recruitingCandidates.push({ id:'another-id', phone:PHONE });
  assert.equal((await duplicate.send()).status, 409);
  assert.equal(duplicate.providerCalls.length, 0);
});

test('existing customer opt-out in every conflict collection blocks owner approval without altering original flags', async () => {
  for (const [collection, phoneField] of [
    ['customerConversations', 'phone'], ['prospects', 'phone'], ['portalCustomers', 'contactPhone'], ['jobs', 'customerPhone']
  ]) {
    for (const flag of [{ smsOptedOut:true }, { marketingOptOutAt:'2026-01-01T00:00:00.000Z' }]) {
      const f = fixture({ shared:false });
      f.db[collection].push({ id:'synthetic-opted-out-customer', [phoneField]:'500-555-4446', ...flag });
      const before = JSON.stringify(f.db);
      const snapshot = await f.request('GET', '/api/recruiting');
      assert.equal(snapshot.body.candidates[0].smsCustomerPhoneConflict, true);
      assert.equal(snapshot.body.candidates[0].smsCustomerOptedOut, true);
      assert.equal(snapshot.body.candidates[0].smsSharedPhoneTestActive, false);
      const response = await f.enable();
      assert.equal(response.status, 409, `${collection} ${JSON.stringify(flag)}`);
      assert.equal(response.body.code, 'SMS_OPTED_OUT');
      assert.equal(JSON.stringify(f.db), before);
      assert.deepEqual(f.stats(), { writes:0, providerCalls:0 });
    }
  }
});

test('later customer opt-out still blocks an already-approved test and candidate START cannot erase customer opt-out', async () => {
  for (const flag of [{ smsOptedOut:true }, { marketingOptOutAt:'2026-01-01T00:00:00.000Z' }]) {
    const f = fixture(); await f.enable();
    Object.assign(f.db.customerConversations[0], flag);
    const customerBefore = JSON.stringify(f.db.customerConversations);
    inbound(f, { text:'START', sid:'SMsynthetic-candidate-start-customer-opted-out' });
    assert.equal(f.candidate().smsOptedOut, false);
    const response = await f.send();
    assert.equal(response.status, 409);
    assert.equal(response.body.code, 'SMS_OPTED_OUT');
    assert.equal(f.providerCalls.length, 0);
    assert.equal(JSON.stringify(f.db.customerConversations), customerBefore);
    assert.equal((await f.enable({ enabled:false, reason:'Revoke after customer opt-out.' })).status, 200);
    assert.equal(f.candidate().smsSharedPhoneTest.enabled, false, 'Opt-out must not prevent revoking the exception');
    assert.equal(JSON.stringify(f.db.customerConversations), customerBefore);
  }
  const unrelated = fixture();
  unrelated.db.prospects.push({ id:'synthetic-unrelated-opt-out', phone:'+15006664446', smsOptedOut:true });
  assert.equal((await unrelated.enable()).status, 200);
  assert.equal((await unrelated.send()).status, 201, 'Unrelated full phone with the same last four digits does not transfer opt-out');
});

test('revocation and expiry stop new sends while leaving original customer data and past sends intact', async () => {
  const f = fixture(), customerBefore = JSON.stringify(f.db.customerConversations);
  await f.enable(); await f.send();
  const revoked = await f.enable({ enabled:false, reason:'Synthetic test is complete.' });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.candidate.smsSharedPhoneTestActive, false);
  assert.equal(f.candidate().smsSharedPhoneTest.revokedByUserId, OWNER.id);
  assert.equal(f.db.recruitingAudit[0].action, 'revoke-recruiting-test-sms');
  assert.equal(f.db.recruitingAudit[0].details.phoneKey, '5005554446');
  assert.equal(f.db.recruitingAudit[0].details.revokeReason, 'Synthetic test is complete.');
  assert.equal((await f.send({ text:'A new test after revocation.', clientMessageId:'synthetic-after-revoke' })).body.code, 'PHONE_CUSTOMER_CONFLICT');
  assert.equal((await f.send()).body.duplicate, true, 'Old idempotent send lookup never performs a new provider call');
  assert.equal(f.providerCalls.length, 1);
  assert.equal(f.candidate().messages.length, 1);
  assert.equal(JSON.stringify(f.db.customerConversations), customerBefore);
  const expired = fixture(); await expired.enable();
  expired.candidate().smsSharedPhoneTest.approvedAt = new Date(Date.now() - 25 * HOUR).toISOString();
  expired.candidate().smsSharedPhoneTest.expiresAt = new Date(Date.now() - HOUR).toISOString();
  assert.equal((await expired.send()).body.code, 'PHONE_CUSTOMER_CONFLICT');
  assert.equal(expired.providerCalls.length, 0);
});

test('renewed approval and revocation preserve immutable earlier reason and phone audit snapshots', async () => {
  const f = fixture();
  await f.enable({ reason:'First synthetic test reason.' });
  const initialAudit = clone(f.db.recruitingAudit[0]);
  await f.enable({ reason:'Second synthetic test reason.' });
  assert.equal(f.candidate().smsSharedPhoneTest.reason, 'Second synthetic test reason.');
  assert.equal(f.db.recruitingAudit[0].details.reason, 'Second synthetic test reason.');
  assert.deepEqual(f.db.recruitingAudit.find(row => row.id === initialAudit.id), initialAudit);
  await f.enable({ enabled:false, reason:'Owner ends the second synthetic test.' });
  const revokedAudit = f.db.recruitingAudit[0];
  assert.equal(revokedAudit.details.enabled, false);
  assert.equal(revokedAudit.details.reason, 'Second synthetic test reason.');
  assert.equal(revokedAudit.details.revokeReason, 'Owner ends the second synthetic test.');
  assert.equal(revokedAudit.details.phoneKey, '5005554446');
  assert.equal(revokedAudit.details.revokedByUserId, OWNER.id);
  assert.deepEqual(f.db.recruitingAudit.find(row => row.id === initialAudit.id), initialAudit);
  assert.equal(f.providerCalls.length, 0);
});

test('phone edit revokes test approval and consent instead of allowing a new number', async () => {
  const f = fixture(); await f.enable();
  const response = await f.request('PATCH', CANDIDATE_PATH, { phone:'+15006664446' });
  assert.equal(response.status, 200);
  assert.equal(f.candidate().smsSharedPhoneTest.enabled, false);
  assert.ok(f.candidate().smsSharedPhoneTest.revokedAt);
  assert.equal(f.candidate().smsSharedPhoneTest.phoneKey, '5005554446');
  assert.equal(f.candidate().smsConsent, false);
  assert.equal(f.candidate().smsConsentNote, '');
  assert.equal(sharedPhoneTestActive(f.db, f.candidate()), false);
  assert.equal(f.providerCalls.length, 0);
});

test('new test replies route privately to one candidate and deduplicate without touching customer history', async () => {
  const f = fixture(); await f.enable();
  const customerBefore = JSON.stringify(f.db.customerConversations);
  assert.deepEqual(inbound(f), { handled:true, added:true });
  assert.deepEqual(inbound(f), { handled:true, added:false });
  assert.equal(f.candidate().messages.length, 1);
  assert.equal(f.db.recruitingQuarantine.length, 0);
  assert.equal(f.candidate().messages[0].sharedPhoneTest.approvedByUserId, OWNER.id);
  assert.equal(f.db.recruitingAudit[0].action, 'receive-recruiting-test-sms');
  const approvedAt = f.candidate().smsSharedPhoneTest.approvedAt;
  assert.deepEqual(ingestInbound(f.db, { from:'5005554446', body:'Synthetic reconciliation reply.', sid:'SMsynthetic-reconcile-001', date_sent:new Date(Date.parse(approvedAt) + 2).toISOString() }), { handled:true, added:true });
  assert.equal(f.candidate().messages.length, 2, 'Provider reconciliation field names route through the same exception');
  assert.equal(JSON.stringify(f.db.customerConversations), customerBefore);
  assert.equal(f.providerCalls.length, 0);
});

test('pre-test history, expired, revoked and ambiguous replies remain quarantined', async () => {
  const f = fixture(); await f.enable();
  const customerBefore = JSON.stringify(f.db.customerConversations);
  const approval = f.candidate().smsSharedPhoneTest;
  inbound(f, { sid:'SMsynthetic-before-window', at:new Date(Date.parse(approval.approvedAt) - 1).toISOString() });
  inbound(f, { sid:'SMsynthetic-at-expiry', at:approval.expiresAt });
  assert.equal(f.candidate().messages.length, 0);
  assert.equal(f.db.recruitingQuarantine.length, 2);
  await f.enable({ enabled:false, reason:'Synthetic revoke.' });
  inbound(f, { sid:'SMsynthetic-revoked' });
  assert.equal(f.db.recruitingQuarantine.length, 3);
  assert.equal(JSON.stringify(f.db.customerConversations), customerBefore);
  const expired = fixture(); await expired.enable();
  const oldApproved = new Date(Date.now() - 25 * HOUR).toISOString();
  Object.assign(expired.candidate().smsSharedPhoneTest, { approvedAt:oldApproved, expiresAt:new Date(Date.now() - HOUR).toISOString() });
  inbound(expired, { sid:'SMsynthetic-expired', at:new Date(Date.parse(oldApproved) + 1).toISOString() });
  assert.equal(expired.db.recruitingQuarantine.length, 1, 'Expired authorization cannot reclassify earlier historical messages');
  const ambiguous = fixture(); await ambiguous.enable();
  ambiguous.db.recruitingCandidates.push({ id:'synthetic-second-candidate', phone:PHONE, messages:[] });
  inbound(ambiguous);
  assert.equal(ambiguous.db.recruitingQuarantine.length, 1);
  assert.equal(ambiguous.candidate().messages.length, 0);
});

test('test routing keeps STOP/START event order and cannot undo opt-out through the toggle', async () => {
  const f = fixture(); await f.enable();
  const start = Date.parse(f.candidate().smsSharedPhoneTest.approvedAt);
  inbound(f, { text:'STOP', sid:'SMsynthetic-stop', at:new Date(start + 1000).toISOString() });
  assert.equal(f.candidate().smsOptedOut, true);
  assert.equal((await f.send()).body.code, 'SMS_OPTED_OUT');
  assert.equal((await f.enable()).body.code, 'SMS_OPTED_OUT');
  inbound(f, { text:'START', sid:'SMsynthetic-old-start', at:new Date(start + 500).toISOString() });
  assert.equal(f.candidate().smsOptedOut, true);
  inbound(f, { text:'START', sid:'SMsynthetic-new-start', at:new Date(start + 2000).toISOString() });
  assert.equal(f.candidate().smsOptedOut, false);
  await f.enable({ enabled:false, reason:'Synthetic completed test.' });
  inbound(f, { text:'STOP', sid:'SMsynthetic-revoked-stop', at:new Date(start + 3000).toISOString() });
  assert.equal(f.candidate().smsOptedOut, true, 'STOP remains effective when the message itself is quarantined');
  assert.ok(f.db.recruitingQuarantine.some(row => row.providerSid === 'SMsynthetic-revoked-stop'));
  assert.equal(f.providerCalls.length, 0);
});

test('manual-only test exception never enables scheduled or direct reminder sends', async () => {
  const f = fixture(); await f.enable();
  const now = Date.now();
  const appointment = {
    id:'synthetic-reminder', candidateId:CANDIDATE_ID, startsAt:new Date(now + 2 * HOUR - 1000).toISOString(),
    status:'confirmed', automaticReminders:true, mode:'online', address:'', durationMinutes:30
  };
  f.db.recruitingInterviews.push(appointment);
  const response = await f.service.processReminders(now);
  assert.equal(response.sent, 0);
  assert.equal(f.providerCalls.length, 0);
  await assert.rejects(f.service.sendCandidateMessage(CANDIDATE_ID, {
    text:'Synthetic scheduled reminder.', clientMessageId:'synthetic-reminder-message', expectedPhone:PHONE
  }, OWNER, '', { interviewId:appointment.id, expectedStartsAt:appointment.startsAt, expectedMode:'online', expectedAddress:'', hours:2 }), error => error.code === 'PHONE_CUSTOMER_CONFLICT');
  assert.equal(f.providerCalls.length, 0);
  assert.equal(f.candidate().messages.length, 0);
});
