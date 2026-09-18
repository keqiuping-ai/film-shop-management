'use strict';

// Run with: node --test scripts/test-recruiting-ui.js
// Execute the actual UI closure with test-only hooks injected in memory. No
// production source is rewritten, no browser/DOM library is loaded, and every
// candidate, date and contact below is synthetic. Network calls fail immediately.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { INTERVIEW_KITS } = require('../lib/recruiting-interview-kits');

const frontendPath = path.join(__dirname, '..', 'public', 'recruiting.js');
const frontendSource = fs.readFileSync(frontendPath, 'utf8');
const hookMarker = '  window.Recruiting = Object.freeze(';
assert.equal(frontendSource.split(hookMarker).length, 2, 'UI test hook must have one unambiguous injection point');
const testHooks = `
  window.__recruitingUiTest = {
    setFixture(snapshot, controls = {}) {
      identity = user.id + ':' + token;
      data = snapshot; loadedAt = 0; loading = null; error = '';
      query = controls.query || ''; status = controls.status || '';
      scope = controls.scope || ''; tab = 'candidates';
      candidateSort = controls.sort || 'applied';
      translationCache.clear(); translationPending.clear();
    },
    filteredCandidates, candidateTable, bilingualBlock, openCandidateProfile, openInterviewKit,
    interviewKitCopyText, scorecardAverage,
    parseApplicationDate, applicationInfo, applicationWhen, recordedWhen,
    applicationDatesHtml, renderPage,
    traceActions(log) {
      openCandidateProfile = id => log.push(['profile', id]);
      openMessages = id => log.push(['messages', id]);
      openInterview = (candidateId, interviewId) => log.push(['interview', candidateId, interviewId]);
    }
  };
`;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const plain = value => JSON.parse(JSON.stringify(value));
const fixedNow = Date.parse('2026-09-17T18:00:00Z');
class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return fixedNow; }
}

function harness(language = 'zh') {
  const listeners = new Map();
  const modals = [];
  const nodes = new Map([
    ['modalSave', { hidden: false, disabled: false }],
    ['modalBody', { scrollTop: 0 }],
    ['modal', { scrollTop: 0, querySelector: () => null, classList: { contains: () => true } }],
    ['recResults', { innerHTML: '' }]
  ]);
  const forbidden = () => { throw new Error('Recruiting UI fixture attempted a network operation'); };
  const sandbox = {
    window: {}, lang: language, user: { id: 'fixture-owner', name: 'Fixture Owner' },
    token: 'synthetic-test-token', state: null, current: '',
    Date: FixtureDate, Intl, URL, escapeHtml, hasPerm: () => true,
    api: forbidden, fetch: forbidden, render: () => {},
    openModal: (title, html, onSave) => modals.push({ title, html, onSave }),
    closeModal: () => {}, requestAnimationFrame: () => {},
    setTimeout: () => 0, setInterval: () => 0,
    MutationObserver: class { observe() {} },
    document: {
      hidden: false,
      getElementById: id => nodes.get(id) || null,
      querySelector: () => null,
      addEventListener(name, callback) {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(callback);
      }
    }
  };
  vm.runInNewContext(frontendSource.replace(hookMarker, testHooks + hookMarker), sandbox, { filename: frontendPath, timeout: 2000 });
  return {
    ui: sandbox.window.__recruitingUiTest, nodes, modals, sandbox,
    emit(name, event) { for (const callback of listeners.get(name) || []) callback(event); },
    fixture(people, controls = {}, meetings = []) {
      sandbox.window.__recruitingUiTest.setFixture({
        candidates: people, interviews: meetings, interviewKits: plain(INTERVIEW_KITS), interviewers: [], quarantine: [],
        translation: { configured: true }, sms: { configured: false },
        settings: { preview: true, remindersEnabled: false }
      }, controls);
    }
  };
}

function candidate(id, fields = {}) {
  return {
    id, name: `Synthetic ${id}`, source: 'Fixture', position: 'Sales', status: 'new',
    createdAt: '2026-09-17T15:00:00Z', messages: [], scores: {}, ...fields
  };
}

function verified(id, appliedAt, fields = {}) {
  return candidate(id, { appliedAt, applicationDateNote: 'Synthetic original application timestamp', ...fields });
}

test('default application order puts verified recent dates first and unknowns last by entry time', () => {
  const env = harness();
  const people = [
    candidate('unknown-old', { createdAt: '2026-09-15T15:00:00Z' }),
    verified('older-application', '2026-09-14', { createdAt: '2026-09-17T17:00:00Z' }),
    candidate('unknown-new', { createdAt: '2026-09-17T17:50:00Z', notes: 'Applied 2 hours ago' }),
    verified('latest-application', '2026-09-17'),
    candidate('date-without-evidence', { appliedAt: '2026-09-17', createdAt: '2026-09-16T18:00:00Z' })
  ];
  env.fixture(people);
  assert.deepEqual(plain(env.ui.filteredCandidates().map(person => person.id)), [
    'latest-application', 'older-application', 'unknown-new', 'date-without-evidence', 'unknown-old'
  ]);
  assert.deepEqual(people.map(person => person.id), ['unknown-old', 'older-application', 'unknown-new', 'latest-application', 'date-without-evidence'], 'render sorting must not mutate source records');
});

test('same application day sorts known instants before date-only records without inventing a time', () => {
  const env = harness();
  env.fixture([
    verified('date-old-entry', '2026-09-17', { createdAt: '2026-09-16T20:00:00Z' }),
    verified('early-instant', '2026-09-17T15:00:00Z'),
    verified('date-new-entry', '2026-09-17', { createdAt: '2026-09-17T17:00:00Z' }),
    verified('late-instant', '2026-09-17T16:00:00Z'),
    verified('previous-pacific-day', '2026-09-17T03:00:00Z')
  ]);
  assert.deepEqual(plain(env.ui.filteredCandidates().map(person => person.id)), [
    'late-instant', 'early-instant', 'date-new-entry', 'date-old-entry', 'previous-pacific-day'
  ]);
});

test('entry-time ordering ignores application dates and preserves query/status filtering', () => {
  const env = harness();
  const people = [
    verified('old-entry-recent-application', '2026-09-17', { createdAt: '2026-09-16T12:00:00Z', name: 'Synthetic Match One', status: 'reviewing' }),
    candidate('new-entry-unknown-application', { createdAt: '2026-09-17T17:00:00Z', name: 'Synthetic Match Two', status: 'reviewing' }),
    verified('middle-entry-old-application', '2026-09-01', { createdAt: '2026-09-17T13:00:00Z', name: 'Synthetic Other', status: 'new' })
  ];
  env.fixture(people, { sort: 'created' });
  assert.deepEqual(plain(env.ui.filteredCandidates().map(person => person.id)), ['new-entry-unknown-application', 'middle-entry-old-application', 'old-entry-recent-application']);
  env.fixture(people, { sort: 'created', query: 'match', status: 'reviewing' });
  assert.deepEqual(plain(env.ui.filteredCandidates().map(person => person.id)), ['new-entry-unknown-application', 'old-entry-recent-application']);
});

test('date-only applications retain their calendar day and explicitly leave time unknown', () => {
  const env = harness();
  const info = env.ui.applicationInfo(verified('date-only', '2026-09-17'));
  assert.deepEqual(plain(env.ui.parseApplicationDate('2026-09-17')), { raw: '2026-09-17', date: '2026-09-17', precision: 'date', instant: null });
  const displayed = env.ui.applicationWhen(info);
  assert.match(displayed, /2026-09-17/);
  assert.match(displayed, /仅日期，时刻未知/);
  assert.doesNotMatch(displayed, /00:00|12:00|2026-09-16/);
  const en = harness('en');
  assert.match(en.ui.applicationWhen(en.ui.applicationInfo(verified('date-only', '2026-09-17'))), /date only, time unknown/);
});

test('exact UTC applications and system-entry timestamps display in Los Angeles including day rollover and winter', () => {
  const env = harness('en');
  for (const [instant, pacificDay] of [['2026-09-17T03:00:00Z', '2026-09-16'], ['2026-01-17T07:30:00Z', '2026-01-16']]) {
    const info = env.ui.applicationInfo(verified('utc', instant));
    assert.equal(info.date, pacificDay);
    const expected = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
    }).format(new Date(instant));
    assert.equal(env.ui.applicationWhen(info), expected);
    assert.equal(env.ui.recordedWhen(instant), expected);
  }
});

test('invalid, relative, missing-source and absent application dates stay unverified', () => {
  const env = harness();
  for (const raw of ['', 'yesterday', '2 days ago', '2026-02-30', '2026-09-17T25:00:00Z', '2026-09-17T10:30:00']) {
    assert.equal(env.ui.parseApplicationDate(raw), null, raw);
    assert.equal(env.ui.applicationInfo(verified('invalid', raw)).verified, false, raw);
  }
  assert.equal(env.ui.applicationInfo(candidate('source-missing', { appliedAt: '2026-09-17' })).verified, false);
  const inferred = candidate('not-inferred', { notes: 'Applied yesterday on Indeed', createdAt: '2026-09-17T17:00:00Z' });
  assert.equal(env.ui.applicationWhen(env.ui.applicationInfo(inferred)), '申请时间未核实');
  assert.equal(env.ui.recordedWhen('not-a-date'), '未记录');
});

test('table exposes separate application/entry columns, unknown group and both sort choices', () => {
  const env = harness();
  env.fixture([verified('known', '2026-09-17'), candidate('unknown')]);
  const html = env.ui.renderPage(false);
  assert.match(html, /申请时间 · 洛杉矶/);
  assert.match(html, /录入系统 · 洛杉矶/);
  assert.match(html, /录入 ≠ 投递/);
  assert.match(html, /class="rec-date-group"/);
  assert.match(html, /申请时间尚未核实/);
  assert.match(html, /id="recCandidateSort"/);
  assert.match(html, /<option value="applied" selected>/);
  assert.match(html, /<option value="created"/);
  env.emit('change', { target: { id: 'recCandidateSort', value: 'created', matches: () => false } });
  assert.match(env.nodes.get('recResults').innerHTML, /按录入系统时间最近优先/);
  assert.doesNotMatch(env.nodes.get('recResults').innerHTML, /class="rec-date-group"/);
});

test('every candidate row opens its profile while messages and scheduling retain their own action targets', () => {
  const env = harness();
  env.fixture([candidate('unscheduled'), candidate('scheduled')], {}, [{
    id: 'fixture-interview', candidateId: 'scheduled', startsAt: '2026-09-18T17:00:00Z', status: 'scheduled'
  }]);
  const rows = [...env.ui.candidateTable().matchAll(/<tr class="rec-candidate-row"[^>]*>[\s\S]*?<\/tr>/g)].map(match => match[0]);
  assert.equal(rows.length, 2);
  for (const [index, id] of ['unscheduled', 'scheduled'].entries()) {
    assert.match(rows[index], new RegExp(`^<tr[^>]*tabindex="0"[^>]*data-rec-action="profile"[^>]*data-rec-id="${id}"`));
    assert.match(rows[index], new RegExp(`<button[^>]*data-rec-action="messages"[^>]*data-rec-id="${id}"`));
  }
  assert.match(rows[0], /<button[^>]*data-rec-action="schedule"[^>]*data-rec-id="unscheduled"/);
  assert.match(rows[1], /<button[^>]*data-rec-action="edit-interview"[^>]*data-rec-id="fixture-interview"/);
  const calls = [];
  env.ui.traceActions(calls);
  for (const [actionName, id] of [['profile', 'unscheduled'], ['messages', 'unscheduled'], ['schedule', 'unscheduled'], ['edit-interview', 'fixture-interview']]) {
    const actionable = { disabled: false, dataset: { recAction: actionName, recId: id }, closest: () => ({ contains: () => false }) };
    env.emit('click', { target: { closest: selector => { assert.equal(selector, '[data-rec-action]'); return actionable; } } });
  }
  assert.deepEqual(calls.map(row => Array.from(row)), [['profile', 'unscheduled'], ['messages', 'unscheduled'], ['interview', 'unscheduled', undefined], ['interview', '', 'fixture-interview']]);
  let prevented = false;
  env.emit('keydown', { key: 'Enter', target: { matches: selector => selector === '.rec-candidate-row', dataset: { recId: 'scheduled' } }, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(Array.from(calls.at(-1)), ['profile', 'scheduled']);
  const count = calls.length;
  env.emit('keydown', { key: 'Enter', target: { matches: () => false, dataset: { recId: 'unscheduled' } } });
  assert.equal(calls.length, count, 'child buttons must not trigger the row keyboard handler');
});

test('selecting row text or modifier-clicking does not unexpectedly open the candidate profile', () => {
  const env = harness();
  env.fixture([candidate('selectable')]);
  const calls = [];
  env.ui.traceActions(calls);
  const row = { contains: node => node === 'selected-fixture-text' };
  const actionable = { disabled: false, dataset: { recAction: 'profile', recId: 'selectable' }, closest: () => row };
  const target = { closest: () => actionable };
  env.sandbox.window.getSelection = () => ({ isCollapsed: false, anchorNode: 'selected-fixture-text', focusNode: null });
  env.emit('click', { target });
  assert.deepEqual(calls, []);
  env.sandbox.window.getSelection = () => ({ isCollapsed: true });
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'defaultPrevented']) env.emit('click', { target, [modifier]: true });
  assert.deepEqual(calls, []);
  env.emit('click', { target });
  assert.deepEqual(plain(calls), [['profile', 'selectable']]);
});

test('profile preserves every character of a 60,000-character resume including its escaped final marker', () => {
  const env = harness();
  const head = 'SYNTHETIC RESUME START\n';
  const tail = '\nSYNTHETIC RESUME END <script>notExecutable()</script> & verified-tail';
  const resumeText = head + 'Relevant sales experience. '.repeat(2500).slice(0, 60000 - head.length - tail.length) + tail;
  assert.equal(resumeText.length, 60000);
  env.fixture([candidate('long-resume', { resumeText })]);
  env.ui.openCandidateProfile('long-resume');
  const html = env.modals.at(-1).html;
  assert.ok(html.includes(escapeHtml(resumeText)), 'full original text must remain present rather than a preview/summary');
  assert.ok(html.includes(escapeHtml(tail)));
  assert.doesNotMatch(html, /<script>notExecutable/);
  assert.match(html, /已保存简历原文与对照/);
  assert.match(html, /data-rec-language="zh"/);
  assert.equal(env.modals.at(-1).onSave, null, 'reading a profile must not create a save action');
  assert.equal(env.nodes.get('modalSave').hidden, true);
});

test('profile keeps short facts in a compact grid while preserving dedicated long-form sections', () => {
  const env = harness();
  env.fixture([candidate('compact-profile', {
    phone: '555-0100', email: '', location: 'Los Angeles, CA', availability: '',
    employmentType: 'full_time', compensation: '', experience: 'Detailed synthetic work history.'
  })]);
  env.ui.openCandidateProfile('compact-profile');
  const html = env.modals.at(-1).html;
  assert.equal((html.match(/class="rec-profile-fact"/g) || []).length, 8);
  assert.equal((html.match(/rec-profile-fact-missing/g) || []).length, 3);
  assert.match(html, /class="rec-profile-contact-row"/);
  assert.match(html, /经验与经历概览 \/ Experience overview/);
  assert.match(html, /Detailed synthetic work history\./);
  assert.match(html, /class="rec-profile-section"/);
});

test('candidate interview kits expose all role variants, exact questions, copy text and restored scores', () => {
  const env = harness();
  const saved = {
    templateId:'dealer_quick_8', scores:{ street_plan:9, entry:7 },
    notes:{ street_plan:'Synthetic territory evidence.' }, overallNote:'Synthetic next round.'
  };
  env.fixture([candidate('kit-candidate', { position:'Dealership field sales', interviewScorecards:[saved] })]);
  env.ui.openInterviewKit('kit-candidate', 'dealer_quick_8');
  const html = env.modals.at(-1).html;
  assert.equal((html.match(/<option value="[^"]+"/g) || []).length, 8);
  assert.equal((html.match(/class="rec-kit-question"/g) || []).length, 8);
  assert.match(html, /value="9"/);
  assert.match(html, /Synthetic territory evidence\./);
  assert.match(html, /Synthetic next round\./);
  const kit = plain(INTERVIEW_KITS.find(item => item.id === 'installer_full_18'));
  const copied = env.ui.interviewKitCopyText(kit, 'zh');
  assert.match(copied, /贴膜技师 · 18题完整版/);
  assert.match(copied, /18\./);
  assert.match(copied, /评分：____ \/ 10/);
  const englishCopy = env.ui.interviewKitCopyText(kit, 'en');
  assert.doesNotMatch(englishCopy, /\p{Script=Han}/u);
  assert.match(englishCopy, /18\./);
  assert.deepEqual(plain(env.ui.scorecardAverage(saved, plain(INTERVIEW_KITS.find(item => item.id === 'dealer_quick_8')))), { completed:2, total:8, average:8 });
});

test('PDF-only profiles explicitly say text is not extracted and never offer fake full-resume translation', () => {
  const env = harness();
  env.fixture([candidate('pdf-only', {
    experience: 'Synthetic summary only; not the original resume.',
    resume: { name: 'synthetic-resume.pdf', mimeType: 'application/pdf' }, resumeText: ''
  })]);
  env.ui.openCandidateProfile('pdf-only');
  const html = env.modals.at(-1).html;
  const resumeSection = html.match(/<section class="rec-profile-section rec-resume-section">([\s\S]*?)<\/section>/)?.[1];
  assert.ok(resumeSection, 'resume attachment section must be present');
  assert.match(resumeSection, /已上传 PDF，但尚未提取文字，暂不能生成全文对照/);
  assert.match(resumeSection, /data-rec-action="view-resume"/);
  assert.match(resumeSection, /synthetic-resume\.pdf/);
  assert.doesNotMatch(resumeSection, /data-rec-translation-block|data-rec-action="translate-reading"|rec-original-text/);
  assert.ok(!resumeSection.includes('Synthetic summary only'), 'summary must not be substituted for the missing resume');
});

test('missing originals and attachments remain clearly marked instead of claiming a complete resume', () => {
  const env = harness('en');
  env.fixture([candidate('no-resume', { experience: 'Synthetic sales summary.' })]);
  env.ui.openCandidateProfile('no-resume');
  const html = env.modals.at(-1).html;
  assert.match(html, /Original resume text is missing\. The experience summary is not a full resume/);
  assert.match(html, /No PDF attachment/);
  assert.doesNotMatch(html, /data-rec-action="view-resume"/);
});

test('mixed Chinese/English originals default to Chinese comparison and expose both target languages', () => {
  const env = harness();
  env.fixture([]);
  const mixed = '中文导入说明\nSales Associate — 2020–2026\nDeveloped dealership partnerships.';
  const html = env.ui.bilingualBlock('mixed', 'Fixture bilingual summary', mixed);
  assert.match(html, /data-rec-language="zh"/);
  assert.match(html, /<select[^>]*data-rec-translation-language/);
  assert.match(html, /<option value="zh" selected>/);
  assert.match(html, /<option value="en"/);
  assert.ok(html.includes(escapeHtml(mixed)));
  assert.match(env.ui.bilingualBlock('chinese', 'Fixture summary', '中文销售经历'), /data-rec-language="en"/);
  assert.match(env.ui.bilingualBlock('resume', 'Fixture resume', '中文销售经历', 'zh'), /data-rec-language="zh"/);
});

test('changing a mixed original back to Chinese resets only its comparison and performs no translation request', () => {
  const env = harness();
  env.fixture([]);
  const mixed = '中文导入说明\nSales Associate — synthetic experience.';
  const elements = {
    '.rec-original-text': { textContent: mixed },
    '.rec-translation-title': { textContent: '中文对照 / Chinese translation' },
    '.rec-translated-text': { textContent: 'Previous synthetic translation' },
    '.rec-translation-status': { textContent: '' },
    '[data-rec-action="translate-reading"]': { disabled: false }
  };
  const block = { dataset: { recId: 'mixed', recLanguage: 'zh' }, querySelector: selector => elements[selector] };
  const select = {
    value: 'en', matches: selector => selector === '[data-rec-translation-language]',
    closest: selector => selector === '[data-rec-translation-block]' ? block : null
  };
  env.emit('change', { target: select });
  assert.equal(block.dataset.recLanguage, 'en');
  assert.match(elements['.rec-translation-title'].textContent, /English translation/);
  select.value = 'zh';
  env.emit('change', { target: select });
  assert.equal(block.dataset.recLanguage, 'zh');
  assert.equal(elements['.rec-translation-title'].textContent, '中文对照 / Chinese translation');
  assert.match(elements['.rec-translated-text'].textContent, /尚未翻译/);
  assert.doesNotMatch(elements['.rec-translated-text'].textContent, /Previous synthetic translation/);
  assert.equal(elements['.rec-original-text'].textContent, mixed);
  assert.equal(elements['[data-rec-action="translate-reading"]'].disabled, false);
  select.value = 'invalid';
  env.emit('change', { target: select });
  assert.equal(block.dataset.recLanguage, 'zh', 'unsupported target language must be ignored');
});
