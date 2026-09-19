'use strict';

// Recruiting records deliberately stay out of customer collections and bootstrap.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createRecruitingTranslation, HAN_TEXT } = require('./recruiting-translation');
const { INTERVIEW_KITS, INTERVIEW_KIT_MAP } = require('./recruiting-interview-kits');

const TIME_ZONE = 'America/Los_Angeles';
const ADDRESS = '3212 Santa Monica Blvd, Santa Monica, CA 90404';
const CANDIDATE_STATUSES = ['new', 'reviewing', 'contacted', 'invited', 'confirmed', 'interviewed', 'on_hold', 'hired', 'not_suitable'];
const INTERVIEW_STATUSES = ['scheduled', 'confirmed', 'arrived', 'completed', 'cancelled', 'no_show'];
const SCORE_KEYS = ['sales', 'dealershipNetwork', 'plan', 'communication', 'execution', 'fit'];
const TEXT_FIELDS = { name:160, phone:40, email:254, source:100, position:160, location:240, experience:8000, dealershipResources:8000, availability:2000, employmentType:100, compensation:2000, notes:8000, resumeText:60000, resumeUrl:2000, scoreNotes:8000, smsConsentNote:2000, applicationDateNote:1000 };
const CANDIDATE_FIELDS = new Set([...Object.keys(TEXT_FIELDS), 'status', 'scores', 'smsConsent', 'appliedAt']);
const INTERVIEW_FIELDS = new Set(['candidateId', 'startsAt', 'durationMinutes', 'timeZone', 'mode', 'address', 'interviewerId', 'interviewerName', 'status', 'notes', 'automaticReminders']);
const STOP_WORDS = /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|REVOKE|OPTOUT)$/i;
const STATUS_ORDER = { pending:0, send_unknown:0, accepted:1, scheduled:1, queued:2, sending:3, sent:4, delivered:5, read:6, failed:7, undelivered:7, canceled:7 };

function uid() { return crypto.randomBytes(16).toString('hex'); }
function fail(status, message, code) { const error = new Error(message); error.statusCode = status; error.code = code || 'RECRUITING_VALIDATION'; throw error; }
function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function validateFields(body, allowed) {
  if (!plain(body)) fail(400, '请提交有效的表单');
  const unexpected = Object.keys(body).filter(key => !allowed.has(key));
  if (unexpected.length) fail(400, `不支持这些字段：${unexpected.join(', ')}`);
}
function text(value, limit, label) {
  if (typeof value !== 'string') fail(400, `${label}格式不正确`);
  const result = value.trim();
  if (result.length > limit) fail(400, `${label}不能超过 ${limit} 个字符`);
  return result;
}
function phoneKey(value) {
  const raw = String(value || '').trim();
  if (!raw || !/^[+()\d\s.-]+$/.test(raw)) return '';
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 ? digits : digits.length === 11 && digits[0] === '1' ? digits.slice(1) : '';
}
function ensure(db) {
  for (const key of ['recruitingCandidates', 'recruitingInterviews', 'recruitingAudit', 'recruitingQuarantine']) if (!Array.isArray(db[key])) db[key] = [];
  return db;
}
function candidateById(db, id) {
  const item = ensure(db).recruitingCandidates.find(row => row.id === id);
  if (!item) fail(404, '没有找到应聘者', 'CANDIDATE_NOT_FOUND');
  return item;
}
function candidatesByPhone(db, phone) {
  const key = phoneKey(phone);
  return key ? (db.recruitingCandidates || []).filter(row => phoneKey(row.phone) === key) : [];
}
function hasCandidatePhone(db, phone) { return candidatesByPhone(db, phone).length > 0; }
function customerPhoneConflict(db, phone) {
  const key = phoneKey(phone);
  return key && ['customerConversations', 'prospects', 'portalCustomers', 'jobs'].some(collection =>
    (db[collection] || []).some(row => phoneKey(row.phone || row.contactPhone || row.customerPhone) === key));
}
function privateAudit(db, actor, action, recordId, at = new Date().toISOString()) {
  ensure(db).recruitingAudit.unshift({ id:uid(), at, userId:actor?.id || 'system', userName:actor?.name || 'System', action, recordId });
  db.recruitingAudit = db.recruitingAudit.slice(0, 3000);
}
function actorFields(actor, at, existing) {
  return { createdAt:existing?.createdAt || at, createdByUserId:existing?.createdByUserId || actor.id,
    createdBy:existing?.createdBy || actor.name || actor.email || '', updatedAt:at, updatedByUserId:actor.id, updatedBy:actor.name || actor.email || '' };
}
function normalizeAppliedAt(value, now) {
  if (value === '') return '';
  if (typeof value !== 'string') fail(400, '申请时间格式不正确', 'APPLICATION_DATE_INVALID');
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(400, '申请日期不存在', 'APPLICATION_DATE_INVALID');
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone:TIME_ZONE, year:'numeric', month:'2-digit', day:'2-digit' })
      .formatToParts(new Date(now)).map(part => [part.type, part.value]));
    const today = `${parts.year}-${parts.month}-${parts.day}`;
    if (value > today) fail(400, '申请日期不能晚于洛杉矶今天的日期', 'APPLICATION_DATE_FUTURE');
    return value;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    fail(400, '申请时间须为 YYYY-MM-DD，或带 Z 的完整 UTC 时间', 'APPLICATION_DATE_INVALID');
  }
  const parsed = new Date(value);
  const canonical = value.includes('.') ? value.replace(/\.(\d{1,3})Z$/, (_, digits) => `.${digits.padEnd(3, '0')}Z`) : value.replace(/Z$/, '.000Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== canonical) fail(400, '申请时间不存在', 'APPLICATION_DATE_INVALID');
  if (parsed.getTime() > Date.parse(now)) fail(400, '申请时间不能晚于当前时间', 'APPLICATION_DATE_FUTURE');
  return canonical;
}
function normalizeCandidate(db, body, actor, existing = null) {
  validateFields(body, CANDIDATE_FIELDS);
  const now = new Date(Date.now()).toISOString();
  const item = existing ? { ...existing } : { id:uid(), status:'new', scores:Object.fromEntries(SCORE_KEYS.map(key => [key, null])), interviewScorecards:[], smsConsent:false, smsConsentNote:'', smsOptedOut:false, messages:[] };
  for (const [key, limit] of Object.entries(TEXT_FIELDS)) {
    if (Object.hasOwn(body, key)) item[key] = text(body[key], limit, key);
    else if (!existing) item[key] = '';
  }
  // An application date is verified source data, never inferred from import
  // timestamps or free-text notes. Omitted legacy fields remain absent.
  if (Object.hasOwn(body, 'appliedAt')) item.appliedAt = normalizeAppliedAt(body.appliedAt, now);
  else if (!existing) item.appliedAt = '';
  if (item.appliedAt && !item.applicationDateNote?.trim()) fail(400, '请填写可核实的申请时间来源说明', 'APPLICATION_DATE_SOURCE_REQUIRED');
  if (!item.name) fail(400, '请填写应聘者姓名');
  if (item.phone && !phoneKey(item.phone)) fail(400, '请填写有效的美国 10 位电话号码');
  if (item.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email)) fail(400, '邮箱格式不正确');
  item.email = item.email.toLowerCase();
  if (item.resumeUrl) {
    let parsed; try { parsed = new URL(item.resumeUrl); } catch { fail(400, '简历链接格式不正确'); }
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) fail(400, '简历链接只能使用 http 或 https');
  }
  if (Object.hasOwn(body, 'status')) {
    if (!CANDIDATE_STATUSES.includes(body.status)) fail(400, '应聘者状态不正确');
    item.status = body.status;
  }
  if (Object.hasOwn(body, 'scores')) {
    validateFields(body.scores, new Set(SCORE_KEYS));
    item.scores = { ...item.scores };
    for (const [key, input] of Object.entries(body.scores)) {
      const value = input === '' ? null : input;
      if (value !== null && (!Number.isInteger(value) || value < 1 || value > 10)) fail(400, '评分须为 1–10 的整数或留空');
      item.scores[key] = value;
    }
  }
  if (Object.hasOwn(body, 'smsConsent')) {
    if (typeof body.smsConsent !== 'boolean') fail(400, '短信授权格式不正确');
    item.smsConsent = body.smsConsent;
    if (item.smsConsent && !item.smsConsentNote) fail(400, '请注明应聘者同意接收招聘短信的依据');
    if (item.smsConsent && !existing?.smsConsent) item.smsConsentAt = now;
  }
  if (item.smsConsent && !item.smsConsentNote) fail(400, '短信授权已开启，请保留授权依据或关闭短信授权');
  if (existing && phoneKey(existing.phone) !== phoneKey(item.phone) && (existing.messages || []).length) fail(409, '此电话已有招聘沟通记录，请保留原号码并联系管理员核实', 'PHONE_HAS_MESSAGES');
  if (existing && phoneKey(existing.phone) !== phoneKey(item.phone)) {
    item.smsConsent = false; item.smsConsentNote = ''; item.smsConsentAt = '';
  }
  const duplicate = ensure(db).recruitingCandidates.find(row => row.id !== item.id &&
    ((phoneKey(item.phone) && phoneKey(row.phone) === phoneKey(item.phone)) || (item.email && String(row.email || '').toLowerCase() === item.email)));
  if (duplicate) fail(409, `电话或邮箱已属于应聘者 ${duplicate.name}，请编辑已有档案`, 'DUPLICATE_CANDIDATE');
  return { ...item, ...actorFields(actor, now, existing) };
}
function normalizeInterviewScorecard(body, actor, existing = null) {
  validateFields(body, new Set(['templateId', 'scores', 'notes', 'overallNote']));
  const templateId = text(body.templateId, 100, '题库模板');
  const kit = INTERVIEW_KIT_MAP.get(templateId);
  if (!kit) fail(400, '请选择有效的面试题库', 'INTERVIEW_KIT_INVALID');
  const allowed = new Set(kit.questions.map(question => question.id));
  const incomingScores = body.scores ?? {};
  const incomingNotes = body.notes ?? {};
  validateFields(incomingScores, allowed);
  validateFields(incomingNotes, allowed);
  const scores = {}, notes = {};
  for (const question of kit.questions) {
    const raw = Object.hasOwn(incomingScores, question.id) ? incomingScores[question.id] : null;
    const score = raw === '' || raw === null || raw === undefined ? null : raw;
    if (score !== null && (!Number.isInteger(score) || score < 1 || score > 10)) fail(400, '每道题评分须为 1–10 的整数或留空', 'INTERVIEW_SCORE_INVALID');
    scores[question.id] = score;
    notes[question.id] = text(String(incomingNotes[question.id] ?? ''), 1200, '题目记录');
  }
  const now = new Date().toISOString();
  return {
    id:existing?.id || uid(), templateId, scores, notes,
    overallNote:text(String(body.overallNote ?? ''), 8000, '总体面试记录'),
    ...actorFields(actor, now, existing)
  };
}
function normalizeInterview(db, body, actor, existing = null) {
  validateFields(body, INTERVIEW_FIELDS);
  const item = { id:uid(), durationMinutes:30, timeZone:TIME_ZONE, mode:'in_person', address:ADDRESS, status:'scheduled', interviewerId:'', interviewerName:'', notes:'', automaticReminders:false, ...(existing || {}) };
  if (Object.hasOwn(body, 'mode')) item.mode = body.mode;
  if (!['online', 'in_person'].includes(item.mode)) fail(400, '面试方式须为线上视频或到店面试', 'INTERVIEW_MODE_INVALID');
  if (!existing && item.mode === 'online' && !Object.hasOwn(body, 'address')) item.address = '';
  for (const field of ['candidateId', 'startsAt', 'timeZone', 'address', 'interviewerId', 'interviewerName', 'status', 'notes']) if (Object.hasOwn(body, field)) item[field] = text(body[field], field === 'notes' ? 8000 : 500, field);
  candidateById(db, item.candidateId);
  if (item.timeZone !== TIME_ZONE) fail(400, '面试时区必须为洛杉矶时间');
  // Only explicit UTC instants are accepted. Local DST gaps/duplicates must be resolved by the UI.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(item.startsAt || '') || !Number.isFinite(Date.parse(item.startsAt))) fail(400, '面试时间须为带 Z 的有效 UTC 时间');
  const instant = new Date(item.startsAt);
  if (instant.toISOString().replace('.000Z', 'Z') !== item.startsAt.replace('.000Z', 'Z')) fail(400, '面试日期不存在');
  item.startsAt = instant.toISOString();
  if ((!existing || item.startsAt !== existing.startsAt) && instant.getTime() <= Date.now()) fail(400, '请安排未来的面试时间');
  if (Object.hasOwn(body, 'durationMinutes')) item.durationMinutes = body.durationMinutes;
  if (!Number.isInteger(item.durationMinutes) || item.durationMinutes < 15 || item.durationMinutes > 180) fail(400, '面试时长须为 15–180 分钟');
  if (!INTERVIEW_STATUSES.includes(item.status)) fail(400, '面试状态不正确');
  if (item.mode === 'in_person' && !item.address) fail(400, '请填写面试地址');
  if (Object.hasOwn(body, 'automaticReminders')) {
    if (typeof body.automaticReminders !== 'boolean') fail(400, '提醒设置格式不正确');
    item.automaticReminders = body.automaticReminders;
    if (item.automaticReminders) {
      const candidate = candidateById(db, item.candidateId);
      if (item.status !== 'confirmed') fail(400, '请先确认候选人同意预约，再开启自动提醒');
      if (!candidate.smsConsent || !candidate.smsConsentNote || candidate.smsOptedOut) fail(409, '自动提醒需要有效的短信授权且候选人没有退订', 'SMS_CONSENT_REQUIRED');
    }
  }
  if (item.status !== 'confirmed') item.automaticReminders = false;
  if (item.interviewerId) {
    const interviewer = (db.users || []).find(row => row.id === item.interviewerId && row.active !== false);
    if (!interviewer) fail(400, '请选择有效的面试官');
    item.interviewerName = interviewer.name || interviewer.email;
  }
  if (!item.interviewerId && !item.interviewerName) { item.interviewerId = actor.id; item.interviewerName = actor.name || actor.email || ''; }
  if (!['cancelled', 'no_show', 'completed'].includes(item.status)) {
    const endsAt = instant.getTime() + item.durationMinutes * 60000;
    const conflict = ensure(db).recruitingInterviews.find(other => other.id !== item.id && !['cancelled', 'no_show', 'completed'].includes(other.status)
      && (other.candidateId === item.candidateId || (item.interviewerId && other.interviewerId === item.interviewerId)
        || (item.interviewerName && String(other.interviewerName || '').toLowerCase() === item.interviewerName.toLowerCase()))
      && Date.parse(other.startsAt) < endsAt && Date.parse(other.startsAt) + other.durationMinutes * 60000 > instant.getTime());
    if (conflict) fail(409, '该应聘者或面试官在这个时间已有面试，请调整时间', 'INTERVIEW_CONFLICT');
  }
  return { ...item, ...actorFields(actor, new Date().toISOString(), existing) };
}
function advanceStatus(message, status, code, at) {
  if (Object.hasOwn(STATUS_ORDER, status) && (STATUS_ORDER[status] >= (STATUS_ORDER[message.status] ?? -1))) message.status = status;
  message.statusUpdatedAt = at;
  if (code) message.errorCode = String(code).slice(0, 80);
}
function updateSmsOptState(candidate, optedOut, at) {
  const eventTime = value => { const time = Date.parse(value || ''); return Number.isFinite(time) ? time : -Infinity; };
  const stateTime = eventTime(candidate.smsOptStateAt);
  const stopTime = eventTime(candidate.smsOptedOutAt);
  const startTime = eventTime(candidate.smsOptedInAt);
  const latestTime = Math.max(stateTime, stopTime, startTime);
  // Old records only have the individual START/STOP timestamps. Recover their
  // newest state as well, so an old START cannot undo a newer known STOP.
  if (Number.isFinite(latestTime)) {
    if (stopTime === latestTime) candidate.smsOptedOut = true;
    else if (startTime === latestTime) candidate.smsOptedOut = false;
  }
  const incomingTime = eventTime(at);
  if (incomingTime < latestTime || (incomingTime === latestTime && !optedOut && candidate.smsOptedOut)) return;
  candidate.smsOptedOut = optedOut;
  candidate.smsOptStateAt = at;
  candidate[optedOut ? 'smsOptedOutAt' : 'smsOptedInAt'] = at;
}
function ingestInbound(db, params) {
  ensure(db);
  const matches = candidatesByPhone(db, params.From || params.from);
  if (!matches.length) return { handled:false, added:false };
  const sid = String(params.MessageSid || params.SmsMessageSid || params.sid || '');
  const body = String(params.Body || params.body || '').trim().slice(0, 4000);
  if (!body && !Number(params.NumMedia || params.num_media || 0) && !params.OptOutType) return { handled:true, added:false };
  const timestamp = new Date(params.DateSent || params.date_sent || params.date_created || Date.now());
  const at = Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : new Date().toISOString();
  const duplicate = sid && (db.recruitingCandidates.some(row => (row.messages || []).some(message => message.providerSid === sid)) || db.recruitingQuarantine.some(message => message.providerSid === sid));
  if (duplicate) return { handled:true, added:false };
  for (const item of matches) {
    if (STOP_WORDS.test(body) || String(params.OptOutType || '').toUpperCase() === 'STOP') updateSmsOptState(item, true, at);
    else if (/^(START|UNSTOP)$/i.test(body) || String(params.OptOutType || '').toUpperCase() === 'START') updateSmsOptState(item, false, at);
  }
  const message = { id:uid(), direction:'inbound', text:body || (Number(params.NumMedia || params.num_media || 0) ? '[应聘者发送了附件，请在短信平台查看]' : ''), timestamp:at, status:'received', providerSid:sid,
    from:String(params.From || params.from || ''), mediaCount:Number(params.NumMedia || params.num_media || 0) };
  if (matches.length !== 1 || customerPhoneConflict(db, params.From || params.from)) {
    db.recruitingQuarantine.unshift({ ...message, candidateIds:matches.map(row => row.id), reason:'shared_phone' });
    privateAudit(db, null, 'quarantine-recruiting-inbound', message.id);
  } else {
    const candidate = matches[0];
    candidate.messages = [...(candidate.messages || []), message]; candidate.updatedAt = at;
    privateAudit(db, null, 'receive-recruiting-sms', candidate.id);
  }
  return { handled:true, added:true };
}
function ingestStatus(db, params, query) {
  ensure(db);
  const sid = String(params.MessageSid || '').trim();
  if (!sid) return false;
  let found;
  for (const candidate of db.recruitingCandidates) {
    const message = (candidate.messages || []).find(row => row.direction === 'outbound' && row.providerSid === sid);
    if (message) { found = { candidate, message }; break; }
  }
  // The signed callback may arrive before the provider send response.
  if (!found && query?.get('recruitingMessageId')) {
    const candidate = db.recruitingCandidates.find(row => row.id === query.get('candidateId'));
    const message = (candidate?.messages || []).find(row => row.id === query.get('recruitingMessageId') && row.direction === 'outbound');
    if (message && (!message.providerSid || message.providerSid === sid) && phoneKey(params.To) === phoneKey(message.to)) found = { candidate, message };
  }
  if (!found) return false;
  found.message.providerSid = sid;
  const at = new Date().toISOString();
  advanceStatus(found.message, String(params.MessageStatus || params.SmsStatus || ''), params.ErrorCode, at);
  if (String(params.ErrorCode || '') === '21610') updateSmsOptState(found.candidate, true, at);
  found.candidate.updatedAt = at;
  return true;
}

function createRecruitingService(deps) {
  const { readDb, writeDb, canAccess, readBody, send, sendSms, smsConfigured, publicBaseUrl, dataDir, notify } = deps;
  const translation = createRecruitingTranslation(deps);
  const resumeDir = path.join(dataDir, 'recruiting-resumes');
  const remindersEnabled = () => process.env.RECRUITING_REMINDERS_ENABLED !== 'false';
  function changed(db, actor, action, recordId) {
    privateAudit(db, actor, action, recordId); writeDb(db);
    const recipients = (db.users || []).filter(user => user.active !== false && canAccess(user, 'recruitingView')).map(user => user.id);
    if (recipients.length) notify(action, recordId, recipients);
  }
  function snapshot(db) {
    ensure(db);
    return { candidates:db.recruitingCandidates, interviews:db.recruitingInterviews.map(interview => ({ ...interview, mode:interview.mode || 'in_person' })), interviewKits:INTERVIEW_KITS,
      settings:{ address:ADDRESS, timeZone:TIME_ZONE, remindersEnabled:remindersEnabled(), preview:process.env.RECRUITING_PREVIEW === 'true' },
      sms:{ configured:smsConfigured() }, translation:{ configured:translation.configured() }, quarantine:db.recruitingQuarantine,
      interviewers:(db.users || []).filter(user => user.active !== false && canAccess(user, 'recruitingView')).map(user => ({ id:user.id, name:user.name || user.email })) };
  }
  async function sendCandidateMessage(candidateId, body, actor, callbackBase = '', reminder = null) {
    validateFields(body, new Set(['text', 'clientMessageId', 'expectedPhone']));
    const messageText = text(body.text, 1600, '短信内容');
    if (!messageText) fail(400, '短信内容不能为空');
    if (HAN_TEXT.test(messageText)) fail(400, '招聘短信须使用英文，请先生成并确认英文内容后再发送', 'SMS_ENGLISH_REQUIRED');
    if (typeof body.clientMessageId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(body.clientMessageId)) fail(400, '缺少有效的发送编号，请刷新后重试');
    const hasExpectedPhone = Object.hasOwn(body, 'expectedPhone');
    const expectedPhone = hasExpectedPhone ? text(body.expectedPhone, 40, '确认收件号码') : '';
    let db = ensure(readDb());
    const candidate = candidateById(db, candidateId);
    // Bind a reviewed draft to its displayed recipient, not a newer background
    // profile value. Legacy callers and server reminders may omit this guard.
    if (hasExpectedPhone && (!phoneKey(expectedPhone) || phoneKey(expectedPhone) !== phoneKey(candidate.phone))) {
      fail(409, '应聘者手机号已变更，请重新核对收件号码并确认英文短信后再发送', 'SMS_RECIPIENT_CHANGED');
    }
    if (reminder) {
      const appointment = db.recruitingInterviews.find(row => row.id === reminder.interviewId);
      if (!appointment || appointment.candidateId !== candidateId || !appointment.automaticReminders
          || appointment.status !== 'confirmed' || appointment.startsAt !== reminder.expectedStartsAt
          || (reminder.expectedMode && (appointment.mode || 'in_person') !== reminder.expectedMode)
          || (Object.hasOwn(reminder, 'expectedAddress') && appointment.address !== reminder.expectedAddress)
          || Date.parse(appointment.startsAt) <= Date.now()) fail(409, '面试安排已变更，取消此次提醒', 'REMINDER_CHANGED');
    }
    const existing = (candidate.messages || []).find(row => row.direction === 'outbound' && row.clientMessageId === body.clientMessageId);
    if (existing) {
      if (existing.text !== messageText) fail(409, '该发送编号已用于其他短信，请刷新后重试', 'MESSAGE_ID_CONFLICT');
      return { message:existing, duplicate:true };
    }
    if (!smsConfigured()) fail(503, '短信平台尚未配置，暂时不能发送', 'SMS_NOT_CONFIGURED');
    const key = phoneKey(candidate.phone);
    if (!key) fail(400, '请先填写有效的美国电话号码');
    if (!candidate.smsConsent || !candidate.smsConsentNote) fail(409, '请先记录应聘者同意接收招聘短信的依据', 'SMS_CONSENT_REQUIRED');
    if (candidate.smsOptedOut) fail(409, '应聘者已退订短信，请改用邮件联系', 'SMS_OPTED_OUT');
    if (customerPhoneConflict(db, candidate.phone)) fail(409, '该号码也在客户资料中。请先核实并处理旧客户记录，避免将招聘短信与客户对话混在一起', 'PHONE_CUSTOMER_CONFLICT');
    if (candidatesByPhone(db, candidate.phone).length !== 1) fail(409, '该电话号码属于多个档案，请先核实', 'PHONE_AMBIGUOUS');
    const recent = (candidate.messages || []).find(row => row.direction === 'outbound' && row.text === messageText && row.to === `+1${key}`
      && (['pending', 'send_unknown'].includes(row.status) || (!['failed', 'undelivered', 'canceled'].includes(row.status) && Date.now() - Date.parse(row.timestamp) < 2 * 60000)));
    if (recent) return { message:recent, duplicate:true };
    const now = new Date().toISOString();
    const message = { id:uid(), clientMessageId:body.clientMessageId, direction:'outbound', text:messageText, timestamp:now, status:'pending', providerSid:'',
      to:`+1${key}`, createdByUserId:actor.id, createdBy:actor.name || actor.email || '', ...(reminder ? { reminder } : {}) };
    candidate.messages = [...(candidate.messages || []), message]; candidate.updatedAt = now;
    changed(db, actor, 'send-recruiting-sms-pending', candidate.id);
    try {
      const callback = callbackBase ? `${callbackBase}/api/twilio/status?candidateId=${encodeURIComponent(candidate.id)}&recruitingMessageId=${encodeURIComponent(message.id)}` : '';
      const result = await sendSms({ to:message.to, body:message.text, statusCallback:callback, purpose:'recruiting' });
      db = ensure(readDb());
      const latest = candidateById(db, candidateId);
      const saved = latest.messages.find(row => row.id === message.id);
      if (!result?.sid) { const error = new Error('短信平台返回状态不明确，请核查发送记录，系统不会自动重发'); error.sendUncertain = true; throw error; }
      saved.providerSid = String(result.sid);
      advanceStatus(saved, String(result.status || 'queued'), result.error_code, new Date().toISOString());
      latest.updatedAt = new Date().toISOString();
      changed(db, actor, 'send-recruiting-sms', candidateId);
      return { message:saved, duplicate:false };
    } catch (error) {
      db = ensure(readDb());
      const latest = candidateById(db, candidateId);
      const saved = latest.messages.find(row => row.id === message.id);
      if (saved.providerSid && ['accepted', 'queued', 'sending', 'sent', 'delivered', 'read'].includes(saved.status)) return { message:saved, duplicate:false };
      if (!saved.providerSid) saved.status = error.providerRejected ? 'failed' : 'send_unknown';
      saved.errorCode = String(error.providerCode || (error.providerRejected ? 'PROVIDER_REJECTED' : 'SEND_UNCERTAIN'));
      saved.error = error.providerRejected ? '短信平台拒绝发送，请核对号码或账户配置' : '发送结果尚未确认，请核查平台记录；重复点击不会再次发送';
      if (saved.errorCode === '21610') updateSmsOptState(latest, true, new Date().toISOString());
      changed(db, actor, 'send-recruiting-sms-error', candidateId);
      const failure = new Error(saved.error); failure.statusCode = 502; failure.code = saved.errorCode; failure.messageRecord = saved; throw failure;
    }
  }
  async function handle(req, res, url, actor) {
    if (url.pathname !== '/api/recruiting' && !url.pathname.startsWith('/api/recruiting/')) return false;
    try {
      const readReceiptRequest = req.method === 'POST' && /^\/api\/recruiting\/candidates\/[a-zA-Z0-9_-]+\/messages-read$/.test(url.pathname);
      if (!canAccess(actor, 'recruitingView') || (req.method !== 'GET' && !readReceiptRequest && !canAccess(actor, 'recruitingEdit'))) fail(403, '没有招聘管理权限', 'RECRUITING_FORBIDDEN');
      if (req.method === 'GET' && url.pathname === '/api/recruiting') { send(res, 200, snapshot(readDb())); return true; }
      if (url.pathname === '/api/recruiting/translate') {
        if (req.method !== 'POST') fail(405, '此操作不支持');
        send(res, 200, await translation.translate(await readBody(req), actor)); return true;
      }
      const route = url.pathname.match(/^\/api\/recruiting\/(candidates|interviews)(?:\/([a-zA-Z0-9_-]+))?(?:\/(messages|messages-read|resume|scorecard))?$/);
      if (!route) fail(404, '没有找到招聘功能');
      const [, collection, recordId, action] = route;
      if (action === 'messages-read' && collection === 'candidates' && recordId && req.method === 'POST') {
        const db = ensure(readDb()); const candidate = candidateById(db, recordId); const userId = String(actor.id || '');
        let marked = 0;
        for (const message of candidate.messages || []) {
          if (message.direction !== 'inbound') continue;
          if (!Array.isArray(message.readByUserIds)) message.readByUserIds = [];
          if (!message.readByUserIds.includes(userId)) { message.readByUserIds.push(userId); marked += 1; }
        }
        if (marked) changed(db, actor, 'read-recruiting-messages', candidate.id);
        send(res, 200, { candidate, marked }); return true;
      }
      if (action === 'messages' && collection === 'candidates' && recordId && req.method === 'POST') {
        const result = await sendCandidateMessage(recordId, await readBody(req), actor, publicBaseUrl(req));
        send(res, result.duplicate ? 200 : 201, result); return true;
      }
      if (action === 'scorecard' && collection === 'candidates' && recordId && req.method === 'POST') {
        const body = await readBody(req); const db = ensure(readDb()); const candidate = candidateById(db, recordId);
        if (!Array.isArray(candidate.interviewScorecards)) candidate.interviewScorecards = [];
        const existing = candidate.interviewScorecards.find(card => card.templateId === body?.templateId) || null;
        const scorecard = normalizeInterviewScorecard(body, actor, existing);
        const index = candidate.interviewScorecards.findIndex(card => card.templateId === scorecard.templateId);
        if (index >= 0) candidate.interviewScorecards[index] = scorecard; else candidate.interviewScorecards.unshift(scorecard);
        candidate.updatedAt = scorecard.updatedAt;
        changed(db, actor, 'save-recruiting-scorecard', candidate.id);
        send(res, 200, { candidate, scorecard }); return true;
      }
      if (action === 'resume' && collection === 'candidates' && recordId) {
        if (req.method === 'GET') {
          const candidate = candidateById(readDb(), recordId);
          const file = candidate.resume?.file;
          if (!file || !/^[a-f0-9]{32}\.pdf$/.test(file) || !fs.existsSync(path.join(resumeDir, file))) fail(404, '没有上传简历文件');
          res.writeHead(200, { 'Content-Type':'application/pdf', 'Content-Disposition':`inline; filename="resume.pdf"; filename*=UTF-8''${encodeURIComponent(candidate.resume.name)}`, 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff' });
          fs.createReadStream(path.join(resumeDir, file)).pipe(res); return true;
        }
        if (req.method === 'POST') {
          const body = await readBody(req);
          validateFields(body, new Set(['name', 'type', 'data']));
          if (body.type !== 'application/pdf' || typeof body.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.data) || body.data.length > 7_000_000) fail(400, '请上传 5MB 以内的 PDF 简历');
          const buffer = Buffer.from(body.data, 'base64');
          if (buffer.length > 5 * 1024 * 1024 || !buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) fail(400, '请上传有效的 PDF 简历（最大 5MB）');
          const db = readDb(); const candidate = candidateById(db, recordId);
          const name = text(body.name, 200, '文件名');
          fs.mkdirSync(resumeDir, { recursive:true, mode:0o700 });
          const file = `${uid()}.pdf`; fs.writeFileSync(path.join(resumeDir, file), buffer, { mode:0o600, flag:'wx' });
          candidate.resume = { name, type:'application/pdf', size:buffer.length, uploadedAt:new Date().toISOString(), file };
          candidate.updatedAt = candidate.resume.uploadedAt;
          changed(db, actor, 'upload-recruiting-resume', candidate.id);
          send(res, 200, { candidate }); return true;
        }
      }
      if (action || !['POST', 'PATCH'].includes(req.method) || (req.method === 'PATCH' && !recordId) || (req.method === 'POST' && recordId)) fail(405, '此操作不支持');
      const body = await readBody(req); const db = ensure(readDb());
      const rows = collection === 'candidates' ? db.recruitingCandidates : db.recruitingInterviews;
      const existing = recordId ? rows.find(row => row.id === recordId) : null;
      if (recordId && !existing) fail(404, '没有找到这条记录');
      const item = collection === 'candidates' ? normalizeCandidate(db, body, actor, existing) : normalizeInterview(db, body, actor, existing);
      if (existing) rows[rows.findIndex(row => row.id === recordId)] = item; else rows.unshift(item);
      changed(db, actor, `${existing ? 'update' : 'create'}-recruiting-${collection}`, item.id);
      send(res, existing ? 200 : 201, { [collection === 'candidates' ? 'candidate' : 'interview']:item });
    } catch (error) {
      send(res, error.statusCode || 400, { error:error.message, code:error.code || 'RECRUITING_ERROR', ...(error.messageRecord ? { message:error.messageRecord } : {}) });
    }
    return true;
  }
  let reminderBusy = false;
  async function processReminders(now = Date.now()) {
    if (reminderBusy || !remindersEnabled() || !smsConfigured()) return { sent:0, skipped:0 };
    reminderBusy = true; let sent = 0; let skipped = 0;
    try {
      const interviews = ensure(readDb()).recruitingInterviews.filter(row => row.automaticReminders && row.status === 'confirmed');
      for (const interview of interviews) {
        const candidate = candidateById(readDb(), interview.candidateId);
        const left = Date.parse(interview.startsAt) - now;
        if (left <= 0 || !candidate.smsConsent || candidate.smsOptedOut || customerPhoneConflict(readDb(), candidate.phone)) { skipped++; continue; }
        // A ten minute window avoids stale reminders when the server restarts late.
        for (const hours of [24, 2]) {
          if (left > hours * 3600000 || left < hours * 3600000 - 10 * 60000) continue;
          const key = crypto.createHash('sha256').update(`${interview.id}:${interview.startsAt}:${hours}`).digest('hex');
          if ((candidate.messages || []).some(row => row.clientMessageId === key)) continue;
          const when = new Intl.DateTimeFormat('en-US', { timeZone:TIME_ZONE, weekday:'long', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short' }).format(new Date(interview.startsAt));
          const mode = interview.mode || 'in_person';
          const details = mode === 'online'
            ? `your online video interview is scheduled for ${when}. Please use the interview link sent separately. If you have not received the link, please reply to let us know.`
            : `your interview is scheduled for ${when} at ${interview.address}.`;
          const body = { clientMessageId:key, text:`Hi ${candidate.name}, this is QUAD FILM. Reminder: ${details} Please reply to confirm or let us know if you need to reschedule. Reply STOP to opt out.` };
          const latestInterview = ensure(readDb()).recruitingInterviews.find(row => row.id === interview.id);
          if (!latestInterview?.automaticReminders || latestInterview.status !== 'confirmed' || latestInterview.startsAt !== interview.startsAt
              || (latestInterview.mode || 'in_person') !== mode || latestInterview.address !== interview.address) { skipped++; continue; }
          try { const result = await sendCandidateMessage(candidate.id, body, { id:'recruiting-reminders', name:'招聘面试提醒' }, String(process.env.TWILIO_WEBHOOK_BASE_URL || '').replace(/\/$/, ''), { interviewId:interview.id, expectedStartsAt:interview.startsAt, expectedMode:mode, expectedAddress:interview.address, hours }); if (!result.duplicate) sent++; }
          catch { skipped++; }
        }
      }
      return { sent, skipped };
    } finally { reminderBusy = false; }
  }
  function startReminderWorker() {
    if (!remindersEnabled()) return;
    const run = () => processReminders().catch(error => console.warn(`Recruiting reminder worker: ${error.message}`));
    setTimeout(run, 60000).unref(); setInterval(run, 60000).unref();
  }
  return { handle, snapshot, sendCandidateMessage, processReminders, startReminderWorker };
}

module.exports = { createRecruitingService, normalizeCandidate, normalizeInterview, normalizeInterviewScorecard, ingestInbound, ingestStatus, hasCandidatePhone, phoneKey, customerPhoneConflict, ensure, TIME_ZONE, ADDRESS };
