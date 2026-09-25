const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-customer-selection-'));
const port = 49400 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;
let child;
let output = '';

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Test server did not start.\n${output}`);
}

async function request(pathname, token = '', options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise(resolve => child.once('exit', resolve));
}

async function run() {
  const appSource = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(appSource, /function existingCustomerPickerHtml\(\)/, 'New customer form needs an existing-customer picker');
  assert.match(appSource, /row\.customer, row\.phone, row\.vehicle/, 'Picker must search name, phone, and vehicle');
  assert.match(appSource, /setProspectFormField\('customer', row\.customer\)/, 'Selecting a result must fill the name');
  assert.match(appSource, /setProspectFormField\('phone', row\.phone\)/, 'Selecting a result must fill the phone');
  assert.match(appSource, /setProspectFormField\('vehicle', row\.vehicle\)/, 'Selecting a result must fill the vehicle');
  assert.match(appSource, /openProspectWorkspace\(collection, savedRecord\.id\)/, 'Successful save must open the saved customer');
  assert.match(serverSource, /新增客户必须填写客户姓名，不能只填写电话/, 'Server must reject unnamed manual customers');

  child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1', ENABLE_CLOUD_DAILY_BACKUPS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  await waitForServer();

  const login = await request('/api/login', '', {
    method: 'POST', body: JSON.stringify({ email: 'admin@filmshop.local', password: 'admin123' })
  });
  assert.equal(login.response.status, 200, JSON.stringify(login.body));
  const token = login.body.token;

  const unnamed = await request('/api/customerConversations', token, {
    method: 'POST',
    body: JSON.stringify({ date: '2026-09-25', source: '手动增加', phone: '+1 310 555 0111', vehicle: 'Tesla Model Y', status: '新意向' })
  });
  assert.equal(unnamed.response.status, 400, 'Phone-only customer must be rejected');
  assert.match(unnamed.body.error || '', /客户姓名/);

  const payload = {
    date: '2026-09-25', source: 'Yelp', customer: 'Existing Search Test', phone: '+1 310 555 0112',
    vehicle: '2025 BMW X5', need: 'Full wrap history', service: 'wrap', status: '新意向',
    chatContext: 'Historical customer notes', conversationMessages: [{ direction: 'inbound', text: 'Need another quote' }]
  };
  const created = await request('/api/customerConversations', token, { method: 'POST', body: JSON.stringify(payload) });
  assert.equal(created.response.status, 200, JSON.stringify(created.body));
  const record = created.body.customerConversations.find(row => row.phone === payload.phone);
  assert(record, 'Named customer must be persisted');
  assert.equal(record.customer, payload.customer);
  assert.equal(record.vehicle, payload.vehicle);
  assert.equal(record.chatContext, payload.chatContext);
  assert.equal(record.conversationMessages.length, 1);

  const countBeforeMerge = created.body.customerConversations.length;
  const merged = await request('/api/customerConversations', token, {
    method: 'POST', body: JSON.stringify({ ...payload, vehicle: '2026 BMW X5', note: 'Selected existing customer' })
  });
  assert.equal(merged.response.status, 200, JSON.stringify(merged.body));
  assert.equal(merged.body.customerConversations.length, countBeforeMerge, 'Selecting an existing customer must merge instead of duplicating it');
  const mergedRecord = merged.body.customerConversations.find(row => row.id === record.id);
  assert(mergedRecord, 'Merged customer must keep a stable record id so the UI can open it');
  assert.equal(mergedRecord.vehicle, '2026 BMW X5');
  console.log('Existing customer selection and required-name regression tests passed.');
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  await stopServer();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
