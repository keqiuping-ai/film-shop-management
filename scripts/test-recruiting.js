/*
 * Isolated HTTP integration tests: node scripts/test-recruiting.js
 * UI preview: RECRUITING_UI_PREVIEW=1 node scripts/test-recruiting.js
 * Uses a fresh temporary DATA_DIR, synthetic accounts, and a loopback SMS provider.
 * No credentials are inherited; the child blocks all non-loopback fetch calls.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-recruiting-test-'));
const DB_PATH = path.join(DATA_DIR, 'db.json');
const AUTH_TOKEN = 'recruiting-isolated-test-auth-not-a-real-credential';
const FROM_NUMBER = '+15005550006';
const PASSWORD = 'local-recruiting-test-only';
const PREVIEW = process.env.RECRUITING_UI_PREVIEW === '1';
let server;
let provider;
let baseUrl;
let providerUrl;
let serverOutput = '';
let checks = 0;
const providerCalls = [];
let providerMode = 'success';
let providerMessages = [];
let aiEnabled = false;
let aiMode = 'success';
const aiCalls = [];
const TEST_AI_KEY = 'synthetic-local-ai-key-not-a-real-credential';
const DEMO_RESUME_TEXT = `FICTIONAL TEST RESUME - not a real applicant
Automotive Film Sales Representative

Professional profile
3 years of dealership sales and business development.
Comfortable visiting local businesses, explaining products and following up with decision makers.

Relevant experience
Discussed service packages, maintained prospect notes and followed up on customer questions.
Used phone calls, visits and referrals to build business relationships.
All claims in this document are synthetic examples, not verified candidate experience.

First-week proposal
Visit 2 dealerships, identify decision makers and ask about their installation needs.
Discuss both referrals to the installation shop and film supply for businesses with installation capacity.

Availability and practical details
Commute, start date, working hours and compensation require confirmation.
End of fictional resume.`;
const DEMO_RESUME_ZH = `虚拟测试简历 - 并非真实应聘者（预设模拟译文）
汽车膜销售代表

职业简介
3 年汽车经销商销售和业务开发经验。
愿意拜访本地商家、介绍产品并跟进决策人。

相关经历
介绍服务套餐，维护潜在客户记录，跟进客户问题。
通过电话、拜访和转介绍建立业务关系。
本文均为虚拟示例，并非已核实的候选人经历。

首周计划
拜访 2 家汽车经销商，找到决策人并了解施工需求。
讨论送车到门店施工，以及向有施工能力的商家供应膜材。

到岗和工作安排
通勤、到岗日期、工时及薪酬均待确认。
虚拟简历结束。`;

function check(condition, description) {
  assert.ok(condition, description);
  checks += 1;
}

function readDb() { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
function saveDb(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

function makeUser(id, role, permissions = {}) {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    id, name: `DEMO ${id}`, email: `${id}@recruiting.test`, role, active: true,
    passwordHash: `${salt}:${crypto.scryptSync(PASSWORD, salt, 64).toString('hex')}`,
    defaultBranchId: '', branchIds: [], permissions
  };
}

async function availablePort() {
  const socket = http.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

async function startProvider() {
  provider = http.createServer(async (req, res) => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ messages: providerMessages }));
      return;
    }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    if (req.url === '/v1/chat/completions') {
      const body = JSON.parse(raw);
      aiCalls.push(body);
      if (aiMode === 'failure') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `Provider echoed ${TEST_AI_KEY}` } }));
        return;
      }
      const source = JSON.parse(body.messages[1].content).sourceText;
      const en = body.messages[0].content.includes('American English');
      const translated = en ? 'Please come to 3212 Santa Monica Blvd at 10:00 for your interview.' : source === DEMO_RESUME_TEXT ? DEMO_RESUME_ZH : `中文对照：${source}`;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ text: translated }) } }] }));
      return;
    }
    const fields = Object.fromEntries(new URLSearchParams(raw));
    const sid = `SM${String(providerCalls.length + 1).padStart(32, '0')}`;
    providerCalls.push({ fields, sid });
    if (providerMode === 'disconnect') {
      req.socket.destroy();
      return;
    }
    if (providerMode === 'failure') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 21211, message: 'Synthetic provider rejection' }));
      return;
    }
    if (providerMode === 'early_callback') {
      await webhook(new URL(fields.StatusCallback).pathname + new URL(fields.StatusCallback).search, {
        MessageSid: sid, MessageStatus: 'delivered', To: fields.To, From: FROM_NUMBER
      });
    }
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sid, status: 'queued', from: FROM_NUMBER, to: fields.To, body: fields.Body }));
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  providerUrl = `http://127.0.0.1:${provider.address().port}`;
}

async function startServer() {
  serverOutput = '';
  const port = new URL(baseUrl).port;
  // Allowlist intentionally excludes TWILIO/META/OPENAI/RESEND/SMTP and every
  // other possibly configured real credential from the developer environment.
  const env = {
    PATH: process.env.PATH || '/usr/bin:/bin',
    LANG: 'en_US.UTF-8', TZ: 'America/Los_Angeles', NODE_ENV: 'test',
    DATA_DIR, PORT: port, HOST: '127.0.0.1', ENABLE_CLOUD_DAILY_BACKUPS: 'false',
    RECRUITING_REMINDERS_ENABLED: 'false', RECRUITING_PREVIEW: 'true',
    TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
    TWILIO_AUTH_TOKEN: AUTH_TOKEN, TWILIO_FROM_NUMBER: FROM_NUMBER,
    TWILIO_API_BASE_URL: providerUrl, TWILIO_WEBHOOK_BASE_URL: baseUrl
  };
  if (aiEnabled) {
    env.OPENAI_API_KEY = TEST_AI_KEY;
    env.OPENAI_API_BASE_URL = `${providerUrl}/v1`;
    env.OPENAI_CUSTOMER_REPLY_MODEL = 'gpt-5-mini';
  }
  server = spawn(process.execPath, ['--require', path.join(__dirname, 'recruiting-test-provider.js'), 'server.js'], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', chunk => { serverOutput += chunk; });
  server.stderr.on('data', chunk => { serverOutput += chunk; });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Isolated server exited ${server.exitCode}:\n${serverOutput}`);
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Isolated server startup timed out:\n${serverOutput}`);
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const child = server;
  await new Promise(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 2500);
    timer.unref();
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

async function request(pathname, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const raw = await response.text();
  let payload;
  try { payload = JSON.parse(raw); } catch { payload = raw; }
  return { status: response.status, body: payload };
}

async function expectStatus(pathname, options, status, description) {
  const result = await request(pathname, options);
  assert.equal(result.status, status, `${description}: ${JSON.stringify(result.body)}`);
  checks += 1;
  return result.body;
}

async function login(id) {
  const result = await expectStatus('/api/login', {
    method: 'POST', body: { email: `${id}@recruiting.test`, password: PASSWORD }
  }, 200, `Login ${id}`);
  return result.token;
}

async function webhook(pathname, fields, signed = true) {
  const publicUrl = `${baseUrl}${pathname}`;
  const payload = publicUrl + Object.keys(fields).sort().map(key => `${key}${fields[key]}`).join('');
  const signature = crypto.createHmac('sha1', AUTH_TOKEN).update(payload).digest('base64');
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(signed ? { 'X-Twilio-Signature': signature } : {}) },
    body: new URLSearchParams(fields)
  });
  return { status: response.status, body: await response.text() };
}

function candidateRow(candidateId) { return readDb().recruitingCandidates.find(row => row.id === candidateId); }
function messages(candidateId) { return candidateRow(candidateId).messages || candidateRow(candidateId).conversationMessages || []; }

async function seedFixture() {
  await startServer();
  await stopServer();
  const db = readDb();
  db.users = [
    makeUser('owner', 'owner'), makeUser('manager', 'manager'), makeUser('sales', 'sales'),
    makeUser('viewer', 'sales', { recruitingView: true, recruitingEdit: false }),
    makeUser('editor', 'sales', { recruitingView: true, recruitingEdit: true })
  ];
  db.customerConversations = [{
    id: 'demo-shared-customer', customer: 'DEMO existing customer', phone: '+15005550102',
    source: 'Local integration fixture', conversationMessages: [], status: '新意向'
  }];
  db.prospects = [];
  db.recruitingCandidates = [];
  db.recruitingInterviews = [];
  db.recruitingQuarantine = [];
  db.recruitingAudit = [];
  db.customerNurtureCampaigns = [];
  db.customerNurtureDeliveries = [];
  db.settings.customerAiAutoReplyEnabled = false;
  for (const key of Object.keys(db.settings)) {
    if (/Encrypted|Token|Secret|ApiKey/i.test(key)) delete db.settings[key];
  }
  saveDb(db);
  await startServer();
}

async function testReminderService() {
  const { createRecruitingService } = require('../lib/recruiting');
  const savedReminderFlag = process.env.RECRUITING_REMINDERS_ENABLED;
  process.env.RECRUITING_REMINDERS_ENABLED = 'true';
  const now = Date.now();
  const sms = [];
  let db = { users: [], recruitingCandidates: [], recruitingInterviews: [], customerConversations: [], prospects: [] };
  function addAppointment(key, offsetHours, changes = {}) {
    const candidateId = `reminder-${key}`;
    db.recruitingCandidates.push({
      id: candidateId, name: `DEMO reminder ${key}`, phone: `500555${String(1000 + db.recruitingCandidates.length).padStart(4, '0')}`,
      smsConsent: true, smsConsentNote: 'Synthetic reminder fixture', smsOptedOut: false, messages: []
    });
    const interview = { id: `appointment-${key}`, candidateId, startsAt: new Date(now + offsetHours * 3600000).toISOString(),
      status: 'confirmed', automaticReminders: true, address: 'DEMO interview location', ...changes };
    db.recruitingInterviews.push(interview);
    return interview;
  }
  let duringSend = () => {};
  const service = createRecruitingService({
    readDb: () => db, writeDb: value => { db = value; }, canAccess: () => true,
    readBody: async () => ({}), send: () => {}, publicBaseUrl: () => 'http://127.0.0.1',
    dataDir: DATA_DIR, notify: () => {}, smsConfigured: () => true,
    sendSms: async payload => {
      sms.push(payload);
      duringSend();
      return { sid: `SMreminder-test-${sms.length}`, status: 'queued' };
    }
  });
  try {
    const first = addAppointment('24h', 24);
    addAppointment('2h', 2);
    addAppointment('cancelled', 24, { status: 'cancelled' });
    addAppointment('proposed-unconfirmed', 24, { status: 'scheduled' });
    addAppointment('past', -1);
    addAppointment('disabled', 24, { automaticReminders: false });
    const optedOut = addAppointment('opted-out', 24);
    db.recruitingCandidates.find(row => row.id === optedOut.candidateId).smsOptedOut = true;
    addAppointment('outside-window', 22);
    const result = await service.processReminders(now);
    check(result.sent === 2 && sms.length === 2, 'Only confirmed eligible 24h and 2h reminder windows send');
    check(db.recruitingCandidates.find(row => row.id === 'reminder-proposed-unconfirmed').messages.length === 0, 'Proposed appointment without candidate confirmation never gets automated reminder');
    check(sms.every(row => row.body.includes('Reply STOP to opt out.')), 'Reminder identifies opt-out instruction');
    check((await service.processReminders(now)).sent === 0 && sms.length === 2, 'Repeated reminder sweep is idempotent');
    first.startsAt = new Date(now + 25 * 3600000).toISOString();
    check((await service.processReminders(now + 3600000)).sent === 1, 'Rescheduled interview gets a new reminder identity');
    check(db.recruitingCandidates.find(row => row.id === first.candidateId).messages.length === 2, 'Both schedule-specific reminders remain auditable');
    process.env.RECRUITING_REMINDERS_ENABLED = 'false';
    const disabled = await service.processReminders(now + 23 * 3600000);
    check(disabled.sent === 0, 'Global reminder disable flag prevents sends');
    process.env.RECRUITING_REMINDERS_ENABLED = 'true';

    for (const modification of ['cancelled', 'rescheduled']) {
      db = { users: [], recruitingCandidates: [], recruitingInterviews: [], customerConversations: [], prospects: [] };
      sms.length = 0;
      addAppointment(`first-${modification}`, 24);
      const next = addAppointment(`second-${modification}`, 24);
      duringSend = () => {
        if (sms.length !== 1) return;
        const index = db.recruitingInterviews.findIndex(row => row.id === next.id);
        db.recruitingInterviews[index] = modification === 'cancelled'
          ? { ...next, status: 'cancelled' }
          : { ...next, startsAt: new Date(now + 48 * 3600000).toISOString() };
      };
      await service.processReminders(now);
      check(sms.length === 1, `Appointment ${modification} during a previous await cannot receive a stale reminder`);
    }
  } finally {
    if (savedReminderFlag === undefined) delete process.env.RECRUITING_REMINDERS_ENABLED;
    else process.env.RECRUITING_REMINDERS_ENABLED = savedReminderFlag;
  }
}

function testSmsOptOutEventOrdering() {
  const { ingestInbound } = require('../lib/recruiting');
  const older = '2026-09-16T18:00:00.000Z';
  const newer = '2026-09-17T18:00:00.000Z';
  let nextSid = 0;
  function fixture(fields = {}) {
    return { recruitingCandidates: [{ id: 'opt-order-demo', name: 'DEMO opt-out ordering', phone: '+15005550104', smsOptedOut: false, messages: [], ...fields }] };
  }
  function receive(db, body, date) {
    return ingestInbound(db, { from: '+15005550104', body, date_sent: date, sid: `SMopt-order-${++nextSid}` });
  }
  const stopped = fixture();
  receive(stopped, 'STOP', newer);
  receive(stopped, 'START', older);
  check(stopped.recruitingCandidates[0].smsOptedOut === true, 'Older reconciled START cannot override newer STOP');
  check(stopped.recruitingCandidates[0].smsOptStateAt === newer, 'Opt-out state timestamp never moves backwards');
  check(stopped.recruitingCandidates[0].messages.length === 2, 'Out-of-order opt events remain in conversation history');
  const started = fixture();
  receive(started, 'START', newer);
  receive(started, 'STOP', older);
  check(started.recruitingCandidates[0].smsOptedOut === false, 'Older reconciled STOP cannot override newer START');
  for (const order of [['START', 'STOP'], ['STOP', 'START']]) {
    const equal = fixture();
    order.forEach(body => receive(equal, body, newer));
    check(equal.recruitingCandidates[0].smsOptedOut === true, `STOP wins equal timestamps in ${order.join(' then ')} order`);
  }
  const legacy = fixture({ smsOptedOut: false, smsOptedOutAt: newer, smsOptedInAt: older });
  receive(legacy, 'START', older);
  check(legacy.recruitingCandidates[0].smsOptedOut === true, 'Legacy opt timestamps preserve newer STOP despite an inconsistent saved boolean');
  const legacyStarted = fixture({ smsOptedOut: false, smsOptedInAt: newer });
  receive(legacyStarted, 'STOP', older);
  check(legacyStarted.recruitingCandidates[0].smsOptedOut === false, 'Legacy opt-in timestamp prevents old STOP from replacing newer START');
}

function testPacificTimeConversion() {
  const context = {
    window: {}, state: null, current: '',
    document: { addEventListener() {}, getElementById: () => null, hidden: false },
    MutationObserver: class { observe() {} }, setInterval() {}, Intl, Date
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public/recruiting.js'), 'utf8'), context);
  const { localToInstants, localParts } = context.window.Recruiting;
  check(localToInstants('2026-09-18', '10:00').join() === '2026-09-18T17:00:00.000Z', 'Summer Los Angeles 10am converts to 17:00 UTC');
  check(localToInstants('2026-12-18', '10:00').join() === '2026-12-18T18:00:00.000Z', 'Winter Los Angeles 10am converts to 18:00 UTC');
  check(localToInstants('2026-03-08', '02:30').length === 0, 'Frontend rejects nonexistent spring DST time');
  check(localToInstants('2026-11-01', '01:30').join() === '2026-11-01T08:30:00.000Z,2026-11-01T09:30:00.000Z', 'Frontend identifies both fall DST instants');
  const parts = localParts('2026-09-18T17:00:00.000Z');
  check(parts.date === '2026-09-18' && parts.time === '10:00', 'Stored UTC instant round-trips to Los Angeles local input');
}

async function run() {
  baseUrl = `http://127.0.0.1:${await availablePort()}`;
  await startProvider();
  await seedFixture();
  const owner = await login('owner');
  const manager = await login('manager');
  const sales = await login('sales');
  const viewer = await login('viewer');
  const editor = await login('editor');

  await expectStatus('/api/recruiting', {}, 401, 'Anonymous recruiting access');
  await expectStatus('/api/recruiting', { token: sales }, 403, 'Default sales recruiting access');
  const snapshot = await expectStatus('/api/recruiting', { token: owner }, 200, 'Owner recruiting access');
  check(Array.isArray(snapshot.candidates) && Array.isArray(snapshot.interviews), 'Recruiting snapshot collections');
  check(Boolean(snapshot.settings && snapshot.sms), 'Recruiting snapshot settings and SMS capability');
  check(!JSON.stringify(snapshot).includes(AUTH_TOKEN), 'Recruiting settings never expose provider credentials');
  check(snapshot.settings.remindersEnabled === false, 'Automatic reminder worker explicitly disabled in tests');
  check(snapshot.translation?.configured === false, 'Translation shows missing configuration without exposing secrets');
  await expectStatus('/api/recruiting/translate', { token: owner, method: 'POST', body: { text: 'Hello', targetLanguage: 'zh' } }, 503, 'Missing translation configuration reported');
  await expectStatus('/api/recruiting', { token: manager }, 200, 'Manager default recruiting access');
  await expectStatus('/api/recruiting', { token: viewer }, 200, 'Explicit viewer access');
  await expectStatus('/api/recruiting/candidates', { token: viewer, method: 'POST', body: { name: 'Denied fixture' } }, 403, 'Viewer cannot create candidates');
  await expectStatus('/api/recruiting/candidates', { token: sales, method: 'POST', body: { name: 'Denied fixture' } }, 403, 'Sales cannot create candidates');

  for (const [body, label] of [
    [{ name: '' }, 'Name is required'],
    [{ name: 'Invalid fixture', phone: '123' }, 'Phone is validated'],
    [{ name: 'Invalid fixture', email: 'no-at-symbol' }, 'Email is validated'],
    [{ name: 'Invalid fixture', status: 'automatic_hire' }, 'Status allowlist'],
    [{ name: 'Invalid fixture', age: 37 }, 'Protected/unknown fields cannot be stored'],
    [{ name: 'Invalid fixture', resumeUrl: 'javascript:alert(1)' }, 'Resume URL rejects script scheme'],
    [{ name: 'Invalid fixture', scores: { sales: 11 } }, 'Scores above ten rejected'],
    [{ name: 'Invalid fixture', scores: { sales: 0 } }, 'Scores below one rejected'],
    [{ name: 'Invalid fixture', scores: { sales: '8' } }, 'Scores require numeric values'],
    [{ name: 'Invalid fixture', appliedAt: '2026-02-30', applicationDateNote: 'Synthetic evidence' }, 'Application date must exist'],
    [{ name: 'Invalid fixture', appliedAt: '2026-09-01' }, 'Application date needs source evidence'],
    [{ name: 'Invalid fixture', appliedAt: '2999-01-01', applicationDateNote: 'Synthetic evidence' }, 'Future application date rejected'],
    [{ name: 'Invalid fixture', createdAt: '2020-01-01T00:00:00.000Z' }, 'System entry time cannot be forged'],
    [{ name: 'Invalid fixture', scores: { age: 8 } }, 'Score criteria whitelist']
  ]) await expectStatus('/api/recruiting/candidates', { token: owner, method: 'POST', body }, 400, label);

  const created = await expectStatus('/api/recruiting/candidates', { token: editor, method: 'POST', body: {
    name: 'DEMO / Alex Sales', phone: '+1 (500) 555-0101', email: 'alex.sales@example.test',
    position: 'Automotive Film Sales Representative', location: 'Santa Monica, CA',
    experience: 'FICTIONAL ONLY: 3 years of dealership sales and business development.',
    dealershipResources: 'FICTIONAL ONLY: plans to visit 2 dealerships in the first week.',
    status: 'reviewing', resumeText: DEMO_RESUME_TEXT,
    appliedAt: '2026-09-10T18:30:00.000Z', applicationDateNote: 'Synthetic fixture: application received at an exact UTC time.',
    resumeUrl: 'https://example.test/demo-resume.pdf', scoreNotes: 'TEST ONLY: verify dealership prospecting examples.',
    scores: { sales: 8, dealershipNetwork: 7, plan: 6, communication: 8, execution: 7, fit: null }
  } }, 201, 'Editor creates fictional candidate');
  const candidate = created.candidate;
  check(Boolean(candidate?.id), 'Create response contains candidate ID');
  check(candidate.smsConsent === false, 'New candidate SMS consent defaults off');
  check(candidate.appliedAt === '2026-09-10T18:30:00.000Z' && candidate.createdAt !== candidate.appliedAt, 'Application time is separate from server entry time');
  check(candidate.scores.sales === 8 && candidate.scores.fit === null, 'Six job-related scoring criteria persist with blanks');
  const second = (await expectStatus('/api/recruiting/candidates', { token: owner, method: 'POST', body: {
    name: 'DEMO / Jordan Installer', phone: '+15005550103', email: 'jordan.installer@example.test', status: 'new',
    appliedAt: '2026-09-12', applicationDateNote: 'Synthetic fixture: original application shows only the calendar date.'
  } }, 201, 'Second fictional candidate')).candidate;
  const shared = (await expectStatus('/api/recruiting/candidates', { token: owner, method: 'POST', body: {
    name: 'DEMO / Shared Phone Candidate', phone: '+15005550102', email: 'shared@example.test',
    smsConsent: true, smsConsentNote: 'Synthetic fixture: candidate agreed to interview texts.'
  } }, 201, 'Shared-phone candidate can have private recruiting record')).candidate;
  const candidatePath = `/api/recruiting/candidates/${candidate.id}`;
  check(second.appliedAt === '2026-09-12' && !shared.appliedAt, 'Date-only precision remains date-only; unknown date is not backfilled');
  await expectStatus(candidatePath, { token: viewer, method: 'PATCH', body: { appliedAt: '2026-09-01', applicationDateNote: 'Synthetic' } }, 403, 'Viewer cannot change application date');
  await expectStatus(candidatePath, { token: owner, method: 'PATCH', body: { createdAt: '2026-09-01T00:00:00.000Z' } }, 400, 'System entry timestamp stays immutable');
  await expectStatus('/api/recruiting/candidates', { token: owner, method: 'POST', body: {
    name: 'Phone duplicate', phone: '(500) 555-0101'
  } }, 409, 'Normalized US phone duplicate');
  await expectStatus('/api/recruiting/candidates', { token: owner, method: 'POST', body: {
    name: 'Email duplicate', email: 'ALEX.SALES@EXAMPLE.TEST'
  } }, 409, 'Case-insensitive email duplicate');
  await expectStatus(candidatePath, { token: viewer, method: 'PATCH', body: { status: 'hired' } }, 403, 'Viewer cannot edit');
  await expectStatus(candidatePath, { token: owner, method: 'PATCH', body: { id: 'replaced-id' } }, 400, 'Candidate ID is immutable');
  await expectStatus(candidatePath, { token: owner, method: 'PATCH', body: { status: 'invited' } }, 200, 'Candidate status update');
  check(candidateRow(candidate.id).appliedAt === candidate.appliedAt && candidateRow(candidate.id).createdAt === candidate.createdAt, 'Status changes preserve both application and entry times');
  const resumeFixture = Buffer.from('%PDF-1.4\n% fictional integration fixture\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
  await expectStatus(`${candidatePath}/resume`, { token: owner, method: 'POST', body: {
    name: 'demo-resume.pdf', type: 'application/pdf', data: Buffer.from('not a PDF').toString('base64')
  } }, 400, 'Resume content must be PDF');
  await expectStatus(`${candidatePath}/resume`, { token: viewer, method: 'POST', body: {
    name: 'demo-resume.pdf', type: 'application/pdf', data: resumeFixture.toString('base64')
  } }, 403, 'View-only cannot upload resumes');
  await expectStatus(`${candidatePath}/resume`, { token: owner, method: 'POST', body: {
    name: 'demo-resume.pdf', type: 'application/pdf', data: resumeFixture.toString('base64')
  } }, 200, 'Private PDF upload');
  await expectStatus(`${candidatePath}/resume`, {}, 401, 'Resume requires authentication');
  await expectStatus(`${candidatePath}/resume`, { token: sales }, 403, 'Resume requires recruiting view permission');
  const resumeResponse = await fetch(`${baseUrl}${candidatePath}/resume`, { headers: { Authorization: `Bearer ${viewer}` } });
  check(resumeResponse.status === 200 && resumeResponse.headers.get('content-type') === 'application/pdf', 'Authorized viewer can open uploaded PDF');
  check(resumeResponse.headers.get('cache-control') === 'private, no-store', 'Resume cache is private and disabled');
  check(Buffer.from(await resumeResponse.arrayBuffer()).equals(resumeFixture), 'Uploaded PDF content preserved');
  const privateResumeFile = candidateRow(candidate.id).resume.file;
  check((await fetch(`${baseUrl}/recruiting-resumes/${privateResumeFile}`)).status === 404, 'Resume is not served through unauthenticated static paths');

  for (const route of ['/api/bootstrap', '/api/mobile/bootstrap']) {
    const result = await expectStatus(route, { token: sales }, 200, `Sales ${route}`);
    const text = JSON.stringify(result);
    check(!text.includes('FICTIONAL TEST RESUME') && !text.includes('alex.sales@example.test'), `${route} excludes recruiting personal data`);
  }
  await expectStatus('/api/recruitingCandidates', { token: owner }, 404, 'Generic collection bypass is unavailable');

  const startsAt = new Date(Date.now() + 3 * 86400000).toISOString();
  const interviewBody = {
    candidateId: candidate.id, startsAt, durationMinutes: 30, timeZone: 'America/Los_Angeles',
    address: '3212 Santa Monica Blvd, Santa Monica, CA 90404', interviewerId: 'owner',
    interviewerName: 'DEMO owner', status: 'scheduled', notes: 'DEMO appointment only', automaticReminders: false
  };
  const interview = (await expectStatus('/api/recruiting/interviews', { token: owner, method: 'POST', body: interviewBody }, 201, 'Create interview')).interview;
  check(interview.startsAt === startsAt && interview.automaticReminders === false, 'Store exact instant and disabled reminder choice');
  await expectStatus(`/api/recruiting/interviews/${interview.id}`, { token: owner, method: 'PATCH', body: { automaticReminders: true } }, 400, 'Proposed time cannot enable reminders before candidate confirmation');
  await expectStatus('/api/recruiting/interviews', { token: viewer, method: 'POST', body: interviewBody }, 403, 'Viewer cannot schedule');
  await expectStatus('/api/recruiting/interviews', { token: owner, method: 'POST', body: { ...interviewBody, candidateId: second.id } }, 409, 'Interviewer double-booking prevented');
  await expectStatus('/api/recruiting/interviews', { token: owner, method: 'POST', body: { ...interviewBody, interviewerId: 'manager', interviewerName: 'DEMO manager' } }, 409, 'Candidate double-booking prevented');
  const nextSlot = new Date(Date.parse(startsAt) + 30 * 60000).toISOString();
  await expectStatus('/api/recruiting/interviews', { token: owner, method: 'POST', body: { ...interviewBody, candidateId: second.id, startsAt: nextSlot } }, 201, 'Adjacent appointments accepted');
  for (const [patch, label] of [
    [{ startsAt: '2020-01-01T12:00:00.000Z' }, 'Past appointment rejected'],
    [{ durationMinutes: 0 }, 'Invalid interview duration rejected'],
    [{ timeZone: 'Imaginary/Timezone' }, 'Invalid timezone rejected'],
    [{ status: 'automatically_hired' }, 'Interview status allowlist'],
    [{ startsAt: '2027-02-30T12:00:00.000Z' }, 'Nonexistent calendar dates rejected'],
    [{ startsAt: '2027-03-14T02:30:00' }, 'Unresolved local DST gap rejected'],
    [{ startsAt: '2027-11-07T01:30:00' }, 'Unresolved local DST duplicate rejected']
  ]) await expectStatus(`/api/recruiting/interviews/${interview.id}`, { token: owner, method: 'PATCH', body: patch }, 400, label);
  await expectStatus(`/api/recruiting/interviews/${interview.id}`, { token: owner, method: 'PATCH', body: { status: 'confirmed' } }, 200, 'Confirm interview without changing instant');
  await expectStatus(`/api/recruiting/interviews/${interview.id}`, { token: owner, method: 'PATCH', body: { automaticReminders: true } }, 409, 'Confirmed interview reminders still require SMS consent');
  check(providerCalls.length === 0, 'Candidate creation and scheduling do not send SMS');

  const sendPath = `${candidatePath}/messages`;
  await expectStatus(sendPath, { token: owner, method: 'POST', body: { text: 'DEMO invitation', clientMessageId: 'consent-test-001' } }, 409, 'Consent required before sending');
  await expectStatus(candidatePath, { token: owner, method: 'PATCH', body: { smsConsent: true } }, 400, 'Consent requires a recorded source');
  await expectStatus(candidatePath, { token: owner, method: 'PATCH', body: {
    smsConsent: true, smsConsentNote: 'Synthetic fixture: candidate agreed to interview SMS.'
  } }, 200, 'Record SMS consent');
  await expectStatus(candidatePath, { token: owner, method: 'PATCH', body: { smsConsentNote: '' } }, 400, 'Recorded consent basis cannot be cleared while consent is true');
  await expectStatus(`/api/recruiting/interviews/${interview.id}`, { token: owner, method: 'PATCH', body: { automaticReminders: true } }, 200, 'Confirmed interview and consent can enable reminders');
  const proposedAgain = await expectStatus(`/api/recruiting/interviews/${interview.id}`, { token: owner, method: 'PATCH', body: { status: 'scheduled' } }, 200, 'Returning to proposed state clears reminder setting');
  check(proposedAgain.interview.automaticReminders === false, 'Unconfirmed appointment automatically disables reminders');
  await expectStatus(`/api/recruiting/interviews/${interview.id}`, { token: owner, method: 'PATCH', body: { status: 'confirmed' } }, 200, 'Restore confirmed interview for subsequent test');
  await expectStatus(sendPath, { token: viewer, method: 'POST', body: { text: 'DEMO blocked', clientMessageId: 'viewer-test-001' } }, 403, 'Viewer cannot send SMS');
  await expectStatus(sendPath, { token: owner, method: 'POST', body: { text: 'DEMO missing id' } }, 400, 'Idempotency key required');
  const sendBody = { text: 'DEMO ONLY: please confirm your interview time.', clientMessageId: 'demo-send-0001' };
  const beforeChinese = JSON.stringify(readDb());
  const beforeChineseCalls = providerCalls.length;
  for (const [index, chinese] of ['你好', 'Hello 请 confirm.', 'Hello 𠀀'].entries()) {
    await expectStatus(sendPath, { token: owner, method: 'POST', body: { text: chinese, clientMessageId: `chinese-block-${index}` } }, 400, 'Chinese and supplementary Han SMS blocked');
  }
  check(JSON.stringify(readDb()) === beforeChinese && providerCalls.length === beforeChineseCalls, 'Chinese block occurs before pending record or SMS provider');
  const sent = await expectStatus(sendPath, { token: owner, method: 'POST', body: sendBody }, 201, 'Send via local mock provider');
  check(Boolean(sent.message?.providerSid), 'Sent SMS stores provider SID');
  const callsAfterSend = providerCalls.length;
  const duplicate = await expectStatus(sendPath, { token: owner, method: 'POST', body: sendBody }, 200, 'Retry same client ID');
  check(duplicate.duplicate === true && providerCalls.length === callsAfterSend, 'Repeated submission sends only once');
  await expectStatus(sendPath, { token: owner, method: 'POST', body: { ...sendBody, text: 'Different message, same ID' } }, 409, 'Same send ID cannot be reused for changed text');
  const concurrentBody = { text: 'DEMO ONLY: simultaneous double click.', clientMessageId: 'concurrent-demo-001' };
  const beforeConcurrent = providerCalls.length;
  const simultaneous = await Promise.all([request(sendPath, { token: owner, method: 'POST', body: concurrentBody }), request(sendPath, { token: owner, method: 'POST', body: concurrentBody })]);
  check(simultaneous.every(row => [200, 201].includes(row.status)), 'Concurrent submissions complete safely');
  check(providerCalls.length === beforeConcurrent + 1, 'Concurrent double click sends only once');
  providerMode = 'early_callback';
  const early = await expectStatus(sendPath, { token: owner, method: 'POST', body: {
    text: 'DEMO ONLY: provider callback precedes send response.', clientMessageId: 'early-callback-demo-001'
  } }, 201, 'Callback may precede provider response');
  check(early.message.status === 'delivered', 'Early delivered callback is not overwritten by queued send response');
  providerMode = 'success';
  await expectStatus(`/api/recruiting/candidates/${shared.id}/messages`, { token: owner, method: 'POST', body: {
    text: 'DEMO shared phone', clientMessageId: 'shared-demo-001'
  } }, 409, 'Shared customer/candidate phone prevents ambiguous sends');

  const inboundFields = { From: '+15005550101', To: FROM_NUMBER, Body: 'DEMO: I confirm the interview.', MessageSid: 'SMdemo-inbound-001', SmsStatus: 'received', NumMedia: '0' };
  check((await webhook('/api/twilio/inbound', inboundFields, false)).status === 403, 'Unsigned webhook rejected');
  check((await webhook('/api/twilio/inbound', inboundFields)).status === 200, 'Signed candidate reply accepted');
  check((await webhook('/api/twilio/inbound', inboundFields)).status === 200, 'Provider duplicate inbound accepted idempotently');
  check(messages(candidate.id).filter(row => row.providerSid === inboundFields.MessageSid).length === 1, 'Provider SID deduplication');
  check(readDb().customerConversations.length === 1 && readDb().prospects.length === 0, 'Candidate reply never creates customer/prospect');
  check((await webhook('/api/twilio/status', { MessageSid: sent.message.providerSid, MessageStatus: 'delivered', To: '+15005550101', From: FROM_NUMBER })).status === 200, 'Delivery callback accepted');
  check(messages(candidate.id).find(row => row.providerSid === sent.message.providerSid).status === 'delivered', 'Delivery status saved on recruiting message');
  await webhook('/api/twilio/status', { MessageSid: sent.message.providerSid, MessageStatus: 'queued', To: '+15005550101', From: FROM_NUMBER });
  check(messages(candidate.id).find(row => row.providerSid === sent.message.providerSid).status === 'delivered', 'Out-of-order callback cannot regress delivery status');

  check((await webhook('/api/twilio/inbound', { ...inboundFields, Body: 'STOP', MessageSid: 'SMdemo-stop-001' })).status === 200, 'STOP received');
  check(candidateRow(candidate.id).smsOptedOut === true, 'STOP persists opt-out');
  await expectStatus(sendPath, { token: owner, method: 'POST', body: { text: 'DEMO must not send', clientMessageId: 'stop-test-001' } }, 409, 'Opted-out candidate cannot be messaged');
  check((await webhook('/api/twilio/inbound', { ...inboundFields, Body: 'START', MessageSid: 'SMdemo-start-001' })).status === 200, 'START received');
  check(candidateRow(candidate.id).smsOptedOut === false, 'START clears opt-out');
  const customerBefore = JSON.stringify(readDb().customerConversations);
  await webhook('/api/twilio/inbound', { ...inboundFields, From: '+15005550102', Body: 'DEMO private ambiguous reply', MessageSid: 'SMdemo-shared-001' });
  check(JSON.stringify(readDb().customerConversations) === customerBefore, 'Ambiguous inbound does not leak into customer thread');
  check(readDb().recruitingQuarantine.some(row => JSON.stringify(row).includes('SMdemo-shared-001')), 'Ambiguous inbound saved privately for routing');

  providerMode = 'failure';
  const failedBody = { text: 'DEMO provider failure', clientMessageId: 'failure-demo-001' };
  await expectStatus(sendPath, { token: owner, method: 'POST', body: failedBody }, 502, 'Provider failure reported');
  const failureCalls = providerCalls.length;
  await request(sendPath, { token: owner, method: 'POST', body: failedBody });
  check(providerCalls.length === failureCalls, 'Provider failure retry with same ID never resends');
  check(messages(candidate.id).find(row => row.clientMessageId === failedBody.clientMessageId).status === 'failed', 'Provider rejection retained as failed');
  providerMode = 'disconnect';
  const unknownBody = { text: 'DEMO uncertain provider result', clientMessageId: 'unknown-demo-001' };
  await expectStatus(sendPath, { token: owner, method: 'POST', body: unknownBody }, 502, 'Uncertain network result reported');
  const unknownCalls = providerCalls.length;
  await request(sendPath, { token: owner, method: 'POST', body: unknownBody });
  check(providerCalls.length === unknownCalls, 'Unknown send result is never blindly retried');
  const unknownMessage = messages(candidate.id).find(row => row.clientMessageId === unknownBody.clientMessageId);
  check(unknownMessage.status === 'send_unknown', 'Uncertain result retained for reconciliation');
  await request(sendPath, { token: owner, method: 'POST', body: { ...unknownBody, clientMessageId: 'unknown-another-id-001' } });
  check(providerCalls.length === unknownCalls, 'New client ID cannot blindly repeat the same uncertain text');
  const recoveryCallback = `/api/twilio/status?candidateId=${candidate.id}&recruitingMessageId=${unknownMessage.id}`;
  check((await webhook(recoveryCallback, { MessageSid: providerCalls.at(-1).sid, MessageStatus: 'delivered', To: '+15005550101', From: FROM_NUMBER })).status === 200, 'Signed callback recovers uncertain send by bound message ID');
  check(messages(candidate.id).find(row => row.id === unknownMessage.id).status === 'delivered', 'Uncertain send becomes confirmed delivered');
  providerMode = 'success';

  providerMessages = [{
    sid: 'SMdemo-reconcile-001', direction: 'inbound', from: '+15005550101', to: FROM_NUMBER,
    body: 'DEMO reply recovered by reconciliation.', status: 'received', date_sent: new Date().toISOString(), num_media: '0'
  }];
  await expectStatus('/api/twilio/reconcile', { token: owner, method: 'POST', body: {} }, 200, 'Reconcile mock SMS history');
  await expectStatus('/api/twilio/reconcile', { token: owner, method: 'POST', body: {} }, 200, 'Reconcile duplicate history');
  check(messages(candidate.id).filter(row => row.providerSid === 'SMdemo-reconcile-001').length === 1, 'Reconciliation uses private recruiting route and deduplicates');
  check(readDb().customerConversations.length === 1 && readDb().prospects.length === 0, 'All SMS paths preserve customer data boundary');

  await stopServer();
  await startServer();
  const restartedOwner = await login('owner');
  const persisted = await expectStatus('/api/recruiting', { token: restartedOwner }, 200, 'Read after server restart');
  check(persisted.candidates.some(row => row.id === candidate.id && row.resumeText.includes('FICTIONAL TEST RESUME')), 'Candidate resume persisted');
  check(persisted.candidates.find(row => row.id === candidate.id).scores.sales === 8, 'Candidate scores persisted');
  check(persisted.interviews.some(row => row.id === interview.id && row.status === 'confirmed'), 'Interview confirmation persisted');
  check(messages(candidate.id).some(row => row.providerSid === 'SMdemo-reconcile-001'), 'Conversation persisted');
  check(candidateRow(candidate.id).appliedAt === candidate.appliedAt && candidateRow(candidate.id).applicationDateNote === candidate.applicationDateNote, 'Application date and evidence survive server restart');
  check(!/blocked external network/i.test(serverOutput), 'Workers made no external network request');
  await stopServer();
  aiEnabled = true;
  await startServer();
  const aiOwner = await login('owner');
  const aiViewer = await login('viewer');
  const aiSnapshot = await expectStatus('/api/recruiting', { token: aiOwner }, 200, 'Configured translation snapshot');
  check(aiSnapshot.translation?.configured === true && !JSON.stringify(aiSnapshot).includes(TEST_AI_KEY), 'AI configuration capability only, no secret');
  const beforeTranslate = JSON.stringify(readDb());
  const smsBeforeTranslate = providerCalls.length;
  await expectStatus('/api/recruiting/translate', { method: 'POST', body: { text: 'Hello', targetLanguage: 'zh' } }, 401, 'Anonymous cannot translate');
  await expectStatus('/api/recruiting/translate', { token: aiViewer, method: 'POST', body: { text: 'Hello', targetLanguage: 'zh' } }, 403, 'Read-only viewer cannot invoke AI');
  for (const invalid of [
    { text: 'Hello', targetLanguage: 'fr' }, { text: '', targetLanguage: 'en' },
    { text: 'x'.repeat(60001), targetLanguage: 'zh' }, { text: 'Hello', targetLanguage: 'zh', apiKey: 'untrusted' }
  ]) await expectStatus('/api/recruiting/translate', { token: aiOwner, method: 'POST', body: invalid }, 400, 'Translation input contract enforced');
  const english = await expectStatus('/api/recruiting/translate', { token: aiOwner, method: 'POST', body: {
    text: '请于 10:00 到 3212 Santa Monica Blvd 面试。', targetLanguage: 'en'
  } }, 200, 'Chinese draft translated with local AI provider');
  check(english.text === 'Please come to 3212 Santa Monica Blvd at 10:00 for your interview.' && english.targetLanguage === 'en', 'Translation returns English preview');
  const chinese = await expectStatus('/api/recruiting/translate', { token: aiOwner, method: 'POST', body: {
    text: 'FICTIONAL TEST RESUME: dealership sales for 3 years.', targetLanguage: 'zh'
  } }, 200, 'Resume translated into Chinese review text');
  check(chinese.text.includes('中文对照') && chinese.targetLanguage === 'zh', 'Chinese review text returned');
  check(aiCalls.length === 2 && aiCalls.every(call => call.model === 'gpt-5-mini' && call.store === false), 'Existing configured model reused, API storage disabled');
  check(JSON.stringify(readDb()) === beforeTranslate && providerCalls.length === smsBeforeTranslate, 'Translation does not alter original resume, consent, appointments or send messages');
  aiMode = 'failure';
  const failedTranslation = await expectStatus('/api/recruiting/translate', { token: aiOwner, method: 'POST', body: { text: 'Hello', targetLanguage: 'zh' } }, 502, 'Provider failure reported safely');
  check(!JSON.stringify(failedTranslation).includes(TEST_AI_KEY), 'Provider error cannot expose credentials');
  check(JSON.stringify(readDb()) === beforeTranslate && providerCalls.length === smsBeforeTranslate, 'Failed translation leaves original data and SMS untouched');
  aiMode = 'success';
  await expectStatus(sendPath, { token: aiOwner, method: 'POST', body: { text: english.text, clientMessageId: 'translated-preview-test-001' } }, 201, 'Explicitly send English preview to local SMS provider only');
  check(providerCalls.at(-1).fields.Body === english.text, 'SMS provider receives exactly the reviewed English preview');
  await testReminderService();
  testSmsOptOutEventOrdering();
  testPacificTimeConversion();

  console.log(`Recruiting integration tests passed: ${checks} checks. All SMS used loopback fixtures; production data untouched.`);
  if (PREVIEW) {
    console.log(`RECRUITING_PREVIEW_URL=${baseUrl}`);
    console.log(`RECRUITING_PREVIEW_DATA_DIR=${DATA_DIR}`);
    console.log(`Synthetic login: owner@recruiting.test / ${PASSWORD}`);
    console.log('Preview remains available until this process is stopped. Outgoing SMS is locally mocked.');
    await new Promise(resolve => {
      process.once('SIGTERM', resolve);
      process.once('SIGINT', resolve);
    });
  }
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  await stopServer();
  if (provider) await new Promise(resolve => provider.close(resolve));
  // Only the exact directory created by mkdtemp above is removed.
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});
