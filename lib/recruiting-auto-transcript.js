'use strict';

const crypto = require('crypto');
const AUTO_NOTICE_VERSION = '2026-09-20-auto-v1';
const MAX_SEGMENT_BYTES = 1024 * 1024;
const MAX_SEGMENT_DURATION_MS = 30000;
const PRESENCE_MS = 30000;
const MAX_TRANSCRIPT_ROWS = 2000;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const id = () => crypto.randomBytes(16).toString('base64url');
const types = new Set(['audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/ogg']);
function fail(code, message, statusCode = 409) { throw Object.assign(new Error(message), { code:`INTERVIEW_AUTO_${code}`, statusCode }); }
function state(interview) { interview.aiInterview ||= {}; return interview.aiInterview.autoTranscript ||= { participants:[], flush:null }; }
function validConsent(participant) { return participant?.consent === true && participant.noticeVersion === AUTO_NOTICE_VERSION; }
function isEnding(auto, invite) { return Boolean(auto?.ending && invite?.id && auto.ending.inviteId === invite.id && Date.parse(auto.ending.startedAt) > Date.now() - 60000); }
function joinChoice(body) {
  if (body?.autoConsent === undefined && body?.autoNoticeVersion === undefined) return null;
  if (typeof body.autoConsent !== 'boolean' || body.autoNoticeVersion !== AUTO_NOTICE_VERSION) fail('CONSENT_INVALID', '请阅读最新自动转写说明并选择加入方式', 400);
  return body.autoConsent;
}
function ownInfo(interview, invite, identity) {
  const record = interview.aiInterview?.autoTranscript?.participants?.find(row => row.identity === identity && row.inviteId === invite.id);
  return { autoConsent:validConsent(record), autoNoticeVersion:record?.noticeVersion || '', autoConsentRecorded:Boolean(record?.noticeVersion === AUTO_NOTICE_VERSION), autoPaused:Boolean(record?.paused) };
}
function applyConsent(interview, invite, identityInfo, consent, method = 'room_button') {
  const current = state(interview);
  if (consent && isEnding(current, invite)) fail('ENDING', '面试正在结束，不能重新开启自动转写');
  let record = current.participants.find(row => row.identity === identityInfo.identity && row.inviteId === invite.id);
  if (!record) {
    if (current.participants.length >= 100) fail('LIMIT', '本次面试的参与会话已达到上限，请联系管理员');
    record = { ...identityInfo, inviteId:invite.id, consent:false, noticeVersion:'', epoch:0, paused:false, requests:[] };
    current.participants.push(record);
  }
  if (record.consent !== consent || record.noticeVersion !== AUTO_NOTICE_VERSION) {
    record.epoch++; record.paused = false;
    for (const request of record.requests) if (request.status === 'pending') request.status = 'cancelled';
    const invalidatedRows = new Set(current.participants.flatMap(participant => participant.requests.filter(request => request.rowId && (participant.identity === record.identity || request.oppositeConsents?.some(contract => contract.identity === record.identity))).map(request => request.rowId)));
    for (const row of interview.aiInterview.transcript || []) if (row.translationStatus === 'pending' && invalidatedRows.has(row.id)) { row.translationStatus = 'cancelled'; row.translationError = 'INTERVIEW_AUTO_CONSENT_CHANGED'; }
  }
  Object.assign(record, identityInfo, { consent, noticeVersion:AUTO_NOTICE_VERSION, method, updatedAt:new Date().toISOString(), lastSeenAt:new Date().toISOString() });
  if (!consent && current.flush?.identities.includes(record.identity) && !current.flush.acknowledged.includes(record.identity)) current.flush.acknowledged.push(record.identity);
  if (identityInfo.speaker === 'candidate') {
    const previous = invite.voiceConsent;
    invite.voiceConsent = { consent, noticeVersion:AUTO_NOTICE_VERSION, method, updatedAt:record.updatedAt };
    if (previous?.consent !== consent || previous?.noticeVersion !== AUTO_NOTICE_VERSION) {
      const voice = interview.aiInterview.voice;
      if (voice) { voice.epoch = (voice.epoch || 0) + 1; voice.recording = false; voice.capture = null; if (voice.currentTurn) voice.currentTurn.phase = 'interrupted'; for (const request of voice.requests || []) if (request.status === 'pending') request.status = 'cancelled'; }
    }
  }
  return record;
}

function createRecruitingAutoTranscriptService(deps) {
  const { readDb, readBody, readVoiceBody = readBody, send, canAccess, activeInvite, interviewContext, interviewerIdentity, aiState, save, safeEqual, voiceProvider, translateVoiceText } = deps;
  const limits = new Map(), inFlight = new Set(), translations = [], translationIds = new Set();
  let activeTranslations = 0;
  const configured = () => { try { return voiceProvider?.configured?.() === true; } catch { return false; } };
  function context(interviewId, actor, body, isPublic, edit = true) {
    const db = readDb(), invite = activeInvite(db, interviewId);
    if (!invite) fail('SESSION_EXPIRED', '面试会话已失效', 410);
    const { interview, candidate } = interviewContext(db, invite);
    if (['completed','cancelled'].includes(interview.status)) fail('SESSION_EXPIRED', '本次面试已结束', 410);
    let identityInfo;
    if (isPublic) {
      if (invite.status !== 'joined' || typeof body.sessionSecret !== 'string' || !body.sessionSecret || !safeEqual(invite.sessionSecretHash, hash(body.sessionSecret))) fail('SESSION_EXPIRED', '候选人会话已失效', 401);
      identityInfo = { identity:`candidate-${invite.id}`, speaker:'candidate', speakerName:candidate.name || 'Candidate' };
    } else {
      const fresh = Array.isArray(db.users) ? db.users.find(user => user.id === actor?.id && user.active !== false) : actor;
      if (!fresh || !canAccess(fresh, 'recruitingView') || (edit && !canAccess(fresh, 'recruitingEdit'))) fail('FORBIDDEN', '没有自动面试转写权限', 403);
      if (typeof body.participantSessionId !== 'string') fail('VALIDATION', '缺少面试官会话标识', 400);
      identityInfo = { identity:interviewerIdentity(fresh, body), speaker:'interviewer', speakerName:fresh.name || fresh.email || 'Interviewer', speakerUserId:fresh.id };
    }
    const auto = state(interview), own = auto.participants.find(row => row.identity === identityInfo.identity && row.inviteId === invite.id);
    return { db, interview, candidate, invite, auto, own, identityInfo, actor, body, isPublic };
  }
  function fresh(ctx, epoch) {
    const latest = context(ctx.interview.id, ctx.actor, ctx.body, ctx.isPublic);
    if (latest.invite.id !== ctx.invite.id || !validConsent(latest.own) || latest.own.epoch !== epoch) fail('CONSENT_CHANGED', '同意或参与会话已变化，本段结果未保存');
    for (const contract of ctx.oppositeConsents || []) {
      const participant = latest.auto.participants.find(row => row.inviteId === latest.invite.id && row.identity === contract.identity);
      if (!validConsent(participant) || participant.epoch !== contract.epoch) fail('CONSENT_CHANGED', '另一方的自动转写同意已变化，本段结果未保存');
    }
    latest.oppositeConsents = ctx.oppositeConsents;
    return latest;
  }
  function pendingCount(participants) { return participants.reduce((count, participant) => count + participant.requests.filter(row => row.status === 'pending').length, 0); }
  function pendingTranslations(interview, participants) {
    const rowIds = new Set(participants.flatMap(participant => participant.requests.map(request => request.rowId).filter(Boolean)));
    return (interview.aiInterview?.transcript || []).filter(row => rowIds.has(row.id) && row.translationStatus === 'pending').length;
  }
  function flushPending(auto) {
    if (!auto.flush) return [];
    return auto.flush.identities.filter(identity => !auto.flush.acknowledged.includes(identity));
  }
  function reply(ctx, extra = {}) {
    const participants = ctx.auto.participants.filter(row => row.inviteId === ctx.invite.id);
    const live = participants.filter(row => Date.parse(row.lastSeenAt) > Date.now() - PRESENCE_MS);
    const flush = ctx.auto.flush, pending = flushPending(ctx.auto), own = ctx.own;
    const flushing = flush?.identities.includes(ctx.identityInfo.identity) && !flush.acknowledged.includes(ctx.identityInfo.identity);
    const available = configured(), ending = isEnding(ctx.auto, ctx.invite), oppositeReady = live.some(row => row.speaker !== own?.speaker && validConsent(row));
    const reason = ending ? '面试正在结束' : !available ? 'AI 转写尚未配置' : !validConsent(own) ? '等待本人明确同意自动转写' : own.paused ? '自动转写已暂停' : flushing ? '正在收尾本次转写' : !oppositeReady ? '等待另一方加入并同意自动转写' : '';
    return { autoState:{ noticeVersion:AUTO_NOTICE_VERSION, configured:available, reason, ownConsent:validConsent(own),
      ownNoticeVersion:own?.noticeVersion || '', ownConsentRecorded:Boolean(own?.noticeVersion === AUTO_NOTICE_VERSION), ownPaused:Boolean(own?.paused),
      allowed:Boolean(available && !ending && validConsent(own) && !own.paused && !flushing && oppositeReady), epoch:own?.epoch || 0, ending,
      identity:ctx.identityInfo.identity, speaker:ctx.identityInfo.speaker, candidateIdentity:`candidate-${ctx.invite.id}`,
      maxSegmentDurationMs:MAX_SEGMENT_DURATION_MS, maxAudioBytes:MAX_SEGMENT_BYTES,
      participants:live.map(row => ({ identity:row.identity, speaker:row.speaker, consent:validConsent(row), paused:Boolean(row.paused) })),
      flushRequestId:flush?.id || '', flushComplete:Boolean(flush && !pending.length && !pendingCount(participants) && !pendingTranslations(ctx.interview, participants)),
      pendingSegments:pendingCount(participants), pendingTranslations:pendingTranslations(ctx.interview, participants), flushPendingIdentities:pending }, aiState:aiState(ctx.interview, !ctx.isPublic), ...extra };
  }
  function rateLimit(ctx, operation) {
    const key = `${ctx.identityInfo.identity}:${operation === 'segment' ? 'segment' : 'state'}`, now = Date.now();
    const recent = (limits.get(key) || []).filter(time => time > now - 60000);
    if (recent.length >= (operation === 'segment' ? 40 : 120)) fail('RATE_LIMIT', '自动转写请求过于频繁，请稍后重试', 429);
    limits.delete(key); limits.set(key, [...recent, now]); while (limits.size > 5000) limits.delete(limits.keys().next().value);
  }
  function touch(ctx) {
    if (ctx.own && Date.parse(ctx.own.lastSeenAt || '') < Date.now() - 4000) { ctx.own.lastSeenAt = new Date().toISOString(); save(ctx.db, 'recruiting-auto-presence', ctx.interview.id); }
  }
  function markFailed(ctx, epoch, requestId, error) {
    try { const latest = fresh(ctx, epoch), request = latest.own.requests.find(row => row.id === requestId); if (request?.status === 'pending') { request.status = 'failed'; request.errorCode = String(error.code || 'INTERVIEW_AUTO_TRANSCRIBE_FAILED'); save(latest.db, 'recruiting-auto-segment-failed', latest.interview.id); } }
    catch {
      // Revocation invalidates the result, but must not strand a pending ledger
      // entry that would prevent all other participants from finishing.
      try { const latest = context(ctx.interview.id, ctx.actor, ctx.body, ctx.isPublic), request = latest.own?.requests.find(row => row.id === requestId); if (request?.status === 'pending') { request.status = 'cancelled'; save(latest.db, 'recruiting-auto-segment-cancelled', latest.interview.id); } } catch {}
    }
  }
  function translatedLater(ctx, epoch, rowId, original) {
    const key = `${ctx.interview.id}:${rowId}`;
    if (translationIds.has(key)) return;
    if (translations.length + activeTranslations >= 16 || typeof translateVoiceText !== 'function') {
      try { const latest = fresh(ctx, epoch), row = latest.interview.aiInterview.transcript.find(row => row.id === rowId); if (row) { row.translationStatus = 'failed'; row.translationError = 'INTERVIEW_AUTO_TRANSLATION_UNAVAILABLE'; save(latest.db, 'recruiting-auto-translation-unavailable', latest.interview.id); } } catch {}
      return;
    }
    translationIds.add(key); translations.push(async () => {
      let translated, failed = false;
      try { fresh(ctx, epoch); translated = await translateVoiceText({ text:original, targetLanguage:'zh' }); if (typeof translated?.text !== 'string' || !translated.text.trim() || translated.text.length > 24000) failed = true; } catch { failed = true; }
      try {
        const latest = fresh(ctx, epoch), row = latest.interview.aiInterview.transcript.find(row => row.id === rowId);
        if (row) { row.translationStatus = failed ? 'failed' : 'complete'; if (failed) row.translationError = 'INTERVIEW_AUTO_TRANSLATION_FAILED'; else row.translationZh = translated.text.trim(); save(latest.db, 'recruiting-auto-translation-ready', latest.interview.id); }
      } catch {
        // No late translation content may be saved after authorization changes.
        // Only settle this already-saved job's status so it cannot remain pending forever.
        try { const db = readDb(), interview = db.recruitingInterviews?.find(item => item.id === ctx.interview.id), row = interview?.aiInterview?.transcript?.find(item => item.id === rowId && item.text === original); if (row?.translationStatus === 'pending') { row.translationStatus = 'cancelled'; row.translationError = 'INTERVIEW_AUTO_AUTH_CHANGED'; save(db, 'recruiting-auto-translation-cancelled', ctx.interview.id); } } catch {}
      } finally { translationIds.delete(key); }
    });
    pumpTranslations();
  }
  function pumpTranslations() {
    while (activeTranslations < 2 && translations.length) { const job = translations.shift(); activeTranslations++; void job().finally(() => { activeTranslations--; pumpTranslations(); }); }
  }
  function validateFields(body, isPublic) {
    const common = ['operation', ...(isPublic ? ['interviewId','sessionSecret'] : ['participantSessionId'])];
    const byOperation = { status:[], consent:['consent','noticeVersion'], pause:['epoch'], resume:['epoch'], segment:['requestId','audioBase64','mimeType','durationMs','epoch','startedAt','endedAt'], flush:['participantIdentities'], 'flush-ack':['flushRequestId','epoch'] };
    const allowed = byOperation[body?.operation];
    if (!body || typeof body !== 'object' || Array.isArray(body) || !allowed || Object.keys(body).some(key => ![...common,...allowed].includes(key))) fail('VALIDATION', '自动转写请求字段无效', 400);
  }
  async function handle(req, res, url, actor, isPublic) {
    const match = isPublic ? url.pathname === '/api/public/recruiting-video/auto' : url.pathname.match(/^\/api\/recruiting\/interviews\/([A-Za-z0-9_-]+)\/video-auto$/);
    if (!match) return false;
    try {
      if (req.method !== 'POST') fail('METHOD', '此操作不支持', 405);
      const body = await readVoiceBody(req); validateFields(body, isPublic);
      let ctx = context(isPublic ? String(body.interviewId || '') : match[1], actor, body, isPublic, body.operation !== 'status');
      rateLimit(ctx, body.operation);
      if (body.operation === 'status') { touch(ctx); send(res, 200, reply(ctx)); return true; }
      if (body.operation === 'consent') {
        if (typeof body.consent !== 'boolean' || body.noticeVersion !== AUTO_NOTICE_VERSION) fail('CONSENT_INVALID', '请确认最新自动转写说明', 400);
        ctx.own = applyConsent(ctx.interview, ctx.invite, ctx.identityInfo, body.consent);
        save(ctx.db, body.consent ? 'recruiting-auto-consent' : 'recruiting-auto-consent-revoked', ctx.interview.id);
        send(res, 200, reply(ctx)); return true;
      }
      if (body.operation === 'flush') {
        if (isPublic) fail('FORBIDDEN', '仅面试官可收尾全部转写', 403);
        if (!Array.isArray(body.participantIdentities) || body.participantIdentities.length > 30 || body.participantIdentities.some(value => typeof value !== 'string' || value.length > 200)) fail('VALIDATION', '参与者列表无效', 400);
        const identities = [...new Set(body.participantIdentities)].filter(identity => ctx.auto.participants.some(row => row.identity === identity && row.inviteId === ctx.invite.id && validConsent(row) && Date.parse(row.lastSeenAt) > Date.now() - PRESENCE_MS));
        if (ctx.auto.flush && flushPending(ctx.auto).length) { send(res, 200, reply(ctx)); return true; }
        ctx.auto.flush = { id:id(), identities, acknowledged:[], createdAt:new Date().toISOString() };
        save(ctx.db, 'recruiting-auto-flush-requested', ctx.interview.id); send(res, 200, reply(ctx)); return true;
      }
      if (!validConsent(ctx.own)) fail('CONSENT_REQUIRED', '当前参与者尚未同意自动录音转写');
      if (!Number.isInteger(body.epoch) || body.epoch !== ctx.own.epoch) fail('CONSENT_CHANGED', '同意状态已变化，请刷新当前状态');
      if (isEnding(ctx.auto, ctx.invite) && ['resume','segment'].includes(body.operation)) fail('ENDING', '面试正在结束，不能重新开启自动转写');
      if (['pause','resume'].includes(body.operation)) {
        if (body.operation === 'resume' && ctx.auto.flush && flushPending(ctx.auto).length) fail('FLUSH_PENDING', '正在收尾转写，请完成后再恢复');
        ctx.own.paused = body.operation === 'pause'; ctx.own.lastSeenAt = new Date().toISOString();
        if (body.operation === 'resume') ctx.auto.flush = null;
        save(ctx.db, `recruiting-auto-${body.operation}`, ctx.interview.id); send(res, 200, reply(ctx)); return true;
      }
      if (body.operation === 'flush-ack') {
        if (!ctx.auto.flush || body.flushRequestId !== ctx.auto.flush.id || !ctx.auto.flush.identities.includes(ctx.identityInfo.identity)) fail('FLUSH_INVALID', '收尾请求已变化');
        if (pendingCount([ctx.own])) fail('FLUSH_PENDING', '该参与者仍有转写进行中');
        if (!ctx.auto.flush.acknowledged.includes(ctx.identityInfo.identity)) ctx.auto.flush.acknowledged.push(ctx.identityInfo.identity);
        ctx.own.paused = true; save(ctx.db, 'recruiting-auto-flush-ack', ctx.interview.id); send(res, 200, reply(ctx)); return true;
      }
      if (ctx.own.paused) fail('PAUSED', '自动转写已暂停');
      if (typeof body.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(body.requestId)) fail('VALIDATION', '分段编号无效', 400);
      const mimeType = typeof body.mimeType === 'string' ? body.mimeType.split(';')[0].trim().toLowerCase() : '';
      if (!types.has(mimeType) || !Number.isInteger(body.durationMs) || body.durationMs < 1 || body.durationMs > MAX_SEGMENT_DURATION_MS || typeof body.audioBase64 !== 'string' || !body.audioBase64 || body.audioBase64.length > Math.ceil(MAX_SEGMENT_BYTES / 3) * 4 || body.audioBase64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.audioBase64)) fail('VALIDATION', '分段音频须不超过 30 秒、1 MB，且格式有效', 400);
      const audio = Buffer.from(body.audioBase64, 'base64');
      if (!audio.length || audio.length > MAX_SEGMENT_BYTES || audio.toString('base64') !== body.audioBase64) fail('VALIDATION', '分段音频无效', 400);
      const fingerprint = hash(JSON.stringify([mimeType,body.durationMs,body.epoch,hash(audio)]));
      const previous = ctx.own.requests.find(row => row.id === body.requestId);
      if (previous) {
        if (previous.fingerprint !== fingerprint) fail('REQUEST_CONFLICT', '该分段编号已用于其他音频');
        const row = ctx.interview.aiInterview.transcript?.find(row => row.id === previous.rowId);
        if (row || previous.status === 'complete' || previous.status === 'cancelled' || (previous.status === 'pending' && inFlight.has(`${ctx.interview.id}:${ctx.identityInfo.identity}`))) {
          const sharedRow = row && (({ speakerUserId, ...rest }) => rest)(row);
          send(res, 200, reply(ctx, { requestStatus:previous.status, duplicate:true, ...(row ? { row:ctx.isPublic ? sharedRow : row } : {}), ...(previous.skipped ? { skipped:true } : {}), ...(previous.errorCode ? { requestErrorCode:previous.errorCode } : {}) })); return true;
        }
        if ((previous.attempts || 1) >= 3) fail('RETRY_LIMIT', '本段已重试三次，请保留页面并联系管理员', 429);
      }
      const flightKey = `${ctx.interview.id}:${ctx.identityInfo.identity}`;
      if (inFlight.has(flightKey)) fail('BUSY', '当前参与者的上一段回答仍在转写');
      if (inFlight.size >= 8 || ctx.own.requests.length >= 1000 || ctx.auto.participants.reduce((sum,row) => sum+row.requests.length,0) >= 5000) fail('LIMIT', '自动转写容量已达到上限，请暂停并联系管理员', 429);
      if (!configured()) fail('NOT_CONFIGURED', 'AI 转写尚未配置', 503);
      if ((ctx.interview.aiInterview.transcript?.length || 0) + pendingCount(ctx.auto.participants) >= MAX_TRANSCRIPT_ROWS) fail('CAPACITY', '本次面试已达到 2000 条记录上限；原记录保留，请结束或联系管理员', 413);
      const epoch = ctx.own.epoch;
      ctx.oppositeConsents = previous?.oppositeConsents || ctx.auto.participants.filter(row => row.inviteId === ctx.invite.id && row.speaker !== ctx.own.speaker && validConsent(row) && Date.parse(row.lastSeenAt) > Date.now() - PRESENCE_MS - MAX_SEGMENT_DURATION_MS).map(row => ({ identity:row.identity, epoch:row.epoch }));
      if (!ctx.oppositeConsents.length) fail('CONSENT_REQUIRED', '等待另一方加入并同意自动转写');
      fresh(ctx, epoch);
      if (previous) { previous.status = 'pending'; previous.errorCode = ''; previous.attempts = (previous.attempts || 1) + 1; previous.updatedAt = new Date().toISOString(); }
      else ctx.own.requests.push({ id:body.requestId, fingerprint, status:'pending', attempts:1, oppositeConsents:ctx.oppositeConsents, createdAt:new Date().toISOString() });
      ctx.own.lastSeenAt = new Date().toISOString(); save(ctx.db, 'recruiting-auto-segment-processing', ctx.interview.id); inFlight.add(flightKey);
      let transcription;
      try { transcription = await voiceProvider.transcribe({ audio, mimeType }); if (typeof transcription?.text !== 'string' || transcription.text.length > 12000) fail('TRANSCRIBE_INVALID', '转写结果无效', 502); }
      catch (error) { markFailed(ctx, epoch, body.requestId, error); throw Object.assign(new Error('本段语音转写失败；已保存的记录未改变'), { code:error.code?.startsWith('INTERVIEW_') ? error.code : 'INTERVIEW_AUTO_TRANSCRIBE_FAILED', statusCode:error.statusCode || 502 }); }
      finally { inFlight.delete(flightKey); }
      try { ctx = fresh(ctx, epoch); }
      catch (error) {
        const latest = context(ctx.interview.id, ctx.actor, ctx.body, ctx.isPublic), cancelled = latest.own?.requests.find(row => row.id === body.requestId);
        if (cancelled?.status === 'pending') { cancelled.status = 'cancelled'; save(latest.db, 'recruiting-auto-segment-cancelled', latest.interview.id); }
        throw error;
      }
      const request = ctx.own.requests.find(row => row.id === body.requestId);
      if (!request || request.status !== 'pending') fail('CONSENT_CHANGED', '本段录音已取消，不会保存过期结果');
      const original = transcription.text.trim(); request.status = 'complete';
      if (!original) { request.skipped = true; save(ctx.db, 'recruiting-auto-segment-empty', ctx.interview.id); send(res, 200, reply(ctx, { requestStatus:'complete', skipped:true })); return true; }
      if ((ctx.interview.aiInterview.transcript?.length || 0) >= MAX_TRANSCRIPT_ROWS) { request.status = 'failed'; request.errorCode = 'INTERVIEW_AUTO_CAPACITY'; save(ctx.db, 'recruiting-auto-capacity-reached', ctx.interview.id); fail('CAPACITY', '本次面试已达到 2000 条记录上限；原记录保留，请结束或联系管理员', 413); }
      const han = (original.match(/\p{Script=Han}/gu) || []).length, latin = (original.match(/[A-Za-z]/g) || []).length;
      const chinese = han > 0 && latin === 0;
      const row = { id:`auto-${id()}`, speaker:ctx.identityInfo.speaker, speakerName:ctx.identityInfo.speakerName, ...(ctx.identityInfo.speakerUserId ? { speakerUserId:ctx.identityInfo.speakerUserId } : {}), participantIdentity:ctx.identityInfo.identity,
        text:original, language:han ? (latin ? 'mixed' : 'zh') : 'en', translationZh:chinese ? original : '', translationStatus:chinese ? 'not_needed' : 'pending', source:'openai_auto_audio',
        turnId:'', questionId:'', kitId:'', questionText:'', createdAt:new Date().toISOString() };
      ctx.interview.aiInterview.transcript ||= []; ctx.interview.aiInterview.transcript.push(row); request.rowId = row.id;
      save(ctx.db, 'recruiting-auto-segment-saved', ctx.interview.id);
      const { speakerUserId, ...sharedRow } = row;
      send(res, 201, reply(ctx, { requestStatus:'complete', row:ctx.isPublic ? sharedRow : row }));
      if (!chinese) translatedLater({ ...ctx, body:ctx.isPublic ? { sessionSecret:body.sessionSecret } : { participantSessionId:body.participantSessionId } }, epoch, row.id, original);
    } catch (error) { send(res, error.statusCode || 400, { error:error.code?.startsWith('INTERVIEW_') ? error.message : '自动转写请求无效', code:error.code || 'INTERVIEW_AUTO_VALIDATION' }); }
    return true;
  }
  function assertReadyForAnalysis(interview, invite) {
    const auto = interview.aiInterview?.autoTranscript;
    if (!auto) return;
    const current = auto.participants.filter(row => row.inviteId === invite?.id && validConsent(row));
    assertNotEnding(interview, invite);
    if (pendingCount(current) || pendingTranslations(interview, current) || (auto.flush && flushPending(auto).length) || current.some(row => !row.paused && Date.parse(row.lastSeenAt) > Date.now() - PRESENCE_MS)) fail('FLUSH_REQUIRED', '请先收尾全部参与者的录音并等待转写及中文对照保存，再分析或结束面试');
  }
  function assertNotEnding(interview, invite) { if (isEnding(interview.aiInterview?.autoTranscript, invite)) fail('ENDING', '面试正在结束，请稍后'); }
  function beginEnding(interview, invite) { assertReadyForAnalysis(interview, invite); const operationId = id(); state(interview).ending = { id:operationId, inviteId:invite.id, startedAt:new Date().toISOString() }; return operationId; }
  function clearEnding(interview, operationId) { if (interview?.aiInterview?.autoTranscript?.ending?.id === operationId) { interview.aiInterview.autoTranscript.ending = null; return true; } return false; }
  return { handleAdmin:(req,res,url,actor) => handle(req,res,url,actor,false), handlePublic:(req,res,url) => handle(req,res,url,null,true), assertReadyForAnalysis, assertNotEnding, beginEnding, clearEnding };
}

module.exports = { createRecruitingAutoTranscriptService, AUTO_NOTICE_VERSION, applyConsent, ownInfo, joinChoice, MAX_SEGMENT_BYTES, MAX_SEGMENT_DURATION_MS };
