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
    invalidatePreview, smsContactBlockers, template, composeVideoInvite,
    sharedPhoneTestActive, sharedPhoneTestHtml, openSharedPhoneTest, saveSharedPhoneTest, returnFromSharedPhoneTest,
    composer: () => composeContext,
    setBusy(value) { busy = value; },
    setPending(value) { composeContext.pending = value; }
  };
`;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const fixedNow = Date.parse('2026-09-19T18:00:00Z');
class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return fixedNow; }
}
const node = (fields = {}) => ({
  value: '', textContent: '', innerHTML: '', className: '', checked: false,
  disabled: false, hidden: false, isConnected: true, dataset: {},
  scrollTop: 0, scrollHeight: 100, clientHeight: 100,
  setAttribute() {}, focus() {}, matches: () => false,
  querySelectorAll(selector) {
    if (selector !== 'button') return [];
    if (this.buttonHtml !== this.innerHTML) {
      this.buttonHtml = this.innerHTML;
      this.buttons = [...this.innerHTML.matchAll(/<button\b([^>]*)>/g)].map(match => node({ dataset:{
        recAction:match[1].match(/data-rec-action="([^"]+)"/)?.[1],
        recId:match[1].match(/data-rec-id="([^"]*)"/)?.[1]
      } }));
    }
    return this.buttons || [];
  }, ...fields
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
    settings: { preview: true, remindersEnabled: false, smsSharedPhoneTestHours:24 }
  };
  const nodes = new Map([
    ['modalSave', node()], ['modalBody', node()],
    ['modal', node({ classList: { contains: () => true }, querySelector: () => null })]
  ]);
  const calls = [], modals = [], listeners = new Map();
  let dialog = null, editAllowed = true, viewAllowed = true, uuid = 0;
  let translationResponse = { text: 'Hi', targetLanguage: 'en' };
  let sendResponse = { message: { status: 'queued' } };
  let testResponse = null;
  const modalNodeIds = new Set();
  const sandbox = {
    window: { crypto: { randomUUID: () => `synthetic-client-message-${++uuid}` } },
    lang: language, user: { id: 'synthetic-owner', name: 'Synthetic Owner', role:'owner' },
    token: 'synthetic-token', state: null, current: '', Date:FixtureDate, Intl, URL,
    escapeHtml, hasPerm: permission => permission === 'recruitingEdit' ? editAllowed : viewAllowed,
    api: async (apiPath, options = {}) => {
      assert.ok(apiPath.startsWith('/api/recruiting'), 'Only local synthetic API routes are permitted');
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ path: apiPath, method: options.method || 'GET', body });
      if (apiPath === '/api/recruiting') return snapshot;
      if (apiPath === '/api/recruiting/translate') return translationResponse;
      if (apiPath === `/api/recruiting/candidates/${person.id}/messages`) return sendResponse;
      if (apiPath === `/api/recruiting/candidates/${person.id}/test-sms`) {
        if (testResponse) return testResponse;
        Object.assign(person, { smsSharedPhoneTestActive:body.enabled, smsSharedPhoneTest:{ candidateId:person.id,
          phoneKey:person.phone.replace(/\D/g, '').slice(-10), enabled:body.enabled, reason:body.reason,
          approvedByUserId:'synthetic-owner', approvedAt:new FixtureDate().toISOString(), expiresAt:new FixtureDate(fixedNow + 86400000).toISOString() } });
        return { candidate:person };
      }
      throw new Error(`Unexpected synthetic API request: ${apiPath}`);
    },
    fetch: () => { throw new Error('Network calls are forbidden in SMS UI tests'); },
    render() {}, requestAnimationFrame() {}, setTimeout: () => 0, setInterval: () => 0,
    MutationObserver: class { observe() {} },
    openModal: (title, html, onSave) => {
      modals.push({ title, html });
      if (dialog) dialog.isConnected = false;
      for (const id of modalNodeIds) nodes.delete(id);
      modalNodeIds.clear();
      const matchDialog = html.match(/data-rec-dialog="([^"]+)" data-rec-id="([^"]+)"/);
      dialog = node({ dataset: { recDialog:matchDialog?.[1], recId:matchDialog?.[2] },
        querySelectorAll: () => [...modalNodeIds].map(id => nodes.get(id)).filter(Boolean) });
      for (const match of html.matchAll(/<(?:div|textarea|input|button|span|p)\b([^>]*\sid="([^"]+)"[^>]*)>/g)) {
        modalNodeIds.add(match[2]);
        nodes.set(match[2], node({
          id: match[2], disabled: /\bdisabled\b/.test(match[1]),
          checked: /\bchecked\b/.test(match[1]),
          value:html.match(new RegExp(`<textarea\\b[^>]*id="${match[2]}"[^>]*>([\\s\\S]*?)</textarea>`))?.[1] || ''
        }));
      }
      nodes.get('modalSave').onclick = onSave;
      nodes.get('modalSave').disabled = false;
    },
    closeModal: () => { if (dialog) dialog.isConnected = false; dialog = null; },
    document: {
      hidden: false, getElementById: id => nodes.get(id) || null,
      querySelector: selector => selector.includes(' > ') ? null : selector.startsWith('[data-rec-dialog') ? dialog : null,
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
    setTestResponse: response => { testResponse = response; },
    setEdit: allowed => { editAllowed = allowed; },
    setView: allowed => { viewAllowed = allowed; },
    setInterviewDialog(interviewId) {
      if (dialog) dialog.isConnected = false;
      dialog = node({ dataset:{ recId:person.id, recInterviewId:interviewId } });
    },
    emit(name, target) { for (const listener of listeners.get(name) || []) listener({ target }); },
    async preview(text) {
      nodes.get('recSmsDraft').value = text;
      ui.invalidatePreview();
      await ui.makeSmsPreview();
    }
  };
  return env;
}

test('online invitation action only opens an English draft, never sends or confirms a time', async () => {
  const env = harness();
  const before = JSON.stringify(env.snapshot);
  const button = node({ dataset:{ recAction:'invite-online', recId:env.person.id }, closest:() => null });
  env.emit('click', { closest:() => button });
  const draft = env.get('recSmsDraft').value;
  assert.match(draft, /online video interview/);
  assert.match(draft, /Which dates and times would work/);
  assert.match(draft, /private interview link separately once the time is agreed/);
  assert.match(draft, /Reply STOP to opt out/);
  assert.doesNotMatch(draft, /\p{Script=Han}|3212|Santa Monica Blvd/u);
  assert.equal(env.get('recSmsBody').value, '');
  assert.equal(env.get('recSendSms').disabled, true);
  await env.ui.sendSms(env.person.id);
  assert.equal(env.calls.length, 0, 'Opening a draft neither sends SMS nor saves an appointment');
  assert.equal(JSON.stringify(env.snapshot), before);
});

for (const [label, fields, blocker] of [
  ['missing phone', { phone:'' }, /未填写手机号/],
  ['missing consent', { smsConsent:false }, /同意记录/],
  ['missing consent source', { smsConsentNote:'' }, /同意记录/]
]) {
  test(`online invitation still cannot send with ${label}`, async () => {
    const env = harness({ fields });
    const draft = env.ui.template(env.person, 'online-invitation');
    env.ui.openMessages(env.person.id, draft);
    assert.equal(env.get('recSmsDraft').value, draft);
    await env.ui.makeSmsPreview();
    assert.equal(env.get('recSendSms').disabled, true);
    assert.match(env.ui.smsContactBlockers(env.person).join(' '), blocker);
    await env.ui.sendSms(env.person.id);
    assert.equal(env.sent().length, 0);
    assert.equal(env.calls.length, 0, 'Blocked draft must not trigger a provider or appointment API');
  });
}

test('online templates use only English remote instructions while legacy in-person templates keep the address', () => {
  const env = harness();
  const remote = { id:'remote', candidateId:env.person.id, mode:'online', startsAt:'2026-09-20T17:00:00Z', status:'scheduled', address:'123 Synthetic Store Ave' };
  const legacy = { id:'legacy', candidateId:env.person.id, startsAt:'2026-09-20T16:00:00Z', status:'confirmed', address:'123 Synthetic Store Ave' };
  env.snapshot.interviews.push(legacy, remote);
  const before = JSON.stringify(env.snapshot);
  for (const kind of ['online-invitation','online-link','confirm','reminder','late']) {
    const text = env.ui.template(env.person, kind, remote, 'https://example.test/recruiting-interview.html?invite=synthetic');
    assert.match(text, /online video interview/, kind);
    assert.match(text, /PDT/, kind);
    assert.match(text, /Reply STOP to opt out/, kind);
    assert.doesNotMatch(text, /\p{Script=Han}|123 Synthetic Store Ave|3212|Santa Monica Blvd|estimated arrival|on your way/u, kind);
  }
  const invitation = env.ui.template(env.person, 'online-invitation');
  assert.match(invitation, /10:00/);
  assert.doesNotMatch(invitation, /\b9:00 AM\b/, 'Online invitation must not silently use the earlier in-person appointment');
  const inPersonInvitation = env.ui.template(env.person, 'invitation');
  assert.match(inPersonInvitation, /in-person interview at 123 Synthetic Store Ave/);
  assert.match(inPersonInvitation, /\b9:00 AM\b/);
  for (const kind of ['confirm','reminder']) assert.match(env.ui.template(env.person, kind, legacy), /The location is 123 Synthetic Store Ave/);
  assert.match(env.ui.template(env.person, 'late', legacy), /estimated arrival time/);
  assert.match(env.ui.template(env.person, 'online-link', remote, 'https://example.test/invite'), /We would like to propose/);
  assert.doesNotMatch(env.ui.template(env.person, 'online-link', remote, 'https://example.test/invite'), /is scheduled/);
  assert.equal(env.ui.template(env.person, 'online-link', remote), '', 'A link draft cannot invent a missing URL');
  assert.equal(JSON.stringify(env.snapshot), before, 'Draft templates never confirm or alter appointments');
});

test('preparing a private online link opens a draft without previewing, sending or confirming', async () => {
  const env = harness();
  const meeting = { id:'remote-link', candidateId:env.person.id, mode:'online', startsAt:'2026-09-20T17:00:00Z', status:'scheduled' };
  env.snapshot.interviews.push(meeting);
  env.setInterviewDialog(meeting.id);
  env.nodes.set('recVideoInviteUrl', node({ value:'https://example.test/recruiting-interview.html?invite=synthetic-only' }));
  env.ui.composeVideoInvite(meeting.id);
  assert.match(env.get('recSmsDraft').value, /https:\/\/example\.test\/recruiting-interview\.html\?invite=synthetic-only/);
  assert.match(env.get('recSmsDraft').value, /We would like to propose an online video interview/);
  assert.doesNotMatch(env.get('recSmsDraft').value, /\p{Script=Han}|3212|Santa Monica Blvd/u);
  assert.equal(env.get('recSmsBody').value, '');
  assert.equal(env.get('recSendSms').disabled, true);
  assert.equal(meeting.status, 'scheduled');
  await env.ui.sendSms(env.person.id);
  assert.equal(env.calls.length, 0);
});

test('private-link drafting rejects old in-person appointments, wrong dialogs and missing URLs', () => {
  for (const kind of ['legacy','wrong-dialog','missing-url','read-only']) {
    const env = harness();
    const meeting = { id:'restricted-link', candidateId:env.person.id, startsAt:'2026-09-20T17:00:00Z', status:'scheduled' };
    if (kind !== 'legacy') meeting.mode = 'online';
    env.snapshot.interviews.push(meeting);
    env.setInterviewDialog(kind === 'wrong-dialog' ? 'different-interview' : meeting.id);
    if (kind !== 'missing-url') env.nodes.set('recVideoInviteUrl', node({ value:'https://example.test/invite' }));
    if (kind === 'read-only') env.setEdit(false);
    const count = env.modals.length;
    env.ui.composeVideoInvite(meeting.id);
    assert.equal(env.modals.length, count, kind);
    assert.equal(env.calls.length, 0, kind);
  }
});

test('a new online invitation asks for fresh availability when only past online appointments exist', () => {
  const env = harness();
  env.snapshot.interviews.push({ id:'past-online', candidateId:env.person.id, mode:'online', startsAt:'2026-09-18T17:00:00Z', status:'scheduled' });
  const draft = env.ui.template(env.person, 'online-invitation');
  assert.match(draft, /Which dates and times would work/);
  assert.doesNotMatch(draft, /Sep 18|10:00/);
  assert.equal(env.calls.length, 0);
});

test('online composer follow-up templates cannot switch to an earlier in-person appointment', () => {
  const env = harness();
  env.snapshot.interviews.push(
    { id:'in-person-first', candidateId:env.person.id, startsAt:'2026-09-20T16:00:00Z', status:'confirmed', address:'123 Synthetic Store Ave' },
    { id:'online-second', candidateId:env.person.id, mode:'online', startsAt:'2026-09-20T17:00:00Z', status:'scheduled' }
  );
  const button = node({ dataset:{ recAction:'invite-online', recId:env.person.id }, closest:() => null });
  env.emit('click', { closest:() => button });
  for (const kind of ['confirm','reminder','late']) {
    const followUp = node({ dataset:{ recAction:'template', recId:kind }, closest:() => null });
    env.emit('click', { closest:() => followUp });
    assert.match(env.get('recSmsDraft').value, /online video interview/);
    assert.match(env.get('recSmsDraft').value, /10:00 AM/);
    assert.doesNotMatch(env.get('recSmsDraft').value, /123 Synthetic Store Ave|\b9:00 AM\b/);
    assert.equal(env.get('recSendSms').disabled, true);
  }
  assert.equal(env.calls.length, 0);
});

for (const text of ['A', 'Hi', 'OK', 'a'.repeat(190), 'a'.repeat(1600)]) {
  test(`${text.length}-character English preview is send-ready without an extra confirmation checkbox`, async () => {
    const env = harness();
    await env.preview(text);
    assert.equal(env.get('recSmsBody').value, text);
    assert.equal(env.get('recSendSms').disabled, false, 'A valid preview enables the final Send button without a checkbox');
    assert.equal(env.calls.length, 0, 'English preview does not call AI or send SMS');
    assert.match(env.get('recSmsCount').textContent, new RegExp(`${text.length} 个字符`));
    assert.match(env.get('recSmsCount').textContent, /最多 1600.*不用写满/);
    assert.match(env.get('recSmsSendState').textContent, /已就绪.*确认发送英文短信.*无需勾选/);
    assert.equal(env.sent().length, 0, 'Generating the preview never submits a message');
    await env.ui.sendSms(env.person.id);
    assert.equal(env.sent().length, 1);
    assert.equal(env.sent()[0].body.text, text);
    assert.equal(env.sent()[0].body.expectedPhone, env.person.phone);
    assert.match(env.sent()[0].body.clientMessageId, /^synthetic-client-message-/);
    assert.equal(env.get('recSmsDraft').value, '', 'Successful submission clears the submitted draft');
    assert.equal(env.get('recSendSms').disabled, true, 'Another message needs a new preview');
  });
}

test('composer has no duplicate review checkbox or checkbox-dependent send requirement', () => {
  assert.doesNotMatch(source, /recSmsReviewed/, 'Production rendering and handlers must not depend on the removed checkbox');
  for (const language of ['zh', 'en']) {
    const env = harness({ language });
    assert.doesNotMatch(env.modals[0].html, /type="checkbox"|我已核对|I checked the recipient/);
    assert.match(env.modals[0].html, /id="recSmsConfirmationNote"/);
    assert.equal(env.get('recSendSms').disabled, true, 'Opening Messages does not prepare or send anything');
  }
});

test('the final Send button itself submits a valid preview without any other confirmation control', async () => {
  const env = harness();
  await env.preview('Hi');
  assert.equal(env.sent().length, 0);
  assert.equal(env.get('recSendSms').disabled, false);
  const button = node({ dataset:{ recAction:'send-sms', recId:env.person.id }, closest:() => null });
  env.emit('click', { closest:() => button });
  assert.equal(env.sent().length, 1);
  assert.equal(env.sent()[0].body.text, 'Hi');
  await Promise.resolve(); await Promise.resolve();
});

test('typing an English draft alone never generates a preview or enables sending', async () => {
  const env = harness();
  env.get('recSmsDraft').value = 'Hi';
  env.emit('input', env.get('recSmsDraft'));
  assert.equal(env.get('recSmsBody').value, '');
  assert.equal(env.get('recSendSms').disabled, true);
  await env.ui.sendSms(env.person.id);
  assert.equal(env.calls.length, 0);
});

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
    assert.equal(env.get('recSendSms').disabled, true);
    await env.ui.sendSms(env.person.id);
    assert.equal(env.sent().length, 0);
    assert.equal(env.calls.length, 0);
  });
}

test('Chinese short draft must translate, then the final button sends exactly the English preview', async () => {
  const env = harness();
  env.setTranslation({ text: 'Hi', targetLanguage: 'en' });
  await env.preview('你好');
  assert.equal(env.calls.length, 1);
  assert.equal(env.calls[0].path, '/api/recruiting/translate');
  assert.deepEqual(env.calls[0].body, { text: '你好', targetLanguage: 'en' });
  assert.equal(env.get('recSmsBody').value, 'Hi');
  assert.equal(env.sent().length, 0);
  assert.equal(env.get('recSendSms').disabled, false, 'Translated valid English needs no extra checkbox');
  await env.ui.sendSms(env.person.id);
  assert.equal(env.sent()[0].body.text, 'Hi');
});

for (const translated of ['你好', 'Hello 请 confirm', 'Hello 𠀀', '', 'a'.repeat(1601)]) {
  test(`invalid translated preview remains blocked (${translated.slice(0, 20) || 'empty'})`, async () => {
    const env = harness();
    env.setTranslation({ text: translated, targetLanguage: 'en' });
    await env.preview('请确认');
    assert.equal(env.get('recSmsBody').value, '');
    assert.equal(env.get('recSendSms').disabled, true);
    await env.ui.sendSms(env.person.id);
    assert.equal(env.sent().length, 0);
  });
}

for (const [body, reason] of [['你好', /中文/], ['Hello 𠀀', /中文/], ['a'.repeat(1601), /1600/], ['Different English', /当前草稿/], ['', /填写短信内容/], ['   ', /填写短信内容/]]) {
  test(`direct handler rejects tampered preview (${body.slice(0, 20)})`, async () => {
    const env = harness();
    await env.preview('Hi');
    env.get('recSmsBody').value = body;
    env.ui.updateComposeControls();
    assert.equal(env.get('recSendSms').disabled, true);
    await env.ui.sendSms(env.person.id);
    assert.equal(env.sent().length, 0);
    assert.match(env.get('recDialogError').textContent, reason);
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
    await env.preview('OK');
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
    await env.preview('Hi');
    assert.equal(env.ui.smsContactBlockers(env.person).length, 0);
    assert.equal(env.get('recSendSms').disabled, false);
    env.person.phone = '+1 (500) 555-0101';
    env.ui.updateComposeControls();
    assert.equal(env.get('recSendSms').disabled, false, 'Formatting-only change is still the same recipient');
  }
});

test('changed recipient blocks short text until a new composer generates a fresh preview', async () => {
  const env = harness();
  await env.preview('Hi');
  env.person.phone = '+15005550102';
  env.ui.updateComposeControls();
  assert.equal(env.get('recSendSms').disabled, true);
  assert.match(env.get('recSmsSendState').textContent, /手机号已更新/);
  await env.ui.sendSms(env.person.id);
  assert.equal(env.sent().length, 0);
  env.ui.openMessages(env.person.id);
  await env.preview('Hi');
  assert.equal(env.get('recSendSms').disabled, false);
});

test('a valid preview cannot be submitted for a different candidate id', async () => {
  const env = harness();
  await env.preview('Hi');
  await env.ui.sendSms('other-synthetic-candidate');
  assert.equal(env.sent().length, 0);
});

test('consent withdrawn or opt-out after preview still blocks the final Send button and handler', async () => {
  for (const update of [{ smsConsent:false }, { smsConsentNote:'' }, { smsOptedOut:true }]) {
    const env = harness();
    await env.preview('Hi');
    assert.equal(env.get('recSendSms').disabled, false);
    Object.assign(env.person, update);
    env.ui.updateComposeControls();
    assert.equal(env.get('recSendSms').disabled, true);
    await env.ui.sendSms(env.person.id);
    assert.equal(env.sent().length, 0);
  }
});

test('editing a previewed draft invalidates the old preview and send readiness', async () => {
  const env = harness();
  await env.preview('Hi');
  env.get('recSmsDraft').value = 'OK';
  env.emit('input', env.get('recSmsDraft'));
  assert.equal(env.get('recSmsBody').value, '');
  assert.equal(env.get('recSendSms').disabled, true);
  await env.ui.sendSms(env.person.id);
  assert.equal(env.sent().length, 0);
  await env.ui.makeSmsPreview();
  assert.equal(env.get('recSendSms').disabled, false);
});

test('unobserved draft or preview mutation cannot bypass the send handler checks', async () => {
  const env = harness();
  await env.preview('Hi');
  env.get('recSmsDraft').value = 'Changed';
  await env.ui.sendSms(env.person.id);
  assert.equal(env.sent().length, 0);
  assert.match(env.get('recDialogError').textContent, /当前草稿/);
});

for (const flag of ['busy', 'pending']) {
  test(`${flag} blocks preview generation and duplicate sending`, async () => {
    const env = harness();
    await env.preview('Hi');
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
  await env.preview('Hi');
  env.setEdit(false); env.ui.updateComposeControls();
  assert.equal(env.get('recSendSms').disabled, true);
  assert.match(env.get('recSmsSendState').textContent, /招聘编辑权限/);
  await env.ui.makeSmsPreview();
  await env.ui.sendSms(env.person.id);
  assert.equal(env.calls.length, 0);
});

test('loss of view permission closes the composer and prevents stale send', async () => {
  const env = harness();
  await env.preview('Hi');
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
  assert.equal(env.get('recSendSms').disabled, true);
  assert.equal(env.sent().length, 0);
});

test('rapid double invocation of the final send button submits the previewed message only once', async () => {
  const env = harness(), waiting = deferred();
  await env.preview('Hi');
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
  await env.preview('Hi');
  env.setSendResponse({ message: { status: 'send_unknown' } });
  await env.ui.sendSms(env.person.id);
  assert.equal(env.get('recSmsDraft').value, 'Hi');
  assert.match(env.get('recDialogError').textContent, /尚未确认/);
  await env.ui.sendSms(env.person.id);
  assert.equal(env.sent().length, 2, 'Two explicit attempts may occur, each with the same server deduplication key');
  assert.equal(env.sent()[0].body.clientMessageId, env.sent()[1].body.clientMessageId);
});

function ownNumberTest(person, overrides = {}) {
  return { candidateId:person.id, phoneKey:person.phone.replace(/\D/g, '').slice(-10), enabled:true,
    reason:'Synthetic owner-number test', approvedByUserId:'synthetic-owner', approvedAt:new FixtureDate().toISOString(),
    expiresAt:new FixtureDate(fixedNow + 86400000).toISOString(), ...overrides };
}

test('owner approves and revokes a shared-number test in app dialogs without sending or losing the preview', async () => {
  const env = harness({ fields:{ smsCustomerPhoneConflict:true } });
  await env.preview('Hi');
  assert.equal(env.get('recSendSms').disabled, true);
  assert.match(env.ui.smsContactBlockers(env.person).join(' '), /也关联客户/);
  await env.ui.sendSms(env.person.id);
  assert.equal(env.calls.length, 0);
  env.ui.openSharedPhoneTest(env.person.id, true);
  assert.match(env.modals.at(-1).html, /Synthetic Candidate/);
  assert.match(env.modals.at(-1).html, /\+15005550101/);
  assert.match(env.modals.at(-1).html, /24 小时/);
  assert.match(env.modals.at(-1).html, /仅新回复/);
  assert.match(env.modals.at(-1).html, /旧短信和待核对短信均不迁移/);
  assert.match(env.get('modalSave').textContent, /不发短信/);
  assert.equal(env.calls.length, 0, 'Opening a confirmation never saves or sends');
  env.get('recSmsTestReason').value = '这是本人的测试号码，仅用于合成测试。';
  await env.ui.saveSharedPhoneTest();
  const enabled = env.calls.filter(call => call.path.endsWith('/test-sms'));
  assert.equal(enabled.length, 1);
  assert.deepEqual(enabled[0].body, { enabled:true, expectedPhone:'+15005550101', reason:'这是本人的测试号码，仅用于合成测试。' });
  assert.equal(env.person.smsSharedPhoneTest.phoneKey, '5005550101', 'Backend metadata uses ten digits');
  assert.equal(env.ui.sharedPhoneTestActive(env.person), true);
  assert.match(env.get('recSharedPhoneTest').innerHTML, /有效至/);
  assert.equal(env.get('recSmsDraft').value, 'Hi');
  assert.equal(env.get('recSmsBody').value, 'Hi');
  assert.equal(env.get('recSendSms').disabled, false, 'Final Send is still a separate explicit action');
  assert.equal(env.sent().length, 0);
  env.ui.openSharedPhoneTest(env.person.id, false);
  await env.ui.saveSharedPhoneTest();
  assert.equal(env.ui.sharedPhoneTestActive(env.person), false);
  assert.equal(env.get('recSmsBody').value, 'Hi');
  assert.equal(env.get('recSendSms').disabled, true);
  assert.equal(env.calls.filter(call => call.path.endsWith('/test-sms')).length, 2);
  assert.equal(env.sent().length, 0, 'Enable and revoke must never call the SMS endpoint');
});

test('cancelling the test dialog preserves a prior uncertain SMS idempotency key', async () => {
  const env = harness();
  await env.preview('Hi'); env.setSendResponse({ message:{ status:'send_unknown' } });
  await env.ui.sendSms(env.person.id);
  const requestId = env.ui.composer().requestId;
  env.person.smsCustomerPhoneConflict = true;
  env.ui.openSharedPhoneTest(env.person.id, true);
  env.ui.returnFromSharedPhoneTest();
  assert.equal(env.ui.composer().requestId, requestId);
  assert.equal(env.get('recSmsBody').value, 'Hi');
  assert.equal(env.get('recSendSms').disabled, true);
  assert.equal(env.calls.filter(call => call.path.endsWith('/test-sms')).length, 0);
  assert.equal(env.sent().length, 1);
});

test('only an owner with recruiting edit permission can open shared-number test controls', () => {
  for (const kind of ['non-owner', 'read-only-owner']) {
    const env = harness({ fields:{ smsCustomerPhoneConflict:true } });
    if (kind === 'non-owner') env.sandbox.user.role = 'manager'; else env.setEdit(false);
    const before = env.modals.length;
    assert.doesNotMatch(env.ui.sharedPhoneTestHtml(env.person), /data-rec-action="(?:enable|revoke)-shared-phone-test"/);
    env.ui.openSharedPhoneTest(env.person.id, true);
    assert.equal(env.modals.length, before, kind);
    assert.equal(env.calls.length, 0);
  }
});

test('active test metadata stays bound to the candidate, normalized phone and unexpired approval', async () => {
  const env = harness({ fields:{ smsCustomerPhoneConflict:true, smsSharedPhoneTestActive:true } });
  const valid = ownNumberTest(env.person);
  for (const phoneKey of ['5005550101', '15005550101', '+1 (500) 555-0101']) {
    env.person.smsSharedPhoneTest = { ...valid, phoneKey };
    assert.equal(env.ui.sharedPhoneTestActive(env.person), true, phoneKey);
  }
  for (const change of [{ candidateId:'different-candidate' }, { phoneKey:'5005550102' }, { enabled:false }, { expiresAt:new FixtureDate(fixedNow).toISOString() }, { expiresAt:'invalid' }]) {
    env.person.smsSharedPhoneTest = { ...valid, ...change };
    assert.equal(env.ui.sharedPhoneTestActive(env.person), false);
    await env.preview('Hi'); await env.ui.sendSms(env.person.id);
    assert.equal(env.get('recSendSms').disabled, true);
    assert.equal(env.sent().length, 0);
  }
  env.person.smsSharedPhoneTest = valid; env.person.smsSharedPhoneTestActive = false;
  assert.equal(env.ui.sharedPhoneTestActive(env.person), false, 'A false server flag cannot be overridden by metadata');
});

test('shared customer opt-out disables owner enable and still blocks an already-active test', async () => {
  const env = harness({ fields:{ smsCustomerPhoneConflict:true, smsCustomerOptedOut:true } });
  env.ui.updateComposeControls();
  const enable = env.get('recSharedPhoneTest').querySelectorAll('button').find(button => button.dataset.recAction === 'enable-shared-phone-test');
  assert.equal(enable.disabled, true);
  const before = env.modals.length;
  env.ui.openSharedPhoneTest(env.person.id, true);
  assert.equal(env.modals.length, before);
  env.person.smsSharedPhoneTest = ownNumberTest(env.person); env.person.smsSharedPhoneTestActive = true;
  await env.preview('Hi');
  assert.match(env.get('recSmsSendState').textContent, /同号客户资料存在退订记录/);
  await env.ui.sendSms(env.person.id);
  assert.equal(env.calls.length, 0);
});

test('test enable cannot create consent or override candidate opt-out', async () => {
  for (const fields of [{ smsConsent:false }, { smsConsentNote:'' }, { smsOptedOut:true }]) {
    const env = harness({ fields:{ smsCustomerPhoneConflict:true, ...fields } });
    env.ui.openSharedPhoneTest(env.person.id, true);
    await env.ui.saveSharedPhoneTest();
    assert.match(env.get('recDialogError').textContent, /同意/);
    assert.equal(env.calls.length, 0);
    env.person.smsSharedPhoneTest = ownNumberTest(env.person); env.person.smsSharedPhoneTestActive = true;
    env.ui.returnFromSharedPhoneTest(); await env.preview('Hi'); await env.ui.sendSms(env.person.id);
    assert.equal(env.get('recSendSms').disabled, true);
    assert.equal(env.sent().length, 0);
  }
});

test('test confirmation rechecks phone, consent, owner identity and required reason before saving', async () => {
  for (const kind of ['phone', 'consent', 'customer-optout', 'identity', 'reason-empty', 'reason-long']) {
    const env = harness({ fields:{ smsCustomerPhoneConflict:true } });
    env.ui.openSharedPhoneTest(env.person.id, true);
    if (kind === 'phone') env.person.phone = '+15005550102';
    if (kind === 'consent') env.person.smsConsent = false;
    if (kind === 'customer-optout') env.person.smsCustomerOptedOut = true;
    if (kind === 'identity') env.sandbox.token = 'new-synthetic-token';
    if (kind === 'reason-empty') env.get('recSmsTestReason').value = '   ';
    if (kind === 'reason-long') env.get('recSmsTestReason').value = 'a'.repeat(501);
    await env.ui.saveSharedPhoneTest();
    assert.equal(env.calls.length, 0, kind);
  }
});

test('test save is single-flight and a late result cannot replace another composer', async () => {
  const env = harness({ fields:{ smsCustomerPhoneConflict:true } }), waiting = deferred();
  await env.preview('Hi'); env.ui.openSharedPhoneTest(env.person.id, true);
  env.setTestResponse(waiting.promise);
  const first = env.ui.saveSharedPhoneTest(), second = env.ui.saveSharedPhoneTest();
  assert.equal(env.calls.filter(call => call.path.endsWith('/test-sms')).length, 1);
  assert.equal(env.get('modalSave').disabled, true);
  env.ui.openMessages(env.person.id, 'Replacement draft');
  const dialogs = env.modals.length;
  waiting.resolve({ candidate:{ ...env.person, smsSharedPhoneTestActive:true, smsSharedPhoneTest:ownNumberTest(env.person) } });
  await Promise.all([first, second]);
  assert.equal(env.modals.length, dialogs, 'An outdated settings result must not reopen its composer');
  assert.equal(env.get('recSmsDraft').value, 'Replacement draft');
  assert.equal(env.get('recSmsBody').value, '');
  assert.equal(env.get('recSendSms').disabled, true);
  assert.equal(env.sent().length, 0);
});
