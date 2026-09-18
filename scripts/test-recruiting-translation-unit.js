'use strict';

// Pure dependency-injected tests. No server, files, credentials, network, or
// production records are read or written, and no real SMS or API calls occur.
const assert = require('node:assert/strict');
const { createRecruitingTranslation, MAX_TEXT_LENGTH, MAX_REQUESTS_PER_WINDOW, MAX_CONCURRENT } = require('../lib/recruiting-translation');
const { createRecruitingService } = require('../lib/recruiting');
let checks = 0;
function check(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; }
async function rejects(action, status, code) {
  await assert.rejects(action, error => error.statusCode === status && error.code === code);
  checks++;
}
const actor = { id:'test-owner', name:'Test Owner', view:true, edit:true };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(overrides = {}) {
  const db = {
    users:[actor], customerConversations:[], prospects:[], portalCustomers:[], jobs:[],
    recruitingCandidates:[{ id:'candidate-test', name:'Test Applicant', phone:'+15005550009', email:'test@example.invalid', notes:'Original note', resumeText:'Original resume 原始简历', smsConsent:true, smsConsentNote:'Synthetic test consent', smsOptedOut:false, messages:[], status:'reviewing' }],
    recruitingInterviews:[], recruitingAudit:[], recruitingQuarantine:[]
  };
  let reads = 0; let writes = 0; let smsCalls = 0; let translationCalls = 0;
  const service = createRecruitingService({
    readDb:() => { reads++; return db; }, writeDb:() => { writes++; },
    canAccess:(user, permission) => Boolean(user && user[permission === 'recruitingView' ? 'view' : 'edit']),
    readBody:async req => req.body, send:(res, status, body) => { res.status = status; res.body = body; },
    sendSms:async () => { smsCalls++; return { sid:'SM_SYNTHETIC_ONLY', status:'queued' }; },
    smsConfigured:() => true, publicBaseUrl:() => '', dataDir:'/not-accessed-by-unit-test', notify:() => {},
    translationConfigured:() => true,
    translateText:async input => { translationCalls++; return { text:input.targetLanguage === 'en' ? 'English draft' : '中文译文', targetLanguage:input.targetLanguage }; },
    ...overrides
  });
  async function request(method, pathname, body, user = actor) {
    const res = {};
    check(await service.handle({ method, body }, res, new URL(pathname, 'http://unit.invalid'), user), true, 'route handled');
    return res;
  }
  return { service, db, request, stats:() => ({ reads, writes, smsCalls, translationCalls }) };
}

async function main() {
  check(createRecruitingTranslation().configured(), false, 'missing adapter is unavailable');
  check(createRecruitingTranslation({ translateText:async () => '', translationConfigured:() => { throw new Error('private'); } }).configured(), false, 'configuration error does not leak');

  const f = fixture();
  const sourceDb = JSON.stringify(f.db);
  const source = 'Original\n材料 +1 500-555-0009';
  const translated = await f.request('POST', '/api/recruiting/translate', { text:source, targetLanguage:'en' });
  check(translated, { status:200, body:{ text:'English draft', targetLanguage:'en' } }, 'bilingual contract');
  check(JSON.stringify(f.db), sourceDb, 'translation does not mutate candidate, resume, notes, consent, messages or appointments');
  check(f.stats(), { reads:0, writes:0, smsCalls:0, translationCalls:1 }, 'translation uses only translation adapter');
  check(f.service.snapshot(f.db).translation, { configured:true }, 'availability flag');

  for (const user of [{ ...actor, view:false }, { ...actor, edit:false }, null]) {
    const response = await f.request('POST', '/api/recruiting/translate', { text:'test', targetLanguage:'zh' }, user);
    check(response.status, 403, 'view and edit permissions required before provider use');
  }
  check(f.stats().translationCalls, 1, 'denied requests never reach provider');
  check((await f.request('GET', '/api/recruiting/translate')).status, 405, 'POST-only translation');

  for (const body of [null, [], {}, { text:'', targetLanguage:'en' }, { text:'  ', targetLanguage:'en' }, { text:123, targetLanguage:'en' }, { text:'test', targetLanguage:'fr' }, { text:'test', targetLanguage:'en', apiKey:'forbidden-field' }, { text:'x'.repeat(MAX_TEXT_LENGTH + 1), targetLanguage:'en' }]) {
    check((await f.request('POST', '/api/recruiting/translate', body)).status, 400, 'invalid translation input rejected');
  }
  check(f.stats().translationCalls, 1, 'validation failures never reach provider');
  check((await fixture({ translationConfigured:() => false }).request('POST', '/api/recruiting/translate', { text:'test', targetLanguage:'en' })).body.code, 'TRANSLATION_NOT_CONFIGURED', 'unconfigured translation response');

  const secretSentinel = 'private-provider-detail-do-not-echo';
  for (const [code, status] of [['PROVIDER_ERROR', 502], ['__proto__', 502], ['constructor', 502], ['TRANSLATION_TIMEOUT', 504], ['TRANSLATION_INCOMPLETE', 502], ['TRANSLATION_FACT_MISMATCH', 502], ['TRANSLATION_NOT_ENGLISH', 502], ['TRANSLATION_NOT_CONFIGURED', 503]]) {
    const failing = fixture({ translateText:async () => { throw Object.assign(new Error(secretSentinel), { code, statusCode:status }); } });
    const response = await failing.request('POST', '/api/recruiting/translate', { text:'test', targetLanguage:'en' });
    check(response.status, status, 'safe adapter status retained');
    check(JSON.stringify(response).includes(secretSentinel), false, 'provider detail sanitized');
    check(failing.stats().writes + failing.stats().smsCalls, 0, 'failure does not save/send');
  }
  for (const result of ['', '  ', {}, { text:null }, 'x'.repeat(180001)]) {
    const response = await fixture({ translateText:async () => result }).request('POST', '/api/recruiting/translate', { text:'test', targetLanguage:'en' });
    check(response.body.code, 'TRANSLATION_FAILED', 'invalid provider output rejected');
  }

  let now = 1000; let calls = 0;
  const limited = createRecruitingTranslation({ now:() => now, translationConfigured:() => true, translateText:async input => { calls++; return input.text; } });
  await limited.translate({ text:'x'.repeat(MAX_TEXT_LENGTH), targetLanguage:'en' }, actor);
  await limited.translate({ text:'y'.repeat(MAX_TEXT_LENGTH), targetLanguage:'en' }, actor);
  await rejects(() => limited.translate({ text:'z', targetLanguage:'en' }, actor), 429, 'TRANSLATION_RATE_LIMIT');
  check(calls, 2, 'character budget blocks extra provider calls');
  now += 60000;
  for (let i = 0; i < MAX_REQUESTS_PER_WINDOW; i++) await limited.translate({ text:'test', targetLanguage:'en' }, actor);
  await rejects(() => limited.translate({ text:'test', targetLanguage:'en' }, actor), 429, 'TRANSLATION_RATE_LIMIT');
  now += 60000;
  check((await limited.translate({ text:'test', targetLanguage:'en' }, actor)).text, 'test', 'window resets');

  const pending = deferred();
  const concurrent = createRecruitingTranslation({ translationConfigured:() => true, translateText:() => pending.promise });
  const active = [];
  for (let i = 0; i < MAX_CONCURRENT; i++) active.push(concurrent.translate({ text:'test', targetLanguage:'en' }, { id:`user-${i}` }));
  await rejects(() => concurrent.translate({ text:'test', targetLanguage:'en' }, { id:'user-0' }), 429, 'TRANSLATION_BUSY');
  await rejects(() => concurrent.translate({ text:'test', targetLanguage:'en' }, { id:'user-new' }), 429, 'TRANSLATION_BUSY');
  pending.resolve('English'); await Promise.all(active);
  check((await concurrent.translate({ text:'test', targetLanguage:'en' }, { id:'user-new' })).text, 'English', 'concurrent slots released');

  for (const message of ['请来面试', 'Hello，时间是11am', '𠀀', 'Chinese name 王']) {
    const sms = fixture();
    const before = JSON.stringify(sms.db);
    await rejects(() => sms.service.sendCandidateMessage('candidate-test', { text:message, clientMessageId:'unit-han-message' }, actor), 400, 'SMS_ENGLISH_REQUIRED');
    check(sms.stats(), { reads:0, writes:0, smsCalls:0, translationCalls:0 }, 'Han blocked before DB/provider/translation access');
    check(JSON.stringify(sms.db), before, 'Han attempt records no pending message');
  }
  const allowed = fixture();
  await allowed.service.sendCandidateMessage('candidate-test', { text:'Hi José, please confirm your interview.', clientMessageId:'unit-english-message' }, actor);
  check(allowed.stats().smsCalls, 1, 'English with accented name remains usable');

  for (const expectedPhone of ['+15005550008', '', 'not-a-phone']) {
    const changedRecipient = fixture();
    const before = JSON.stringify(changedRecipient.db);
    await rejects(() => changedRecipient.service.sendCandidateMessage('candidate-test', { text:'Please confirm your interview.', clientMessageId:'unit-stale-recipient', expectedPhone }, actor), 409, 'SMS_RECIPIENT_CHANGED');
    check(changedRecipient.stats().writes + changedRecipient.stats().smsCalls, 0, 'changed or missing reviewed recipient never writes or sends');
    check(JSON.stringify(changedRecipient.db), before, 'recipient mismatch preserves all data');
  }
  const matchingRecipient = fixture();
  const recipientResult = await matchingRecipient.service.sendCandidateMessage('candidate-test', { text:'Please confirm your interview.', clientMessageId:'unit-matching-recipient', expectedPhone:'(500) 555-0009' }, actor);
  check(matchingRecipient.stats().smsCalls, 1, 'format-equivalent reviewed phone can send');
  check(recipientResult.message.to, '+15005550009', 'matched recipient normalized');
  const invalidRecipient = fixture();
  await rejects(() => invalidRecipient.service.sendCandidateMessage('candidate-test', { text:'Please confirm your interview.', clientMessageId:'unit-invalid-recipient', expectedPhone:null }, actor), 400, 'RECRUITING_VALIDATION');
  check(invalidRecipient.stats().reads + invalidRecipient.stats().writes + invalidRecipient.stats().smsCalls, 0, 'non-string expectedPhone rejected before database/provider');

  const reminder = fixture();
  reminder.db.recruitingCandidates[0].name = '王';
  reminder.db.recruitingInterviews.push({ id:'reminder-test', candidateId:'candidate-test', startsAt:new Date(Date.now() + 2 * 3600000).toISOString(), address:'3212 Santa Monica Blvd', status:'confirmed', automaticReminders:true });
  check(await reminder.service.processReminders(), { sent:0, skipped:1 }, 'Han reminder safely skipped');
  check(reminder.stats().smsCalls + reminder.stats().writes, 0, 'Han reminder never queued or sent');

  const stopWhileTranslating = deferred();
  const stopped = fixture({ translateText:() => stopWhileTranslating.promise });
  const inProgress = stopped.request('POST', '/api/recruiting/translate', { text:'确认面试', targetLanguage:'en' });
  stopped.db.recruitingCandidates[0].smsOptedOut = true;
  stopWhileTranslating.resolve('Please confirm your interview.');
  const ready = await inProgress;
  await rejects(() => stopped.service.sendCandidateMessage('candidate-test', { text:ready.body.text, clientMessageId:'unit-after-stop' }, actor), 409, 'SMS_OPTED_OUT');
  check(stopped.stats().smsCalls + stopped.stats().writes, 0, 'translation cannot override a new opt-out');
  console.log(`Recruiting translation unit tests passed: ${checks} checks; no network or formal data.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
