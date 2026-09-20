'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRecruitingVideoService, digest, roomName, expiryFor } = require('../lib/recruiting-video');
const { createRecruitingInterviewAnalyzer, normalize } = require('../lib/recruiting-interview-ai');

function fixture(analyzeInterview, { canAccess = () => true, snapshotReads = false } = {}) {
  let db = {
    recruitingCandidates:[{ id:'candidate-1', name:'Synthetic Candidate', phone:'+15005550006', email:'candidate@example.invalid', position:'PPF Installer', location:'Los Angeles, CA', source:'Indeed', experience:'Three years installing PPF.', resumeText:'Synthetic resume body.', notes:'Verify installation portfolio.', resume:{ name:'synthetic-resume.pdf', size:1234, uploadedAt:'2026-09-18T00:00:00.000Z', file:'/private/path.pdf' } }],
    recruitingInterviews:[{ id:'interview-1', candidateId:'candidate-1', startsAt:new Date(Date.now() + 86400000).toISOString(), durationMinutes:45, interviewerName:'Fixture Owner' }],
    recruitingVideoInvites:[]
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  const service = createRecruitingVideoService({
    readDb:() => snapshotReads ? clone(db) : db,
    writeDb:value => { db = snapshotReads ? clone(value) : value; }, readBody:async req => req.body || {},
    send:(res, status, body) => { res.result = { status, body }; }, canAccess,
    publicBaseUrl:() => 'https://quad.example', notify:() => {}, analyzeInterview
  });
  const call = async (kind, pathname, method = 'POST', body = {}, actor = { id:'owner', name:'Fixture Owner' }) => {
    const req = { method, body }, res = {};
    await service[kind](req, res, new URL(`https://quad.example${pathname}`), actor);
    return res.result;
  };
  const grantVoiceConsent = () => {
    let invite = db.recruitingVideoInvites.find(row => ['active', 'joined'].includes(row.status));
    if (!invite) {
      invite = { id:'synthetic-consented-invite', interviewId:'interview-1', candidateId:'candidate-1', status:'joined', expiresAt:new Date(Date.now() + 86400000).toISOString(), roomName:roomName('interview-1') };
      db.recruitingVideoInvites.push(invite);
    }
    invite.voiceConsent = { consent:true, noticeVersion:'2026-09-19-voice-v1', updatedAt:new Date().toISOString() };
  };
  return { get db() { return db; }, call, grantVoiceConsent };
}

async function withConfiguredVideo(callback) {
  const names = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'];
  const previous = names.map(name => process.env[name]);
  process.env.LIVEKIT_URL = 'wss://livekit.example';
  process.env.LIVEKIT_API_KEY = 'fixture-key';
  process.env.LIVEKIT_API_SECRET = 'fixture-secret-fixture-secret-fixture-secret';
  try { return await callback(); }
  finally { names.forEach((name, index) => previous[index] === undefined ? delete process.env[name] : process.env[name] = previous[index]); }
}

function tokenClaims(result) {
  assert.equal(result.status, 200);
  return JSON.parse(Buffer.from(result.body.token.split('.')[1], 'base64url').toString('utf8'));
}

const videoPath = action => `/api/recruiting/interviews/interview-1/video-${action}`;
const hasFixturePermission = (actor, permission) => Boolean(actor?.permissions?.includes(permission));
const editor = { id:'synthetic-editor-a', name:'Synthetic Interviewer A', permissions:['recruitingView', 'recruitingEdit'] };
const otherEditor = { id:'synthetic-editor-b', name:'Synthetic Interviewer B', permissions:['recruitingView', 'recruitingEdit'] };
const viewer = { id:'synthetic-viewer', name:'Synthetic Observer', permissions:['recruitingView'] };
const participantSessionA = 'synthetic-session-a-0001';
const participantSessionB = 'synthetic-session-b-0002';

test('multiple interviewers and same-account sessions get distinct identities without replacing the shared room or invite', async () => {
  await withConfiguredVideo(async () => {
    const env = fixture(undefined, { canAccess:hasFixturePermission });
    const invite = await env.call('handleAdmin', videoPath('invite'), 'POST', {}, editor);
    assert.equal(invite.status, 201);
    const originalInvite = JSON.stringify(env.db.recruitingVideoInvites);
    const token = (actor, participantSessionId) => env.call('handleAdmin', videoPath('token'), 'POST', participantSessionId ? { participantSessionId } : {}, actor);
    const first = await token(editor, participantSessionA);
    const reconnect = await token(editor, participantSessionA);
    const anotherDevice = await token(editor, participantSessionB);
    const anotherPerson = await token(otherEditor, participantSessionA);
    const legacyFirst = await token(editor), legacySecond = await token(editor);
    const results = [first, reconnect, anotherDevice, anotherPerson, legacyFirst, legacySecond];
    const claims = results.map(tokenClaims);
    assert.equal(claims[0].sub, claims[1].sub, 'Reconnecting the same per-tab session keeps its identity');
    assert.equal(new Set([claims[0].sub, ...claims.slice(2).map(row => row.sub)]).size, 5, 'Different actors, devices and legacy joins cannot share an identity');
    for (const [index, claim] of claims.entries()) {
      assert.equal(claim.sub, results[index].body.participantIdentity);
      assert.equal(claim.video.room, roomName('interview-1'));
      assert.equal(claim.video.roomJoin, true);
      assert.equal(claim.video.canPublish, true);
      assert.equal(claim.video.canSubscribe, true);
      const metadata = JSON.parse(claim.metadata);
      assert.equal(metadata.role, 'interviewer');
      assert.equal(metadata.interviewId, 'interview-1');
      assert.equal(metadata.canWriteTranscript, true);
      assert.equal(Object.hasOwn(metadata, 'speakerUserId'), false);
      assert.equal(results[index].body.canManageRoom, true);
      assert.equal(results[index].body.canWriteTranscript, true);
    }
    assert.equal(JSON.stringify(env.db.recruitingVideoInvites), originalInvite, 'Joining more interviewers must not regenerate or revoke the candidate invitation');
  });
});

test('recruiting video permissions allow view-only joining but forbid mutation and no-view access', async () => {
  await withConfiguredVideo(async () => {
    const env = fixture(async () => ({ summary:'Synthetic analysis' }), { canAccess:hasFixturePermission });
    await env.call('handleAdmin', videoPath('invite'), 'POST', {}, editor);
    const readOnly = await env.call('handleAdmin', videoPath('token'), 'POST', { participantSessionId:participantSessionA }, viewer);
    const claims = tokenClaims(readOnly), metadata = JSON.parse(claims.metadata);
    assert.equal(readOnly.body.canManageRoom, false);
    assert.equal(readOnly.body.canWriteTranscript, false);
    assert.equal(metadata.role, 'interviewer');
    assert.equal(metadata.canWriteTranscript, false);
    const original = JSON.stringify(env.db);
    const withoutView = [
      { id:'no-access', name:'No access', permissions:[] },
      { id:'edit-only', name:'No view', permissions:['recruitingEdit'] }
    ];
    for (const actor of [viewer, ...withoutView]) {
      const actions = actor === viewer ? ['invite','transcript','analyze','end'] : ['token','invite','transcript','analyze','end'];
      for (const action of actions) {
        const response = await env.call('handleAdmin', videoPath(action), 'POST', { text:'Should not be saved', consent:true }, actor);
        assert.equal(response.status, 403, `${actor.id}/${action}`);
        assert.equal(response.body.code, 'RECRUITING_FORBIDDEN');
      }
    }
    assert.equal(JSON.stringify(env.db), original, 'Denied access must not mutate evidence or end a shared room');
  });
});

test('invalid interviewer sessions are rejected instead of issuing ambiguous participant identities', async () => {
  await withConfiguredVideo(async () => {
    const env = fixture();
    await env.call('handleAdmin', videoPath('invite'));
    for (const participantSessionId of ['short', 'session with spaces 0001', '../synthetic-session', 'x'.repeat(101)]) {
      const response = await env.call('handleAdmin', videoPath('token'), 'POST', { participantSessionId });
      assert.equal(response.status, 400);
      assert.equal(response.body.code, 'INTERVIEW_PARTICIPANT_SESSION_INVALID');
    }
  });
});

test('transcript attribution is server-owned and cross-participant duplicate IDs fail explicitly', async () => {
  const env = fixture(undefined, { canAccess:hasFixturePermission });
  env.grantVoiceConsent();
  const body = {
    id:'shared-line-id', participantSessionId:participantSessionA, text:'Original interviewer question.', language:'en',
    speaker:'candidate', speakerName:'Forged person', speakerUserId:'forged-user', participantIdentity:'candidate-forged', createdAt:'1900-01-01'
  };
  const first = await env.call('handleAdmin', videoPath('transcript'), 'POST', body, editor);
  assert.equal(first.status, 201);
  assert.equal(first.body.row.speaker, 'interviewer');
  assert.equal(first.body.row.speakerName, editor.name);
  assert.equal(first.body.row.participantIdentity, `recruiter-${digest(editor.id).slice(0, 16)}-${participantSessionA}`);
  assert.equal(Object.hasOwn(first.body.row, 'speakerUserId'), false, 'The broadcastable row omits the internal user ID');
  assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript[0].speakerUserId, editor.id);
  assert.notEqual(first.body.row.createdAt, body.createdAt);
  const replay = await env.call('handleAdmin', videoPath('transcript'), 'POST', { ...body, text:'Do not overwrite original evidence.' }, editor);
  assert.equal(replay.status, 201);
  assert.equal(replay.body.row.text, 'Original interviewer question.');
  assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript.length, 1);
  for (const [actor, participantSessionId] of [[otherEditor, participantSessionA], [editor, participantSessionB]]) {
    const conflict = await env.call('handleAdmin', videoPath('transcript'), 'POST', { ...body, participantSessionId }, actor);
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.code, 'INTERVIEW_TRANSCRIPT_CONFLICT');
  }
  const second = await env.call('handleAdmin', videoPath('transcript'), 'POST', { id:'different-line-id', participantSessionId:participantSessionA, text:'Second interviewer question.' }, otherEditor);
  assert.equal(second.status, 201);
  assert.equal(env.db.recruitingInterviews[0].aiInterview.transcript.length, 2);
  const legacy = await env.call('handleAdmin', videoPath('transcript'), 'POST', { id:'legacy-line', text:'Older client without a session.' }, editor);
  assert.equal(legacy.status, 201, 'Existing clients without participantSessionId retain transcript access');
});

test('candidate public responses never expose internal interviewer user IDs, private profile or AI analysis', async () => {
  await withConfiguredVideo(async () => {
    const env = fixture(undefined, { canAccess:hasFixturePermission });
    env.grantVoiceConsent();
    await env.call('handleAdmin', videoPath('transcript'), 'POST', { id:'private-staff-line', participantSessionId:participantSessionA, text:'Describe your work experience.' }, editor);
    env.db.recruitingInterviews[0].aiInterview.analysis = { summary:'Private evidence score draft', generatedByUserId:editor.id };
    const created = await env.call('handleAdmin', videoPath('invite'), 'POST', {}, editor);
    const raw = new URL(created.body.joinUrl).searchParams.get('invite');
    const details = await env.call('handlePublic', `/api/public/recruiting-video/invite/${raw}`, 'GET');
    const exchange = await env.call('handlePublic', `/api/public/recruiting-video/invite/${raw}/exchange`, 'POST', { consent:true });
    assert.equal(exchange.status, 200);
    const voiceConsent = await env.call('handlePublic', '/api/public/recruiting-video/voice-consent', 'POST', { interviewId:'interview-1', sessionSecret:exchange.body.sessionSecret, consent:true, noticeVersion:'2026-09-19-voice-v1' });
    assert.equal(voiceConsent.status, 200);
    const rejoin = await env.call('handlePublic', '/api/public/recruiting-video/session', 'POST', { interviewId:'interview-1', sessionSecret:exchange.body.sessionSecret });
    for (const result of [details, exchange, rejoin]) {
      assert.equal(result.status, 200);
      const serialized = JSON.stringify(result.body);
      assert.doesNotMatch(serialized, /speakerUserId|generatedByUserId|synthetic-editor-a|candidateProfile|resumeText|private\/path|Private evidence score draft/);
      assert.equal(Object.hasOwn(result.body.aiState || {}, 'analysis'), false);
    }
    const candidateClaims = tokenClaims(exchange);
    assert.equal(JSON.parse(candidateClaims.metadata).role, 'candidate');
    const candidateBody = { interviewId:'interview-1', sessionSecret:exchange.body.sessionSecret, id:'candidate-owned-line', text:'I have installation experience.', speaker:'interviewer', speakerUserId:editor.id, speakerName:editor.name, participantIdentity:'forged-staff-identity' };
    const transcript = await env.call('handlePublic', '/api/public/recruiting-video/transcript', 'POST', candidateBody);
    assert.equal(transcript.status, 201);
    assert.equal(transcript.body.row.speaker, 'candidate');
    assert.equal(transcript.body.row.speakerName, 'Synthetic Candidate');
    assert.equal(transcript.body.row.participantIdentity, candidateClaims.sub);
    assert.equal(Object.hasOwn(transcript.body.row, 'speakerUserId'), false);
    const conflict = await env.call('handlePublic', '/api/public/recruiting-video/transcript', 'POST', { ...candidateBody, id:'private-staff-line' });
    assert.equal(conflict.status, 409, 'A candidate cannot silently overwrite or claim an interviewer transcript ID');
  });
});

test('candidate joins with an explicit versioned AI choice, while legacy and video-only joins never silently grant it', async () => {
  await withConfiguredVideo(async () => {
    for (const [extra, expected] of [
      [{ voiceConsent:true, voiceNoticeVersion:'2026-09-19-voice-v1' }, true],
      [{ voiceConsent:false, voiceNoticeVersion:'2026-09-19-voice-v1' }, false],
      [{}, false]
    ]) {
      const env = fixture(undefined, { snapshotReads:true });
      const created = await env.call('handleAdmin', videoPath('invite'));
      const raw = new URL(created.body.joinUrl).searchParams.get('invite');
      const response = await env.call('handlePublic', `/api/public/recruiting-video/invite/${raw}/exchange`, 'POST', { consent:true, ...extra });
      assert.equal(response.status, 200, JSON.stringify(response.body));
      const invitation = env.db.recruitingVideoInvites[0];
      assert.equal(invitation.status, 'joined');
      assert.equal(invitation.voiceConsent?.consent === true, expected);
      if (expected) {
        assert.equal(invitation.voiceConsent.noticeVersion, '2026-09-19-voice-v1');
        assert.ok(Date.parse(invitation.voiceConsent.updatedAt));
      }
      assert.equal(env.db.recruitingInterviews[0].aiInterview?.voice?.recording === true, false);
      assert.equal((env.db.recruitingInterviews[0].aiInterview?.transcript || []).length, 0);
      const state = await env.call('handlePublic', '/api/public/recruiting-video/voice-state', 'POST', { interviewId:'interview-1', sessionSecret:response.body.sessionSecret });
      assert.equal(state.status, 200); assert.equal(state.body.voice.consent, expected);
    }
  });
});

test('outdated or malformed AI consent at join fails without consuming the invitation', async () => {
  await withConfiguredVideo(async () => {
    for (const body of [
      { voiceConsent:true },
      { voiceConsent:true, voiceNoticeVersion:'outdated-notice' },
      { voiceConsent:'true', voiceNoticeVersion:'2026-09-19-voice-v1' }
    ]) {
      const env = fixture(undefined, { snapshotReads:true });
      const created = await env.call('handleAdmin', videoPath('invite'));
      const raw = new URL(created.body.joinUrl).searchParams.get('invite');
      const before = JSON.stringify(env.db);
      const response = await env.call('handlePublic', `/api/public/recruiting-video/invite/${raw}/exchange`, 'POST', { consent:true, ...body });
      assert.equal(response.status, 400, JSON.stringify(response.body));
      assert.equal(JSON.stringify(env.db), before, 'Invalid disclosure cannot consume a one-time link or fabricate consent');
    }
  });
});

test('reconnect never regrants withdrawn AI consent, even if an old page posts affirmative join fields', async () => {
  await withConfiguredVideo(async () => {
    const env = fixture(undefined, { snapshotReads:true });
    const created = await env.call('handleAdmin', videoPath('invite'));
    const raw = new URL(created.body.joinUrl).searchParams.get('invite');
    const joined = await env.call('handlePublic', `/api/public/recruiting-video/invite/${raw}/exchange`, 'POST', { consent:true, voiceConsent:true, voiceNoticeVersion:'2026-09-19-voice-v1' });
    assert.equal(joined.status, 200);
    const body = { interviewId:'interview-1', sessionSecret:joined.body.sessionSecret };
    const revoked = await env.call('handlePublic', '/api/public/recruiting-video/voice-consent', 'POST', { ...body, consent:false, noticeVersion:'2026-09-19-voice-v1' });
    assert.equal(revoked.status, 200);
    const rejoin = await env.call('handlePublic', '/api/public/recruiting-video/session', 'POST', { ...body, consent:true, voiceConsent:true, voiceNoticeVersion:'2026-09-19-voice-v1' });
    assert.ok([200, 400].includes(rejoin.status));
    assert.equal(env.db.recruitingVideoInvites[0].voiceConsent.consent, false);
    const state = await env.call('handlePublic', '/api/public/recruiting-video/voice-state', 'POST', body);
    assert.equal(state.status, 200); assert.equal(state.body.voice.consent, false); assert.equal(state.body.voice.recording, false);
  });
});

test('awaiting AI analysis preserves transcript evidence written by another interviewer meanwhile', async () => {
  let finishAnalysis, started;
  const analysisStarted = new Promise(resolve => { started = resolve; });
  const analyze = async ({ transcript }) => {
    assert.equal(transcript.length, 1);
    started();
    return new Promise(resolve => { finishAnalysis = resolve; });
  };
  const env = fixture(analyze, { canAccess:hasFixturePermission, snapshotReads:true });
  env.grantVoiceConsent();
  await env.call('handleAdmin', videoPath('transcript'), 'POST', { id:'before-analysis', participantSessionId:participantSessionA, text:'First preserved evidence.' }, editor);
  const pending = env.call('handleAdmin', videoPath('analyze'), 'POST', { mode:'next' }, editor);
  await analysisStarted;
  const concurrent = await env.call('handleAdmin', videoPath('transcript'), 'POST', { id:'during-analysis', participantSessionId:participantSessionB, text:'Concurrent preserved evidence.' }, otherEditor);
  assert.equal(concurrent.status, 201);
  finishAnalysis({ summary:'Synthetic bounded analysis', scores:{} });
  const analyzed = await pending;
  assert.equal(analyzed.status, 200);
  const state = env.db.recruitingInterviews[0].aiInterview;
  assert.deepEqual(state.transcript.map(row => row.id), ['before-analysis','during-analysis']);
  assert.equal(state.analysis.summary, 'Synthetic bounded analysis');
  assert.equal(state.analysis.generatedByUserId, editor.id);
  assert.equal(analyzed.body.aiState.transcript.length, 2, 'Response returns the fresh saved evidence, not a stale pre-analysis snapshot');
});

test('helpers create isolated room names and bounded expiry', () => {
  assert.equal(roomName('safe-id/../../bad'), 'quad-interview-safe-idbad');
  const expiry = Date.parse(expiryFor({ startsAt:new Date(Date.now() + 365 * 86400000).toISOString(), durationMinutes:30 }));
  assert.ok(expiry <= Date.now() + 30 * 86400000 + 1000);
  assert.equal(digest('same'), digest('same'));
});

test('candidate page defaults to English and exposes all four requested languages and AI controls', () => {
  const html = fs.readFileSync(require.resolve('../public/recruiting-interview.html'), 'utf8');
  const script = fs.readFileSync(require.resolve('../public/recruiting-interview.js'), 'utf8');
  const css = fs.readFileSync(require.resolve('../public/recruiting-interview.css'), 'utf8');
  assert.match(html, /<html lang="en">/);
  for (const option of ['English', 'Español', 'Português', '中文']) assert.match(html, new RegExp(`>${option}<`));
  for (const locale of ["en:{", "es:{", "pt:{", "zh:{"]) assert.match(script, new RegExp(locale.replace('{', '\\{')));
  assert.match(html, /id="transcriptToggle"/); assert.match(html, /id="aiNext"/); assert.match(html, /id="aiFinal"/);
  assert.match(html, /id="aiBoundaryNotice"/); assert.match(html, /id="candidateResumePanel"/);
  assert.match(html, /id="backToRecruiting"[^>]*hidden/);
  assert.match(script, /function renderCandidateResume\(\)/);
  assert.match(script, /\$\('aiBoundaryNotice'\)\.hidden = recruiter/);
  assert.match(script, /function leaveInterview\(\)/);
  assert.match(script, /window\.location\.assign\('\/\?page=recruiting'\)/);
  assert.doesNotMatch(script, /\$\('leave'\).*location\.reload\(\)/);
  assert.match(script, /document\.body\.classList\.add\(recruiter \? 'recruiter-view' : 'candidate-view'\)/);
  assert.match(script, /\$\('backToRecruiting'\)\.hidden = !recruiter/);
  assert.match(script, /\$\('backToRecruiting'\)\.addEventListener\('click', \(\) => window\.location\.assign\('\/\?page=recruiting'\)\)/);
  assert.match(css, /\.candidate-view #aiBoundaryNotice,[\s\S]*?\.candidate-view \.transcript-panel\s*\{[^}]*display:\s*none\s*!important/);
});

test('question-first room uses independent participant tiles and per-tile video orientation', () => {
  const html = fs.readFileSync(require.resolve('../public/recruiting-interview.html'), 'utf8');
  const script = fs.readFileSync(require.resolve('../public/recruiting-interview.js'), 'utf8');
  const css = fs.readFileSync(require.resolve('../public/recruiting-interview.css'), 'utf8');
  assert.match(css, /\.interview-shell\s*\{[^}]*width:\s*100%/);
  assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/);
  assert.match(css, /\.room\s*\{[^}]*grid-template-columns:\s*clamp\(340px, 38vw, 680px\) minmax\(0, 1fr\)/);
  assert.match(css, /\.participant-grid\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.remote-stage\s*\{[^}]*display:\s*contents/);
  assert.match(css, /\.participant-tile\s*\{[^}]*aspect-ratio:\s*4\/3/);
  assert.match(css, /\.participant-tile\.portrait-video\s*\{[^}]*aspect-ratio:\s*3\/4/);
  assert.match(css, /\.stage\s*\{[^}]*background:\s*transparent/);
  assert.match(css, /\.participant-media video\s*\{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*object-fit:\s*contain/);
  assert.match(css, /\.local-stage video\s*\{[^}]*object-fit:\s*cover/);
  assert.doesNotMatch(css, /\.participant-media video\s*\{[^}]*object-fit:\s*cover/);
  for (const id of ['questionBankPanel', 'questionKitSelect', 'questionBankList', 'participantGrid', 'localStage', 'remoteStage', 'audioStage', 'participantCount', 'waitingParticipants']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(script, /function renderQuestionBank\(\)/);
  assert.match(script, /displayValue\(value\)/);
  assert.match(script, /function updateVideoAspect\(element, container\)/);
  assert.match(script, /element\.videoHeight > element\.videoWidth \* 1\.08/);
  assert.match(script, /updateVideoAspect\(element, entry\.tile\)/);
  assert.match(script, /const participants = new Map\(\)/);
  assert.match(script, /participants\.set\(participant\.identity, entry\)/);
  assert.match(script, /if \(!local\) \$\('remoteStage'\)\.appendChild\(tile\)/);
  assert.doesNotMatch(script, /SpeechRecognition|startTranscript\(|saveTranscript\(/, 'Joining must not start browser-owned continuous transcription');
  assert.match(script, /await voiceUi\?\.connect\(\)/);
  assert.match(script, /\$\('transcriptToggle'\)\.hidden = true; \$\('transcriptToggle'\)\.disabled = true/);
});

test('room keeps ordinary leave separate from permission-gated end-for-everyone and signed-in sharing', () => {
  const html = fs.readFileSync(require.resolve('../public/recruiting-interview.html'), 'utf8');
  const script = fs.readFileSync(require.resolve('../public/recruiting-interview.js'), 'utf8');
  const leave = script.slice(script.indexOf('async function leaveInterview()'), script.indexOf('async function endInterviewForEveryone()'));
  const end = script.slice(script.indexOf('async function endInterviewForEveryone()'), script.indexOf('function showInterviewerLink()'));
  const share = script.slice(script.indexOf('function showInterviewerLink()'), script.indexOf('async function copyInterviewerLink()'));
  assert.match(leave, /await disconnectLocal\(\); showDisconnected\(\)/);
  assert.doesNotMatch(leave, /video-end|request\(|roomEnded = true|removeItem/);
  assert.match(end, /!connected \|\| !recruiter \|\| info\?\.canManageRoom !== true/);
  assert.match(end, /if \(!window\.confirm\(t\('endConfirm'\)\)\) return/);
  assert.match(end, /\/video-end/);
  assert.match(end, /roomEnded = true; await disconnectLocal\(\)/);
  assert.match(html, /id="endRoom"[^>]*hidden/);
  assert.match(script, /\$\('endRoom'\)\.hidden = !recruiter \|\| info\?\.canManageRoom !== true \|\| !connected/);
  assert.match(share, /url\.searchParams\.set\('interview', info\.interviewId\)/);
  assert.doesNotMatch(share, /searchParams\.set\(['"](?:invite|token|sessionSecret|auth)/);
  assert.match(script, /if \(recruiter && !authToken\) throw new Error\(t\('signInRequired'\)\)/);
  assert.match(script, /const participantSessionId = Array\.from\(crypto\.getRandomValues\(new Uint8Array\(16\)\)/);
  assert.doesNotMatch(script, /(?:localStorage|sessionStorage)\.setItem\([^\n]*participantSessionId/);
});

test('multiplayer transcript trusts only server evidence and analysis remains manual, guarded and answer-aware', () => {
  const script = fs.readFileSync(require.resolve('../public/recruiting-interview.js'), 'utf8');
  const receive = script.slice(script.indexOf('function receiveTranscript('), script.indexOf('function stopTranscript('));
  const analyze = script.slice(script.indexOf('async function analyze('), script.indexOf('function stopLocalTracks('));
  assert.match(receive, /voiceUi\?\.receiveSignal\(payload, participant\)/);
  assert.doesNotMatch(receive, /renderTranscripts|JSON\.parse|\.row|speakerUserId/, 'Room data cannot append or forge transcript evidence');
  assert.match(analyze, /if \(analysisBusy \|\| !connected \|\| !recruiter \|\| info\?\.canWriteTranscript !== true\) return/);
  assert.match(analyze, /await voiceUi\?\.beforeAnalyze\(mode\)/);
  assert.ok(analyze.indexOf('await voiceUi?.beforeAnalyze(mode)') < analyze.indexOf('await request('));
  assert.equal((analyze.match(/if \(!connected \|\| room !== activeRoom\) return/g) || []).length, 2, 'The same room is checked before and after analysis');
  assert.doesNotMatch(script, /isAutoAnalysisLeader|analyze\([^)]*,\s*true|startTranscript\(/);
  assert.match(script, /getSelectedQuestion:selectedQuestion/);
  assert.match(script, /text:question\.en, questionId:question\.id, kitId:kit\.id/, 'Spoken question source is English, independent of UI language');
});

test('disconnect and failed joins stop local media and detach every participant track', () => {
  const script = fs.readFileSync(require.resolve('../public/recruiting-interview.js'), 'utf8');
  const disconnect = script.slice(script.indexOf('async function disconnectLocal()'), script.indexOf('function showDisconnected()'));
  assert.match(disconnect, /const previous = room; room = null; connected = false/);
  assert.match(disconnect, /stopTranscript\(\); stopLocalTracks\(previous\); clearParticipants\(\)/);
  assert.match(disconnect, /previous\?\.disconnect\(true\)/);
  assert.match(script, /publication\.track\?\.stop\(\)/);
  assert.match(script, /track\.detach\(attached\.element\)/);
  assert.match(script, /attached\.element\.remove\(\); entry\.tracks\.delete\(track\)/);
  assert.match(script, /RoomEvent\.Disconnected, reason =>[\s\S]*?disconnectLocal\(\); showDisconnected\(\)/);
  assert.match(script, /if \(room === joiningRoom\) callback\(\.\.\.args\)/);
  assert.match(script, /stopLocalTracks\(joiningRoom\);\s*if \(!joiningRoom \|\| room === joiningRoom\) await disconnectLocal\(\)/);
  assert.match(script, /if \(room !== activeRoom\) \{ stopLocalTracks\(activeRoom\); return; \}/);
  assert.match(script, /window\.addEventListener\('pagehide', \(\) => \{ voiceUi\?\.dispose\(\); stopTranscript\(\); stopLocalTracks\(room\); room\?\.disconnect\(true\); \}\)/);
});

test('fresh candidate invitation replaces stale stored session while reconnect keeps the active session', async () => {
  const script = fs.readFileSync(require.resolve('../public/recruiting-interview.js'), 'utf8');
  const helper = script.slice(script.indexOf('async function tokenForJoin('), script.indexOf('async function join('));
  assert.match(helper, /^async function tokenForJoin\(voiceConsent\)/);
  function context(status, memorySecret = '', invite = 'synthetic-new-invite') {
    const calls = [], stored = new Map([['quadInterview.synthetic-interview', JSON.stringify({ sessionSecret:'synthetic-old-session' })]]);
    const value = vm.createContext({
      invite, info:{ interviewId:'synthetic-interview', status }, sessionSecret:memorySecret,
      window:{ QuadInterviewVoice:{ NOTICE_VERSION:'2026-09-19-voice-v1' } },
      localStorage:{ getItem:key => stored.get(key) || null, setItem:(key, text) => stored.set(key, text) },
      request:async (url, options) => {
        calls.push({ url, body:JSON.parse(options.body) });
        return { interviewId:'synthetic-interview', sessionSecret:'synthetic-new-session', expiresAt:'2099-01-01T00:00:00.000Z' };
      },
      recruiterAccess:async () => { calls.push({ url:'synthetic-recruiter-access' }); return { participantIdentity:'synthetic-recruiter' }; }
    });
    vm.runInContext(helper, value);
    return { value, calls, stored };
  }
  const fresh = context('active');
  await fresh.value.tokenForJoin(true);
  assert.equal(fresh.calls[0].url, '/api/public/recruiting-video/invite/synthetic-new-invite/exchange');
  assert.equal(fresh.calls[0].body.consent, true);
  assert.equal(fresh.calls[0].body.voiceConsent, true);
  assert.equal(fresh.calls[0].body.voiceNoticeVersion, '2026-09-19-voice-v1');
  assert.equal(JSON.parse(fresh.stored.get('quadInterview.synthetic-interview')).sessionSecret, 'synthetic-new-session');
  await fresh.value.tokenForJoin();
  assert.equal(fresh.calls[1].url, '/api/public/recruiting-video/session');
  assert.equal(fresh.calls[1].body.sessionSecret, 'synthetic-new-session', 'Same-page reconnect uses the newly exchanged session');
  assert.equal(Object.hasOwn(fresh.calls[1].body, 'voiceConsent'), false, 'Rejoining must not repost an affirmative consent choice');

  const videoOnly = context('active'); await videoOnly.value.tokenForJoin(false);
  assert.equal(videoOnly.calls[0].body.voiceConsent, false);
  const unspecified = context('active'); await unspecified.value.tokenForJoin();
  assert.equal(unspecified.calls[0].body.voiceConsent, false, 'Default/no explicit choice does not enable recording');

  const joined = context('joined');
  await joined.value.tokenForJoin();
  assert.equal(joined.calls[0].url, '/api/public/recruiting-video/session');
  assert.equal(joined.calls[0].body.sessionSecret, 'synthetic-old-session');
  assert.equal(joined.calls.length, 1, 'A joined one-time link is not exchanged twice');

  const inMemory = context('joined', 'synthetic-current-memory-session');
  await inMemory.value.tokenForJoin();
  assert.equal(inMemory.calls[0].body.sessionSecret, 'synthetic-current-memory-session');

  const staff = context('active', '', '');
  await staff.value.tokenForJoin();
  assert.equal(staff.calls[0].url, 'synthetic-recruiter-access');
  assert.equal(staff.calls.length, 1, 'Interviewer access never uses the public candidate exchange');
});

test('AI analysis normalization never fabricates unsupported scores', () => {
  const value = normalize({ scores:{ technicalSkill:8, salesAbility:0, communication:11 }, nextQuestions:['One'], evidence:['Observed example'] });
  assert.equal(value.scores.technicalSkill, 8); assert.equal(value.scores.salesAbility, null); assert.equal(value.scores.communication, null);
  assert.deepEqual(value.nextQuestions, ['One']);
});

test('AI analyzer sends only job evidence and enforces human decision boundaries', async () => {
  let captured;
  const analyze = createRecruitingInterviewAnalyzer({
    getConfig:() => ({ apiKey:'fixture-key', model:'gpt-5-mini', baseUrl:'https://api.openai.example/v1' }),
    requestJson:async (_url, options) => {
      captured = JSON.parse(options.body);
      return { choices:[{ message:{ content:JSON.stringify({ nextQuestions:['Describe the installation steps.'], scores:{ technicalSkill:6 }, summary:'Evidence-bound draft' }) } }] };
    }
  });
  const result = await analyze({
    candidate:{ name:'Private Name', phone:'+15005550006', email:'private@example.invalid', position:'PPF Installer', experience:'Three years installing PPF' },
    interview:{ notes:'Ask for a work sample' }, transcript:[{ speaker:'candidate', text:'I install full-front PPF.', createdAt:'2026-09-18T00:00:00.000Z' }], mode:'next'
  });
  const prompt = captured.messages[0].content;
  const evidence = captured.messages[1].content;
  assert.match(prompt, /Do not make a hire\/reject decision/);
  assert.match(prompt, /protected\/sensitive trait/);
  assert.doesNotMatch(evidence, /Private Name|15005550006|private@example/);
  assert.equal(result.scores.technicalSkill, 6);
  assert.equal(result.scores.salesAbility, null);
});

test('one-time candidate link exchanges once and reconnects only with the browser session secret', async () => {
  const previous = { url:process.env.LIVEKIT_URL, key:process.env.LIVEKIT_API_KEY, secret:process.env.LIVEKIT_API_SECRET };
  process.env.LIVEKIT_URL = 'wss://livekit.example'; process.env.LIVEKIT_API_KEY = 'fixture-key'; process.env.LIVEKIT_API_SECRET = 'fixture-secret-fixture-secret-fixture-secret';
  try {
    const { db, call } = fixture();
    const created = await call('handleAdmin', '/api/recruiting/interviews/interview-1/video-invite');
    assert.equal(created.status, 201);
    assert.match(created.body.joinUrl, /^https:\/\/quad\.example\/recruiting-interview\.html\?invite=/);
    assert.doesNotMatch(JSON.stringify(db.recruitingVideoInvites), /candidate@example\.invalid|\+15005550006/);
    const raw = new URL(created.body.joinUrl).searchParams.get('invite');
    assert.ok(raw.length >= 40);
    assert.notEqual(db.recruitingVideoInvites[0].tokenHash, raw);

    const recruiterToken = await call('handleAdmin', '/api/recruiting/interviews/interview-1/video-token');
    assert.equal(recruiterToken.status, 200);
    assert.equal(recruiterToken.body.candidatePosition, 'PPF Installer');
    assert.equal(recruiterToken.body.interviewKits.length, 8);
    assert.equal(recruiterToken.body.candidateProfile.resumeText, 'Synthetic resume body.');
    assert.equal(recruiterToken.body.candidateProfile.resume.name, 'synthetic-resume.pdf');
    assert.equal(Object.hasOwn(recruiterToken.body.candidateProfile.resume, 'file'), false);
    assert.equal(Object.hasOwn(recruiterToken.body, 'phone'), false); assert.equal(Object.hasOwn(recruiterToken.body, 'email'), false);

    const details = await call('handlePublic', `/api/public/recruiting-video/invite/${raw}`, 'GET');
    assert.equal(details.status, 200); assert.equal(details.body.candidateName, 'Synthetic Candidate');
    assert.equal(Object.hasOwn(details.body, 'candidateProfile'), false);
    assert.equal(Object.hasOwn(details.body, 'phone'), false); assert.equal(Object.hasOwn(details.body, 'email'), false);

    const noConsent = await call('handlePublic', `/api/public/recruiting-video/invite/${raw}/exchange`, 'POST', { consent:false });
    assert.equal(noConsent.status, 400);
    const joined = await call('handlePublic', `/api/public/recruiting-video/invite/${raw}/exchange`, 'POST', { consent:true });
    assert.equal(joined.status, 200); assert.ok(joined.body.token); assert.ok(joined.body.sessionSecret);
    assert.equal(Object.hasOwn(joined.body, 'candidateProfile'), false);
    assert.equal(db.recruitingVideoInvites[0].status, 'joined');

    const reused = await call('handlePublic', `/api/public/recruiting-video/invite/${raw}/exchange`, 'POST', { consent:true });
    assert.equal(reused.status, 409);
    const wrongSession = await call('handlePublic', '/api/public/recruiting-video/session', 'POST', { interviewId:'interview-1', sessionSecret:'wrong' });
    assert.equal(wrongSession.status, 401);
    const rejoined = await call('handlePublic', '/api/public/recruiting-video/session', 'POST', { interviewId:'interview-1', sessionSecret:joined.body.sessionSecret });
    assert.equal(rejoined.status, 200); assert.ok(rejoined.body.token);
    assert.equal(Object.hasOwn(rejoined.body, 'candidateProfile'), false);

    const transcriptBody = { interviewId:'interview-1', sessionSecret:joined.body.sessionSecret, id:'candidate-line-1', text:'I installed PPF for three years.', language:'en' };
    const unconsentedTranscript = await call('handlePublic', '/api/public/recruiting-video/transcript', 'POST', transcriptBody);
    assert.equal(unconsentedTranscript.status, 409, 'Joining video does not grant separate AI transcription consent');
    assert.equal(unconsentedTranscript.body.code, 'INTERVIEW_VOICE_CONSENT_REQUIRED');
    const voiceConsent = await call('handlePublic', '/api/public/recruiting-video/voice-consent', 'POST', { interviewId:'interview-1', sessionSecret:joined.body.sessionSecret, consent:true, noticeVersion:'2026-09-19-voice-v1' });
    assert.equal(voiceConsent.status, 200);
    const transcript = await call('handlePublic', '/api/public/recruiting-video/transcript', 'POST', transcriptBody);
    assert.equal(transcript.status, 201); assert.equal(db.recruitingInterviews[0].aiInterview.transcript[0].speaker, 'candidate');
    delete process.env.LIVEKIT_URL; delete process.env.LIVEKIT_API_KEY; delete process.env.LIVEKIT_API_SECRET;
    const ended = await call('handleAdmin', '/api/recruiting/interviews/interview-1/video-end');
    assert.equal(ended.status, 200); assert.equal(db.recruitingVideoInvites[0].status, 'ended');
  } finally {
    for (const [name, value] of [['LIVEKIT_URL', previous.url], ['LIVEKIT_API_KEY', previous.key], ['LIVEKIT_API_SECRET', previous.secret]]) value === undefined ? delete process.env[name] : process.env[name] = value;
  }
});

test('recruiter transcript and AI evidence draft are stored separately from original evidence', async () => {
  const analyzer = async ({ transcript, mode }) => ({ nextQuestions:['Give a specific example.'], evidence:[transcript[0].text], openQuestions:[], scores:{ technicalSkill:7 }, summary:'Draft summary', resumeDraft:'Unverified draft', limitations:[], provider:'openai', model:'fixture', generatedAt:new Date().toISOString(), mode });
  const { db, call, grantVoiceConsent } = fixture(analyzer);
  grantVoiceConsent();
  const line = await call('handleAdmin', '/api/recruiting/interviews/interview-1/video-transcript', 'POST', { id:'interviewer-line-1', text:'Tell me about your PPF experience.', language:'en' });
  assert.equal(line.status, 201); assert.equal(db.recruitingInterviews[0].aiInterview.transcript[0].speaker, 'interviewer');
  const analyzed = await call('handleAdmin', '/api/recruiting/interviews/interview-1/video-analyze', 'POST', { mode:'final' });
  assert.equal(analyzed.status, 200); assert.equal(analyzed.body.aiState.analysis.summary, 'Draft summary');
  assert.equal(db.recruitingInterviews[0].aiInterview.transcript[0].text, 'Tell me about your PPF experience.');
});
