const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-chinese-send-guard-'));
const port = 47400 + Math.floor(Math.random() * 300);
let output = '';

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Test server did not start.\n${output}`);
}

async function jsonRequest(pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function run() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT: String(port),
      HOST: '127.0.0.1',
      ENABLE_CLOUD_DAILY_BACKUPS: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });

  try {
    await waitForServer();
    const login = await jsonRequest('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@filmshop.local', password: 'admin123' })
    });
    assert.equal(login.response.status, 200, 'Admin login must succeed');
    const headers = { Authorization: `Bearer ${login.body.token}`, 'Content-Type': 'application/json' };

    async function createCustomer(payload) {
      const created = await jsonRequest('/api/customerConversations', {
        method: 'POST', headers,
        body: JSON.stringify({ date: new Date().toISOString().slice(0, 10), status: '新意向', ...payload })
      });
      assert.equal(created.response.status, 200, `Customer creation failed: ${JSON.stringify(created.body)}`);
      const item = created.body.customerConversations.find(row => row.customer === payload.customer);
      assert(item?.id, `Created customer ${payload.customer} must be returned`);
      return item.id;
    }

    const metaId = await createCustomer({
      customer: 'Chinese Guard Meta', source: 'Meta / Facebook',
      externalId: 'meta-messenger:guard-meta-user', externalBusinessId: '1142640765595371',
      metaPsid: 'guard-meta-user', metaPlatform: 'facebook'
    });
    const yelpId = await createCustomer({
      customer: 'Chinese Guard Yelp', source: 'Yelp', externalId: 'guard-yelp-lead', externalBusinessId: 'guard-yelp-business'
    });
    const smsId = await createCustomer({
      customer: 'Chinese Guard SMS', source: 'Walk-in', phone: '(702) 555-0147'
    });

    for (const [endpoint, id] of [['/api/meta/send', metaId], ['/api/yelp/send', yelpId], ['/api/twilio/send', smsId]]) {
      const result = await jsonRequest(endpoint, {
        method: 'POST', headers,
        body: JSON.stringify({ collection: 'customerConversations', id, text: 'Hello，价格是多少？' })
      });
      assert.equal(result.response.status, 400, `${endpoint} must reject Chinese before contacting the provider`);
      assert.match(String(result.body.error || ''), /检测到中文.*阻止发送/);
    }

    console.log('Customer Chinese-send guard tests passed.');
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
