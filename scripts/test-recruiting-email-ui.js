'use strict';

// Real UI closure, synthetic DOM/API only. No mail provider, AI service, browser
// mail application, production account or database is contacted by these tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const frontendPath = path.join(__dirname, '..', 'public', 'recruiting.js');
const source = fs.readFileSync(frontendPath, 'utf8');
const marker = '  window.Recruiting = Object.freeze(';
assert.equal(source.split(marker).length, 2);
const hooks = `
  window.__emailUiTest = {
    setFixture(snapshot) { identity = user.id + ':' + token; data = snapshot; loadedAt = 0; loading = null; error = ''; busy = false; },
    openEmailMessages, makeEmailPreview, sendEmail, openReviewedEmailApp, invalidateEmailPreview,
    emailContactBlockers, emailComposeBlockers, updateEmailComposeControls, updateOpenEmailThread,
    refreshEmailMessages, emailThreadHtml, onlineWorkflowHtml, candidateTable, openCandidateProfile,
    openCandidate, composeVideoInvite, template, checkIdentity,
    composer: () => emailComposeContext,
    setBusy(value) { busy = value; }
  };
`;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const unescapeHtml = value => String(value || '').replace(/&(amp|lt|gt|quot|#39);/g, (_, key) => ({ amp:'&', lt:'<', gt:'>', quot:'"', '#39':"'" }[key]));
const node = (fields = {}) => ({ value:'', textContent:'', innerHTML:'', checked:false, disabled:false, hidden:false, readOnly:false, isConnected:true, className:'', dataset:{}, scrollTop:0, setAttribute() {}, focus() {}, checkValidity:() => true, matches:() => false, querySelector:() => null, querySelectorAll:() => [], ...fields });
const fixedNow = Date.parse('2026-09-19T18:00:00Z');
class FixtureDate extends Date { constructor(...args) { super(...(args.length ? args : [fixedNow])); } static now() { return fixedNow; } }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function flush() { for (let n = 0; n < 12; n++) await Promise.resolve(); }

function harness({ fields = {}, configured = true, edit = true, language = 'en' } = {}) {
  const person = { id:'synthetic-email-candidate', name:'Synthetic Candidate', email:'candidate@example.invalid', phone:'', smsConsent:false, smsOptedOut:true, messages:[], emailMessages:[], status:'new', ...fields };
  const snapshot = { candidates:[person], interviews:[], interviewers:[], quarantine:[], translation:{ configured:true }, sms:{ configured:false }, email:{ configured, from:'QUAD Demo <sender@example.invalid>', replyTo:'replies@example.invalid', inboundConfigured:false }, settings:{ preview:true, remindersEnabled:false } };
  const nodes = new Map([['modalSave', node()], ['modalBody', node()], ['modal', node({ classList:{ contains:() => true } })]]);
  const calls = [], mailtos = [], modals = [], listeners = new Map(), modalNodeIds = new Set();
  let dialog, editAllowed = edit, viewAllowed = true, uuid = 0;
  let reading = () => snapshot;
  let translation = () => ({ text:'English translation', targetLanguage:'en' });
  let sending = () => ({ message:{ id:'synthetic-email', status:'accepted', subject:'Interview', text:'Hello', to:person.email, createdAt:new FixtureDate().toISOString() } });
  const sandbox = {
    window:{ crypto:{ randomUUID:() => `synthetic-email-id-${++uuid}` }, location:{ assign:url => mailtos.push(url) } },
    lang:language, user:{ id:'synthetic-owner', role:'owner' }, token:'synthetic-token', state:null, current:'', Date:FixtureDate, Intl, URL,
    escapeHtml, hasPerm:permission => permission === 'recruitingEdit' ? editAllowed : viewAllowed,
    api:async (apiPath, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ path:apiPath, method:options.method || 'GET', body });
      if (apiPath === '/api/recruiting') return reading();
      if (apiPath === '/api/recruiting/translate') return translation(body);
      if (apiPath === `/api/recruiting/candidates/${person.id}/email-messages`) return sending(body);
      if (apiPath === `/api/recruiting/candidates/${person.id}` && options.method === 'PATCH') { Object.assign(person, body); return { candidate:person }; }
      throw new Error(`Forbidden synthetic API route: ${apiPath}`);
    },
    fetch:() => { throw new Error('Real network is forbidden'); }, render() {}, requestAnimationFrame() {}, setTimeout:() => 0, setInterval:() => 0,
    MutationObserver:class { observe() {} },
    openModal(title, html, onSave) {
      modals.push({ title, html, onSave }); if (dialog) dialog.isConnected = false;
      for (const id of modalNodeIds) nodes.delete(id); modalNodeIds.clear();
      const match = html.match(/data-rec-dialog="([^"]+)" data-rec-id="([^"]+)"/);
      const actions = new Map([...html.matchAll(/<button\b([^>]*)>/g)].map(m => [m[1].match(/data-rec-action="([^"]+)"/)?.[1], node({ disabled:/\bdisabled\b/.test(m[1]) })]));
      dialog = node({ dataset:{ recDialog:match?.[1], recId:match?.[2] }, querySelector:selector => actions.get(selector.match(/data-rec-action="([^"]+)"/)?.[1]) || null, querySelectorAll:() => [...modalNodeIds].map(id => nodes.get(id)) });
      for (const m of html.matchAll(/<(?:div|textarea|input|button|span|p|summary|select)\b([^>]*\sid="([^"]+)"[^>]*)>/g)) {
        const content = html.match(new RegExp(`<textarea\\b[^>]*id="${m[2]}"[^>]*>([\\s\\S]*?)</textarea>`))?.[1] ?? m[1].match(/\bvalue="([^"]*)"/)?.[1] ?? '';
        nodes.set(m[2], node({ id:m[2], value:unescapeHtml(content), disabled:/\bdisabled\b/.test(m[1]), checked:/\bchecked\b/.test(m[1]), readOnly:/\breadonly\b/.test(m[1]) })); modalNodeIds.add(m[2]);
      }
      nodes.get('modalSave').onclick = onSave;
    },
    closeModal() { if (dialog) dialog.isConnected = false; dialog = null; },
    document:{ hidden:false, getElementById:id => nodes.get(id) || null,
      querySelector:selector => selector.startsWith('[data-rec-dialog') && !selector.includes(' > ') && (!selector.match(/data-rec-dialog="([^"]+)"/) || selector.match(/data-rec-dialog="([^"]+)"/)[1] === dialog?.dataset.recDialog) ? dialog : null,
      addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); }
    }
  };
  vm.runInNewContext(source.replace(marker, hooks + marker), sandbox, { filename:frontendPath, timeout:2000 });
  const ui = sandbox.window.__emailUiTest; ui.setFixture(snapshot); ui.openEmailMessages(person.id);
  return { ui, snapshot, person, nodes, modals, calls, mailtos, sandbox,
    get:id => nodes.get(id), sent:() => calls.filter(c => c.path.endsWith('/email-messages')),
    translations:() => calls.filter(c => c.path.endsWith('/translate')),
    setTranslation:fn => { translation = fn; }, setSending:fn => { sending = fn; }, setReading:fn => { reading = fn; }, setEdit:value => { editAllowed = value; }, setView:value => { viewAllowed = value; },
    async preview(subject = 'Interview invitation', text = 'Hello. When are you available for an online interview?') { nodes.get('recEmailSubjectDraft').value = subject; nodes.get('recEmailDraft').value = text; ui.invalidateEmailPreview(); await ui.makeEmailPreview(); },
    click(action, id = person.id) { const target = node({ dataset:{ recAction:action, recId:id }, closest:() => null }); for (const fn of listeners.get('click') || []) fn({ target:{ closest:() => target } }); },
    input(id) { for (const fn of listeners.get('input') || []) fn({ target:nodes.get(id) }); },
    setInterviewDialog(id) { if (dialog) dialog.isConnected = false; dialog = node({ dataset:{ recDialog:'interview', recId:person.id, recInterviewId:id } }); },
    dialog:() => dialog
  };
}

test('no-phone candidates get primary email invite, without requiring or altering SMS permission', async () => {
  const env = harness(), before = JSON.stringify(env.snapshot);
  const workflow = env.ui.onlineWorkflowHtml(env.person);
  assert.match(workflow, /class="btn primary" data-rec-action="invite-online-email"/);
  assert.match(workflow, /data-rec-action="invite-online"/);
  assert.match(env.ui.candidateTable(), /data-rec-action="email-messages"/);
  env.click('invite-online-email');
  assert.match(env.get('recEmailDraft').value, /online video interview/);
  assert.doesNotMatch(env.get('recEmailDraft').value, /Reply STOP|3212|Santa Monica Blvd/);
  assert.equal(env.get('recSendEmail').disabled, true);
  assert.equal(env.get('recEmailBodyPreview').value, '');
  assert.equal(env.calls.length, 0); assert.equal(JSON.stringify(env.snapshot), before);
  await env.ui.makeEmailPreview();
  assert.equal(env.get('recSendEmail').disabled, false, 'No phone, SMS opt-out and no SMS consent do not block email');
});

test('English preview is manual, atomic and readonly; explicit send is the only write', async () => {
  const env = harness();
  assert.equal(env.get('recEmailSubjectPreview').readOnly, true); assert.equal(env.get('recEmailBodyPreview').readOnly, true);
  await env.ui.sendEmail(env.person.id); env.ui.openReviewedEmailApp(env.person.id);
  assert.equal(env.calls.length, 0); assert.equal(env.mailtos.length, 0);
  await env.preview();
  assert.equal(env.calls.length, 0); assert.equal(env.get('recSendEmail').disabled, false);
  assert.equal(env.get('recOpenEmailApp').disabled, false);
  assert.match(env.get('recEmailPreviewState').textContent, /not sent/);
  const status = env.person.status;
  await env.ui.sendEmail(env.person.id);
  assert.equal(env.sent().length, 1);
  assert.deepEqual(Object.keys(env.sent()[0].body).sort(), ['clientMessageId','expectedEmail','subject','text']);
  assert.equal(env.sent()[0].body.expectedEmail, env.person.email);
  assert.equal(env.get('recEmailDraft').value, ''); assert.equal(env.get('recSendEmail').disabled, true);
  assert.equal(env.person.status, status); assert.equal(env.snapshot.interviews.length, 0);
  assert.match(env.get('recDialogError').textContent, /does not prove delivery/);
});

test('subject and body translations must both complete before any preview appears', async () => {
  const env = harness(), subject = deferred(), body = deferred();
  env.setTranslation(({ text }) => text === '面试邀请' ? subject.promise : body.promise);
  const pending = env.preview('面试邀请', '请参加线上面试'); await flush();
  assert.equal(env.translations().length, 1); assert.equal(env.get('recSendEmail').disabled, true);
  subject.resolve({ text:'Interview invitation', targetLanguage:'en' }); await flush();
  assert.equal(env.translations().length, 2); assert.equal(env.get('recEmailSubjectPreview').value, ''); assert.equal(env.get('recEmailBodyPreview').value, '');
  await env.ui.sendEmail(env.person.id); assert.equal(env.sent().length, 0);
  body.resolve({ text:'Please attend an online interview.', targetLanguage:'en' }); await pending;
  assert.equal(env.get('recEmailSubjectPreview').value, 'Interview invitation'); assert.equal(env.get('recSendEmail').disabled, false);
});

test('body translation failure retains drafts but does not expose a sendable partial email', async () => {
  const env = harness();
  env.setTranslation(({ text }) => { if (text === '面试邀请') return { text:'Interview invitation', targetLanguage:'en' }; throw new Error('Synthetic translation unavailable'); });
  await env.preview('面试邀请', '请参加线上面试');
  assert.equal(env.get('recEmailSubjectPreview').value, ''); assert.equal(env.get('recEmailBodyPreview').value, '');
  assert.equal(env.get('recEmailDraft').value, '请参加线上面试'); assert.equal(env.get('recSendEmail').disabled, true);
  assert.match(env.get('recDialogError').textContent, /Synthetic translation unavailable/);
});

test('unconfigured service still offers primary reviewed external draft without writes', async () => {
  const env = harness({ configured:false });
  env.snapshot.email.configuration = { providerConfigured:false, senderConfigured:false, replyToConfigured:false };
  await env.preview('Interview & details', 'Hello\nWhen can you join?');
  assert.equal(env.get('recSendEmail').disabled, true); assert.equal(env.get('recSendEmail').className, 'btn');
  assert.equal(env.get('recOpenEmailApp').disabled, false); assert.equal(env.get('recOpenEmailApp').className, 'btn primary');
  assert.match(env.get('recEmailSender').textContent, /email service, sender address, reply mailbox/);
  const before = JSON.stringify(env.snapshot); await env.ui.sendEmail(env.person.id); await env.ui.openReviewedEmailApp(env.person.id);
  assert.equal(env.calls.length, 1); assert.equal(env.calls[0].method, 'GET'); assert.equal(env.mailtos.length, 1); assert.equal(JSON.stringify(env.snapshot), before);
  const uri = new URL(env.mailtos[0]);
  assert.equal(uri.protocol, 'mailto:'); assert.equal(decodeURIComponent(uri.pathname), env.person.email);
  assert.equal(uri.searchParams.get('subject'), 'Interview & details'); assert.equal(uri.searchParams.get('body'), 'Hello\nWhen can you join?');
  assert.match(env.get('recDialogError').textContent, /click Send there/); assert.match(env.get('recDialogError').textContent, /has not sent or recorded an email/);
});

for (const email of ['', 'no-at-symbol', 'a@b', 'a@example.invalid,b@example.invalid', 'a@example.invalid; b@example.invalid', '<a@example.invalid>', 'a@example.invalid\r\nBcc: b@example.invalid']) {
  test(`invalid or multiple recipient is blocked: ${JSON.stringify(email)}`, async () => {
    const env = harness({ fields:{ email } }); await env.preview();
    assert.equal(env.get('recSendEmail').disabled, true); assert.equal(env.get('recOpenEmailApp').disabled, true);
    await env.ui.sendEmail(env.person.id); env.ui.openReviewedEmailApp(env.person.id);
    assert.equal(env.sent().length, 0); assert.equal(env.mailtos.length, 0);
  });
}

for (const field of ['emailOptedOut','doNotContact']) {
  test(`${field} blocks direct and external mail while preserving readable address/history`, async () => {
    const env = harness({ fields:{ [field]:true, emailMessages:[{ subject:'Previous invitation', text:'Hello', status:'accepted' }] } });
    await env.preview(); await env.ui.sendEmail(env.person.id); env.ui.openReviewedEmailApp(env.person.id);
    assert.equal(env.get('recSendEmail').disabled, true); assert.equal(env.get('recOpenEmailApp').disabled, true);
    assert.equal(env.sent().length, 0); assert.equal(env.mailtos.length, 0);
    env.ui.openCandidateProfile(env.person.id);
    assert.match(env.modals.at(-1).html, /candidate@example.invalid/); assert.doesNotMatch(env.modals.at(-1).html, /href="mailto:/);
    env.ui.openEmailMessages(env.person.id); assert.match(env.modals.at(-1).html, /Previous invitation/);
  });
}

test('recipient and direct sender changes invalidate authorization; email case normalization is supported', async () => {
  const env = harness(); await env.preview();
  env.person.email = 'other@example.invalid'; env.ui.updateEmailComposeControls();
  assert.equal(env.get('recOpenEmailApp').disabled, true); await env.ui.sendEmail(env.person.id); assert.equal(env.sent().length, 0);
  env.person.email = 'CANDIDATE@example.invalid'; env.ui.updateEmailComposeControls(); assert.equal(env.get('recSendEmail').disabled, false);
  env.snapshot.email.replyTo = 'changed@example.invalid'; env.ui.updateEmailComposeControls(); assert.equal(env.get('recSendEmail').disabled, true);
  await env.ui.sendEmail(env.person.id); assert.equal(env.sent().length, 0);
});

for (const change of ['candidate','close','reopen','token','user','view','edit','busy']) {
  test(`stale or unauthorized composer cannot send or open external draft: ${change}`, async () => {
    const env = harness(); await env.preview();
    let id = env.person.id;
    if (change === 'candidate') id = 'different-candidate';
    if (change === 'close') env.sandbox.closeModal();
    if (change === 'reopen') env.ui.openEmailMessages(env.person.id);
    if (change === 'token') env.sandbox.token = 'new-token';
    if (change === 'user') env.sandbox.user = { id:'other-user' };
    if (change === 'view') env.setView(false);
    if (change === 'edit') env.setEdit(false);
    if (change === 'busy') env.ui.setBusy(true);
    await env.ui.sendEmail(id); env.ui.openReviewedEmailApp(id);
    assert.equal(env.sent().length, 0); assert.equal(env.mailtos.length, 0);
  });
}

for (const id of ['recEmailSubjectDraft','recEmailDraft','recEmailSubjectPreview','recEmailBodyPreview']) {
  test(`editing ${id} invalidates both previews`, async () => {
    const env = harness(); await env.preview(); env.get(id).value += ' changed'; env.input(id);
    assert.equal(env.get('recEmailSubjectPreview').value, ''); assert.equal(env.get('recEmailBodyPreview').value, '');
    await env.ui.sendEmail(env.person.id); env.ui.openReviewedEmailApp(env.person.id);
    assert.equal(env.sent().length, 0); assert.equal(env.mailtos.length, 0);
  });
}

for (const [subject, text] of [['','Hello'], ['Invite',''], ['a'.repeat(201),'Hello'], ['Invite','a'.repeat(10001)], ['Invite\r\nBcc: other@example.invalid','Hello']]) {
  test(`invalid draft length or header is blocked (${subject.length}/${text.length})`, async () => {
    const env = harness(); await env.preview(subject, text); assert.equal(env.get('recSendEmail').disabled, true); assert.equal(env.calls.length, 0);
  });
}
for (const result of [{ text:'', targetLanguage:'en' }, { text:'仍是中文', targetLanguage:'en' }, { text:'Hello', targetLanguage:'zh' }, { text:'a'.repeat(201), targetLanguage:'en' }]) {
  test(`invalid translated subject never becomes ready: ${result.text.length}/${result.targetLanguage}`, async () => {
    const env = harness(); env.setTranslation(() => result); await env.preview('面试邀请', 'Hello');
    assert.equal(env.get('recSendEmail').disabled, true); assert.equal(env.get('recEmailBodyPreview').value, '');
  });
}

for (const change of ['draft','close','reopen','identity']) {
  test(`in-flight translation cannot fill stale context after ${change}`, async () => {
    const env = harness(), wait = deferred(); env.setTranslation(() => wait.promise);
    const pending = env.preview('面试邀请', 'Hello'); await flush();
    if (change === 'draft') { env.get('recEmailDraft').value = 'Changed draft'; env.ui.invalidateEmailPreview(); }
    if (change === 'close') env.sandbox.closeModal();
    if (change === 'reopen') env.ui.openEmailMessages(env.person.id);
    if (change === 'identity') env.sandbox.token = 'new-token';
    wait.resolve({ text:'Interview invitation', targetLanguage:'en' }); await pending;
    assert.equal(env.get('recEmailSubjectPreview')?.value || '', ''); assert.equal(env.get('recEmailBodyPreview')?.value || '', '');
    assert.equal(env.sent().length, 0);
  });
}

test('duplicate clicks are serialized and retry of uncertain result keeps the idempotency key', async () => {
  const env = harness(), wait = deferred(); await env.preview(); env.setSending(() => wait.promise);
  const pending = env.ui.sendEmail(env.person.id); await env.ui.sendEmail(env.person.id); assert.equal(env.sent().length, 1);
  wait.resolve({ message:{ status:'future-status' } }); await pending;
  assert.notEqual(env.get('recEmailDraft').value, ''); assert.match(env.get('recDialogError').textContent, /unconfirmed/);
  const first = env.sent()[0].body.clientMessageId;
  env.setSending(() => ({ message:{ status:'sending' } })); await env.ui.sendEmail(env.person.id);
  assert.equal(env.sent()[1].body.clientMessageId, first);
  await env.preview('Different subject', 'Different body'); await env.ui.sendEmail(env.person.id);
  assert.notEqual(env.sent()[2].body.clientMessageId, first);
});

for (const status of ['failed','undelivered','bounced','rejected','cancelled',undefined,'future-status']) {
  test(`non-success response ${status} preserves draft without false success`, async () => {
    const env = harness(); await env.preview(); env.setSending(() => ({ message:{ status } })); await env.ui.sendEmail(env.person.id);
    assert.notEqual(env.get('recEmailDraft').value, ''); assert.equal(env.get('recDialogError').className, 'rec-alert');
    assert.equal(env.person.status, 'new'); assert.equal(env.snapshot.interviews.length, 0);
  });
}

test('transport failure preserves original draft and same retry id', async () => {
  const env = harness(); await env.preview(); env.setSending(() => { throw new Error('Synthetic timeout'); });
  await env.ui.sendEmail(env.person.id); await env.ui.sendEmail(env.person.id);
  assert.equal(env.sent()[0].body.clientMessageId, env.sent()[1].body.clientMessageId); assert.notEqual(env.get('recEmailDraft').value, '');
  assert.match(env.get('recDialogError').textContent, /Refresh sent history to verify first/);
});

test('refresh retains draft, updates independent email count/history and does not mark SMS read', async () => {
  const env = harness({ fields:{ messages:[{ text:'SMS only secret', direction:'inbound', readAt:null }] } }); await env.preview();
  env.person.emailMessages.push({ id:'mail1', subject:'Mail only', text:'Email body', status:'accepted', createdAt:new FixtureDate().toISOString() });
  await env.ui.refreshEmailMessages(env.person.id);
  assert.match(env.get('recEmailHistorySummary').textContent, /1$/); assert.match(env.get('recEmailThreads').innerHTML, /Mail only/);
  assert.doesNotMatch(env.get('recEmailThreads').innerHTML, /SMS only secret/); assert.match(env.get('recEmailThreads').innerHTML, /not proof of delivery/);
  assert.equal(env.get('recSendEmail').disabled, false); assert.equal(env.person.messages[0].readAt, null);
  assert.equal(env.calls.every(c => c.method === 'GET'), true);
});

test('Indeed relay and absent inbound sync are explicit; read-only user cannot send even fallback', async () => {
  const env = harness({ fields:{ email:'conversation-demo@indeedemail.com' }, edit:false });
  assert.match(env.modals[0].html, /Indeed relay address/); assert.match(env.modals[0].html, /Replies are not synced here automatically/);
  assert.equal(env.get('recSendEmail'), undefined); assert.equal(env.get('recOpenEmailApp'), undefined);
  env.ui.openReviewedEmailApp(env.person.id); await env.ui.sendEmail(env.person.id);
  assert.equal(env.calls.length, 0); assert.equal(env.mailtos.length, 0);
});

test('video invitation email uses candidate link, never host link or wrong-mode appointment', () => {
  const env = harness();
  const meeting = { id:'synthetic-online', candidateId:env.person.id, mode:'online', status:'scheduled', startsAt:'2026-09-20T17:00:00Z' };
  env.snapshot.interviews.push(meeting); env.setInterviewDialog(meeting.id);
  env.nodes.set('recVideoInviteUrl', node({ value:'https://example.invalid/recruiting-interview.html?invite=synthetic-candidate' }));
  env.ui.composeVideoInvite(meeting.id, 'email');
  const draft = env.get('recEmailDraft').value;
  assert.match(draft, /\?invite=synthetic-candidate/); assert.doesNotMatch(draft, /\?interview=|Reply STOP|3212|Santa Monica Blvd/);
  assert.match(draft, /propose an online video interview/); assert.equal(meeting.status, 'scheduled'); assert.equal(env.calls.length, 0);
  assert.equal(env.get('recEmailBodyPreview').value, '');
  meeting.mode = 'in_person'; env.setInterviewDialog(meeting.id); const count = env.modals.length;
  env.ui.composeVideoInvite(meeting.id, 'email'); assert.equal(env.modals.length, count);
});

test('email follow-up templates choose online time instead of earlier legacy in-person time', () => {
  const env = harness();
  env.snapshot.interviews.push({ id:'legacy', candidateId:env.person.id, status:'confirmed', startsAt:'2026-09-20T16:00:00Z', address:'123 Synthetic Store' }, { id:'online', candidateId:env.person.id, mode:'online', status:'scheduled', startsAt:'2026-09-20T17:00:00Z' });
  const before = JSON.stringify(env.snapshot); env.click('email-template', 'confirm');
  assert.match(env.get('recEmailDraft').value, /10:00/); assert.doesNotMatch(env.get('recEmailDraft').value, /9:00|123 Synthetic Store|Reply STOP/);
  assert.equal(env.get('recEmailBodyPreview').value, ''); assert.equal(JSON.stringify(env.snapshot), before);
});

test('profile persists email stop separately without changing SMS consent or sending a message', async () => {
  const env = harness(); env.ui.openCandidate(env.person.id);
  assert.match(env.modals.at(-1).html, /Candidate requested no further email contact/); assert.doesNotMatch(env.modals.at(-1).html, /href="mailto:/);
  env.get('recEmailOptedOut').checked = true; env.get('recEmailOptOutNote').value = 'Candidate emailed request on 2026-09-19';
  await env.get('modalSave').onclick();
  const patch = env.calls.find(c => c.method === 'PATCH'); assert.ok(patch);
  assert.equal(patch.body.emailOptedOut, true); assert.equal(patch.body.emailOptOutNote, 'Candidate emailed request on 2026-09-19');
  assert.equal(patch.body.smsConsent, false); assert.equal(env.sent().length, 0); assert.equal(env.mailtos.length, 0);
});

for (const change of ['optout','doNotContact','email','duplicate','missing','read-failure','empty-error']) {
  test(`external draft refresh fails closed on latest server change: ${change}`, async () => {
    const env = harness({ configured:false }); await env.preview();
    env.setReading(() => {
      if (change === 'read-failure') throw new Error('Synthetic read failed');
      if (change === 'empty-error') throw new Error('');
      const fresh = JSON.parse(JSON.stringify(env.snapshot)), person = fresh.candidates[0];
      if (change === 'optout') person.emailOptedOut = true;
      if (change === 'doNotContact') person.doNotContact = true;
      if (change === 'email') person.email = 'updated@example.invalid';
      if (change === 'duplicate') fresh.candidates.push({ ...person, id:'another-profile', email:'CANDIDATE@example.invalid' });
      if (change === 'missing') fresh.candidates = [];
      return fresh;
    });
    await env.ui.openReviewedEmailApp(env.person.id);
    assert.equal(env.mailtos.length, 0); assert.equal(env.sent().length, 0);
    assert.equal(env.get('recDialogError').className, 'rec-alert');
    assert.equal(env.calls.filter(c => c.method !== 'GET').length, 0);
  });
}

for (const change of ['draft','preview','reopen','identity','permission']) {
  test(`external draft refresh cannot open a stale or changed review: ${change}`, async () => {
    const env = harness({ configured:false }), wait = deferred(); await env.preview();
    env.setReading(() => wait.promise);
    const pending = env.ui.openReviewedEmailApp(env.person.id);
    await env.ui.openReviewedEmailApp(env.person.id);
    assert.equal(env.calls.length, 1, 'Pending handoff cannot be duplicated');
    if (change === 'draft') { env.get('recEmailDraft').value = 'Changed'; env.ui.invalidateEmailPreview(); }
    if (change === 'preview') env.get('recEmailBodyPreview').value = 'Tampered';
    if (change === 'reopen') env.ui.openEmailMessages(env.person.id);
    if (change === 'identity') env.sandbox.token = 'new-token';
    if (change === 'permission') env.setEdit(false);
    wait.resolve(env.snapshot); await pending;
    assert.equal(env.mailtos.length, 0); assert.equal(env.sent().length, 0);
  });
}

test('duplicate normalized email blocks both channels before any provider request', async () => {
  const env = harness(); env.snapshot.candidates.push({ id:'duplicate', name:'Other', email:' CANDIDATE@example.invalid ' });
  await env.preview(); await env.ui.sendEmail(env.person.id); await env.ui.openReviewedEmailApp(env.person.id);
  assert.equal(env.get('recSendEmail').disabled, true); assert.equal(env.get('recOpenEmailApp').disabled, true);
  assert.equal(env.calls.length, 0); assert.equal(env.mailtos.length, 0);
});
