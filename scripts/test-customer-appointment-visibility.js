const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-appointment-visibility-'));
const port = 48500 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;
let output = '';
let child;

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Test server did not start.\n${output}`);
}

function startServer() {
  output = '';
  child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1', ENABLE_CLOUD_DAILY_BACKUPS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  return waitForServer();
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise(resolve => child.once('exit', resolve));
}

async function request(pathname, token, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function login() {
  const result = await request('/api/login', '', {
    method: 'POST', body: JSON.stringify({ email: 'admin@filmshop.local', password: 'admin123' })
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body.token;
}

function readDb() {
  return JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
}

function writeDb(db) {
  fs.writeFileSync(path.join(dataDir, 'db.json'), `${JSON.stringify(db, null, 2)}\n`);
}

async function run() {
  const appSource = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  assert.match(appSource, /'customerCenter', 'prospects', 'recruiting'/, 'Appointment center must use company-wide scope');
  assert.match(appSource, /const sourceIds = new Set\(\[item\.id, item\.promotedProspectId\]/, 'Job detection must use explicit record links');
  assert.doesNotMatch(appSource, /function prospectHasGeneratedJob[\s\S]{0,1200}phoneMatches/, 'Job detection must not hide appointments through fuzzy phone matching');
  assert.match(appSource, /filter\(row => !prospectHasGeneratedJob\(row\)\)[\s\S]{0,300}grouped\.get\(key\)\.push\(item\)/, 'Only the converted record may be removed before phone grouping');

  try {
    await startServer();
    let token = await login();
    const bootstrap = await request('/api/bootstrap', token);
    const branchId = bootstrap.body.data.settings.clockLocations[0].id;
    const created = await request('/api/customerConversations', token, {
      method: 'POST',
      body: JSON.stringify({
        date: '2026-09-25', source: '手动增加', customer: '预约恢复测试客户', phone: '+1 310 555 0199',
        vehicle: '2026 Test Vehicle', need: 'Appointment visibility regression', status: '待回复', branchId
      })
    });
    assert.equal(created.response.status, 200, JSON.stringify(created.body));
    const source = created.body.customerConversations.find(row => row.customer === '预约恢复测试客户');
    assert(source, 'Customer conversation must be created');

    const scheduled = await request(`/api/customerConversations/${source.id}`, token, {
      method: 'PUT',
      body: JSON.stringify({ status: '已预约', appointmentDate: '2026-09-26', appointmentTime: '10:30' })
    });
    assert.equal(scheduled.response.status, 200, JSON.stringify(scheduled.body));
    const scheduledSource = scheduled.body.customerConversations.find(row => row.id === source.id);
    const promoted = scheduled.body.prospects.find(row => row.id === scheduledSource.promotedProspectId);
    assert(promoted, 'Scheduled customer must remain visible through a promoted appointment record');
    assert.equal(promoted.appointmentTime, '10:30');

    const rescheduled = await request(`/api/customerConversations/${source.id}`, token, {
      method: 'PUT', body: JSON.stringify({ status: '已预约', appointmentTime: '14:45' })
    });
    assert.equal(rescheduled.response.status, 200, JSON.stringify(rescheduled.body));
    const synced = rescheduled.body.prospects.find(row => row.id === scheduledSource.promotedProspectId);
    assert.equal(synced.appointmentTime, '14:45', 'Later customer edits must stay synchronized with the appointment record');

    await stopServer();
    const db = readDb();
    db.prospects = db.prospects.filter(row => row.id !== scheduledSource.promotedProspectId);
    const persistedSource = db.customerConversations.find(row => row.id === source.id);
    persistedSource.promotedProspectId = 'missing-appointment-record';
    delete db.customerAppointmentVisibilityRepairVersion;
    writeDb(db);

    await startServer();
    token = await login();
    const repairedBootstrap = await request('/api/bootstrap', token);
    const repairedSource = repairedBootstrap.body.data.customerConversations.find(row => row.id === source.id);
    const repairedTarget = repairedBootstrap.body.data.prospects.find(row => row.id === repairedSource.promotedProspectId);
    assert(repairedTarget, 'Startup repair must recreate an appointment hidden by a stale promotion link');
    assert.equal(repairedTarget.promotedFromConversationId, source.id);
    assert.notEqual(repairedSource.promotedProspectId, 'missing-appointment-record');
    console.log('Customer appointment visibility regression tests passed.');
  } finally {
    await stopServer();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
