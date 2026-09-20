'use strict';

// Isolated synthetic route tests. No real account, candidate, audio capture,
// provider request, network, production database, or provider credential is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecruitingVideoService, digest, roomName } = require('../lib/recruiting-video');
const NOTICE = '2026-09-20-auto-v1';
const OLD_NOTICE = '2026-09-19-voice-v1';
const SESSION = 'synthetic-auto-interviewer-session';
const SESSION_OTHER = 'synthetic-auto-interviewer-session-other';
const SECRET = 'synthetic-candidate-auto-session-secret';
const EDITOR = { id:'auto-editor', name:'Synthetic Interviewer', permissions:['recruitingView','recruitingEdit'] };
const VIEWER = { id:'auto-viewer', name:'Synthetic Observer', permissions:['recruitingView'] };
const AUDIO = Buffer.from('SYNTHETIC_AUTO_TRANSCRIPT_BYTES_NOT_A_RECORDING');
const clone = value => JSON.parse(JSON.stringify(value));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function providerStarted(work, gate) {
  await Promise.race([gate.promise, work.then(value => { throw new Error(`Route returned before mock provider: ${JSON.stringify(value)}`); })]);
}
async function settleBackground(predicate) { for (let i = 0; i < 50 && !predicate(); i++) await new Promise(resolve => setImmediate(resolve)); assert.ok(predicate(), 'Expected bounded background work to settle'); }
function ok(result) { assert.ok(result?.status >= 200 && result.status < 300, JSON.stringify(result)); return result.body; }
function denied(result, status) { assert.equal(result.status, status, JSON.stringify(result.body)); return result.body; }

function fixture(overrides = {}) {
  let db = {
    unrelated:[{ id:'preserve-me', text:'Original unrelated value' }],
    recruitingCandidates:[{ id:'auto-candidate', name:'Synthetic Candidate', resumeText:'PRIVATE_RESUME_MARKER', notes:'PRIVATE_NOTE_MARKER' }],
    recruitingInterviews:[{ id:'auto-interview', candidateId:'auto-candidate', startsAt:new Date(Date.now() + 86400000).toISOString(), durationMinutes:30,
      aiInterview:{ transcript:[], analysis:{ summary:'PRIVATE_ANALYSIS_MARKER' } } }],
    recruitingVideoInvites:[{ id:'auto-invite', interviewId:'auto-interview', candidateId:'auto-candidate', roomName:roomName('auto-interview'), status:'joined',
      expiresAt:new Date(Date.now() + 86400000).toISOString(), sessionSecretHash:digest(SECRET), tokenHash:digest('synthetic-auto-invite') }]
  };
  const calls = { transcribe:[], translate:[], speech:[], analyze:[] }, writes = [];
  const service = createRecruitingVideoService({
    readDb:() => clone(db), writeDb:value => { db = clone(value); writes.push(clone(value)); },
    readBody:async req => req.body || {}, readVoiceBody:async req => req.body || {},
    send:(res, status, body) => { res.result = { status, body }; },
    canAccess:(actor, permission) => Boolean(actor?.permissions?.includes(permission)),
    publicBaseUrl:() => 'https://fixture.invalid', notify:() => {},
    deleteVideoRoom:overrides.deleteVideoRoom || (async () => {}),
    analyzeInterview:async body => { calls.analyze.push(body); return overrides.analyze ? overrides.analyze(body) : { summary:'Synthetic job-evidence summary', mode:body.mode }; },
    voiceProvider:{ configured:() => typeof overrides.configured === 'function' ? overrides.configured() : overrides.configured !== false,
      speech:async body => { calls.speech.push(body); return { mimeType:'audio/mpeg', audioBase64:'U1lOVEhFVElD' }; },
      transcribe:async body => { calls.transcribe.push(body); return overrides.transcribe ? overrides.transcribe(body) : { text:'I visited three dealerships and won a trial order.' }; } },
    translateVoiceText:async body => { calls.translate.push(body); return overrides.translate ? overrides.translate(body) : { text:'我拜访了三家经销商，并获得一笔试单。' }; }
  });
  async function route(kind, body = {}, actor = EDITOR) {
    const pathname = kind === 'public' ? '/api/public/recruiting-video/auto' : '/api/recruiting/interviews/auto-interview/video-auto';
    const payload = kind === 'public' ? { interviewId:'auto-interview', sessionSecret:SECRET, ...body } : { participantSessionId:SESSION, ...body };
    const response = {};
    const handled = await service[kind === 'public' ? 'handlePublic' : 'handleAdmin']({ method:'POST', body:payload, headers:{}, socket:{ remoteAddress:'127.0.0.1' } }, response, new URL(`https://fixture.invalid${pathname}`), actor);
    return response.result || { status:handled === false ? 404 : 0, body:{} };
  }
  return { calls, writes, get db() { return db; }, mutate(fn) { const copy = clone(db); fn(copy); db = copy; },
    admin(operation, body = {}, actor = EDITOR) { return route('admin', { operation, ...body }, actor); },
    public(operation, body = {}) { return route('public', { operation, ...body }, null); },
    async video(action, body = {}, actor = EDITOR) {
      const response = {};
      await service.handleAdmin({ method:'POST', body }, response, new URL(`https://fixture.invalid/api/recruiting/interviews/auto-interview/video-${action}`), actor);
      return response.result;
    },
    async ready() { ok(await this.public('consent', { consent:true, noticeVersion:NOTICE })); ok(await this.admin('consent', { consent:true, noticeVersion:NOTICE })); return this; },
    async pauseBoth() { for (const kind of ['public','admin']) { const current = ok(await this[kind]('status')).autoState; ok(await this[kind]('pause', { epoch:current.epoch })); } return this; },
    async segment(kind = 'public', extra = {}, actor = EDITOR) {
      const identity = kind === 'admin' ? { participantSessionId:extra.participantSessionId || SESSION } : {};
      const state = ok(await route(kind, { operation:'status', ...identity }, actor)).autoState;
      return route(kind, { operation:'segment', requestId:'synthetic-auto-segment-0001', epoch:state.epoch, audioBase64:AUDIO.toString('base64'), mimeType:'audio/webm', durationMs:15000, ...extra }, actor);
    }
  };
}

test('automatic transcription defaults off and old voice consent is not silently upgraded', async () => {
  const env = fixture(), before = clone(env.db);
  for (const kind of ['public','admin']) {
    const result = ok(await env[kind]('status'));
    assert.equal(result.autoState.noticeVersion, NOTICE); assert.equal(result.autoState.ownConsent, false); assert.equal(result.autoState.allowed, false);
  }
  assert.deepEqual(env.db, before);
  env.mutate(db => { db.recruitingVideoInvites[0].voiceConsent = { consent:true, noticeVersion:OLD_NOTICE, updatedAt:new Date().toISOString() }; });
  assert.equal(ok(await env.public('status')).autoState.allowed, false);
  denied(await env.segment(), 409); assert.equal(env.calls.transcribe.length, 0);
  for (const noticeVersion of [OLD_NOTICE, 'outdated', '']) denied(await env.public('consent', { consent:true, noticeVersion }), 400);
  assert.equal(ok(await env.public('status')).autoState.ownConsent, false);
});

test('only the participant can consent to local capture, and candidate responses omit private recruiting data', async () => {
  const env = fixture();
  denied(await env.public('consent', { sessionSecret:'invalid', consent:true, noticeVersion:NOTICE }), 401);
  for (const actor of [VIEWER, { id:'edit-only', permissions:['recruitingEdit'] }, null]) denied(await env.admin('consent', { consent:true, noticeVersion:NOTICE }, actor), 403);
  ok(await env.public('consent', { consent:true, noticeVersion:NOTICE }));
  const candidate = ok(await env.public('status'));
  assert.equal(candidate.autoState.ownConsent, true); assert.equal(candidate.autoState.speaker, 'candidate');
  assert.doesNotMatch(JSON.stringify(candidate), /PRIVATE_(?:RESUME|NOTE|ANALYSIS)_MARKER|sessionSecretHash|tokenHash|speakerUserId/);
  assert.equal(ok(await env.admin('status')).autoState.ownConsent, false, 'Candidate consent does not grant consent for an interviewer');
  assert.equal(env.calls.transcribe.length, 0);
});

test('candidate and interviewer segments are saved with server-owned attribution without controller or manual turn', async () => {
  const env = await fixture().ready();
  const candidate = ok(await env.segment('public'));
  assert.equal(candidate.requestStatus, 'complete'); assert.equal(candidate.row.speaker, 'candidate');
  assert.equal(candidate.row.participantIdentity, 'candidate-auto-invite'); assert.equal(candidate.row.speakerName, 'Synthetic Candidate');
  const interviewer = ok(await env.segment('admin', { requestId:'synthetic-auto-staff-0001' }));
  assert.equal(interviewer.row.speaker, 'interviewer'); assert.equal(interviewer.row.speakerName, EDITOR.name);
  assert.equal(interviewer.row.participantIdentity, `recruiter-${digest(EDITOR.id).slice(0, 16)}-${SESSION}`);
  assert.equal(candidate.row.source, 'openai_auto_audio'); assert.equal(interviewer.row.source, 'openai_auto_audio');
  assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript.length, 2);
  assert.equal(env.calls.speech.length, 0); assert.equal(env.calls.transcribe.length, 2);
  assert.ok(!JSON.stringify(env.writes).includes(AUDIO.toString('base64')), 'Raw audio is not persisted in the recruiting database');
});

test('clients cannot forge another speaker, question association, or another interviewer session consent', async () => {
  const env = await fixture().ready();
  for (const extra of [{ speaker:'interviewer' }, { participantIdentity:'forged-identity' }, { speakerName:'Forged Person' }, { questionId:'forged-question' }, { kitId:'forged-kit' }]) denied(await env.segment('public', extra), 400);
  denied(await env.segment('admin', { participantSessionId:SESSION_OTHER }), 409);
  assert.equal(env.calls.transcribe.length, 0);
});

test('Chinese, English and mixed speech stay unchanged as original evidence with Chinese translation in a separate field', async () => {
  for (const [text, language] of [['I won one dealer order.', 'en'], ['我拿到了一个经销商订单。', 'zh'], ['我拜访了 three dealers，并拿到试单。', 'mixed']]) {
    const env = await fixture({ transcribe:async () => ({ text }), translate:async () => ({ text:'单独保存的中文对照。' }) }).ready();
    const result = ok(await env.segment());
    assert.equal(result.row.text, text); assert.equal(result.row.language, language);
    await settleBackground(() => Boolean(env.db.recruitingInterviews[0].aiInterview.transcript[0].translationZh));
    assert.ok(env.db.recruitingInterviews[0].aiInterview.transcript[0].translationZh, 'Chinese comparison is supplied without changing original wording');
    assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript[0].text, text);
  }
});

test('empty recognized audio creates no fabricated transcript row or translation', async () => {
  const env = await fixture({ transcribe:async () => ({ text:'' }) }).ready();
  const result = ok(await env.segment());
  assert.equal(result.requestStatus, 'complete'); assert.equal(result.skipped, true); assert.equal(result.row, undefined);
  assert.equal(env.calls.translate.length, 0); assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript.length, 0);
});

test('pausing blocks further upload and resume requires the current participant epoch', async () => {
  const env = await fixture().ready(); const state = ok(await env.public('status')).autoState;
  const paused = ok(await env.public('pause', { epoch:state.epoch })).autoState;
  assert.equal(paused.ownPaused, true); assert.equal(paused.allowed, false);
  denied(await env.segment(), 409);
  assert.ok((await env.public('resume', { epoch:'stale-epoch' })).status >= 400);
  const resumed = ok(await env.public('resume', { epoch:paused.epoch })).autoState;
  assert.equal(resumed.ownPaused, false); assert.equal(resumed.allowed, true);
  ok(await env.segment()); assert.equal(env.calls.transcribe.length, 1);
});

test('duplicate segment IDs cannot repeat provider work, change bytes or cross participant ownership', async () => {
  const gate = deferred(), started = deferred();
  const env = await fixture({ transcribe:async () => { started.resolve(); return gate.promise; } }).ready();
  const work = env.segment(); await providerStarted(work, started);
  const pending = await env.segment(); assert.ok([200,202,409].includes(pending.status)); assert.equal(pending.body.requestStatus, 'pending');
  denied(await env.segment('public', { audioBase64:Buffer.from('DIFFERENT_SYNTHETIC_BYTES').toString('base64') }), 409);
  gate.resolve({ text:'A verified original segment.' }); const complete = ok(await work);
  assert.equal(complete.requestStatus, 'complete'); const repeat = ok(await env.segment()); assert.equal(repeat.row.id, complete.row.id);
  assert.equal(env.calls.transcribe.length, 1); assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript.length, 1);
  const staff = await env.segment('admin');
  assert.ok(staff.status >= 400 || staff.body.row?.speaker === 'interviewer', 'Duplicate IDs never return another participant\'s row as the caller\'s own evidence');
});

test('malformed, oversized, too-long or stale-epoch segments never reach the provider', async () => {
  const env = await fixture().ready();
  for (const extra of [{ audioBase64:'' }, { audioBase64:'not-base64' }, { audioBase64:Buffer.alloc(1024 * 1024 + 1).toString('base64') }, { mimeType:'text/plain' }, { durationMs:0 }, { durationMs:30001 }, { durationMs:-1 }, { requestId:'short' }, { epoch:'old-epoch' }]) {
    const result = await env.segment('public', extra); assert.ok(result.status >= 400, JSON.stringify(result));
  }
  assert.equal(env.calls.transcribe.length, 0);
});

test('consent revocation during transcription discards the late original without overwriting concurrent records', async () => {
  const gate = deferred(), started = deferred();
  const env = await fixture({ transcribe:async () => { started.resolve(); return gate.promise; } }).ready();
  const work = env.segment(); await providerStarted(work, started);
  env.mutate(db => { db.unrelated[0].text = 'Concurrent preserved update'; });
  ok(await env.public('consent', { consent:false, noticeVersion:NOTICE }));
  gate.resolve({ text:'This late revoked content must not be saved.' }); const result = await work;
  assert.ok(result.status >= 400); assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript.length, 0);
  assert.equal(env.db.unrelated[0].text, 'Concurrent preserved update'); assert.equal(env.calls.translate.length, 0);
});

test('staff permission loss and ended invitations are rechecked after transcription before writing evidence', async () => {
  for (const change of [
    env => env.mutate(db => { db.users = [{ ...EDITOR, permissions:[] }]; }),
    env => env.mutate(db => { db.recruitingVideoInvites[0].status = 'revoked'; }),
    env => env.mutate(db => { db.recruitingInterviews[0].status = 'completed'; })
  ]) {
    const gate = deferred(), started = deferred(); const env = await fixture({ transcribe:async () => { started.resolve(); return gate.promise; } }).ready();
    const work = env.segment('admin'); await providerStarted(work, started); change(env);
    gate.resolve({ text:'Forbidden late evidence.' }); const result = await work;
    assert.ok(result.status >= 400); assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript.length, 0);
  }
});

test('the opposing participant must consent, and withdrawing that consent during transcription cancels late evidence', async () => {
  for (const kind of ['public','admin']) {
    const opposite = kind === 'public' ? 'admin' : 'public';
    const gate = deferred(), started = deferred();
    const env = fixture({ transcribe:async () => { started.resolve(); return gate.promise; } });
    ok(await env[kind]('consent', { consent:true, noticeVersion:NOTICE }));
    assert.equal(ok(await env[kind]('status')).autoState.allowed, false);
    denied(await env.segment(kind), 409); assert.equal(env.calls.transcribe.length, 0);
    ok(await env[opposite]('consent', { consent:true, noticeVersion:NOTICE }));
    assert.equal(ok(await env[kind]('status')).autoState.allowed, true);
    const work = env.segment(kind); await providerStarted(work, started);
    ok(await env[opposite]('consent', { consent:false, noticeVersion:NOTICE }));
    gate.resolve({ text:'Opposing participant revoked permission; do not save this.' });
    denied(await work, 409);
    assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript.length, 0); assert.equal(env.calls.translate.length, 0);
  }
});

test('a failed segment retries only when explicitly resubmitted and never creates duplicate evidence', async () => {
  let attempts = 0;
  const env = await fixture({ transcribe:async () => { if (++attempts === 1) throw new Error('synthetic transient failure'); return { text:'Recovered original answer.' }; } }).ready();
  denied(await env.segment(), 502); assert.equal(env.calls.transcribe.length, 1);
  ok(await env.public('status')); assert.equal(env.calls.transcribe.length, 1, 'Status polls cannot retry provider work');
  const retried = ok(await env.segment()); assert.equal(retried.row.text, 'Recovered original answer.');
  const duplicate = ok(await env.segment()); assert.equal(duplicate.row.id, retried.row.id);
  assert.equal(env.calls.transcribe.length, 2); assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript.length, 1);
});

test('translation failure preserves the original but never fabricates a completed Chinese translation', async () => {
  const env = await fixture({ translate:async () => { throw new Error('PRIVATE_SYNTHETIC_UPSTREAM_FAILURE'); } }).ready();
  const result = ok(await env.segment());
  assert.equal(result.row.text, 'I visited three dealerships and won a trial order.');
  await settleBackground(() => Boolean(env.db.recruitingInterviews[0].aiInterview.transcript[0].translationError));
  const saved = env.db.recruitingInterviews[0].aiInterview.transcript[0];
  assert.ok(!saved.translationZh); assert.ok(saved.translationError);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SYNTHETIC_UPSTREAM_FAILURE/);
  assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript.length, 1);
});

test('revoking consent during translation preserves only the already-authorized original and concurrent records', async () => {
  const gate = deferred(), started = deferred();
  const env = await fixture({ translate:async () => { started.resolve(); return gate.promise; } }).ready();
  ok(await env.segment()); await started.promise;
  assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript.length, 1);
  ok(await env.public('consent', { consent:false, noticeVersion:NOTICE }));
  env.mutate(db => { db.unrelated[0].text = 'Concurrent during translation'; });
  gate.resolve({ text:'已经撤回后到达的译文，不应保存。' }); for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(!env.db.recruitingInterviews[0].aiInterview.transcript[0].translationZh);
  assert.equal(env.db.unrelated[0].text, 'Concurrent during translation');
});

test('room flush waits for both participants and cannot acknowledge an in-flight final segment', async () => {
  const gate = deferred(), started = deferred();
  const env = await fixture({ transcribe:async () => { started.resolve(); return gate.promise; } }).ready();
  const candidateState = ok(await env.public('status')).autoState, staffState = ok(await env.admin('status')).autoState;
  const work = env.segment(); await providerStarted(work, started);
  const flush = ok(await env.admin('flush', { participantIdentities:[candidateState.identity, staffState.identity] })).autoState;
  assert.ok(flush.flushRequestId); assert.equal(flush.flushComplete, false);
  const earlyAck = await env.public('flush-ack', { flushRequestId:flush.flushRequestId, epoch:candidateState.epoch });
  assert.ok(earlyAck.status >= 400 || earlyAck.body.autoState?.flushComplete === false);
  ok(await env.admin('flush-ack', { flushRequestId:flush.flushRequestId, epoch:staffState.epoch }));
  assert.equal(ok(await env.admin('status')).autoState.flushComplete, false);
  gate.resolve({ text:'Final partial answer at the end of the interview.' }); ok(await work);
  ok(await env.public('flush-ack', { flushRequestId:flush.flushRequestId, epoch:candidateState.epoch }));
  const done = ok(await env.admin('status')).autoState;
  assert.equal(done.flushComplete, true); assert.equal(done.pendingSegments, 0);
  assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript.length, 1);
});

test('public candidate cannot initiate arbitrary room-wide flush or acknowledge another participant', async () => {
  const env = await fixture().ready();
  const candidate = ok(await env.public('status')).autoState, staff = ok(await env.admin('status')).autoState;
  denied(await env.public('flush', { participantIdentities:[staff.identity] }), 403);
  const flush = ok(await env.admin('flush', { participantIdentities:[candidate.identity, staff.identity] })).autoState;
  denied(await env.public('flush-ack', { flushRequestId:flush.flushRequestId, epoch:candidate.epoch, participantIdentity:staff.identity }), 400);
  assert.equal(ok(await env.admin('status')).autoState.flushComplete, false);
});

test('automatic provider accepts source language without forcing English and returns empty audio as empty text', async () => {
  const { createRecruitingVoiceProvider } = require('../lib/recruiting-voice');
  const calls = [];
  for (const text of ['我做汽车销售。', 'I work in car sales.', '我从事 car sales。', '']) {
    const provider = createRecruitingVoiceProvider({ getConfig:() => ({ apiKey:'synthetic-not-real', baseUrl:'https://synthetic.invalid/v1' }),
      fetchImpl:async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ text }), { headers:{ 'content-type':'application/json' } }); } });
    const result = await provider.transcribe({ audio:AUDIO, mimeType:'audio/webm' });
    assert.equal(result.text, text);
    assert.equal(calls.at(-1).options.body.has('language'), false, 'Forcing en would lose original Chinese or mixed-language evidence');
  }
});

test('next-question suggestions use saved evidence without forcing a room flush, while final analysis requires it', async () => {
  const env = await fixture().ready();
  ok(await env.segment()); await settleBackground(() => env.db.recruitingInterviews[0].aiInterview.transcript[0].translationStatus === 'complete');
  denied(await env.video('analyze', { mode:'final' }), 409); assert.equal(env.calls.analyze.length, 0);
  ok(await env.video('analyze', { mode:'next' })); assert.equal(env.calls.analyze.length, 1);
  assert.equal(env.calls.analyze[0].mode, 'next'); assert.equal(ok(await env.public('status')).autoState.allowed, true);
  await env.pauseBoth(); ok(await env.video('analyze', { mode:'final' }));
  assert.equal(env.calls.analyze.at(-1).mode, 'final');
});

test('final analysis retains all saved evidence beyond the old 300-row response window', async () => {
  const env = await fixture().ready();
  env.mutate(db => { db.recruitingInterviews[0].aiInterview.transcript = Array.from({ length:350 }, (_, i) => ({ id:`saved-${i}`, speaker:'candidate', text:`Saved evidence ${i}`, source:'openai_auto_audio', translationStatus:'not_needed' })); });
  await env.pauseBoth(); ok(await env.video('analyze', { mode:'final' }));
  assert.equal(env.calls.analyze[0].transcript.length, 350);
  assert.equal(env.calls.analyze[0].transcript[0].text, 'Saved evidence 0');
  assert.equal(env.calls.analyze[0].transcript.at(-1).text, 'Saved evidence 349');
});

test('final analysis does not save a stale result after permission, invitation, capture or evidence changes', async () => {
  for (const change of [
    env => env.mutate(db => { db.users = [{ ...EDITOR, permissions:[] }]; }),
    env => env.mutate(db => { db.recruitingVideoInvites[0].id = 'replacement-invite'; }),
    async env => { const current = ok(await env.public('status')).autoState; ok(await env.public('resume', { epoch:current.epoch })); },
    env => env.mutate(db => { db.recruitingInterviews[0].aiInterview.transcript.push({ id:'concurrent-answer', speaker:'candidate', text:'Concurrent new evidence.', source:'openai_auto_audio', translationStatus:'not_needed' }); })
  ]) {
    const gate = deferred(), started = deferred();
    const env = await fixture({ analyze:async () => { started.resolve(); return gate.promise; } }).ready();
    ok(await env.segment()); await settleBackground(() => env.db.recruitingInterviews[0].aiInterview.transcript[0].translationStatus === 'complete'); await env.pauseBoth();
    const work = env.video('analyze', { mode:'final' }); await providerStarted(work, started); await change(env);
    gate.resolve({ summary:'STALE_FINAL_MUST_NOT_SAVE' }); const result = await work;
    assert.ok(result.status >= 400, JSON.stringify(result));
    assert.notEqual(env.db.recruitingInterviews[0].aiInterview.analysis?.summary, 'STALE_FINAL_MUST_NOT_SAVE');
  }
});

test('a full transcript preserves the earliest records and rejects new audio without provider work', async () => {
  const env = await fixture().ready();
  env.mutate(db => { db.recruitingInterviews[0].aiInterview.transcript = Array.from({ length:2000 }, (_, i) => ({ id:`saved-${i}`, speaker:'candidate', text:`Preserved evidence ${i}` })); });
  const response = await env.segment(); assert.ok(response.status >= 400, JSON.stringify(response));
  assert.equal(env.calls.transcribe.length, 0); assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript.length, 2000);
  assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript[0].text, 'Preserved evidence 0');
});

test('room completion and final analysis wait for the separate Chinese translation to settle', async () => {
  for (const fail of [false,true]) {
    const gate = deferred(), started = deferred();
    const env = await fixture({ translate:async () => { started.resolve(); return gate.promise; } }).ready();
    ok(await env.segment()); await started.promise;
    const candidate = ok(await env.public('status')).autoState, staff = ok(await env.admin('status')).autoState;
    assert.equal(candidate.pendingSegments, 0); assert.equal(candidate.pendingTranslations, 1);
    const flush = ok(await env.admin('flush', { participantIdentities:[candidate.identity, staff.identity] })).autoState;
    ok(await env.public('flush-ack', { flushRequestId:flush.flushRequestId, epoch:candidate.epoch }));
    ok(await env.admin('flush-ack', { flushRequestId:flush.flushRequestId, epoch:staff.epoch }));
    assert.equal(ok(await env.admin('status')).autoState.flushComplete, false);
    denied(await env.video('analyze', { mode:'final' }), 409);
    if (fail) gate.reject(new Error('Synthetic translation failure')); else gate.resolve({ text:'完整的中文对照。' });
    await settleBackground(() => env.db.recruitingInterviews[0].aiInterview.transcript[0].translationStatus !== 'pending');
    const done = ok(await env.admin('status')).autoState;
    assert.equal(done.pendingTranslations, 0); assert.equal(done.flushComplete, true);
    ok(await env.video('analyze', { mode:'final' }));
    assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript[0].text, 'I visited three dealerships and won a trial order.');
  }
});

test('an active server-owned ending lock stops fresh consent, resume and segment provider work', async () => {
  const env = await fixture().ready();
  env.mutate(db => { db.recruitingInterviews[0].aiInterview.autoTranscript.ending = { id:'synthetic-end-operation', inviteId:'auto-invite', startedAt:new Date().toISOString() }; });
  for (const kind of ['public','admin']) {
    const current = ok(await env[kind]('status')).autoState;
    assert.equal(current.ending, true); assert.equal(current.allowed, false);
    denied(await env[kind]('consent', { consent:true, noticeVersion:NOTICE }), 409);
    denied(await env[kind]('resume', { epoch:current.epoch }), 409);
    denied(await env.segment(kind), 409);
  }
  assert.equal(env.calls.transcribe.length, 0);
  ok(await env.public('consent', { consent:false, noticeVersion:NOTICE }));
  assert.equal(ok(await env.public('status')).autoState.ownConsent, false, 'Ending cannot prevent withdrawing consent');
});

test('ending the room locks the real await boundary and releases the lock on success or failure', async () => {
  for (const fail of [false,true]) {
    const gate = deferred(), started = deferred();
    const env = await fixture({ deleteVideoRoom:async name => { assert.equal(name, roomName('auto-interview')); started.resolve(); return gate.promise; } }).ready();
    await env.pauseBoth(); const work = env.video('end'); await providerStarted(work, started);
    assert.equal(ok(await env.public('status')).autoState.ending, true);
    const before = ok(await env.public('status')).autoState;
    denied(await env.public('resume', { epoch:before.epoch }), 409);
    denied(await env.public('consent', { consent:true, noticeVersion:NOTICE }), 409);
    denied(await env.segment(), 409); assert.equal(env.calls.transcribe.length, 0);
    if (fail) gate.reject(new Error('Synthetic room deletion failed')); else gate.resolve();
    const result = await work;
    assert.equal(Boolean(env.db.recruitingInterviews[0].aiInterview.autoTranscript.ending), false);
    if (fail) {
      assert.ok(result.status >= 400); assert.equal(env.db.recruitingVideoInvites[0].status, 'joined');
      ok(await env.public('resume', { epoch:before.epoch }));
    } else { ok(result); assert.equal(env.db.recruitingVideoInvites[0].status, 'ended'); }
  }
});
