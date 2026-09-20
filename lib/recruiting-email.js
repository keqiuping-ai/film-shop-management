'use strict';

// Recruiting mail uses the existing Resend account, but has its own validation,
// idempotency and error boundary. It never sends or imports customer messages.
const RESEND_URL = 'https://api.resend.com/emails';
const ERROR_TYPES = Object.freeze({
  EMAIL_NOT_CONFIGURED:[503, '招聘邮件通道尚未配置完整的发件人与回复邮箱，请使用邮箱草稿联系', true],
  EMAIL_PROVIDER_AUTH:[503, '邮件服务认证或发件权限异常，请联系管理员；无需重新登录系统', true],
  EMAIL_PROVIDER_RATE_LIMIT:[429, '邮件服务暂时限流，本次发送被拒绝；请稍后人工核查', true],
  EMAIL_PROVIDER_REJECTED:[502, '邮件服务拒绝了此次发送，请核对邮箱和发件配置', true],
  EMAIL_SEND_TIMEOUT:[504, '邮件发送响应超时，结果尚未确认；请先核查服务商记录，系统不会自动重发', false],
  EMAIL_SEND_UNKNOWN:[502, '邮件发送结果尚未确认；请先核查服务商记录，系统不会自动重发', false],
  EMAIL_VALIDATION:[400, '请核对邮件收件人、英文主题、正文和发送编号', true]
});

function emailAddress(value) {
  if (typeof value !== 'string' || /[\r\n\x00-\x1f\x7f]/.test(value)) return '';
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || /[\s,;<>"\\]/.test(email)) return '';
  const parts = email.split('@');
  if (parts.length !== 2 || parts[0].length > 64 || !parts[0]
      || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0])
      || parts[0].startsWith('.') || parts[0].endsWith('.') || parts[0].includes('..')) return '';
  const labels = parts[1].split('.');
  if (labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return '';
  return email;
}

function emailSender(value) {
  if (typeof value !== 'string' || value.length > 450 || /[\r\n\x00-\x1f\x7f,;]/.test(value)) return '';
  const bare = emailAddress(value);
  if (bare) return bare;
  const match = value.trim().match(/^([^<>]+)\s*<([^<>]+)>$/);
  if (!match || !match[1].trim() || match[1].trim().length > 160) return '';
  const address = emailAddress(match[2]);
  return address ? `${match[1].trim()} <${address}>` : '';
}

function emailFailure(code) {
  const safeCode = typeof code === 'string' && Object.hasOwn(ERROR_TYPES, code) ? code : 'EMAIL_SEND_UNKNOWN';
  const [statusCode, message, providerRejected] = ERROR_TYPES[safeCode];
  return Object.assign(new Error(message), { code:safeCode, statusCode, providerRejected });
}

function createRecruitingEmailProvider({ getConfig, fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  function config() {
    let input;
    try { input = typeof getConfig === 'function' ? getConfig() : {}; } catch { input = {}; }
    const from = emailSender(input?.from), replyTo = emailAddress(input?.replyTo);
    const apiKey = typeof input?.apiKey === 'string' && !/[\r\n]/.test(input.apiKey) ? input.apiKey.trim() : '';
    return { configured:Boolean(apiKey && from && replyTo && typeof fetchImpl === 'function'), apiKey, from, replyTo };
  }
  function info() {
    const { configured, apiKey, from, replyTo } = config();
    return { configured, from, replyTo, inboundConfigured:false,
      configuration:{ providerConfigured:Boolean(apiKey), senderConfigured:Boolean(from), replyToConfigured:Boolean(replyTo) } };
  }
  async function send(input) {
    const settings = config();
    if (!settings.configured) throw emailFailure('EMAIL_NOT_CONFIGURED');
    const to = emailAddress(input?.to);
    const subject = typeof input?.subject === 'string' ? input.subject.trim() : '';
    const text = typeof input?.text === 'string' ? input.text.trim() : '';
    if (!to || !subject || subject.length > 200 || /[\r\n\x00-\x1f\x7f]/.test(input.subject)
        || !text || text.length > 10000 || /\p{Script=Han}/u.test(subject + text)
        || !/^recruiting-email-[a-f0-9]{64}$/.test(input?.idempotencyKey || '')) throw emailFailure('EMAIL_VALIDATION');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(RESEND_URL, {
        method:'POST', redirect:'error', signal:controller.signal,
        headers:{ Authorization:`Bearer ${settings.apiKey}`, 'Content-Type':'application/json', 'Idempotency-Key':input.idempotencyKey },
        body:JSON.stringify({ from:settings.from, to:[to], reply_to:settings.replyTo, subject, text })
      });
      // Authentication/rate errors do not require trusting or parsing a response
      // body (a proxy may return HTML, including private diagnostic details).
      if (!response.ok && [401, 403].includes(response.status)) throw emailFailure('EMAIL_PROVIDER_AUTH');
      if (!response.ok && response.status === 429) throw emailFailure('EMAIL_PROVIDER_RATE_LIMIT');
      let body;
      try { body = JSON.parse(await response.text()); } catch (error) {
        if (controller.signal.aborted) throw emailFailure('EMAIL_SEND_TIMEOUT');
        throw emailFailure('EMAIL_SEND_UNKNOWN');
      }
      if (!response.ok) {
        // A 5xx or concurrent idempotent request may already be in flight.
        if (response.status >= 500 || (response.status === 409 && body?.name === 'concurrent_idempotent_requests')) throw emailFailure('EMAIL_SEND_UNKNOWN');
        throw emailFailure('EMAIL_PROVIDER_REJECTED');
      }
      if (typeof body?.id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(body.id)) throw emailFailure('EMAIL_SEND_UNKNOWN');
      return { id:body.id, status:'accepted' };
    } catch (error) {
      if (controller.signal.aborted) throw emailFailure('EMAIL_SEND_TIMEOUT');
      // Do not retain provider text, response body, credentials, or causes.
      throw emailFailure(error?.code);
    } finally { clearTimeout(timer); }
  }
  return { info, send };
}

module.exports = { createRecruitingEmailProvider, emailAddress, emailSender, emailFailure, RESEND_URL };
