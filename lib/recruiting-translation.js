'use strict';

// No credentials, provider implementation, source records, or translated text
// are retained here. The host supplies its existing, timeout-bounded adapter.
const MAX_TEXT_LENGTH = 60000;
const MAX_OUTPUT_LENGTH = 180000;
const WINDOW_MS = 60000;
const MAX_REQUESTS_PER_WINDOW = 12;
const MAX_CHARACTERS_PER_WINDOW = 120000;
const MAX_CONCURRENT = 3;
const HAN_TEXT = /\p{Script=Han}/u;
// Preserve meaningful adapter outcomes, but supply our own safe wording rather
// than reflecting arbitrary error messages or provider payloads.
const ADAPTER_ERRORS = {
  TRANSLATION_INVALID_INPUT:[400, '请选择中英翻译方向，并提供不超过 60000 字符的内容'],
  TRANSLATION_NOT_CONFIGURED:[503, '翻译服务尚未配置，请联系管理员'],
  TRANSLATION_TIMEOUT:[504, '翻译超时，请分段重试；原文未改变，也没有发送消息'],
  TRANSLATION_AUTH_FAILED:[503, 'AI 翻译服务认证或访问权限异常，请联系管理员；无需重新登录系统'],
  TRANSLATION_QUOTA_EXCEEDED:[503, 'AI 翻译额度或计费状态不足，请联系管理员检查；原文保留'],
  TRANSLATION_PROVIDER_RATE_LIMIT:[429, 'AI 翻译服务暂时限流，请稍后重试当前段；原文保留'],
  TRANSLATION_NETWORK_ERROR:[503, '暂时无法连接 AI 翻译服务，请稍后重试；原文保留'],
  TRANSLATION_INCOMPLETE:[502, 'AI 未返回完整译文，请分段重试；不会使用截断内容'],
  TRANSLATION_INVALID_RESULT:[502, 'AI 没有返回有效译文，请重试'],
  TRANSLATION_NOT_ENGLISH:[502, '译文仍含中文，已阻止使用，请重新翻译'],
  TRANSLATION_FACT_MISMATCH:[502, '译文中的数字或联系方式与原文不一致，请分段重试并核对']
};

function failure(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function createRecruitingTranslation({ translateText, translationConfigured, now = Date.now } = {}) {
  const budgets = new Map();
  const activeUsers = new Set();
  let activeCount = 0;

  function configured() {
    try { return typeof translateText === 'function' && typeof translationConfigured === 'function' && Boolean(translationConfigured()); }
    catch { return false; }
  }

  async function translate(body, actor) {
    if (!actor || typeof actor.id !== 'string' || !actor.id) throw failure(403, 'RECRUITING_FORBIDDEN', '没有招聘管理权限');
    if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).some(key => !['text', 'targetLanguage'].includes(key))) {
      throw failure(400, 'TRANSLATION_VALIDATION', '请只提交待翻译内容和目标语言');
    }
    if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > MAX_TEXT_LENGTH) {
      throw failure(400, 'TRANSLATION_VALIDATION', `待翻译内容须为 1–${MAX_TEXT_LENGTH} 个字符`);
    }
    if (!['en', 'zh'].includes(body.targetLanguage)) throw failure(400, 'TRANSLATION_VALIDATION', '目标语言只能是英文或中文');
    if (!configured()) throw failure(503, 'TRANSLATION_NOT_CONFIGURED', '翻译服务尚未配置，请联系管理员');

    const instant = now();
    for (const [key, value] of budgets) if (instant - value.startedAt >= WINDOW_MS && !activeUsers.has(key)) budgets.delete(key);
    const previous = budgets.get(actor.id);
    const budget = previous && instant - previous.startedAt < WINDOW_MS ? previous : { startedAt:instant, requests:0, characters:0 };
    if (activeUsers.has(actor.id) || activeCount >= MAX_CONCURRENT) {
      throw failure(429, 'TRANSLATION_BUSY', '已有翻译正在进行，请稍后再试');
    }
    if (budget.requests >= MAX_REQUESTS_PER_WINDOW || budget.characters + body.text.length > MAX_CHARACTERS_PER_WINDOW) {
      throw failure(429, 'TRANSLATION_RATE_LIMIT', '翻译请求较多，请一分钟后再试');
    }
    budget.requests++;
    budget.characters += body.text.length;
    budgets.set(actor.id, budget);
    activeUsers.add(actor.id);
    activeCount++;
    try {
      const result = await translateText({ text:body.text, targetLanguage:body.targetLanguage });
      const translated = typeof result === 'string' ? result : result?.text;
      if (typeof translated !== 'string' || !translated.trim() || translated.length > MAX_OUTPUT_LENGTH) {
        throw new Error('Invalid translation response');
      }
      return { text:translated.trim(), targetLanguage:body.targetLanguage };
    } catch (error) {
      // Provider errors may contain prompts, request headers, account details or
      // credentials. Never pass them through to the response or application log.
      const safe = typeof error?.code === 'string' && Object.hasOwn(ADAPTER_ERRORS, error.code) ? ADAPTER_ERRORS[error.code] : null;
      if (safe) throw failure(safe[0], error.code, safe[1]);
      throw failure(502, 'TRANSLATION_FAILED', '翻译暂时失败，请稍后重试；原文未更改，也未发送消息');
    } finally {
      activeUsers.delete(actor.id);
      activeCount--;
    }
  }

  return { configured, translate };
}

module.exports = { createRecruitingTranslation, HAN_TEXT, MAX_TEXT_LENGTH, MAX_OUTPUT_LENGTH, WINDOW_MS, MAX_REQUESTS_PER_WINDOW, MAX_CHARACTERS_PER_WINDOW, MAX_CONCURRENT };
