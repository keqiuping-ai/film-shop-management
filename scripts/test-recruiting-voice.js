'use strict';

// Synthetic route tests only: cloned in-memory DB, injected providers, no keys,
// network, microphone, recordings, server, filesystem DB, or actual candidates.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecruitingVideoService, digest, roomName } = require('../lib/recruiting-video');
const { INTERVIEW_KITS } = require('../lib/recruiting-interview-kits');

const NOTICE = '2026-09-20-auto-v1';
const SESSION_A = 'synthetic-voice-session-a';
const SESSION_B = 'synthetic-voice-session-b';
const CANDIDATE_SECRET = 'synthetic-private-candidate-session-secret';
const CANDIDATE_IDENTITY = 'candidate-voice-invite-1';
const EDITOR = { id:'voice-editor-a', name:'Synthetic Interviewer A', permissions:['recruitingView', 'recruitingEdit'] };
const OTHER_EDITOR = { id:'voice-editor-b', name:'Synthetic Interviewer B', permissions:['recruitingView', 'recruitingEdit'] };
const VIEWER = { id:'voice-viewer', name:'Synthetic Observer', permissions:['recruitingView'] };
const AUDIO = Buffer.from('SYNTHETIC_AUDIO_BYTES_NOT_A_REAL_RECORDING');
const QUESTION = 'Tell me about a specific installation you completed.';
const FIXED_KIT = INTERVIEW_KITS.find(kit => kit.id === 'wholesale_quick_6');
const FIXED_QUESTION = FIXED_KIT.questions[0];
const clone = value => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function providerStarted(work, started) {
  await Promise.race([started.promise, work.then(result => { throw new Error(`Route returned before reaching mocked provider: ${JSON.stringify(result)}`); })]);
}

function fixture(overrides = {}) {
  let db = {
    unrelatedRecords:[{ id:'preserve-me', value:'Original unrelated data' }],
    recruitingCandidates:[{ id:'voice-candidate-1', name:'Synthetic Voice Candidate', resumeText:'PRIVATE RESUME MARKER', notes:'PRIVATE INTERNAL NOTES MARKER' }],
    recruitingInterviews:[{ id:'voice-interview-1', candidateId:'voice-candidate-1', startsAt:new Date(Date.now() + 86400000).toISOString(), durationMinutes:30,
      aiInterview:{ transcript:[], analysis:{ summary:'PRIVATE ANALYSIS MARKER', generatedByUserId:EDITOR.id } } }],
    recruitingVideoInvites:[{ id:'voice-invite-1', interviewId:'voice-interview-1', candidateId:'voice-candidate-1', status:'joined', roomName:roomName('voice-interview-1'),
      expiresAt:new Date(Date.now() + 86400000).toISOString(), sessionSecretHash:digest(CANDIDATE_SECRET), tokenHash:digest('synthetic-original-invite') }]
  };
  const calls = { speech:[], transcribe:[], translate:[] }, writes = [];
  const provider = {
    configured:() => typeof overrides.configured === 'function' ? overrides.configured() : overrides.configured !== false,
    speech:async body => { calls.speech.push(body); return overrides.speech ? overrides.speech(body) : { audioBase64:Buffer.from('SYNTHETIC_AI_VOICE').toString('base64'), mimeType:'audio/mpeg' }; },
    transcribe:async body => { calls.transcribe.push(body); return overrides.transcribe ? overrides.transcribe(body) : { text:'I completed a full-front installation and verified every edge.' }; }
  };
  const service = createRecruitingVideoService({
    readDb:() => clone(db), writeDb:value => { writes.push(clone(value)); db = clone(value); },
    readBody:async req => req.body || {}, send:(res, status, body) => { res.result = { status, body }; },
    canAccess:(actor, permission) => Boolean(actor?.permissions?.includes(permission)),
    publicBaseUrl:() => 'https://fixture.invalid', notify:() => {}, voiceProvider:provider,
    translateVoiceText:async body => { calls.translate.push(body); return overrides.translate ? overrides.translate(body) : { text:'Can you describe the result in more detail?' }; }
  });
  const route = async (kind, pathname, body = {}, actor = EDITOR, method = 'POST') => {
    const res = {};
    const handled = await service[kind]({ method, body, headers:{}, socket:{ remoteAddress:'127.0.0.1' } }, res, new URL(`https://fixture.invalid${pathname}`), actor);
    return res.result || { status:handled === false ? 404 : 0, body:{} };
  };
  return {
    calls, writes, get db() { return db; },
    mutate(callback) { const fresh = clone(db); callback(fresh); db = fresh; },
    admin(action, body = {}, actor = EDITOR, method = 'POST') { return route('handleAdmin', `/api/recruiting/interviews/voice-interview-1/video-${action}`, { participantSessionId:SESSION_A, ...body }, actor, method); },
    public(action, body = {}, method = 'POST') { return route('handlePublic', `/api/public/recruiting-video/${action}`, { interviewId:'voice-interview-1', sessionSecret:CANDIDATE_SECRET, ...body }, null, method); },
    consent(value = true, extra = {}) { return this.public('auto', { operation:'consent', consent:value, noticeVersion:NOTICE, ...extra }); },
    voice(operation, body = {}, actor = EDITOR) { return this.admin('voice', { operation, ...body }, actor); },
    speech(body = {}, actor = EDITOR) { return this.admin('speech', { requestId:'synthetic-speech-request-1', text:QUESTION, questionId:'', kitId:'', ...body }, actor); },
    prepare(body = {}, actor = EDITOR) { return route('handleAdmin', '/api/recruiting/interviews/voice-interview-1/video-speech-prepare', { kitId:FIXED_KIT.id, questionId:FIXED_QUESTION.id, ...body }, actor); },
    answer(turnId, body = {}, actor = EDITOR) { return this.admin('answer', { requestId:'synthetic-answer-request-1', turnId, candidateIdentity:CANDIDATE_IDENTITY, mimeType:'audio/webm', durationMs:1500, audioBase64:AUDIO.toString('base64'), ...body }, actor); }
  };
}

function ok(result, message) {
  assert.ok(result.status >= 200 && result.status < 300, message || JSON.stringify(result));
  return result.body;
}
function error(result, status, code) {
  assert.equal(result.status, status, JSON.stringify(result.body));
  if (code) assert.equal(result.body.code, code);
}
async function prepared(overrides = {}) {
  const env = fixture(overrides);
  ok(await env.consent()); ok(await env.voice('claim'));
  const speech = ok(await env.speech()), turnId = speech.voice.currentTurn.id;
  return { env, speech, turnId };
}
async function capturing(overrides = {}) {
  const context = await prepared(overrides), { env, turnId } = context;
  ok(await env.voice('speaking', { turnId })); ok(await env.voice('waiting', { turnId }));
  ok(await env.voice('recording', { turnId, candidateIdentity:CANDIDATE_IDENTITY }));
  return context;
}

test('voice status is read-only and configuration failure never calls a provider', async () => {
  const env = fixture({ configured:false }), before = clone(env.db);
  const status = ok(await env.voice('status'));
  assert.equal(status.voice.configured, false);
  assert.deepEqual(env.db, before);
  error(await env.voice('claim'), 503, 'INTERVIEW_VOICE_NOT_CONFIGURED');
  assert.equal(env.calls.speech.length, 0); assert.equal(env.calls.transcribe.length, 0);
});

test('single controller lease binds actor plus per-tab identity and can be taken over only after expiry', async t => {
  t.mock.timers.enable({ apis:['Date'], now:Date.parse('2026-09-19T18:00:00Z') });
  const env = fixture();
  const first = ok(await env.voice('claim'));
  assert.equal(first.voice.controllerIdentity, `recruiter-${digest(EDITOR.id).slice(0, 16)}-${SESSION_A}`);
  error(await env.voice('claim', {}, OTHER_EDITOR), 409, 'INTERVIEW_VOICE_CONTROLLER_BUSY');
  error(await env.voice('claim', { participantSessionId:SESSION_B }), 409, 'INTERVIEW_VOICE_CONTROLLER_BUSY');
  error(await env.voice('heartbeat', {}, OTHER_EDITOR), 409, 'INTERVIEW_VOICE_CONTROLLER_REQUIRED');
  error(await env.voice('release', { participantSessionId:SESSION_B }), 409, 'INTERVIEW_VOICE_CONTROLLER_REQUIRED');
  t.mock.timers.tick(15000); const renewed = ok(await env.voice('heartbeat'));
  assert.ok(Date.parse(renewed.voice.leaseExpiresAt) > Date.parse(first.voice.leaseExpiresAt));
  t.mock.timers.tick(30001); const next = ok(await env.voice('claim', {}, OTHER_EDITOR));
  assert.notEqual(next.voice.controllerIdentity, first.voice.controllerIdentity);
  error(await env.voice('heartbeat'), 409, 'INTERVIEW_VOICE_CONTROLLER_REQUIRED');
  ok(await env.voice('release', {}, OTHER_EDITOR));
  ok(await env.voice('claim'));
});

test('public candidate sessions grant consent/status only and never admin voice rights or private profile output', async () => {
  const env = fixture(), original = clone(env.db);
  for (const action of ['voice-consent', 'voice-state']) {
    error(await env.public(action, { sessionSecret:'invalid-secret', ...(action === 'voice-consent' ? { consent:true, noticeVersion:NOTICE } : {}) }), 401, 'INTERVIEW_VOICE_SESSION_EXPIRED');
  }
  assert.deepEqual(env.db, original);
  for (const actor of [VIEWER, { id:'edit-only', permissions:['recruitingEdit'] }, null]) {
    for (const action of ['voice', 'speech', 'followup', 'answer']) error(await env.admin(action, { operation:'claim', sessionSecret:CANDIDATE_SECRET }, actor), 403, 'INTERVIEW_VOICE_FORBIDDEN');
  }
  ok(await env.consent());
  const state = ok(await env.public('voice-state'));
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE (?:RESUME|INTERNAL NOTES|ANALYSIS) MARKER|speakerUserId|generatedByUserId|sessionSecretHash|tokenHash/);
  assert.equal(Object.hasOwn(state.aiState || {}, 'analysis'), false);
  error(await env.public('answer', { audioBase64:AUDIO.toString('base64') }), 404);
  assert.equal(env.calls.speech.length + env.calls.transcribe.length, 0);
});

test('video-join consent does not opt into AI voice and explicit revocation disables future synthesis and capture', async () => {
  const env = fixture();
  ok(await env.voice('claim'));
  error(await env.speech(), 409, 'INTERVIEW_VOICE_CONSENT_REQUIRED');
  error(await env.consent(true, { noticeVersion:'outdated-notice' }), 400);
  ok(await env.consent());
  const speech = ok(await env.speech()), turnId = speech.voice.currentTurn.id;
  ok(await env.voice('speaking', { turnId })); ok(await env.voice('waiting', { turnId }));
  ok(await env.consent(false));
  error(await env.voice('recording', { turnId, candidateIdentity:CANDIDATE_IDENTITY }), 409, 'INTERVIEW_VOICE_CONSENT_REQUIRED');
  error(await env.speech({ requestId:'synthetic-after-revoke' }), 409, 'INTERVIEW_VOICE_CONSENT_REQUIRED');
  assert.equal(env.calls.speech.length, 1); assert.equal(env.calls.transcribe.length, 0);
  assert.equal(env.db.recruitingVideoInvites[0].voiceConsent.consent, false);
});

test('questions must be English-only and recordings require the authoritative waiting turn and candidate identity', async () => {
  const { env, turnId } = await prepared();
  for (const text of ['请介绍你的经验', 'Tell me 中文 details', '', 'x'.repeat(5001)]) {
    error(await env.speech({ requestId:`invalid-${text.length}`, text }), 400);
  }
  error(await env.voice('recording', { turnId, candidateIdentity:CANDIDATE_IDENTITY }), 409);
  ok(await env.voice('speaking', { turnId })); ok(await env.voice('waiting', { turnId }));
  error(await env.voice('recording', { turnId:'wrong-turn', candidateIdentity:CANDIDATE_IDENTITY }), 409, 'INTERVIEW_VOICE_TURN_INVALID');
  error(await env.voice('recording', { turnId, candidateIdentity:'candidate-forged' }), 409);
  error(await env.voice('recording', { turnId, candidateIdentity:CANDIDATE_IDENTITY, participantSessionId:SESSION_B }), 409, 'INTERVIEW_VOICE_CONTROLLER_REQUIRED');
  const recording = ok(await env.voice('recording', { turnId, candidateIdentity:CANDIDATE_IDENTITY }));
  assert.equal(recording.voice.currentTurn.phase, 'recording');
  error(await env.speech({ requestId:'new-question-while-recording' }), 409, 'INTERVIEW_VOICE_BUSY');
  assert.equal(env.calls.speech.length, 1);
});

test('speech request IDs are idempotent during provider work and after completion without replaying or retaining audio', async () => {
  const pending = deferred(), started = deferred();
  const env = fixture({ speech:async () => { started.resolve(); return pending.promise; } });
  ok(await env.consent()); ok(await env.voice('claim'));
  const first = env.speech(); await providerStarted(first, started);
  const duplicate = await env.speech();
  assert.ok([200, 202, 409].includes(duplicate.status));
  assert.equal(duplicate.body.requestStatus, 'pending');
  assert.equal(duplicate.body.audioBase64, undefined);
  error(await env.speech({ text:'A different question with the same ID.' }), 409, 'INTERVIEW_VOICE_REQUEST_CONFLICT');
  const payload = Buffer.from('EPHEMERAL_SPEECH_BYTES').toString('base64');
  pending.resolve({ audioBase64:payload, mimeType:'audio/mpeg' });
  const spoken = ok(await first); assert.equal(spoken.audioBase64, payload); assert.equal(spoken.requestStatus, 'complete');
  const replay = ok(await env.speech()); assert.equal(replay.audioBase64, undefined); assert.equal(replay.requestStatus, 'complete');
  assert.equal(env.calls.speech.length, 1);
  assert.ok(!JSON.stringify(env.writes).includes(payload), 'Synthesized audio is never retained in a DB write');
});

test('revoking consent during synthesis discards the provider result without clobbering newer consent or data', async () => {
  const pending = deferred(), started = deferred();
  const env = fixture({ speech:async () => { started.resolve(); return pending.promise; } });
  ok(await env.consent()); ok(await env.voice('claim'));
  const result = env.speech(); await providerStarted(result, started);
  env.mutate(db => { db.unrelatedRecords[0].value = 'Concurrent updated value'; db.recruitingCandidates[0].notes = 'Concurrent new note'; });
  ok(await env.consent(false));
  pending.resolve({ audioBase64:Buffer.from('MUST_NOT_PLAY').toString('base64'), mimeType:'audio/mpeg' });
  const response = await result;
  assert.ok(response.status >= 400); assert.equal(response.body.audioBase64, undefined);
  assert.equal(env.db.recruitingVideoInvites[0].voiceConsent.consent, false);
  assert.equal(env.db.unrelatedRecords[0].value, 'Concurrent updated value');
  assert.equal(env.db.recruitingCandidates[0].notes, 'Concurrent new note');
});

test('late speech cannot survive controller release, lease expiry, interruption, permission loss or invite revocation', async t => {
  t.mock.timers.enable({ apis:['Date'], now:Date.parse('2026-09-19T18:00:00Z') });
  for (const change of [
    async env => { ok(await env.voice('release')); ok(await env.voice('claim', {}, OTHER_EDITOR)); },
    async () => { t.mock.timers.tick(30001); },
    async env => { ok(await env.voice('interrupted')); },
    async env => { env.mutate(db => { db.users = [{ ...EDITOR, permissions:[] }]; }); },
    async env => { env.mutate(db => { db.recruitingVideoInvites[0].status = 'revoked'; }); }
  ]) {
    const pending = deferred(), started = deferred();
    const env = fixture({ speech:async () => { started.resolve(); return pending.promise; } });
    ok(await env.consent()); ok(await env.voice('claim'));
    const work = env.speech(); await providerStarted(work, started); await change(env);
    pending.resolve({ audioBase64:Buffer.from('OBSOLETE_AUDIO_RESULT').toString('base64'), mimeType:'audio/mpeg' });
    const result = await work;
    assert.ok(result.status >= 400); assert.equal(result.body.audioBase64, undefined);
    assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript.length, 0, 'Preparing a question is not evidence that it was spoken');
  }
});

test('follow-up translation returns a reviewable English draft only and never synthesizes speech or starts a new turn', async () => {
  const env = fixture(); ok(await env.consent()); ok(await env.voice('claim'));
  const before = clone(env.db);
  const draft = ok(await env.admin('followup', { text:'请详细说明结果。' }));
  assert.equal(draft.text, 'Can you describe the result in more detail?');
  assert.deepEqual(env.calls.translate, [{ text:'请详细说明结果。', targetLanguage:'en' }]);
  assert.equal(env.calls.speech.length, 0); assert.equal(env.calls.transcribe.length, 0);
  assert.deepEqual(env.db.recruitingInterviews[0].aiInterview.transcript, before.recruitingInterviews[0].aiInterview.transcript);
  assert.deepEqual(env.db.recruitingInterviews[0].aiInterview.voice.currentTurn, before.recruitingInterviews[0].aiInterview.voice.currentTurn);
  const english = ok(await env.admin('followup', { text:'What changed after your work?' }));
  assert.equal(english.text, 'What changed after your work?'); assert.equal(env.calls.translate.length, 1);
  const invalid = fixture({ translate:async () => ({ text:'仍然是中文' }) }); ok(await invalid.consent()); ok(await invalid.voice('claim'));
  error(await invalid.admin('followup', { text:'请详细说明。' }), 502, 'INTERVIEW_VOICE_PROVIDER_FAILED');
  assert.equal(invalid.calls.speech.length, 0);
});

test('follow-up translation enforces single-flight and minute budgets, releases failures and preserves concurrent data', async t => {
  t.mock.timers.enable({ apis:['Date'], now:Date.parse('2026-09-19T18:00:00Z') });
  const pending = deferred(), started = deferred();
  const env = fixture({ translate:async () => { started.resolve(); return pending.promise; } });
  ok(await env.consent()); ok(await env.voice('claim'));
  const work = env.admin('followup', { text:'请说明工作细节。' }); await providerStarted(work, started);
  error(await env.admin('followup', { text:'另一条中文追问。' }), 409, 'INTERVIEW_VOICE_BUSY');
  env.mutate(db => { db.unrelatedRecords[0].value = 'Concurrent during follow-up'; });
  pending.resolve({ text:'Please explain the work in detail.' }); ok(await work);
  assert.equal(env.db.unrelatedRecords[0].value, 'Concurrent during follow-up');
  assert.equal(env.db.recruitingInterviews[0].aiInterview.voice.followupPending, null);
  const limited = fixture(); ok(await limited.consent()); ok(await limited.voice('claim'));
  for (let index = 0; index < 6; index++) ok(await limited.admin('followup', { text:`请说明第 ${index} 个细节。` }));
  error(await limited.admin('followup', { text:'超出频率限制。' }), 429, 'INTERVIEW_VOICE_RATE_LIMIT');
  assert.equal(limited.calls.translate.length, 6);
  t.mock.timers.tick(60001); ok(await limited.voice('claim')); ok(await limited.admin('followup', { text:'恢复后的追问。' }));
  const failing = fixture({ translate:async () => { throw new Error('SENSITIVE_SYNTHETIC_TRANSLATOR_DETAIL'); } }); ok(await failing.consent()); ok(await failing.voice('claim'));
  const failed = await failing.admin('followup', { text:'这条追问会失败。' }); error(failed, 502);
  assert.doesNotMatch(JSON.stringify(failed), /SENSITIVE_SYNTHETIC_TRANSLATOR_DETAIL/);
  assert.equal(failing.db.recruitingInterviews[0].aiInterview.voice.followupPending, null);
});

test('interruption and renewed consent cannot start a second follow-up provider while cancelled work is still pending', async () => {
  const pending = deferred(), started = deferred();
  let sequence = 0;
  const env = fixture({ translate:async () => { if (++sequence === 1) { started.resolve(); return pending.promise; } return { text:'A fresh follow-up question.' }; } });
  ok(await env.consent()); ok(await env.voice('claim'));
  const work = env.admin('followup', { text:'第一条待完成追问。' }); await providerStarted(work, started);
  ok(await env.voice('interrupted')); ok(await env.consent(false)); ok(await env.consent(true));
  error(await env.admin('followup', { text:'不能并行启动的追问。' }), 409, 'INTERVIEW_VOICE_BUSY');
  assert.equal(env.calls.translate.length, 1);
  pending.resolve({ text:'An obsolete follow-up result.' });
  error(await work, 409, 'INTERVIEW_VOICE_RESULT_STALE');
  const next = ok(await env.admin('followup', { text:'原请求结束后的新追问。' }));
  assert.equal(next.text, 'A fresh follow-up question.'); assert.equal(env.calls.translate.length, 2);
});

test('answer transcription retains text only with server-owned turn/candidate attribution and preserves concurrent DB writes', async () => {
  const pending = deferred(), started = deferred();
  const { env, turnId } = await capturing({ transcribe:async body => { assert.deepEqual(body.audio, AUDIO); started.resolve(); return pending.promise; } });
  ok(await env.voice('stop-recording', { turnId, candidateIdentity:CANDIDATE_IDENTITY }));
  error(await env.answer(turnId, { speaker:'interviewer', speakerName:'Forged Owner', speakerUserId:'forged-user' }), 400, 'INTERVIEW_VOICE_VALIDATION');
  assert.equal(env.calls.transcribe.length, 0, 'Client-supplied attribution is rejected before transcription');
  const work = env.answer(turnId); await providerStarted(work, started);
  env.mutate(db => { db.unrelatedRecords.push({ id:'concurrent-record' }); db.recruitingCandidates[0].notes = 'Concurrent preserved notes'; db.recruitingInterviews[0].aiInterview.transcript.push({ id:'concurrent-line', speaker:'interviewer', text:'Concurrent original evidence.' }); });
  pending.resolve({ text:'I verified every edge after the synthetic installation.' });
  const result = ok(await work), row = result.row;
  assert.equal(row.speaker, 'candidate'); assert.equal(row.participantIdentity, CANDIDATE_IDENTITY);
  assert.equal(row.turnId, turnId); assert.equal(row.text, 'I verified every edge after the synthetic installation.');
  assert.notEqual(row.speakerName, 'Forged Owner'); assert.notEqual(row.speakerUserId, 'forged-user');
  assert.equal(env.db.recruitingCandidates[0].notes, 'Concurrent preserved notes');
  assert.equal(env.db.unrelatedRecords.at(-1).id, 'concurrent-record');
  assert.ok(env.db.recruitingInterviews[0].aiInterview.transcript.some(item => item.id === 'concurrent-line'));
  assert.ok(env.db.recruitingInterviews[0].aiInterview.transcript.some(item => item.text === row.text));
  const persisted = JSON.stringify(env.writes);
  assert.ok(!persisted.includes(AUDIO.toString('base64'))); assert.ok(!persisted.includes(AUDIO.toString()));
  assert.doesNotMatch(persisted, /"audioBase64"|"audio":|"type":"Buffer"/);
});

test('answer request IDs bind to exact bytes, turn and identity and retry never duplicates provider work or evidence', async () => {
  const pending = deferred(), started = deferred();
  const { env, turnId } = await capturing({ transcribe:async () => { started.resolve(); return pending.promise; } });
  const work = env.answer(turnId); await providerStarted(work, started);
  const duplicate = await env.answer(turnId); assert.ok([200, 202, 409].includes(duplicate.status)); assert.equal(duplicate.body.requestStatus, 'pending');
  error(await env.answer(turnId, { audioBase64:Buffer.from('DIFFERENT_BYTES').toString('base64') }), 409, 'INTERVIEW_VOICE_REQUEST_CONFLICT');
  error(await env.answer(turnId, { participantSessionId:SESSION_B }), 409, 'INTERVIEW_VOICE_CONTROLLER_REQUIRED');
  pending.resolve({ text:'The saved candidate answer.' });
  const answer = ok(await work), replay = ok(await env.answer(turnId));
  assert.deepEqual(replay.row, answer.row); assert.equal(replay.requestStatus, 'complete'); assert.equal(env.calls.transcribe.length, 1);
  assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript.filter(row => row.id === answer.row.id).length, 1);
});

test('answer upload rejects missing capture, stale turn, wrong candidate, bad MIME, invalid base64 and duration/byte limits before providers', async () => {
  const before = await prepared();
  error(await before.env.answer(before.turnId), 409);
  const { env, turnId } = await capturing();
  for (const body of [
    { turnId:'stale-turn' }, { candidateIdentity:'candidate-other' }, { mimeType:'text/plain' },
    { audioBase64:'not valid base64!?' }, { audioBase64:'' }, { durationMs:0 }, { durationMs:120001 }, { durationMs:1.5 },
    { audioBase64:Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64') }
  ]) {
    const response = await env.answer(turnId, body);
    assert.ok(response.status >= 400, JSON.stringify({ body:{ ...body, audioBase64:body.audioBase64 ? '[synthetic bytes]' : body.audioBase64 }, response }));
  }
  assert.equal(env.calls.transcribe.length, 0);
});

test('revocation while transcription is pending prevents late evidence retention and keeps unrelated concurrent data', async () => {
  const pending = deferred(), started = deferred();
  const { env, turnId } = await capturing({ transcribe:async () => { started.resolve(); return pending.promise; } });
  const work = env.answer(turnId); await providerStarted(work, started);
  env.mutate(db => { db.unrelatedRecords[0].value = 'Concurrent value after recording'; });
  ok(await env.consent(false)); pending.resolve({ text:'REVOKED_CANDIDATE_ANSWER_MUST_NOT_PERSIST' });
  const result = await work; assert.ok(result.status >= 400);
  assert.ok(!JSON.stringify(env.db).includes('REVOKED_CANDIDATE_ANSWER_MUST_NOT_PERSIST'));
  assert.equal(env.db.unrelatedRecords[0].value, 'Concurrent value after recording');
});

test('answer translation keeps original English separate, preserves concurrent records and never fabricates a failed translation', async () => {
  const pending = deferred(), started = deferred();
  const { env, turnId } = await capturing({ translate:async body => { assert.equal(body.targetLanguage, 'zh'); started.resolve(); return pending.promise; } });
  const work = env.answer(turnId); await providerStarted(work, started);
  const original = env.db.recruitingInterviews[0].aiInterview.transcript.find(row => row.source === 'openai_audio');
  assert.ok(original); assert.equal(original.translationZh, '');
  const pendingReplay = ok(await env.answer(turnId));
  assert.equal(pendingReplay.requestStatus, 'pending'); assert.equal(pendingReplay.row.id, original.id);
  assert.equal(pendingReplay.row.translationZh, '', 'A saved English row does not imply translation is complete');
  env.mutate(db => { db.unrelatedRecords[0].value = 'Written while translating'; db.recruitingInterviews[0].aiInterview.transcript.push({ id:'during-translation', text:'Concurrent staff evidence.' }); });
  pending.resolve({ text:'合成中文对照。' });
  const result = ok(await work);
  assert.equal(result.row.text, original.text); assert.equal(result.row.translationZh, '合成中文对照。');
  assert.equal(env.db.unrelatedRecords[0].value, 'Written while translating');
  assert.ok(env.db.recruitingInterviews[0].aiInterview.transcript.some(row => row.id === 'during-translation'));
  const failed = await capturing({ translate:async () => { throw new Error('Synthetic translation unavailable'); } });
  const kept = ok(await failed.env.answer(failed.turnId));
  assert.ok(kept.row.text); assert.equal(kept.row.translationZh, '');
  assert.equal(kept.row.translationError, 'INTERVIEW_VOICE_TRANSLATION_FAILED');
});

test('per-interview request limits stop new provider work without deleting previous evidence', async () => {
  const env = fixture(); ok(await env.consent()); ok(await env.voice('claim'));
  env.mutate(db => { db.recruitingInterviews[0].aiInterview.voice.requests = Array.from({ length:500 }, (_, index) => ({ id:`synthetic-old-${index}`, kind:'speech', status:'complete' })); });
  const before = clone(env.db);
  error(await env.speech(), 409, 'INTERVIEW_VOICE_LIMIT_REACHED');
  assert.equal(env.calls.speech.length, 0); assert.deepEqual(env.db, before);
});

test('provider failures do not persist audio or create fabricated transcript evidence and release busy turn state', async () => {
  const { env, turnId } = await capturing({ transcribe:async () => { throw new Error('Synthetic transcription unavailable'); } });
  const result = await env.answer(turnId); assert.ok(result.status >= 400);
  assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript.length, 1, 'Only the previously asked AI question remains');
  const state = ok(await env.voice('status'));
  assert.notEqual(state.voice.currentTurn.phase, 'transcribing');
  assert.ok(!JSON.stringify(env.writes).includes(AUDIO.toString('base64')));
  const retry = ok(await env.answer(turnId));
  assert.equal(retry.requestStatus, 'failed'); assert.equal(retry.row, undefined);
  assert.equal(retry.requestErrorCode, 'INTERVIEW_VOICE_PROVIDER_FAILED');
  assert.equal(env.calls.transcribe.length, 1, 'A terminally failed request ID never silently repeats provider work');
});

function providerFixture(fetchImpl, extra = {}) {
  const { createRecruitingVoiceProvider } = require('../lib/recruiting-voice');
  return createRecruitingVoiceProvider({
    getConfig:() => ({ apiKey:'synthetic-provider-key', baseUrl:'https://mock-provider.invalid/v1' }),
    fetchImpl, timeoutMs:20, ...extra
  });
}

test('voice provider uses bounded English speech and multipart source-language transcription with injected transport only', async () => {
  const calls = [];
  const provider = providerFixture(async (url, options) => {
    calls.push({ url, options });
    return url.endsWith('/audio/speech')
      ? new Response(Buffer.from('SYNTHETIC_MP3'), { headers:{ 'content-type':'audio/mpeg' } })
      : new Response(JSON.stringify({ text:'A synthetic English answer.' }), { headers:{ 'content-type':'application/json' } });
  });
  assert.equal(provider.configured(), true);
  const speech = await provider.speech({ text:QUESTION });
  assert.equal(speech.mimeType, 'audio/mpeg');
  assert.equal(Buffer.from(speech.audioBase64, 'base64').toString(), 'SYNTHETIC_MP3');
  const speechBody = JSON.parse(calls[0].options.body);
  assert.equal(calls[0].url, 'https://mock-provider.invalid/v1/audio/speech');
  assert.equal(speechBody.model, 'gpt-4o-mini-tts'); assert.equal(speechBody.input, QUESTION);
  assert.equal(speechBody.response_format, 'mp3'); assert.equal(speechBody.voice, 'onyx');
  const transcript = await provider.transcribe({ audio:AUDIO, mimeType:'audio/webm;codecs=opus' });
  assert.equal(transcript.text, 'A synthetic English answer.');
  assert.equal(calls[1].url, 'https://mock-provider.invalid/v1/audio/transcriptions');
  assert.ok(calls[1].options.body instanceof FormData);
  assert.equal(calls[1].options.body.has('language'), false, 'Transcription preserves the original spoken language rather than forcing English');
  assert.equal(calls[1].options.body.get('model'), 'gpt-4o-mini-transcribe');
  assert.equal(calls[1].options.body.get('response_format'), 'json');
  assert.deepEqual(Buffer.from(await calls[1].options.body.get('file').arrayBuffer()), AUDIO);
  assert.ok(calls.every(call => call.options.signal instanceof AbortSignal));
});

test('provider rejects unsupported audio, oversized input and non-English questions before transport', async () => {
  let calls = 0;
  const provider = providerFixture(async () => { calls++; throw new Error('Unexpected provider call'); });
  for (const text of ['', '请介绍你自己', 'English 中文 mixed question', 'x'.repeat(2001)]) {
    await assert.rejects(async () => provider.speech({ text }), error => error.statusCode === 400);
  }
  for (const body of [{ audio:AUDIO, mimeType:'text/plain' }, { audio:Buffer.alloc(0), mimeType:'audio/webm' }, { audio:Buffer.alloc(4 * 1024 * 1024 + 1), mimeType:'audio/webm' }]) {
    await assert.rejects(async () => provider.transcribe(body), error => [400, 413].includes(error.statusCode));
  }
  assert.equal(calls, 0);
});

test('provider failures sanitize upstream bodies and transport errors without leaking credential or submitted content', async () => {
  const sensitive = 'SYNTHETIC_PROVIDER_PRIVATE_TEXT_AND_KEY';
  for (const [status, code, statusCode] of [[401,'AUTH',503], [403,'AUTH',503], [429,'RATE_LIMIT',429], [500,'FAILED',502]]) {
    const provider = providerFixture(async () => new Response(sensitive, { status }));
    await assert.rejects(provider.speech({ text:QUESTION }), error => {
      assert.equal(error.code, `INTERVIEW_VOICE_PROVIDER_${code}`); assert.equal(error.statusCode, statusCode);
      assert.ok(!String(error).includes(sensitive)); assert.ok(!JSON.stringify(error).includes(sensitive));
      return true;
    });
  }
  const provider = providerFixture(async () => { throw new Error(sensitive); });
  await assert.rejects(provider.transcribe({ audio:AUDIO, mimeType:'audio/webm' }), error => {
    assert.ok(!String(error).includes(sensitive)); assert.ok(!JSON.stringify(error).includes(sensitive));
    assert.equal(error.code, 'INTERVIEW_VOICE_PROVIDER_FAILED'); return true;
  });
});

test('provider aborts a stalled transport within its deadline and exposes only a safe timeout', async t => {
  t.mock.timers.enable({ apis:['setTimeout'] });
  let signal;
  const provider = providerFixture(async (url, options) => {
    signal = options.signal;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('SYNTHETIC_SECRET_TIMEOUT_DETAIL'), { name:'AbortError' })), { once:true }));
  });
  const work = provider.speech({ text:QUESTION });
  const expectation = assert.rejects(work, error => {
    assert.equal(error.code, 'INTERVIEW_VOICE_PROVIDER_TIMEOUT'); assert.equal(error.statusCode, 504);
    assert.doesNotMatch(String(error), /SYNTHETIC_SECRET_TIMEOUT_DETAIL/); return true;
  });
  t.mock.timers.tick(60001); await expectation;
  assert.equal(signal.aborted, true);
});

test('provider rejects malformed transcription output and non-audio speech without fabricating usable evidence', async () => {
  for (const body of [{ text:42 }, {}, { text:'x'.repeat(12001) }]) {
    const provider = providerFixture(async () => new Response(JSON.stringify(body), { headers:{ 'content-type':'application/json' } }));
    await assert.rejects(provider.transcribe({ audio:AUDIO, mimeType:'audio/webm' }), error => error.code === 'INTERVIEW_VOICE_PROVIDER_INVALID');
  }
  for (const response of [new Response('', { headers:{ 'content-type':'audio/mpeg' } }), new Response('<html>Not audio</html>', { headers:{ 'content-type':'text/html' } })]) {
    const provider = providerFixture(async () => response);
    await assert.rejects(provider.speech({ text:QUESTION }), error => error.code === 'INTERVIEW_VOICE_PROVIDER_INVALID');
  }
});

test('provider bounds streamed and announced response bytes before they become usable audio or transcript data', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1)); },
    cancel() { cancelled = true; }
  });
  const provider = providerFixture(async () => new Response(stream, { headers:{ 'content-type':'audio/mpeg' } }));
  await assert.rejects(provider.speech({ text:QUESTION }), error => error.code === 'INTERVIEW_VOICE_PROVIDER_INVALID');
  assert.equal(cancelled, true, 'Oversized streaming audio is cancelled promptly');
  const announced = providerFixture(async () => new Response('{}', { headers:{ 'content-type':'application/json', 'content-length':'100001' } }));
  await assert.rejects(announced.transcribe({ audio:AUDIO, mimeType:'audio/webm' }), error => error.code === 'INTERVIEW_VOICE_PROVIDER_INVALID');
});

test('fixed question preparation works before a candidate joins without consent, control, transcript or recording changes', async () => {
  const env = fixture();
  env.mutate(db => { db.recruitingVideoInvites[0].status = 'active'; });
  const before = clone(env.db), result = ok(await env.prepare());
  assert.equal(result.mimeType, 'audio/mpeg'); assert.equal(result.voiceName, 'onyx');
  assert.match(result.audioKey, /^[a-f0-9]{64}:[a-f0-9]{64}$/);
  assert.ok(result.audioBase64);
  assert.equal(env.calls.speech.length, 1);
  assert.equal(env.calls.speech[0].text, FIXED_QUESTION.en, 'Only the server-owned English question is synthesized');
  assert.equal(env.calls.transcribe.length + env.calls.translate.length, 0);
  assert.deepEqual(env.db, before, 'Warming public question audio cannot grant consent, claim control or save candidate evidence');
  const again = ok(await env.prepare());
  assert.equal(again.audioKey, result.audioKey); assert.equal(again.audioBase64, result.audioBase64);
  assert.equal(env.calls.speech.length, 1, 'Warm audio is reused without another provider request');
});

test('preparation rejects arbitrary material, unknown questions, public sessions and unauthorized actors', async () => {
  const env = fixture();
  for (const body of [{ text:'Private candidate material must not be cached.' }, { questionId:'not-a-question' }, { kitId:'not-a-kit' }, { participantSessionId:SESSION_A }, { questionId:'', kitId:'' }]) {
    error(await env.prepare(body), 400);
  }
  for (const actor of [VIEWER, { id:'edit-only', permissions:['recruitingEdit'] }, null]) error(await env.prepare({}, actor), 403);
  error(await env.public('speech-prepare', { kitId:FIXED_KIT.id, questionId:FIXED_QUESTION.id }), 404);
  assert.equal(env.calls.speech.length, 0); assert.equal(env.writes.length, 0);
});

test('simultaneous canonical preparations share provider work and provider failure remains retryable', async () => {
  const pending = deferred(), started = deferred(); let attempt = 0;
  const env = fixture({ speech:async () => { attempt++; started.resolve(); return pending.promise; } });
  const first = env.prepare(); await providerStarted(first, started); const second = env.prepare();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(env.calls.speech.length, 1);
  pending.resolve({ audioBase64:Buffer.from('COALESCED_ONYX_QUESTION').toString('base64'), mimeType:'audio/mpeg' });
  const [left, right] = await Promise.all([first, second]);
  assert.equal(ok(left).audioKey, ok(right).audioKey); assert.equal(attempt, 1);
  let fail = true;
  const failing = fixture({ speech:async () => { if (fail) throw new Error('Synthetic private upstream detail'); return { audioBase64:Buffer.from('RETRY_QUESTION').toString('base64'), mimeType:'audio/mpeg' }; } });
  const failed = await failing.prepare(); assert.ok(failed.status >= 400);
  assert.equal(failed.body.audioBase64, undefined); assert.doesNotMatch(JSON.stringify(failed.body), /private upstream detail/);
  fail = false; ok(await failing.prepare()); assert.equal(failing.calls.speech.length, 2);
});

test('prepared playback requires fresh consent and control and returns a fresh turn without resynthesizing or transferring bytes', async () => {
  const env = fixture(), warm = ok(await env.prepare());
  const body = { text:FIXED_QUESTION.en, kitId:FIXED_KIT.id, questionId:FIXED_QUESTION.id, preparedAudioKey:warm.audioKey };
  error(await env.speech(body), 409, 'INTERVIEW_VOICE_CONTROLLER_REQUIRED');
  ok(await env.voice('claim'));
  error(await env.speech(body), 409, 'INTERVIEW_VOICE_CONSENT_REQUIRED');
  ok(await env.consent());
  const ready = ok(await env.speech(body));
  assert.equal(ready.audioPrepared, true); assert.equal(ready.audioKey, warm.audioKey);
  assert.equal(ready.audioBase64, undefined); assert.equal(ready.voice.currentTurn.phase, 'ready');
  assert.equal(env.calls.speech.length, 1);
  assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript.length, 0, 'A prepared turn is not yet spoken evidence');
  const second = ok(await env.speech({ ...body, requestId:'synthetic-prepared-next-request' }));
  assert.notEqual(second.voice.currentTurn.id, ready.voice.currentTurn.id); assert.equal(second.audioBase64, undefined);
  ok(await env.consent(false));
  error(await env.speech({ ...body, requestId:'synthetic-prepared-revoked-request' }), 409, 'INTERVIEW_VOICE_CONSENT_REQUIRED');
  assert.equal(env.calls.transcribe.length, 0);
});

test('prepared keys cannot substitute another question or freeform text, and a stale valid key falls back to correct audio', async () => {
  const env = fixture(), warm = ok(await env.prepare()); ok(await env.consent()); ok(await env.voice('claim'));
  const secondQuestion = FIXED_KIT.questions[1];
  const different = ok(await env.speech({ requestId:'synthetic-different-fixed', text:secondQuestion.en, questionId:secondQuestion.id, kitId:FIXED_KIT.id, preparedAudioKey:warm.audioKey }));
  assert.notEqual(different.audioPrepared, true); assert.ok(different.audioBase64);
  assert.notEqual(different.audioKey, warm.audioKey);
  assert.equal(different.voice.currentTurn.questionText, secondQuestion.en);
  const mismatch = await env.speech({ requestId:'synthetic-mismatch-fixed', text:'This is private and not the canonical question.', questionId:FIXED_QUESTION.id, kitId:FIXED_KIT.id, preparedAudioKey:warm.audioKey });
  assert.ok(mismatch.status >= 400, 'A canonical question ID cannot launder arbitrary content into the generic cache');
  for (const preparedAudioKey of ['', 'incorrect-cache-key', 'a'.repeat(128), `${'a'.repeat(64)}:${'g'.repeat(64)}`]) {
    error(await env.speech({ requestId:`synthetic-invalid-key-${preparedAudioKey.length}`, text:FIXED_QUESTION.en, questionId:FIXED_QUESTION.id, kitId:FIXED_KIT.id, preparedAudioKey }), 400);
  }
  const stale = ok(await env.speech({ requestId:'synthetic-stale-cache-key', text:FIXED_QUESTION.en, questionId:FIXED_QUESTION.id, kitId:FIXED_KIT.id, preparedAudioKey:`${'0'.repeat(64)}:${'1'.repeat(64)}` }));
  assert.notEqual(stale.audioPrepared, true); assert.equal(stale.audioKey, warm.audioKey); assert.equal(stale.audioBase64, warm.audioBase64);
  assert.ok(!JSON.stringify(env.writes).includes(warm.audioBase64), 'Generic audio is not stored alongside candidate DB records');
});

test('cached preparation cannot bypass disabled configuration or stale permission and invite checks', async () => {
  let configured = true;
  const env = fixture({ configured:() => configured }); ok(await env.prepare());
  configured = false; error(await env.prepare(), 503); assert.equal(env.calls.speech.length, 1);
  const configGate = deferred(), configStarted = deferred(); let pendingConfigured = true;
  const configurationChanged = fixture({ configured:() => pendingConfigured, speech:async () => { configStarted.resolve(); return configGate.promise; } });
  const configWork = configurationChanged.prepare(); await providerStarted(configWork, configStarted); pendingConfigured = false;
  configGate.resolve({ audioBase64:Buffer.from('LATE_DISABLED_CONFIG_AUDIO').toString('base64'), mimeType:'audio/mpeg' });
  const configResult = await configWork; error(configResult, 503); assert.equal(configResult.body.audioBase64, undefined);
  for (const change of [
    env => env.mutate(db => { db.users = [{ ...EDITOR, permissions:[] }]; }),
    env => env.mutate(db => { db.recruitingVideoInvites[0].status = 'revoked'; }),
    env => env.mutate(db => { db.recruitingInterviews[0].status = 'completed'; })
  ]) {
    const pending = deferred(), started = deferred();
    const pendingEnv = fixture({ speech:async () => { started.resolve(); return pending.promise; } });
    const work = pendingEnv.prepare(); await providerStarted(work, started); change(pendingEnv);
    pending.resolve({ audioBase64:Buffer.from('LATE_FIXED_QUESTION').toString('base64'), mimeType:'audio/mpeg' });
    const response = await work; assert.ok(response.status >= 400); assert.equal(response.body.audioBase64, undefined);
    assert.equal(pendingEnv.writes.length, 0);
  }
});

test('speech cache bounds simultaneous generation, coalesces equal questions and evicts older entries', async () => {
  const { createRecruitingSpeechCache } = require('../lib/recruiting-speech-cache');
  let active = 0, peak = 0;
  const calls = [], gates = new Map();
  const cache = createRecruitingSpeechCache({ maxEntries:2, concurrency:2, generate:async ({ text }) => {
    calls.push(text); active++; peak = Math.max(peak, active);
    const gate = deferred(); gates.set(text, gate); await gate.promise; active--;
    return { audioBase64:Buffer.from(`SYNTHETIC_FIXED_AUDIO:${text}`).toString('base64'), mimeType:'audio/mpeg' };
  } });
  const a = cache.prepare('Question A?'), aDuplicate = cache.prepare('Question A?'), b = cache.prepare('Question B?'), c = cache.prepare('Question C?');
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(calls.length, 2); assert.equal(peak, 2); assert.equal(calls.filter(text => text === 'Question A?').length, 1);
  gates.get('Question A?').resolve(); const [left, right] = await Promise.all([a, aDuplicate]); assert.equal(left.audioKey, right.audioKey);
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(calls.length, 3); assert.equal(peak, 2);
  gates.get('Question B?').resolve(); await b; gates.get('Question C?').resolve(); await c;
  const again = cache.prepare('Question A?');
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(calls.filter(text => text === 'Question A?').length, 2, 'Oldest item is regenerated once the entry bound evicts it');
  gates.get('Question A?').resolve(); await again;
});

test('speech cache enforces a finite queue and generation budget rather than spawning unlimited provider work', async () => {
  const { createRecruitingSpeechCache } = require('../lib/recruiting-speech-cache');
  const gate = deferred(); let calls = 0;
  const cache = createRecruitingSpeechCache({ concurrency:1, maxQueue:1, maxGenerationsPerMinute:2, generate:async ({ text }) => {
    calls++; await gate.promise; return { audioBase64:Buffer.from(`SYNTHETIC:${text}`).toString('base64'), mimeType:'audio/mpeg' };
  } });
  const first = cache.prepare('Bounded question one?');
  for (let i = 0; i < 20; i++) await Promise.resolve();
  const second = cache.prepare('Bounded question two?');
  await assert.rejects(cache.prepare('Bounded question three?'), error => error.statusCode === 429);
  assert.equal(calls, 1); gate.resolve(); await Promise.all([first, second]);
  assert.equal(calls, 2);
  await assert.rejects(cache.prepare('A fourth unique question?'), error => error.statusCode === 429);
  assert.equal(calls, 2);
  await cache.prepare('Bounded question one?'); assert.equal(calls, 2, 'A warm read does not consume the generation budget');
});

test('queued speech preparations expire and do not synthesize later after the caller has timed out', async t => {
  t.mock.timers.enable({ apis:['setTimeout'] });
  const { createRecruitingSpeechCache } = require('../lib/recruiting-speech-cache');
  const gate = deferred(), calls = [];
  const cache = createRecruitingSpeechCache({ concurrency:1, maxQueue:2, maxQueueWaitMs:50, generate:async ({ text }) => {
    calls.push(text); await gate.promise; return { audioBase64:Buffer.from('BOUNDED_QUEUE_AUDIO').toString('base64'), mimeType:'audio/mpeg' };
  } });
  const first = cache.prepare('Already generating?');
  for (let i = 0; i < 20; i++) await Promise.resolve();
  const queued = cache.prepare('Should expire before generation?');
  const expectation = assert.rejects(queued, error => error.code === 'INTERVIEW_VOICE_PROVIDER_TIMEOUT' && error.statusCode === 504);
  for (let i = 0; i < 20; i++) await Promise.resolve();
  t.mock.timers.tick(51); await expectation; gate.resolve(); await first;
  assert.deepEqual(calls, ['Already generating?']);
});

test('durable generic question cache survives a new instance and rejects corrupt or mismatched files', async () => {
  const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
  const { createRecruitingSpeechCache, cacheKeyFor } = require('../lib/recruiting-speech-cache');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'quad-synthetic-speech-cache-'));
  let calls = 0;
  const generate = async ({ text }) => { calls++; return { audioBase64:Buffer.from(`SYNTHETIC_ONYX:${text}`).toString('base64'), mimeType:'audio/mpeg' }; };
  try {
    const first = await createRecruitingSpeechCache({ cacheDir:directory, generate }).prepare(FIXED_QUESTION.en);
    const second = await createRecruitingSpeechCache({ cacheDir:directory, generate }).prepare(FIXED_QUESTION.en);
    assert.deepEqual(second, first); assert.equal(calls, 1);
    const names = await fs.readdir(directory); assert.deepEqual(names, [`${cacheKeyFor(FIXED_QUESTION.en)}.json`]);
    const filename = path.join(directory, names[0]);
    const saved = JSON.parse(await fs.readFile(filename, 'utf8'));
    assert.ok(!Object.hasOwn(saved, 'text')); assert.ok(!Object.hasOwn(saved, 'apiKey'));
    assert.match(saved.audioKey, /^[a-f0-9]{64}:[a-f0-9]{64}$/);
    await fs.writeFile(filename, JSON.stringify({ ...saved, audioKey:`${'a'.repeat(64)}:${'b'.repeat(64)}` }));
    const replaced = await createRecruitingSpeechCache({ cacheDir:directory, generate }).prepare(FIXED_QUESTION.en);
    assert.equal(replaced.audioKey, first.audioKey); assert.equal(calls, 2, 'Invalid content checksum is never returned as cached audio');
    await fs.writeFile(filename, '{not-json');
    await createRecruitingSpeechCache({ cacheDir:directory, generate }).prepare(FIXED_QUESTION.en);
    assert.equal(calls, 3);
  } finally { await fs.rm(directory, { recursive:true, force:true }); }
});

test('explicit follow-ups preserve question association but never read or poison canonical audio caches', async () => {
  const env = fixture(), warm = ok(await env.prepare()); ok(await env.consent()); ok(await env.voice('claim'));
  const body = { requestId:'synthetic-linked-followup', text:'What evidence supports that result?', kitId:FIXED_KIT.id, questionId:FIXED_QUESTION.id, followup:true };
  const answer = ok(await env.speech(body));
  assert.ok(answer.audioBase64); assert.equal(answer.audioPrepared, undefined);
  assert.equal(answer.voice.currentTurn.questionText, body.text); assert.equal(answer.voice.currentTurn.questionId, FIXED_QUESTION.id);
  assert.equal(env.calls.speech.length, 2);
  error(await env.speech({ ...body, requestId:'synthetic-followup-key-forged', preparedAudioKey:warm.audioKey }), 400);
  error(await env.speech({ ...body, followup:false }), 400);
  const repeatedCanonical = ok(await env.speech({ ...body, requestId:'synthetic-canonical-as-followup', text:FIXED_QUESTION.en }));
  assert.ok(repeatedCanonical.audioBase64); assert.equal(repeatedCanonical.audioPrepared, undefined);
  assert.equal(env.calls.speech.length, 3, 'Even identical words marked as a follow-up do not read the fixed bank cache');
  const stillWarm = ok(await env.prepare()); assert.equal(stillWarm.audioKey, warm.audioKey); assert.equal(env.calls.speech.length, 3);
});
