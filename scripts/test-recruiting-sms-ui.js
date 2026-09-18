'use strict';

// Run with: node --test scripts/test-recruiting-sms-ui.js
// Exercise the real recruiting UI closure with hooks injected only in memory.
// Fixtures and API responses are synthetic; no server, database, AI, or SMS
// provider is contacted. Unexpected API paths and all fetch calls throw.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontendPath = path.join(__dirname, '..', 'public', 'recruiting.js');
const source = fs.readFileSync(frontendPath, 'utf8');
const marker = '  window.Recruiting = Object.freeze(';
assert.equal(source.split(marker).length, 2, 'UI test hook has one injection point');
const hooks = `
  window.__smsUiTest = {
    setFixture(snapshot) {
      identity = user.id + ':' + token;
      data = snapshot; loadedAt = 0; loading = null; error = ''; busy = false;
    },
    openMessages, makeSmsPreview, updateComposeControls, sendSms,
    invalidatePreview, smsContactBlockers,
    setBusy(value) { busy = value; },
    setPending(value) { composeContext.pending = value; }
  };
`;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const node = (fields = {}) => ({
  value: '', textContent: '', innerHTML: '', className: '', checked: false,
  disabled: false, hidden: false, isConnected: true, dataset: {},
  scrollTop: 0, scrollHeight: 100, clientHeight: 100,
  setAttribute() {}, focus() {}, matches: () => false, ...fields
});
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function harness({ fields = {}, configured = true, language = 'zh' } = {}) {
  const person = {
    id: 'synthetic-candidate', name: 'Synthetic Candidate', phone: '+15005550101',
    smsConsent: true, smsConsentNote: 'Synthetic consent fixture, 2026-09-18',
    smsOptedOut: false, messages: [], ...fields
  };
  const snapshot = {
    candidates: [person], interviews: [], interviewers: [], quarantine: [],
    translation: { configured: true }, sms: { configured },
    settings: { preview: true, remindersEnabled: false }
  };
  const nodes = new Map([
    ['modalSave', node()], ['modalBody', node()],
    ['modal', node({ classList: { contains: () => true }, querySelector: () => null })]
  ]);
  const calls = [], modals = [], listeners = new Map();
  let dialog = null, editAllowed = true, viewAllowed = true, uuid = 0;
  let translationResponse = { text: 'Hi', targetLanguage: 'en' };
  let sendResponse = { message: { status: 'queued' } };
  const sandbox = {
    window: { crypto: { randomUUID: () => `synthetic-client-message-${++uuid}` } },
    lang: language, user: { id: 'synthetic-owner', name: 'Synthetic Owner' },
    token: 'synthetic-token', state: null, current: '', Date, Intl, URL,
    escapeHtml, hasPerm: permission => permission === 'recruitingEdit' ? editAllowed : viewAllowed,
    api: async (apiPath, options = {}) => {
      assert.ok(apiPath.startsWith('/api/recruiting'), 'Only local synthetic API routes are permitted');
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ path: apiPath, method: options.method || 'GET', body });
      if (apiPath === '/api/recruiting') return snapshot;
      if (apiPath === '/api/recruiting/translate') return translationResponse;
      if (apiPath === `/api/recruiting/candidates/${person.id}/messages`) return sendResponse;
      throw new Error(`Unexpected synthetic API request: ${apiPath}`);
    },
    fetch: () => { throw new Error('Network calls are forbidden in SMS UI tests'); },
    render() {}, requestAnimationFrame() {}, setTimeout: () => 0, setInterval: () => 0,
    MutationObserver: class { observe() {} },
    openModal: (title, html) => {
      modals.push({ title, html });
      if (dialog) dialog.isConnected = false;
      const candidateId = html.match(/data-rec-dialog="messages" data-rec-id="([^"]+)"/)?.[1];
      dialog = node({ dataset: { recId: candidateId } });
      for (const match of html.matchAll(/<(?:div|textarea|input|button|span|p)\b([^>]*\sid="([^"]+)"[^>]*)>/g)) {
        nodes.set(match[2], node({
          id: match[2], disabled: /\bdisabled\b/.test(match[1]),
          checked: /\bchecked\b/.test(match[1])
        }));
      }
    },
    closeModal: () => { if (dialog) dialog.isConnected = false; dialog = null; },
    document: {
      hidden: false, getElementById: id => nodes.get(id) || null,
      querySelector: selector => selector.startsWith('[data-rec-dialog') ? dialog : null,
      addEventListener: (name, callback) => {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(callback);
      }
    }
  };
  vm.runInNewContext(source.replace(marker, hooks + marker), sandbox, { filename: frontendPath, timeout: 2000 });
  const ui = sandbox.window.__smsUiTest;
  ui.setFixture(snapshot);
  ui.openMessages(person.id);
  const env = {
    ui, person, snapshot, nodes, modals, calls, sandbox,
    get: id => nodes.get(id),
    sent: () => calls.filter(call => call.path.endsWith('/messages')),
    setTranslation: response => { translationResponse = response; },
    setSendResponse: response => { sendResponse = response; },
    setEdit: allowed => { editAllowed = allowed; },
    setView: allowed => { viewAllowed = allowed; },
    emit(name, target) { for (const listener of listeners.get(name) || []) listener({ target }); },
    async preview(text) {
      nodes.get('recSmsDraft').value = text;
      ui.invalidatePreview();
      await ui.makeSmsPreview();
    },
    review() {
      nodes.get('recSmsReviewed').checked = true;
      ui.updateComposeControls();
    }
  };
  return env;
}

for (const text of ['A', 'Hi', 'OK', 'a'.repeat(190), 'a'.repeat(1600)]) {
  test(`${text.length}-character English message can be previewed and explicitly sent`, async () => {
    const env = harness();
    await env.preview(text);
    assert.equal(env.get('recSmsBody').value, text);
    assert.equal(env.get('recSmsReviewed').disabled, false);
    assert.equal(env.get('recSendSms').disabled, true, 'Preview must still require explicit review');
    assert.equal(env.calls.length, 0, 'English preview does not call AI or send SMS');
    assert.match(env.get('recSmsCount').textContent, new RegExp(`${text.length} 个字符`));
    assert.match(env.get('recSmsCount').textContent, /最多 1600.*不用写满/);
    await env.ui.sendSms(env.person.id);
    assert.equal(env.sent().length, 0, 'Unchecked preview cannot be sent even by direct handler call');
    env.review();
    assert.equal(env.get('recSendSms').disabled, false);
    assert.match(env.get('recSmsSendState').textContent, /已就绪.*短消息/);
    assert.equal(env.sent().length, 0, 'Review itself does not send');
    await env.ui.sendSms(env.person.id);
    assert.equal(env.sent().length, 1);
    assert.equal(env.sent()[0].body.text, text);
    assert.equal(env.sent()[0].body.expectedPhone, env.person.phone);
    assert.match(env.sent()[0].body.clientMessageId, /^synthetic-client-message-/);
    assert.equal(env.get('recSmsDraft').value, '', 'Successful submission clears the submitted draft');
    assert.equal(env.get('recSmsReviewed').checked, false);
  });
}

test('composer explains that a short message is allowed in Chinese and English', () => {
  for (const language of ['zh', 'en']) {
    const env = harness({ language });
    assert.match(env.modals[0].html, language === 'zh' ? /几个字也可以/ : /No minimum length/);
    assert.match(env.get('recSmsCount').textContent, language === 'zh' ? /不用写满/ : /not a minimum/);
    assert.doesNotMatch(env.modals[0].html, /\bminlength=/);
  }
});

for (const text of ['', '   \n\t', 'a'.repeat(1601)]) {
  test(`empty, whitespace, or oversized input is not preview-ready (${text.length})`, async () => {
    const env = harness();
    await env.preview(text);
    assert.equal(env.get('recSmsBody').value, '');
    assert.equal(env.get('recSmsReviewed').disabled, true);
    env.review();
    assert.equal(env.get('recSendSms').disabled, true);
    await env.ui.sendSms(env.person.id);
    assert.equal(env.sent().length, 0);
    assert.equal(env.calls.length, 0);
  });
}

test('Chinese short draft must translate, then sends exactly the reviewed English text', async () => {
  const env = harness();
  env.setTranslation({ text: 'Hi', targetLanguage: 'en' });
  await env.preview('你好');
  assert.equal(env.calls.length, 1);
  assert.equal(env.calls[0].path, '/api/recruiting/translate');
  assert.deepEqual(env.calls[0].body, { text: '你好', targetLanguage: 'en' });
  assert.equal(env.get('recSmsBody').value, 'Hi');
  assert.equal(env.sent().length, 0);
  env.review();
  await env.ui.sendSms(env.person.id);
  assert.equal(env.sent()[0].body.text, 'Hi');
});

for (const translated of ['你好', 'Hello 请 confirm', 'Hello 𠀀', '', 'a'.repeat(1601)]) {
  test(`invalid translated preview remains blocked (${translated.slice(0, 20) || 'empty'})`, async () => {
    const env = harness();
    env.setTranslation({ text: translated, targetLanguage: 'en' });
    await env.preview('请确认');
    assert.equal(env.get('recSmsBody').value, '');
    env.review();
    assert.equal(env.get('recSendSms').disabled, true);
    await env.ui.sendSms(env.person.id);
    assert.equal(env.sent().length, 0);
  });
}

for (const body of ['你好', 'Hello 𠀀', 'a'.repeat(1601)]) {
  test(`direct handler rejects tampered preview (${body.slice(0, 20)})`, async () => {
    const env = harness();
    await env.preview('Hi'); env.review();
    env.get('recSmsBody').value = body;
    await env.ui.sendSms(env.person.id);
    assert.equal(env.sent().length, 0);
    assert.match(env.get('recDialogError').textContent, /中文|1600/);
  });
}

const contactCases = [
  ['missing phone', { phone: '' }, true, /未填写手机号/],
  ['whitespace phone', { phone: '  ' }, true, /未填写手机号/],
  ['invalid phone characters', { phone: 'bad5005550101' }, true, /手机号格式无效/],
  ['short phone number', { phone: '5550101' }, true, /手机号格式无效/],
  ['unsupported country prefix', { phone: '+445005550101' }, true, /手机号格式无效/],
  ['no consent', { smsConsent: false }, true, /同意记录/],
  ['missing consent source', { smsConsentNote: '' }, true, /同意记录/],
  ['whitespace consent source', { smsConsentNote: '  ' }, true, /同意记录/],
  ['opted out', { smsOptedOut: true }, true, /已退订/],
  ['channel unavailable', {}, false, /通道尚未启用/]
];
for (const [name, fields, configured, reason] of contactCases) {
  test(`SMS blocker is visible and enforced: ${name}`, async () => {
    const env = harness({ fields, configured });
    assert.match(env.ui.smsContactBlockers(env.person).join(' '), reason);
    await env.preview('OK'); env.review();
    assert.equal(env.get('recSendSms').disabled, true);
    assert.match(env.get('recSmsSendState').textContent, reason);
    await env.ui.sendSms(env.person.id);
    assert.equal(env.sent().length, 0);
    assert.match(env.get('recDialogError').textContent, reason);
  });
}

test('all contact problems are shown together rather than hidden by the first blocker', () => {
  const env = harness({ fields: { phone: '', smsConsent: false }, configured: false });
  assert.equal(env.ui.smsContactBlockers(env.person).length, 3);
  assert.match(env.get('recSmsSendState').textContent, /未填写手机号.*同意记录.*通道尚未启用/);
});

test('valid US phone formatting is accepted without relaxing recipient binding', async () => {
  for (const phone of ['5005550101', '(500) 555-0101', '1-500-555-0101', '+1 500 555 0101']) {
    const env = harness({ fields: { phone } });
    await env.preview('Hi'); env.review();
    assert.equal(env.ui.smsContactBlockers(env.person).length, 0);
    assert.equal(env.get('recSendSms').disabled, false);
    env.person.phone = '+1 (500) 555-0101';
    env.ui.updateComposeControls();
    assert.equal(env.get('recSendSms').disabled, false, 'Formatting-only change is still the same recipient');
  }
});

test('changed recipient blocks short text until a new composer is reviewed', async () => {
  const env = harness();
  await env.preview('Hi'); env.review();
  env.person.phone = '+15005550102';
  env.ui.updateComposeControls();
  assert.equal(env.get('recSendSms').disabled, true);
  assert.match(env.get('recSmsSendState').textContent, /手机号已更新/);
  await env.ui.sendSms(env.person.id);
  assert.equal(env.sent().length, 0);
  env.ui.openMessages(env.person.id);
  await env.preview('Hi'); env.review();
  assert.equal(env.get('recSendSms').disabled, false);
});

test('editing a reviewed draft invalidates the old preview and confirmation', async () => {
  const env = harness();
  await env.preview('Hi'); env.review();
  env.get('recSmsDraft').value = 'OK';
  env.emit('input', env.get('recSmsDraft'));
  assert.equal(env.get('recSmsBody').value, '');
  assert.equal(env.get('recSmsReviewed').checked, false);
  assert.equal(env.get('recSmsReviewed').disabled, true);
  assert.equal(env.get('recSendSms').disabled, true);
  await env.ui.sendSms(env.person.id);
  assert.equal(env.sent().length, 0);
  await env.ui.makeSmsPreview(); env.review();
  assert.equal(env.get('recSendSms').disabled, false);
});

test('unobserved draft or preview mutation cannot bypass the send handler checks', async () => {
  const env = harness();
  await env.preview('Hi'); env.review();
  env.get('recSmsDraft').value = 'Changed';
  await env.ui.sendSms(env.person.id);
  assert.equal(env.sent().length, 0);
  assert.match(env.get('recDialogError').textContent, /当前草稿/);
});

for (const flag of ['busy', 'pending']) {
  test(`${flag} blocks preview generation and duplicate sending`, async () => {
    const env = harness();
    await env.preview('Hi'); env.review();
    env.ui[flag === 'busy' ? 'setBusy' : 'setPending'](true);
    env.ui.updateComposeControls();
    assert.equal(env.get('recMakePreview').disabled, true);
    assert.equal(env.get('recSendSms').disabled, true);
    assert.match(env.get('recSmsSendState').textContent, flag === 'busy' ? /正在提交/ : /正在生成英文预览/);
    await env.ui.makeSmsPreview();
    await env.ui.sendSms(env.person.id);
    assert.equal(env.calls.length, 0);
  });
}

test('loss of editing permission blocks sending with an explicit reason', async () => {
  const env = harness();
  await env.preview('Hi'); env.review();
  env.setEdit(false); env.ui.updateComposeControls();
  assert.equal(env.get('recSendSms').disabled, true);
  assert.match(env.get('recSmsSendState').textContent, /招聘编辑权限/);
  await env.ui.makeSmsPreview();
  await env.ui.sendSms(env.person.id);
  assert.equal(env.calls.length, 0);
});

test('loss of view permission closes the composer and prevents stale send', async () => {
  const env = harness();
  await env.preview('Hi'); env.review();
  env.setView(false);
  await env.ui.sendSms(env.person.id);
  assert.equal(env.calls.length, 0);
});

test('asynchronous translation of an edited draft cannot restore its stale preview', async () => {
  const env = harness(), waiting = deferred();
  env.setTranslation(waiting.promise);
  const preview = env.preview('你好');
  await Promise.resolve(); await Promise.resolve();
  assert.equal(env.get('recSendSms').disabled, true);
  env.get('recSmsDraft').value = 'New draft';
  env.ui.invalidatePreview();
  waiting.resolve({ text: 'Hi', targetLanguage: 'en' });
  await preview;
  assert.equal(env.get('recSmsBody').value, '');
  assert.equal(env.get('recSmsReviewed').checked, false);
  assert.equal(env.get('recSendSms').disabled, true);
  assert.equal(env.sent().length, 0);
});

test('rapid double invocation submits the reviewed message only once', async () => {
  const env = harness(), waiting = deferred();
  await env.preview('Hi'); env.review();
  env.setSendResponse(waiting.promise);
  const first = env.ui.sendSms(env.person.id);
  const second = env.ui.sendSms(env.person.id);
  assert.equal(env.sent().length, 1);
  assert.equal(env.get('recSendSms').disabled, true);
  waiting.resolve({ message: { status: 'queued' } });
  await Promise.all([first, second]);
  assert.equal(env.sent().length, 1);
});

test('uncertain submission preserves draft and reuses its idempotency key on manual retry', async () => {
  const env = harness();
  await env.preview('Hi'); env.review();
  env.setSendResponse({ message: { status: 'send_unknown' } });
  await env.ui.sendSms(env.person.id);
  assert.equal(env.get('recSmsDraft').value, 'Hi');
  assert.match(env.get('recDialogError').textContent, /尚未确认/);
  await env.ui.sendSms(env.person.id);
  assert.equal(env.sent().length, 2, 'Two explicit attempts may occur, each with the same server deduplication key');
  assert.equal(env.sent()[0].body.clientMessageId, env.sent()[1].body.clientMessageId);
});
