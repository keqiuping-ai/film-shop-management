'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecruitingVideoService, digest, roomName, expiryFor } = require('../lib/recruiting-video');

function fixture() {
  const db = {
    recruitingCandidates:[{ id:'candidate-1', name:'Synthetic Candidate', phone:'+15005550006', email:'candidate@example.invalid' }],
    recruitingInterviews:[{ id:'interview-1', candidateId:'candidate-1', startsAt:new Date(Date.now() + 86400000).toISOString(), durationMinutes:45, interviewerName:'Fixture Owner' }],
    recruitingVideoInvites:[]
  };
  let sent = null;
  const service = createRecruitingVideoService({
    readDb:() => db, writeDb:() => {}, readBody:async req => req.body || {},
    send:(_res, status, body) => { sent = { status, body }; }, canAccess:() => true,
    publicBaseUrl:() => 'https://quad.example', notify:() => {}
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
  } finally {
    for (const [name, value] of [['LIVEKIT_URL', previous.url], ['LIVEKIT_API_KEY', previous.key], ['LIVEKIT_API_SECRET', previous.secret]]) value === undefined ? delete process.env[name] : process.env[name] = value;
  }
});
