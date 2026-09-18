'use strict';

const crypto = require('crypto');
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');

const NOTICE_VERSION = '2026-09-18';
const ACTIVE = new Set(['active', 'joined']);

function uid(bytes = 18) { return crypto.randomBytes(bytes).toString('base64url'); }
function digest(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex'); }
function fail(statusCode, message, code = 'RECRUITING_VIDEO_ERROR') {
  const error = new Error(message); error.statusCode = statusCode; error.code = code; throw error;
}
function liveKitConfigured() {
  return Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
}
function ensure(db) {
  if (!Array.isArray(db.recruitingVideoInvites)) db.recruitingVideoInvites = [];
  return db.recruitingVideoInvites;
}
function safeEqual(left, right) {
  const a = Buffer.from(String(left || '')); const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function roomName(interviewId) { return `quad-interview-${String(interviewId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)}`; }
function expiryFor(interview) {
  const plannedEnd = Date.parse(interview.startsAt || '') + (Number(interview.durationMinutes || 30) + 120) * 60000;
  const cap = Date.now() + 30 * 86400000;
  return new Date(Math.max(Date.now() + 3600000, Math.min(Number.isFinite(plannedEnd) ? plannedEnd : cap, cap))).toISOString();
}
function inviteByToken(db, token) {
  const hashed = digest(token);
  return ensure(db).find(row => safeEqual(row.tokenHash, hashed));
}
function interviewContext(db, invite) {
  const interview = (db.recruitingInterviews || []).find(row => row.id === invite.interviewId);
  const candidate = interview && (db.recruitingCandidates || []).find(row => row.id === interview.candidateId);
  if (!interview || !candidate) fail(404, '这次面试已经不存在', 'INTERVIEW_NOT_FOUND');
  return { interview, candidate };
}
function publicInfo(db, invite) {
  const { interview, candidate } = interviewContext(db, invite);
  return {
    interviewId:interview.id, candidateName:candidate.name, startsAt:interview.startsAt,
    durationMinutes:interview.durationMinutes || 30, interviewerName:interview.interviewerName || 'QUAD FILM',
    status:invite.status, expiresAt:invite.expiresAt, noticeVersion:NOTICE_VERSION,
    liveKitConfigured:liveKitConfigured()
  };
}
async function participantToken(invite, identity, name, role) {
  if (!liveKitConfigured()) fail(503, '视频面试服务尚未配置', 'LIVEKIT_NOT_CONFIGURED');
  const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity, name, ttl:'3h', metadata:JSON.stringify({ interviewId:invite.interviewId, role, noticeVersion:NOTICE_VERSION })
  });
  token.addGrant({ roomJoin:true, room:invite.roomName, canPublish:true, canSubscribe:true, canPublishData:true });
  return { url:process.env.LIVEKIT_URL, token:await token.toJwt() };
}

function createRecruitingVideoService(deps) {
  const { readDb, writeDb, readBody, send, canAccess, publicBaseUrl, notify = () => {} } = deps;
  const publicAttempts = new Map();
  function save(db, action, recordId) { writeDb(db); notify(action, recordId); }
  function enforcePublicRateLimit(req) {
    const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    const key = forwarded || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const recent = (publicAttempts.get(key) || []).filter(timestamp => now - timestamp < 60000);
    if (recent.length >= 60) fail(429, '请求过于频繁，请稍后再试', 'INTERVIEW_RATE_LIMITED');
    recent.push(now); publicAttempts.set(key, recent);
    if (publicAttempts.size > 5000) {
      for (const [entryKey, timestamps] of publicAttempts) {
        if (!timestamps.some(timestamp => now - timestamp < 60000)) publicAttempts.delete(entryKey);
      }
    }
  }
  function activeInvite(db, interviewId) {
    return ensure(db).find(row => row.interviewId === interviewId && ACTIVE.has(row.status) && Date.parse(row.expiresAt) > Date.now());
  }
  async function handlePublic(req, res, url) {
    const match = url.pathname.match(/^\/api\/public\/recruiting-video\/invite\/([A-Za-z0-9_-]{30,100})(?:\/(exchange))?$/);
    const sessionRoute = url.pathname === '/api/public/recruiting-video/session';
    if (!match && !sessionRoute) return false;
    try {
      enforcePublicRateLimit(req);
      if (sessionRoute) {
        if (req.method !== 'POST') fail(405, '此操作不支持');
        const body = await readBody(req); const db = readDb();
        const invite = ensure(db).find(row => row.interviewId === String(body.interviewId || '') && row.status === 'joined');
        if (!invite || Date.parse(invite.expiresAt) <= Date.now() || !safeEqual(invite.sessionSecretHash, digest(body.sessionSecret))) {
          fail(401, '面试会话已失效，请联系招聘负责人重新发送链接', 'INTERVIEW_SESSION_EXPIRED');
        }
        invite.lastSeenAt = new Date().toISOString(); writeDb(db);
        send(res, 200, { ...publicInfo(db, invite), ...(await participantToken(invite, `candidate-${invite.id}`, interviewContext(db, invite).candidate.name, 'candidate')) });
        return true;
      }
      const token = match[1]; const operation = match[2] || ''; const db = readDb(); const invite = inviteByToken(db, token);
      if (!invite) fail(404, '面试链接无效，请检查完整链接', 'INTERVIEW_INVITE_INVALID');
      if (Date.parse(invite.expiresAt) <= Date.now() || ['ended', 'revoked'].includes(invite.status)) fail(410, '面试链接已失效，请联系招聘负责人重新发送', 'INTERVIEW_INVITE_EXPIRED');
      if (!operation && req.method === 'GET') { send(res, 200, publicInfo(db, invite)); return true; }
      if (operation === 'exchange' && req.method === 'POST') {
        if (invite.status !== 'active') fail(409, '此一次性链接已经使用，请在原浏览器继续，或联系招聘负责人重新生成', 'INTERVIEW_INVITE_USED');
        const body = await readBody(req);
        if (body?.consent !== true) fail(400, '进入前需要确认视频、音频和AI转写说明', 'INTERVIEW_CONSENT_REQUIRED');
        const secret = uid(32); const now = new Date().toISOString();
        const access = await participantToken(invite, `candidate-${invite.id}`, interviewContext(db, invite).candidate.name, 'candidate');
        invite.status = 'joined'; invite.joinedAt = now; invite.lastSeenAt = now;
        invite.sessionSecretHash = digest(secret); invite.consentAt = now; invite.noticeVersion = NOTICE_VERSION;
        save(db, 'recruiting-video-candidate-joined', invite.interviewId);
        send(res, 200, { ...publicInfo(db, invite), sessionSecret:secret, ...access });
        return true;
      }
      fail(405, '此操作不支持');
    } catch (error) { send(res, error.statusCode || 400, { error:error.message, code:error.code }); }
    return true;
  }
  async function handleAdmin(req, res, url, actor) {
    const match = url.pathname.match(/^\/api\/recruiting\/interviews\/([A-Za-z0-9_-]+)\/video-(invite|token|end)$/);
    if (!match) return false;
    try {
      if (!canAccess(actor, 'recruitingView') || (match[2] !== 'token' && !canAccess(actor, 'recruitingEdit'))) fail(403, '没有招聘视频面试权限', 'RECRUITING_FORBIDDEN');
      if (req.method !== 'POST') fail(405, '此操作不支持');
      const [, interviewId, action] = match; const db = readDb();
      const interview = (db.recruitingInterviews || []).find(row => row.id === interviewId);
      if (!interview) fail(404, '没有找到这次面试', 'INTERVIEW_NOT_FOUND');
      const candidate = (db.recruitingCandidates || []).find(row => row.id === interview.candidateId);
      if (!candidate) fail(404, '没有找到应聘者', 'CANDIDATE_NOT_FOUND');
      if (action === 'invite') {
        if (!liveKitConfigured()) fail(503, 'Railway 尚未配置 LiveKit 视频服务', 'LIVEKIT_NOT_CONFIGURED');
        for (const row of ensure(db)) if (row.interviewId === interviewId && ACTIVE.has(row.status)) row.status = 'revoked';
        const raw = uid(32); const now = new Date().toISOString();
        const invite = { id:uid(), interviewId, candidateId:candidate.id, tokenHash:digest(raw), sessionSecretHash:'',
          roomName:roomName(interviewId), status:'active', createdAt:now, createdByUserId:actor.id,
          createdBy:actor.name || actor.email || '', expiresAt:expiryFor(interview), joinedAt:'', endedAt:'' };
        ensure(db).unshift(invite); db.recruitingVideoInvites = db.recruitingVideoInvites.slice(0, 2000);
        save(db, 'create-recruiting-video-invite', interviewId);
        send(res, 201, { interviewId, candidateName:candidate.name, expiresAt:invite.expiresAt,
          joinUrl:`${String(publicBaseUrl(req)).replace(/\/$/, '')}/recruiting-interview.html?invite=${raw}` });
        return true;
      }
      const invite = activeInvite(db, interviewId);
      if (!invite) fail(409, '请先生成一次性面试链接', 'INTERVIEW_INVITE_REQUIRED');
      if (action === 'token') {
        send(res, 200, { interviewId, candidateName:candidate.name, startsAt:interview.startsAt,
          ...(await participantToken(invite, `recruiter-${actor.id}`, actor.name || actor.email || 'QUAD interviewer', 'interviewer')) });
        return true;
      }
      invite.status = 'ended'; invite.endedAt = new Date().toISOString(); invite.endedByUserId = actor.id;
      if (liveKitConfigured()) {
        const client = new RoomServiceClient(process.env.LIVEKIT_URL.replace(/^ws/, 'http'), process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, { requestTimeout:5 });
        try { await client.deleteRoom(invite.roomName); } catch (error) { if (!/not found/i.test(String(error.message))) throw error; }
      }
      save(db, 'end-recruiting-video-interview', interviewId); send(res, 200, { ok:true }); return true;
    } catch (error) { send(res, error.statusCode || 400, { error:error.message, code:error.code }); }
    return true;
  }
  return { handlePublic, handleAdmin };
}

module.exports = { createRecruitingVideoService, digest, roomName, expiryFor, NOTICE_VERSION };
