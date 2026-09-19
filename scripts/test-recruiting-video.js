'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRecruitingVideoService, digest, roomName, expiryFor } = require('../lib/recruiting-video');
const { createRecruitingInterviewAnalyzer, normalize } = require('../lib/recruiting-interview-ai');

function fixture(analyzeInterview) {
  const db = {
    recruitingCandidates:[{ id:'candidate-1', name:'Synthetic Candidate', phone:'+15005550006', email:'candidate@example.invalid' }],
    recruitingInterviews:[{ id:'interview-1', candidateId:'candidate-1', startsAt:new Date(Date.now() + 86400000).toISOString(), durationMinutes:45, interviewerName:'Fixture Owner' }],
    recruitingVideoInvites:[]
  };
  let sent = null;
  const service = createRecruitingVideoService({
    readDb:() => db, writeDb:() => {}, readBody:async req => req.body || {},
    send:(_res, status, body) => { sent = { status, body }; }, canAccess:() => true,
    publicBaseUrl:() => 'https://quad.example', notify:() => {}, analyzeInterview
  });
  const call = async (kind, pathname, method = 'POST', body = {}, actor = { id:'owner', name:'Fixture Owner' }) => {
    sent = null; const req = { method, body };
    await service[kind](req, {}, new URL(`https://quad.example${pathname}`), actor);
    return sent;
  };
  return { db, call };
}

test('helpers create isolated room names and bounded expiry', () => {
  assert.equal(roomName('safe-id/../../bad'), 'quad-interview-safe-idbad');
  const expiry = Date.parse(expiryFor({ startsAt:new Date(Date.now() + 365 * 86400000).toISOString(), durationMinutes:30 }));
  assert.ok(expiry <= Date.now() + 30 * 86400000 + 1000);
  assert.equal(digest('same'), digest('same'));
});

test('candidate page defaults to English and exposes all four requested languages and AI controls', () => {
  const html = fs.readFileSync(require.resolve('../public/recruiting-interview.html'), 'utf8');
  const script = fs.readFileSync(require.resolve('../public/recruiting-interview.js'), 'utf8');
  assert.match(html, /<html lang="en">/);
  for (const option of ['English', 'Español', 'Português', '中文']) assert.match(html, new RegExp(`>${option}<`));
  for (const locale of ["en:{", "es:{", "pt:{", "zh:{"]) assert.match(script, new RegExp(locale.replace('{', '\\{')));
  assert.match(html, /id="transcriptToggle"/); assert.match(html, /id="aiNext"/); assert.match(html, /id="aiFinal"/);
});

test('remote video shows the complete camera frame while the local preview may stay cropped', () => {
  const css = fs.readFileSync(require.resolve('../public/recruiting-interview.css'), 'utf8');
  assert.match(css, /\.remote-stage video\s*\{[^}]*width:\s*68%[^}]*height:\s*68%[^}]*object-fit:\s*contain/);
  assert.match(css, /\.local-stage video\s*\{[^}]*object-fit:\s*cover/);
  assert.doesNotMatch(css, /\.remote-stage video\s*\{[^}]*object-fit:\s*cover/);
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

    const details = await call('handlePublic', `/api/public/recruiting-video/invite/${raw}`, 'GET');
    assert.equal(details.status, 200); assert.equal(details.body.candidateName, 'Synthetic Candidate');
    assert.equal(Object.hasOwn(details.body, 'phone'), false); assert.equal(Object.hasOwn(details.body, 'email'), false);

    const noConsent = await call('handlePublic', `/api/public/recruiting-video/invite/${raw}/exchange`, 'POST', { consent:false });
    assert.equal(noConsent.status, 400);
    const joined = await call('handlePublic', `/api/public/recruiting-video/invite/${raw}/exchange`, 'POST', { consent:true });
    assert.equal(joined.status, 200); assert.ok(joined.body.token); assert.ok(joined.body.sessionSecret);
    assert.equal(db.recruitingVideoInvites[0].status, 'joined');

    const reused = await call('handlePublic', `/api/public/recruiting-video/invite/${raw}/exchange`, 'POST', { consent:true });
    assert.equal(reused.status, 409);
    const wrongSession = await call('handlePublic', '/api/public/recruiting-video/session', 'POST', { interviewId:'interview-1', sessionSecret:'wrong' });
    assert.equal(wrongSession.status, 401);
    const rejoined = await call('handlePublic', '/api/public/recruiting-video/session', 'POST', { interviewId:'interview-1', sessionSecret:joined.body.sessionSecret });
    assert.equal(rejoined.status, 200); assert.ok(rejoined.body.token);

    const transcript = await call('handlePublic', '/api/public/recruiting-video/transcript', 'POST', { interviewId:'interview-1', sessionSecret:joined.body.sessionSecret, id:'candidate-line-1', text:'I installed PPF for three years.', language:'en' });
    assert.equal(transcript.status, 201); assert.equal(db.recruitingInterviews[0].aiInterview.transcript[0].speaker, 'candidate');
  } finally {
    for (const [name, value] of [['LIVEKIT_URL', previous.url], ['LIVEKIT_API_KEY', previous.key], ['LIVEKIT_API_SECRET', previous.secret]]) value === undefined ? delete process.env[name] : process.env[name] = value;
  }
});

test('recruiter transcript and AI evidence draft are stored separately from original evidence', async () => {
  const analyzer = async ({ transcript, mode }) => ({ nextQuestions:['Give a specific example.'], evidence:[transcript[0].text], openQuestions:[], scores:{ technicalSkill:7 }, summary:'Draft summary', resumeDraft:'Unverified draft', limitations:[], provider:'openai', model:'fixture', generatedAt:new Date().toISOString(), mode });
  const { db, call } = fixture(analyzer);
  const line = await call('handleAdmin', '/api/recruiting/interviews/interview-1/video-transcript', 'POST', { id:'interviewer-line-1', text:'Tell me about your PPF experience.', language:'en' });
  assert.equal(line.status, 201); assert.equal(db.recruitingInterviews[0].aiInterview.transcript[0].speaker, 'interviewer');
  const analyzed = await call('handleAdmin', '/api/recruiting/interviews/interview-1/video-analyze', 'POST', { mode:'final' });
  assert.equal(analyzed.status, 200); assert.equal(analyzed.body.aiState.analysis.summary, 'Draft summary');
  assert.equal(db.recruitingInterviews[0].aiInterview.transcript[0].text, 'Tell me about your PPF experience.');
});
