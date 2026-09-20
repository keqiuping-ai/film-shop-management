'use strict';

const crypto = require('crypto');
const { INTERVIEW_KITS } = require('./recruiting-interview-kits');
const VOICE_NOTICE_VERSION = '2026-09-19-voice-v1';
const LEASE_MS = 30000;
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_DURATION_MS = 120000;
const AUDIO_TYPES = new Map([['audio/webm','webm'], ['audio/mp4','mp4'], ['audio/mpeg','mp3'], ['audio/wav','wav'], ['audio/ogg','ogg']]);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const uid = () => crypto.randomBytes(18).toString('base64url');
function failure(code, message, statusCode = 409) { return Object.assign(new Error(message), { code:`INTERVIEW_VOICE_${code}`, statusCode }); }
function reject(code, message, statusCode) { throw failure(code, message, statusCode); }
function consented(invite) { return invite?.status === 'joined' && invite.voiceConsent?.consent === true && invite.voiceConsent.noticeVersion === VOICE_NOTICE_VERSION; }
function audioType(value) { return typeof value === 'string' ? value.split(';')[0].trim().toLowerCase() : ''; }
function english(value, limit = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /\p{Script=Han}/u.test(value)) reject('VALIDATION', '请提供完整英文内容（不超过规定长度）', 400);
  return value.trim();
}
function decodeAudio(value) {
  if (typeof value !== 'string' || !value || value.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4
      || value.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) reject('VALIDATION', '音频格式无效或超过 4 MB', 400);
  const audio = Buffer.from(value, 'base64');
  if (!audio.length || audio.length > MAX_AUDIO_BYTES || audio.toString('base64') !== value) reject('VALIDATION', '音频格式无效或超过 4 MB', 400);
  return audio;
}
function safeProviderError(error) {
  const allowed = new Set(['NOT_CONFIGURED','PROVIDER_AUTH','PROVIDER_RATE_LIMIT','PROVIDER_TIMEOUT','PROVIDER_FAILED','PROVIDER_INVALID']);
  const name = String(error?.code || '').replace(/^INTERVIEW_VOICE_/, '');
  const code = allowed.has(name) ? name : 'PROVIDER_FAILED';
  const status = code === 'PROVIDER_RATE_LIMIT' ? 429 : code === 'PROVIDER_TIMEOUT' ? 504 : ['NOT_CONFIGURED','PROVIDER_AUTH'].includes(code) ? 503 : 502;
  return failure(code, code === 'NOT_CONFIGURED' ? 'AI 语音服务尚未配置' : code === 'PROVIDER_AUTH' ? 'AI 语音服务认证或权限异常，无需重新登录系统' : code === 'PROVIDER_TIMEOUT' ? 'AI 语音处理超时，请停止当前操作后核查' : code === 'PROVIDER_RATE_LIMIT' ? 'AI 语音服务暂时限流，请稍后人工重试' : 'AI 语音处理失败，原有面试资料未改变', status);
}

function createRecruitingVoiceProvider({ getConfig, fetchImpl = globalThis.fetch, timeoutMs = 30000 } = {}) {
  function config() {
    let settings; try { settings = getConfig?.() || {}; } catch { settings = {}; }
    const apiKey = typeof settings.apiKey === 'string' ? settings.apiKey.trim() : '';
    let baseUrl = '';
    try { const url = new URL(settings.baseUrl || 'https://api.openai.com/v1'); if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash) baseUrl = url.href.replace(/\/+$/, ''); } catch {}
    return { apiKey, baseUrl, configured:Boolean(apiKey && !/[\r\n]/.test(apiKey) && baseUrl && typeof fetchImpl === 'function') };
  }
  async function limitedBytes(response, limit) {
    if (Number(response.headers?.get?.('content-length') || 0) > limit) throw safeProviderError({ code:'INTERVIEW_VOICE_PROVIDER_INVALID' });
    if (!response.body?.getReader) {
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > limit) throw safeProviderError({ code:'INTERVIEW_VOICE_PROVIDER_INVALID' });
      return buffer;
    }
    const reader = response.body.getReader(), parts = []; let size = 0;
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break;
        size += next.value.length;
        if (size > limit) { await reader.cancel(); throw safeProviderError({ code:'INTERVIEW_VOICE_PROVIDER_INVALID' }); }
        parts.push(Buffer.from(next.value));
      }
      return Buffer.concat(parts);
    } finally { reader.releaseLock(); }
  }
  async function call(endpoint, body, isSpeech) {
    const settings = config(); if (!settings.configured) throw safeProviderError({ code:'INTERVIEW_VOICE_NOT_CONFIGURED' });
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${settings.baseUrl}/audio/${endpoint}`, { method:'POST', redirect:'error', signal:abort.signal,
        headers:{ Authorization:`Bearer ${settings.apiKey}`, ...(isSpeech ? { 'Content-Type':'application/json' } : {}) }, body });
      if (!response.ok) throw safeProviderError({ code:`INTERVIEW_VOICE_${[401,403].includes(response.status) ? 'PROVIDER_AUTH' : response.status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_FAILED'}` });
      const buffer = await limitedBytes(response, isSpeech ? MAX_AUDIO_BYTES : 100000);
      if (isSpeech) {
        if (!buffer.length || (response.headers?.get?.('content-type') && !/^audio\/(?:mpeg|mp3)(?:;|$)/i.test(response.headers.get('content-type')))) throw safeProviderError({ code:'INTERVIEW_VOICE_PROVIDER_INVALID' });
        return { audioBase64:buffer.toString('base64'), mimeType:'audio/mpeg' };
      }
      let value; try { value = JSON.parse(buffer.toString('utf8')); } catch {}
      if (typeof value?.text !== 'string' || !value.text.trim() || value.text.length > 12000 || /\p{Script=Han}/u.test(value.text)) throw safeProviderError({ code:'INTERVIEW_VOICE_PROVIDER_INVALID' });
      return { text:value.text.trim() };
    } catch (error) { throw safeProviderError(abort.signal.aborted ? { code:'INTERVIEW_VOICE_PROVIDER_TIMEOUT' } : error); }
    finally { clearTimeout(timer); }
  }
  return {
    configured:() => config().configured,
    speech:async ({ text }) => call('speech', JSON.stringify({ model:'gpt-4o-mini-tts', voice:'coral', input:english(text), response_format:'mp3', instructions:'Speak clearly in professional American English as an AI interview assistant. Read the supplied question exactly, without adding questions or promises.' }), true),
    transcribe:async ({ audio, mimeType }) => {
      const type = audioType(mimeType);
      if (!Buffer.isBuffer(audio) || !audio.length || audio.length > MAX_AUDIO_BYTES || !AUDIO_TYPES.has(type)) reject('VALIDATION', '回答音频无效', 400);
      const form = new FormData(); form.append('model', 'gpt-4o-mini-transcribe'); form.append('language', 'en'); form.append('response_format', 'json');
      form.append('file', new Blob([audio], { type }), `answer.${AUDIO_TYPES.get(type)}`);
      return call('transcriptions', form, false);
    }
  };
}

function createRecruitingVoiceService(deps) {
  const { readDb, readBody, send, canAccess, activeInvite, interviewContext, interviewerIdentity, aiState, save, voiceProvider, translateVoiceText } = deps;
  const readVoiceBody = deps.readVoiceBody || readBody;
  const followupInFlight = new Map();
  const configured = () => { try { return voiceProvider?.configured?.() === true && typeof voiceProvider.speech === 'function' && typeof voiceProvider.transcribe === 'function'; } catch { return false; } };
  function context(db, interviewId) {
    const invite = activeInvite(db, interviewId);
    if (!invite) reject('SESSION_EXPIRED', '面试邀请已失效，请停止 AI 语音并重新进入', 410);
    const { interview, candidate } = interviewContext(db, invite);
    if (['cancelled','completed'].includes(interview.status)) reject('SESSION_EXPIRED', '本次面试已结束', 410);
    interview.aiInterview ||= {};
    interview.aiInterview.voice ||= { epoch:0, requests:[], currentTurn:null, recording:false };
    return { db, invite, interview, candidate, state:interview.aiInterview.voice };
  }
  function stateFor(interview, invite) {
    const state = interview.aiInterview?.voice || {}, active = state.inviteId === invite.id && Date.parse(state.leaseExpiresAt) > Date.now();
    const turn = state.currentTurn;
    return { configured:configured(), controllerIdentity:active ? state.controllerIdentity || '' : '', controllerName:active ? state.controllerName || '' : '',
      leaseExpiresAt:active ? state.leaseExpiresAt : '', consent:consented(invite), noticeVersion:VOICE_NOTICE_VERSION, candidateIdentity:`candidate-${invite.id}`,
      currentTurn:turn ? { id:turn.id, questionText:turn.questionText, questionId:turn.questionId || '', kitId:turn.kitId || '', phase:active && consented(invite) ? turn.phase : 'interrupted' } : null,
      recording:Boolean(active && consented(invite) && state.recording && turn?.phase === 'recording') };
  }
  function response(ctx, privateView = true) { return { voice:stateFor(ctx.interview, ctx.invite), aiState:aiState(ctx.interview, privateView) }; }
  function freshActor(db, actor, edit = true) {
    const current = Array.isArray(db.users) ? db.users.find(row => row.id === actor?.id && row.active !== false) : actor;
    if (!current || !canAccess(current, 'recruitingView') || (edit && !canAccess(current, 'recruitingEdit'))) reject('FORBIDDEN', '没有 AI 面试操作权限', 403);
    return current;
  }
  function controller(ctx, actor, body, needsConsent = true) {
    freshActor(ctx.db, actor);
    if (typeof body.participantSessionId !== 'string') reject('VALIDATION', '缺少面试官页面会话标识', 400);
    const identity = interviewerIdentity(actor, body);
    if (ctx.state.inviteId !== ctx.invite.id || ctx.state.controllerIdentity !== identity || ctx.state.controllerUserId !== actor.id || !(Date.parse(ctx.state.leaseExpiresAt) > Date.now())) reject('CONTROLLER_REQUIRED', '当前页面没有有效 AI 控制权，请重新取得控制权');
    if (needsConsent && !consented(ctx.invite)) reject('CONSENT_REQUIRED', '须由候选人单独同意 AI 语音及回答转写后才能开始');
    return identity;
  }
  function invalidate(state) {
    state.epoch = (state.epoch || 0) + 1; state.recording = false; state.capture = null;
    state.followupPending = null;
    if (state.currentTurn) state.currentTurn.phase = 'interrupted';
    for (const row of state.requests || []) if (row.status === 'pending') row.status = 'cancelled';
  }
  function guardFor(ctx, actor, body) { return { interviewId:ctx.interview.id, inviteId:ctx.invite.id, epoch:ctx.state.epoch, turnId:ctx.state.currentTurn?.id, actor, participantSessionId:body.participantSessionId }; }
  function after(guard, phase) {
    const ctx = context(readDb(), guard.interviewId); controller(ctx, guard.actor, guard);
    if (ctx.invite.id !== guard.inviteId || ctx.state.epoch !== guard.epoch || (guard.turnId && ctx.state.currentTurn?.id !== guard.turnId) || (phase && ctx.state.currentTurn?.phase !== phase)) reject('RESULT_STALE', '当前题目、同意或控制权已改变，已丢弃过期结果');
    return ctx;
  }
  function fields(body, names) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !names.includes(key))) reject('VALIDATION', '请求字段无效', 400);
  }
  function requestId(body) { if (typeof body.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(body.requestId)) reject('VALIDATION', '请求编号无效', 400); return body.requestId; }
  function requestRecord(state, kind, id, fingerprint) {
    const previous = (state.requests || []).find(row => row.id === id);
    if (previous && (previous.kind !== kind || previous.fingerprint !== fingerprint)) reject('REQUEST_CONFLICT', '该请求编号已用于其他内容');
    return previous;
  }
  function requestState(record) { return { requestStatus:record.status, ...(record.errorCode ? { requestErrorCode:record.errorCode } : {}) }; }
  function addRequest(state, item) {
    state.requests ||= [];
    if (state.requests.length >= 500) reject('LIMIT_REACHED', '本次面试请求次数已达上限，请人工核查');
    state.requests.push({ ...item, status:'pending', createdAt:new Date().toISOString() });
  }
  function currentTurn(ctx, turnId) { if (!ctx.state.currentTurn || typeof turnId !== 'string' || ctx.state.currentTurn.id !== turnId) reject('TURN_INVALID', '当前题目已经改变'); return ctx.state.currentTurn; }
  function ensureIdle(state) { if (state.recording || ['preparing','speaking','recording','captured','transcribing'].includes(state.currentTurn?.phase)) reject('BUSY', '请先停止当前语音或完成本题回答'); }
  function saveFailure(guard, id, error) {
    const safe = safeProviderError(error);
    try {
      const ctx = after(guard), record = ctx.state.requests.find(row => row.id === id);
      if (record?.status === 'pending') { record.status = 'failed'; record.errorCode = safe.code; ctx.state.recording = false; ctx.state.capture = null; ctx.state.currentTurn.phase = 'error'; save(ctx.db, 'recruiting-voice-failed', ctx.interview.id); }
    } catch {}
    return safe;
  }
  async function handlePublic(req, res, url) {
    const operation = url.pathname.match(/^\/api\/public\/recruiting-video\/voice-(state|consent)$/)?.[1];
    if (!operation) return false;
    try {
      if (req.method !== 'POST') reject('METHOD', '此操作不支持', 405);
      deps.enforcePublicRateLimit?.(req);
      const body = await readVoiceBody(req);
      fields(body, operation === 'state' ? ['interviewId','sessionSecret'] : ['interviewId','sessionSecret','consent','noticeVersion']);
      const ctx = context(readDb(), String(body.interviewId || ''));
      if (ctx.invite.status !== 'joined' || !body.sessionSecret || !deps.safeEqual(ctx.invite.sessionSecretHash, hash(String(body.sessionSecret)))) reject('SESSION_EXPIRED', '候选人面试会话已失效', 401);
      if (operation === 'consent') {
        if (typeof body.consent !== 'boolean' || body.noticeVersion !== VOICE_NOTICE_VERSION) reject('VALIDATION', '请阅读并确认最新 AI 语音说明', 400);
        // Any fresh consent event invalidates older in-flight audio work.
        if (body.consent !== consented(ctx.invite)) invalidate(ctx.state);
        ctx.invite.voiceConsent = { consent:body.consent, noticeVersion:VOICE_NOTICE_VERSION, updatedAt:new Date().toISOString() };
        save(ctx.db, body.consent ? 'recruiting-voice-consent' : 'recruiting-voice-consent-revoked', ctx.interview.id);
      }
      send(res, 200, response(ctx, false));
    } catch (error) { send(res, error.statusCode || 400, { error:error.code?.startsWith('INTERVIEW_') ? error.message : 'AI 面试请求无效', code:error.code || 'INTERVIEW_VOICE_VALIDATION' }); }
    return true;
  }
  async function handleAdmin(req, res, url, actor) {
    const match = url.pathname.match(/^\/api\/recruiting\/interviews\/([A-Za-z0-9_-]+)\/video-(voice|speech|followup|answer)$/);
    if (!match) return false;
    try {
      if (!canAccess(actor, 'recruitingView')) reject('FORBIDDEN', '没有 AI 面试访问权限', 403);
      if (req.method !== 'POST') reject('METHOD', '此操作不支持', 405);
      const body = await readVoiceBody(req), [, interviewId, action] = match;
      let ctx = context(readDb(), interviewId);
      freshActor(ctx.db, actor, action !== 'voice' || body.operation !== 'status');
      if (action === 'voice') {
        fields(body, ['participantSessionId','operation','turnId','candidateIdentity']);
        const operation = body.operation;
        if (operation === 'status') { send(res, 200, response(ctx)); return true; }
        if (operation === 'claim') {
          if (!configured()) reject('NOT_CONFIGURED', 'AI 语音服务尚未配置', 503);
          if (typeof body.participantSessionId !== 'string') reject('VALIDATION', '缺少页面会话标识', 400);
          const identity = interviewerIdentity(actor, body), active = stateFor(ctx.interview, ctx.invite);
          if (active.controllerIdentity && active.controllerIdentity !== identity) reject('CONTROLLER_BUSY', '另一位面试官正在控制 AI，不能抢占控制权');
          if (!active.controllerIdentity) { invalidate(ctx.state); Object.assign(ctx.state, { controllerIdentity:identity, controllerName:actor.name || 'Interviewer', controllerUserId:actor.id, inviteId:ctx.invite.id }); }
          ctx.state.leaseExpiresAt = new Date(Date.now() + LEASE_MS).toISOString();
        } else {
          controller(ctx, actor, body, !['heartbeat','release','interrupted','stop-recording'].includes(operation));
          if (operation === 'heartbeat') ctx.state.leaseExpiresAt = new Date(Date.now() + LEASE_MS).toISOString();
          else if (operation === 'release') { invalidate(ctx.state); ctx.state.leaseExpiresAt = ''; ctx.state.controllerIdentity = ''; ctx.state.controllerUserId = ''; ctx.state.controllerName = ''; }
          else if (operation === 'interrupted') {
            // Stop can arrive while the speech response (including turnId) is still pending.
            if (body.turnId !== undefined) currentTurn(ctx, body.turnId);
            invalidate(ctx.state);
          } else {
            const turn = currentTurn(ctx, body.turnId);
            if (operation === 'speaking' && turn.phase === 'ready') {
              turn.phase = 'speaking'; turn.spokenAt = new Date().toISOString();
              ctx.interview.aiInterview.transcript ||= [];
              ctx.interview.aiInterview.transcript.push({ id:`voice-question-${turn.id}`, speaker:'assistant', speakerName:'QUAD AI Interview Assistant', participantIdentity:ctx.state.controllerIdentity,
                text:turn.questionText, language:'en', source:'openai_speech', turnId:turn.id, questionId:turn.questionId, kitId:turn.kitId, createdAt:turn.spokenAt });
              ctx.interview.aiInterview.transcript = ctx.interview.aiInterview.transcript.slice(-1000);
            } else if (operation === 'waiting' && turn.phase === 'speaking') turn.phase = 'waiting';
            else if (operation === 'recording' && turn.phase === 'waiting') {
              if (body.candidateIdentity !== `candidate-${ctx.invite.id}`) reject('TURN_INVALID', '候选人音轨与当前面试不符');
              turn.phase = 'recording'; ctx.state.recording = true; ctx.state.capture = { turnId:turn.id, candidateIdentity:body.candidateIdentity, startedAt:new Date().toISOString() };
            } else if (operation === 'stop-recording' && turn.phase === 'recording') { turn.phase = 'captured'; ctx.state.recording = false; ctx.state.capture.stoppedAt = new Date().toISOString(); }
            else reject('TURN_INVALID', '当前题目阶段不支持此操作');
          }
        }
        save(ctx.db, `recruiting-voice-${operation}`, interviewId); send(res, 200, response(ctx)); return true;
      }
      controller(ctx, actor, body);
      if (!configured()) reject('NOT_CONFIGURED', 'AI 语音服务尚未配置', 503);
      if (action === 'followup') {
        fields(body, ['participantSessionId','text']);
        if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000) reject('VALIDATION', '追问须为 1–2000 字符', 400);
        const guard = guardFor(ctx, actor, body);
        if (!/\p{Script=Han}/u.test(body.text)) { send(res, 200, { text:english(body.text) }); return true; }
        const now = Date.now();
        if (followupInFlight.has(interviewId) || (ctx.state.followupPending && Date.parse(ctx.state.followupPending.expiresAt) > now)) reject('BUSY', '上一条追问仍在翻译，请等待结果');
        const recent = (ctx.state.followupRequests || []).filter(timestamp => Number.isFinite(timestamp) && timestamp > now - 60000);
        if (recent.length >= 6) reject('RATE_LIMIT', '追问翻译过于频繁，请稍后再试', 429);
        const followupId = uid();
        ctx.state.followupRequests = [...recent, now];
        ctx.state.followupPending = { id:followupId, expiresAt:new Date(now + 45000).toISOString() };
        save(ctx.db, 'recruiting-voice-followup-started', interviewId);
        let translated, timer;
        const providerWork = Promise.resolve().then(() => translateVoiceText?.({ text:body.text, targetLanguage:'en' }));
        followupInFlight.set(interviewId, followupId);
        const clearFlight = () => { if (followupInFlight.get(interviewId) === followupId) followupInFlight.delete(interviewId); };
        providerWork.then(clearFlight, clearFlight);
        try {
          translated = await Promise.race([
            providerWork,
            new Promise((_, rejectTimeout) => { timer = setTimeout(() => rejectTimeout(safeProviderError({ code:'INTERVIEW_VOICE_PROVIDER_TIMEOUT' })), 30000); })
          ]);
          english(translated?.text);
        } catch (error) {
          try { const latest = after(guard); if (latest.state.followupPending?.id === followupId) { latest.state.followupPending = null; save(latest.db, 'recruiting-voice-followup-failed', interviewId); } } catch {}
          throw safeProviderError(error);
        } finally { clearTimeout(timer); }
        ctx = after(guard);
        if (ctx.state.followupPending?.id !== followupId) reject('RESULT_STALE', '本条追问已停止，已丢弃过期译文');
        ctx.state.followupPending = null; save(ctx.db, 'recruiting-voice-followup-ready', interviewId);
        send(res, 200, { text:english(translated.text) }); return true;
      }
      if (action === 'speech') {
        fields(body, ['participantSessionId','requestId','text','questionId','kitId']);
        const text = english(body.text), id = requestId(body);
        const questionId = body.questionId || '', kitId = body.kitId || '';
        if (typeof questionId !== 'string' || typeof kitId !== 'string' || questionId.length > 100 || kitId.length > 100 || ((questionId || kitId) && !INTERVIEW_KITS.find(kit => kit.id === kitId)?.questions.some(question => question.id === questionId))) reject('VALIDATION', '题库或题目编号无效', 400);
        const fingerprint = hash(JSON.stringify([text, questionId, kitId])), previous = requestRecord(ctx.state, 'speech', id, fingerprint);
        if (previous) { send(res, 200, { duplicate:true, turnId:previous.turnId, ...requestState(previous), ...response(ctx) }); return true; }
        ensureIdle(ctx.state);
        const turn = { id:uid(), questionText:text, questionId, kitId, phase:'preparing', createdAt:new Date().toISOString() };
        addRequest(ctx.state, { kind:'speech', id, fingerprint, turnId:turn.id }); ctx.state.currentTurn = turn; ctx.state.capture = null;
        const guard = guardFor(ctx, actor, body); save(ctx.db, 'recruiting-voice-speech-preparing', interviewId);
        let audio;
        try { audio = await voiceProvider.speech({ text }); decodeAudio(audio?.audioBase64); if (audio?.mimeType !== 'audio/mpeg') throw safeProviderError({ code:'INTERVIEW_VOICE_PROVIDER_INVALID' }); }
        catch (error) { throw saveFailure(guard, id, error); }
        ctx = after(guard, 'preparing'); ctx.state.currentTurn.phase = 'ready'; ctx.state.requests.find(row => row.id === id).status = 'complete';
        save(ctx.db, 'recruiting-voice-speech-ready', interviewId);
        send(res, 200, { audioBase64:audio.audioBase64, mimeType:'audio/mpeg', turnId:turn.id, requestStatus:'complete', ...response(ctx) }); return true;
      }
      fields(body, ['participantSessionId','turnId','requestId','audioBase64','mimeType','durationMs','candidateIdentity']);
      const id = requestId(body), type = audioType(body.mimeType), audio = decodeAudio(body.audioBase64);
      if (!AUDIO_TYPES.has(type) || !Number.isInteger(body.durationMs) || body.durationMs < 1 || body.durationMs > MAX_DURATION_MS) reject('VALIDATION', '回答音频须不超过两分钟且格式有效', 400);
      const fingerprint = hash(JSON.stringify([body.turnId, type, body.durationMs, body.candidateIdentity, hash(audio)]));
      const previous = requestRecord(ctx.state, 'answer', id, fingerprint);
      if (previous) { const row = ctx.interview.aiInterview.transcript?.find(item => item.id === previous.rowId); send(res, 200, { duplicate:true, ...requestState(previous), ...(row ? { row } : {}), ...response(ctx) }); return true; }
      const turn = currentTurn(ctx, body.turnId), capture = ctx.state.capture;
      if (!['recording','captured'].includes(turn.phase) || !capture || capture.turnId !== turn.id || body.candidateIdentity !== `candidate-${ctx.invite.id}` || body.candidateIdentity !== capture.candidateIdentity) reject('TURN_INVALID', '请先为当前候选人、当前题目开始录制回答');
      if (Date.now() - Date.parse(capture.startedAt) > MAX_DURATION_MS + 30000) reject('TURN_INVALID', '回答录制已过期，请重新开始本题');
      addRequest(ctx.state, { kind:'answer', id, fingerprint, turnId:turn.id }); ctx.state.recording = false; turn.phase = 'transcribing';
      const guard = guardFor(ctx, actor, body); save(ctx.db, 'recruiting-voice-answer-processing', interviewId);
      let transcription;
      try { transcription = await voiceProvider.transcribe({ audio, mimeType:type }); english(transcription?.text, 12000); }
      catch (error) { throw saveFailure(guard, id, error); }
      ctx = after(guard, 'transcribing');
      const row = { id:`voice-answer-${uid()}`, speaker:'candidate', speakerName:ctx.candidate.name || 'Candidate', participantIdentity:`candidate-${ctx.invite.id}`,
        text:transcription.text.trim(), language:'en', translationZh:'', source:'openai_audio', turnId:turn.id, questionText:turn.questionText, questionId:turn.questionId, kitId:turn.kitId, createdAt:new Date().toISOString() };
      ctx.interview.aiInterview.transcript ||= []; ctx.interview.aiInterview.transcript.push(row); ctx.interview.aiInterview.transcript = ctx.interview.aiInterview.transcript.slice(-1000);
      ctx.state.requests.find(item => item.id === id).rowId = row.id;
      save(ctx.db, 'recruiting-voice-answer-original-saved', interviewId);
      let translated, translationError = '';
      try { translated = await translateVoiceText?.({ text:row.text, targetLanguage:'zh' }); if (typeof translated?.text !== 'string' || !translated.text.trim() || translated.text.length > 24000) throw new Error(); }
      catch { translationError = 'INTERVIEW_VOICE_TRANSLATION_FAILED'; }
      ctx = after(guard, 'transcribing');
      const savedRow = ctx.interview.aiInterview.transcript.find(item => item.id === row.id);
      if (!savedRow) reject('RESULT_STALE', '转写记录已改变，已丢弃过期翻译');
      if (translationError) savedRow.translationError = translationError; else savedRow.translationZh = translated.text.trim();
      ctx.state.requests.find(item => item.id === id).status = 'complete'; ctx.state.currentTurn.phase = 'answered'; ctx.state.capture = null;
      save(ctx.db, 'recruiting-voice-answer-ready', interviewId); send(res, 201, { row:savedRow, requestStatus:'complete', ...response(ctx) });
    } catch (error) { send(res, error.statusCode || 400, { error:error.code?.startsWith('INTERVIEW_') ? error.message : 'AI 面试请求无效', code:error.code || 'INTERVIEW_VOICE_VALIDATION' }); }
    return true;
  }
  return { handleAdmin, handlePublic, stateFor };
}

module.exports = { createRecruitingVoiceProvider, createRecruitingVoiceService, consented, VOICE_NOTICE_VERSION, LEASE_MS, MAX_AUDIO_BYTES, MAX_DURATION_MS };
