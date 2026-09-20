'use strict';

// In-memory fixtures and dependency-injected fetch only. No environment secrets,
// production data, real mail/SMS, or external network requests are used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRecruitingService, ingestStatus } = require('../lib/recruiting');
const { createRecruitingEmailProvider, emailAddress, emailSender, emailFailure, RESEND_URL } = require('../lib/recruiting-email');

const OWNER = { id:'fixture-owner', name:'Synthetic Owner', role:'owner', view:true, edit:true };
const CANDIDATE = 'fixture-applicant';
const EMAIL = 'applicant@example.test';
const ROUTE = `/api/recruiting/candidates/${CANDIDATE}`;
const MESSAGE_ROUTE = `${ROUTE}/email-messages`;
const CONFIG = { apiKey:'synthetic-mail-key-never-real', from:'QUAD FILM <recruiting@example.test>', replyTo:'replies@example.test' };
const clone = value => JSON.parse(JSON.stringify(value));
const pending = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const draft = (extra = {}) => ({ subject:'QUAD FILM interview invitation', text:'Hello, please let us know your availability for an online interview.',
  expectedEmail:EMAIL, clientMessageId:'fixture-email-message-001', ...extra });

function fixture({ configured = true, provider, metadata, initialDb } = {}) {
  let db = initialDb ? clone(initialDb) : { users:[OWNER], recruitingCandidates:[{ id:CANDIDATE, name:'Synthetic Applicant', email:EMAIL, phone:'', status:'new',
    smsConsent:false, smsConsentNote:'', smsOptedOut:true, messages:[], notes:'Original note', resumeText:'Original private fixture resume' }],
    recruitingInterviews:[], recruitingAudit:[], recruitingQuarantine:[],
    customerConversations:[{ id:'customer-fixture', email:EMAIL, conversationMessages:[{ text:'Customer message remains private' }] }], prospects:[], portalCustomers:[], jobs:[] };
  const calls = [], notifications = [];
  let writes = 0, smsCalls = 0;
  const service = createRecruitingService({
    readDb:() => clone(db), writeDb:value => { writes++; db = clone(value); },
    canAccess:(actor, permission) => Boolean(actor?.[permission === 'recruitingView' ? 'view' : 'edit']),
    readBody:async req => req.body, send:(res, status, body) => { res.status = status; res.body = body; },
    smsConfigured:() => false, sendSms:async () => { smsCalls++; throw new Error('SMS must not be called by email'); },
    emailInfo:() => metadata || { configured, from:CONFIG.from, replyTo:CONFIG.replyTo, inboundConfigured:true, apiKey:'private-snapshot-sentinel',
      configuration:{ providerConfigured:configured, senderConfigured:true, replyToConfigured:true } },
    sendEmail:async input => { calls.push(clone(input)); return provider ? provider(input) : { id:`fixture-email-provider-${calls.length}`, status:'delivered' }; },
    publicBaseUrl:() => 'https://fixture.invalid', dataDir:'/not-accessed-by-email-tests', notify:(...args) => notifications.push(args)
  });
  const request = async (method, pathname, body, actor = OWNER) => {
    const response = {};
    assert.equal(await service.handle({ method, body }, response, new URL(pathname, 'https://fixture.invalid'), actor), true);
    return response;
  };
  return { service, request, send:(body = {}, actor = OWNER) => request('POST', MESSAGE_ROUTE, draft(body), actor),
    calls, notifications, get db() { return db; }, candidate:() => db.recruitingCandidates[0], stats:() => ({ writes, smsCalls, calls:calls.length }) };
}

test('email capability exposes only safe metadata and explicitly has no incoming-mail integration', async () => {
  const f = fixture();
  const response = await f.request('GET', '/api/recruiting');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.email, { configured:true, from:CONFIG.from, replyTo:CONFIG.replyTo, inboundConfigured:false,
    configuration:{ providerConfigured:true, senderConfigured:true, replyToConfigured:true } });
  assert.deepEqual(response.body.candidates[0].emailMessages, []);
  assert.equal(response.body.candidates[0].emailOptedOut, false);
  assert.ok(!JSON.stringify(response.body).includes('private-snapshot-sentinel'));
  assert.equal(f.stats().writes, 0);
  for (const metadata of [null, {}, { configured:true, from:CONFIG.from }, { configured:true, from:CONFIG.from, replyTo:'broken' }]) {
    const next = fixture({ metadata:metadata || {}, configured:false });
    assert.equal((await next.request('GET', '/api/recruiting')).body.email.configured, false);
  }
});

test('email-only applicant can receive an English invitation without SMS consent or a phone', async () => {
  const f = fixture(), beforeCustomers = clone(f.db.customerConversations);
  const response = await f.send();
  assert.equal(response.status, 201);
  assert.equal(response.body.message.status, 'accepted', 'Provider acceptance must never be described as delivery');
  assert.equal(response.body.message.channel, 'email');
  assert.equal(response.body.message.provider, 'resend');
  assert.equal(response.body.message.to, EMAIL);
  assert.equal(response.body.message.subject, draft().subject);
  assert.equal(response.body.message.text, draft().text);
  assert.equal(response.body.message.replyTo, CONFIG.replyTo);
  assert.match(f.calls[0].idempotencyKey, /^recruiting-email-[a-f0-9]{64}$/);
  assert.deepEqual(f.candidate().messages, []);
  assert.equal(f.candidate().phone, '');
  assert.equal(f.candidate().smsConsent, false);
  assert.equal(f.candidate().smsOptedOut, true);
  assert.equal(f.candidate().status, 'new', 'Sending does not invent invitation acceptance or confirmation');
  assert.deepEqual(f.db.recruitingInterviews, []);
  assert.deepEqual(f.db.customerConversations, beforeCustomers);
  assert.equal(f.stats().smsCalls, 0);
  assert.equal(f.db.recruitingAudit.length, 2);
  assert.ok(f.db.recruitingAudit.every(row => row.action.includes('recruiting-email')));
});

test('view and edit permission are both required and email route is POST-only', async () => {
  for (const actor of [null, { ...OWNER, view:false }, { ...OWNER, edit:false }]) {
    const f = fixture();
    assert.equal((await f.send({}, actor)).status, 403);
    assert.deepEqual(f.stats(), { writes:0, smsCalls:0, calls:0 });
  }
  const f = fixture();
  for (const method of ['GET', 'PATCH', 'DELETE']) assert.equal((await f.request(method, MESSAGE_ROUTE, draft())).status, 405);
  assert.equal(f.calls.length, 0);
});

test('missing configuration or explicit reply mailbox blocks system sending without a pending record', async () => {
  for (const options of [{ configured:false }, { metadata:{ configured:true, from:CONFIG.from, replyTo:'' } }]) {
    const f = fixture(options), response = await f.send();
    assert.equal(response.status, 503);
    assert.equal(response.body.code, 'EMAIL_NOT_CONFIGURED');
    assert.deepEqual(f.stats(), { writes:0, smsCalls:0, calls:0 });
  }
});

test('email subject/body and recipient validation reject injection, Han, empty or excessive content before sending', async () => {
  const invalid = [
    { subject:'' }, { text:' \n\t' }, { subject:'x'.repeat(201) }, { text:'x'.repeat(10001) },
    { subject:'Hello\r\nBcc: outsider@example.test' }, { subject:'Hello\n' }, { subject:'Hello\0' },
    { subject:'邀请' }, { text:'Hello 王' }, { text:'𠀀' }, { expectedEmail:'' }, { expectedEmail:undefined },
    { expectedEmail:['applicant@example.test'] }, { expectedEmail:'applicant@example.test,other@example.test' },
    { expectedEmail:'Person <applicant@example.test>' }, { expectedEmail:'applicant@example.test\r\n' },
    { clientMessageId:'short' }, { to:'outsider@example.test' }, { cc:['outsider@example.test'] }, { html:'<script>bad</script>' }
  ];
  for (const input of invalid) {
    const f = fixture(), response = await f.send(input);
    assert.equal(response.status, 400, JSON.stringify(input));
    assert.deepEqual(f.stats(), { writes:0, smsCalls:0, calls:0 });
  }
  for (const input of [{ subject:'A', text:'B' }, { subject:'x'.repeat(200), text:'x'.repeat(10000) }, { text:'Hi José, please confirm.' }]) {
    assert.equal((await fixture().send(input)).status, 201, 'Short and maximum-length English messages are allowed');
  }
});

test('recipient is bound to the current exact normalized candidate email', async () => {
  const f = fixture();
  assert.equal((await f.send({ expectedEmail:' APPLICANT@EXAMPLE.TEST ' })).status, 201);
  for (const email of ['other@example.test', 'a@example.test,b@example.test']) {
    const changed = fixture(); changed.candidate().email = email;
    const response = await changed.send();
    assert.equal(response.status, 409);
    assert.equal(response.body.code, 'EMAIL_RECIPIENT_CHANGED');
    assert.equal(changed.calls.length, 0);
  }
  const ambiguous = fixture();
  ambiguous.db.recruitingCandidates.push({ id:'duplicate-fixture', name:'Another record', email:EMAIL });
  assert.equal((await ambiguous.send()).body.code, 'EMAIL_AMBIGUOUS');
  assert.equal(ambiguous.calls.length, 0);
});

test('manual email opt-out and existing doNotContact block email but do not rewrite SMS consent', async () => {
  for (const [field, value] of [['emailOptedOut', true], ['doNotContact', true], ['doNotContact', 'Explicitly asked not to be contacted']]) {
    const f = fixture(); f.candidate()[field] = value;
    assert.equal((await f.send()).body.code, 'EMAIL_OPTED_OUT');
    assert.equal(f.stats().writes + f.calls.length, 0);
  }
  const f = fixture();
  const saved = await f.request('PATCH', ROUTE, { emailOptedOut:true, emailOptOutNote:'Candidate explicitly requested no more recruitment email.' });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.candidate.emailOptedOut, true);
  assert.ok(saved.body.candidate.emailOptedOutAt);
  assert.equal((await f.send()).body.code, 'EMAIL_OPTED_OUT');
  assert.equal((await f.request('PATCH', ROUTE, { emailOptedOut:'yes' })).status, 400);
  assert.equal((await f.request('PATCH', ROUTE, { emailOptOutNote:'x'.repeat(2001) })).status, 400);
  assert.equal((await f.request('PATCH', ROUTE, { emailMessages:[] })).status, 400, 'Clients cannot forge message history');
  assert.equal(f.candidate().smsConsent, false);
});

test('stable idempotency binds recipient, subject and body and prevents concurrent or later duplicate sends', async () => {
  const wait = pending();
  const f = fixture({ provider:() => wait.promise });
  const first = f.send();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(f.candidate().emailMessages[0].status, 'pending');
  assert.equal((await f.send()).status, 200);
  const concurrentDifferentId = await f.send({ clientMessageId:'different-id-while-pending' });
  assert.equal(concurrentDifferentId.body.duplicate, true);
  assert.equal(concurrentDifferentId.body.message.status, 'pending');
  assert.equal((await f.send({ subject:'Different subject' })).body.code, 'EMAIL_MESSAGE_ID_CONFLICT');
  assert.equal((await f.send({ text:'Different content' })).body.code, 'EMAIL_MESSAGE_ID_CONFLICT');
  f.candidate().email = 'changed@example.test';
  assert.equal((await f.send({ expectedEmail:'changed@example.test' })).body.code, 'EMAIL_MESSAGE_ID_CONFLICT');
  f.candidate().email = EMAIL;
  assert.equal(f.calls.length, 1);
  wait.resolve({ id:'synthetic-provider-id' });
  assert.equal((await first).body.message.status, 'accepted');
  assert.equal((await f.send()).body.duplicate, true);
  assert.equal((await f.send({ clientMessageId:'different-client-id-002' })).body.duplicate, true, 'Rapid same-content double click does not create a new email');
  assert.equal(f.calls.length, 1);
  assert.equal(f.candidate().emailMessages.length, 1);
  const secondFixture = fixture(); await secondFixture.send();
  assert.equal(secondFixture.calls[0].idempotencyKey, f.calls[0].idempotencyKey);
});

test('persisted idempotency survives a service restart for every sending state', async () => {
  const original = fixture(); await original.send();
  for (const status of ['pending', 'accepted', 'send_unknown', 'failed']) {
    const persisted = clone(original.db);
    persisted.recruitingCandidates[0].emailMessages[0].status = status;
    const restarted = fixture({ initialDb:persisted });
    const repeated = await restarted.send();
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.duplicate, true);
    assert.equal(repeated.body.message.status, status);
    assert.equal((await restarted.send({ text:'Changed after restart' })).body.code, 'EMAIL_MESSAGE_ID_CONFLICT');
    if (status !== 'failed') assert.equal((await restarted.send({ clientMessageId:'new-id-after-restart' })).body.duplicate, true);
    assert.deepEqual(restarted.stats(), { writes:0, smsCalls:0, calls:0 });
  }
});

test('provider rejection is failed while ambiguous network, timeout and missing result are send_unknown', async () => {
  for (const [provider, status, code] of [
    [async () => { throw emailFailure('EMAIL_PROVIDER_AUTH'); }, 'failed', 'EMAIL_PROVIDER_AUTH'],
    [async () => { throw emailFailure('EMAIL_PROVIDER_RATE_LIMIT'); }, 'failed', 'EMAIL_PROVIDER_RATE_LIMIT'],
    [async () => { throw emailFailure('EMAIL_PROVIDER_REJECTED'); }, 'failed', 'EMAIL_PROVIDER_REJECTED'],
    [async () => { throw emailFailure('EMAIL_SEND_TIMEOUT'); }, 'send_unknown', 'EMAIL_SEND_TIMEOUT'],
    [async () => { throw Object.assign(new Error('PRIVATE provider text synthetic-mail-key'), { code:'UNTRUSTED', statusCode:401 }); }, 'send_unknown', 'EMAIL_SEND_UNKNOWN'],
    [async () => ({}), 'send_unknown', 'EMAIL_SEND_UNKNOWN']
  ]) {
    const f = fixture({ provider });
    const response = await f.send();
    assert.ok([429, 502, 503, 504].includes(response.status));
    assert.equal(response.body.code, code);
    assert.equal(f.candidate().emailMessages[0].status, status);
    assert.ok(!JSON.stringify(response).includes('PRIVATE'));
    assert.equal((await f.send()).body.duplicate, true);
    assert.equal(f.calls.length, 1, 'Same id never automatically retries');
    if (status === 'send_unknown') {
      assert.equal((await f.send({ clientMessageId:'new-id-after-unknown' })).body.duplicate, true);
      assert.equal(f.calls.length, 1, 'Changing the client id cannot duplicate uncertain identical mail');
    }
  }
});

test('provider completion re-reads storage and merges without overwriting edits or another message', async () => {
  const wait = pending(), f = fixture({ provider:() => wait.promise });
  const sending = f.send(); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.candidate().emailMessages[0].status, 'pending');
  f.candidate().notes = 'Concurrent note edit';
  f.candidate().emailOptedOut = true;
  f.candidate().emailMessages.push({ id:'another-message', text:'Concurrent history', status:'accepted' });
  wait.resolve({ id:'provider-merge-fixture' });
  await sending;
  assert.equal(f.candidate().notes, 'Concurrent note edit');
  assert.equal(f.candidate().emailOptedOut, true);
  assert.equal(f.candidate().emailMessages.length, 2);
  assert.equal(f.candidate().emailMessages[0].status, 'accepted');
});

test('email history does not prevent adding a phone or accept Twilio status updates', async () => {
  const f = fixture(); await f.send();
  assert.equal((await f.request('PATCH', ROUTE, { phone:'+15005550009' })).status, 200);
  const before = clone(f.candidate().emailMessages);
  assert.equal(ingestStatus(f.db, { MessageSid:before[0].providerId, MessageStatus:'delivered' }, new URLSearchParams({ candidateId:CANDIDATE, recruitingMessageId:before[0].id })), false);
  assert.deepEqual(f.candidate().emailMessages, before);
  assert.deepEqual(f.candidate().messages, []);
});

test('creating an email-only applicant and saving an online appointment never sends an invitation', async () => {
  const f = fixture();
  const created = await f.request('POST', '/api/recruiting/candidates', { name:'Second synthetic applicant', email:'second@example.test' });
  assert.equal(created.status, 201);
  assert.equal(created.body.candidate.phone, '');
  const appointment = await f.request('POST', '/api/recruiting/interviews', { candidateId:created.body.candidate.id, mode:'online', startsAt:new Date(Date.now() + 86400000).toISOString(), status:'scheduled', automaticReminders:false });
  assert.equal(appointment.status, 201);
  assert.equal(appointment.body.interview.status, 'scheduled');
  assert.equal(f.calls.length, 0);
  assert.equal(f.stats().smsCalls, 0);
});

test('provider configuration requires a valid explicit reply mailbox and reveals no credential', () => {
  for (const cfg of [{}, { ...CONFIG, apiKey:'' }, { ...CONFIG, from:'bad' }, { ...CONFIG, replyTo:'' }, { ...CONFIG, replyTo:'a@example.test,b@example.test' }, { ...CONFIG, apiKey:'bad\r\nkey' }]) {
    assert.equal(createRecruitingEmailProvider({ getConfig:() => cfg, fetchImpl:async () => { throw new Error('No calls expected'); } }).info().configured, false);
  }
  const provider = createRecruitingEmailProvider({ getConfig:() => CONFIG, fetchImpl:async () => {} });
  assert.deepEqual(provider.info(), { configured:true, from:CONFIG.from, replyTo:CONFIG.replyTo, inboundConfigured:false,
    configuration:{ providerConfigured:true, senderConfigured:true, replyToConfigured:true } });
  assert.ok(!JSON.stringify(provider.info()).includes(CONFIG.apiKey));
  assert.equal(emailAddress(' FIRST.LAST+tag@EXAMPLE.TEST '), 'first.last+tag@example.test');
  for (const value of ['a@example.test,b@example.test', 'Name <a@example.test>', 'a@example.test\r\nBcc:x@example.test', 'a..b@example.test', 'a@-invalid.test', 'a@localhost', '"a"@example.test']) assert.equal(emailAddress(value), '');
  assert.equal(emailSender('QUAD FILM <MAIL@EXAMPLE.TEST>'), 'QUAD FILM <mail@example.test>');
  assert.equal(emailSender('A <a@example.test>, B <b@example.test>'), '');
});

test('configuration diagnostics expose only validated presence flags, not provider credentials', async () => {
  for (const [missing, flag] of [['apiKey', 'providerConfigured'], ['from', 'senderConfigured'], ['replyTo', 'replyToConfigured']]) {
    const provider = createRecruitingEmailProvider({ getConfig:() => ({ ...CONFIG, [missing]:'' }), fetchImpl:async () => {} });
    const info = provider.info();
    assert.equal(info.configured, false);
    assert.equal(info.configuration[flag], false);
    const response = await fixture({ metadata:info }).request('GET', '/api/recruiting');
    assert.deepEqual(response.body.email.configuration, info.configuration);
    assert.ok(Object.values(response.body.email.configuration).every(value => typeof value === 'boolean'));
    assert.ok(!JSON.stringify(response.body.email).includes(CONFIG.apiKey));
  }
  const malicious = fixture({ metadata:{ configured:false, from:'bad', replyTo:'bad', configuration:{ providerConfigured:CONFIG.apiKey, senderConfigured:true, replyToConfigured:true, apiKey:CONFIG.apiKey } } });
  assert.deepEqual((await malicious.request('GET', '/api/recruiting')).body.email.configuration,
    { providerConfigured:false, senderConfigured:false, replyToConfigured:false });
});

test('Resend adapter uses fixed official endpoint, reply_to and stable idempotency header, with plain text only', async () => {
  const calls = [];
  const provider = createRecruitingEmailProvider({ getConfig:() => CONFIG, fetchImpl:async (url, options) => {
    calls.push({ url, options });
    return { ok:true, status:200, text:async () => JSON.stringify({ id:'synthetic-resend-id' }) };
  } });
  const idempotencyKey = `recruiting-email-${'a'.repeat(64)}`;
  const result = await provider.send({ to:EMAIL, subject:'Interview', text:'Hello.', idempotencyKey });
  assert.deepEqual(result, { id:'synthetic-resend-id', status:'accepted' });
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].url, RESEND_URL);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers['Idempotency-Key'], idempotencyKey);
  assert.deepEqual(JSON.parse(calls[0].options.body), { from:CONFIG.from, to:[EMAIL], reply_to:CONFIG.replyTo, subject:'Interview', text:'Hello.' });
  assert.equal(calls.length, 1);
});

test('Resend adapter sanitizes authentication, rejection, rate limits, ambiguous responses and network failures', async () => {
  for (const [status, body, expected, rejected] of [
    [401, {}, 'EMAIL_PROVIDER_AUTH', true], [403, {}, 'EMAIL_PROVIDER_AUTH', true],
    [429, {}, 'EMAIL_PROVIDER_RATE_LIMIT', true], [422, {}, 'EMAIL_PROVIDER_REJECTED', true],
    [500, {}, 'EMAIL_SEND_UNKNOWN', false], [409, { name:'concurrent_idempotent_requests' }, 'EMAIL_SEND_UNKNOWN', false],
    [200, {}, 'EMAIL_SEND_UNKNOWN', false]
  ]) {
    const provider = createRecruitingEmailProvider({ getConfig:() => CONFIG, fetchImpl:async () => ({ ok:status === 200, status, text:async () => JSON.stringify({ message:`PRIVATE ${CONFIG.apiKey}`, ...body }) }) });
    await assert.rejects(provider.send({ to:EMAIL, subject:'Test', text:'Hello.', idempotencyKey:`recruiting-email-${'a'.repeat(64)}` }), error => {
      assert.equal(error.code, expected); assert.equal(error.providerRejected, rejected);
      assert.notEqual(error.statusCode, 401); assert.notEqual(error.statusCode, 403);
      assert.ok(!`${error.stack}${JSON.stringify(error)}`.includes(CONFIG.apiKey));
      assert.ok(!`${error.stack}${JSON.stringify(error)}`.includes('PRIVATE'));
      assert.equal(error.cause, undefined); return true;
    });
  }
  const broken = createRecruitingEmailProvider({ getConfig:() => CONFIG, fetchImpl:async () => { throw new Error(`PRIVATE ${CONFIG.apiKey}`); } });
  await assert.rejects(broken.send({ to:EMAIL, subject:'Test', text:'Hello.', idempotencyKey:`recruiting-email-${'a'.repeat(64)}` }), error => error.code === 'EMAIL_SEND_UNKNOWN');
});

test('non-JSON upstream authentication responses remain a safe non-401 error without reading their body', async () => {
  for (const status of [401, 403]) {
    let readBody = false;
    const provider = createRecruitingEmailProvider({ getConfig:() => CONFIG, fetchImpl:async () => ({ ok:false, status, text:async () => {
      readBody = true; return `<html>PRIVATE ${CONFIG.apiKey}</html>`;
    } }) });
    const response = await fixture({ provider:provider.send }).send();
    assert.equal(response.status, 503);
    assert.equal(response.body.code, 'EMAIL_PROVIDER_AUTH');
    assert.equal(readBody, false);
    assert.ok(!JSON.stringify(response).includes('PRIVATE'));
    assert.ok(!JSON.stringify(response).includes(CONFIG.apiKey));
  }
});

test('Resend timeout is bounded and never retries or leaks the provider error', async () => {
  let calls = 0;
  const provider = createRecruitingEmailProvider({ getConfig:() => CONFIG, timeoutMs:1, fetchImpl:async (_url, options) => {
    calls++;
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('PRIVATE abort message')), { once:true }));
  } });
  await assert.rejects(provider.send({ to:EMAIL, subject:'Test', text:'Hello.', idempotencyKey:`recruiting-email-${'a'.repeat(64)}` }), error => error.code === 'EMAIL_SEND_TIMEOUT' && error.statusCode === 504 && error.providerRejected === false);
  assert.equal(calls, 1);
});

test('server wiring reuses the specified environment configuration without touching employee reminders', () => {
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.match(source, /from:process\.env\.RECRUITING_FROM_EMAIL \|\| process\.env\.RESEND_FROM_EMAIL \|\| process\.env\.REMINDER_FROM_EMAIL/);
  assert.match(source, /replyTo:process\.env\.RECRUITING_REPLY_TO_EMAIL \|\| process\.env\.RESEND_REPLY_TO_EMAIL/);
  assert.match(source, /sendEmail:recruitingEmailProvider\.send, emailInfo:recruitingEmailProvider\.info/);
  assert.match(source, /async function sendReminderEmail\(to, subject, text\)/);
});
