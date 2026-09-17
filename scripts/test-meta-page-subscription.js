const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-meta-subscription-'));
const appPort = 46800 + Math.floor(Math.random() * 300);
const graphPort = appPort + 400;
let output = '';
const graphRequests = [];

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${appPort}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Test server did not start.\n${output}`);
}

async function jsonRequest(pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${appPort}${pathname}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function run() {
  const fakeGraph = http.createServer((req, res) => {
    graphRequests.push({ method: req.method, url: req.url });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.method === 'POST') return res.end(JSON.stringify({ success: true }));
    if (req.url.includes('/subscribed_apps?')) {
      return res.end(JSON.stringify({
        data: [{ id: '1540802224215324', name: 'Quad Film Lead CRM', subscribed_fields: ['messages', 'messaging_postbacks', 'leadgen'] }]
      }));
    }
    return res.end(JSON.stringify({ id: '1142640765595371', access_token: 'resolved-autohaus-page-token' }));
  });
  await listen(fakeGraph, graphPort);

  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT: String(appPort),
      HOST: '127.0.0.1',
      ENABLE_CLOUD_DAILY_BACKUPS: 'false',
      META_PAGE_ACCESS_TOKEN: 'test-system-user-access-token-with-safe-length',
      META_GRAPH_API_VERSION: 'v23.0',
      META_GRAPH_API_BASE_URL: `http://127.0.0.1:${graphPort}`
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });

  try {
    await waitForServer();
    const unauthorized = await jsonRequest('/api/meta/subscriptions?businessId=1142640765595371');
    assert.equal(unauthorized.response.status, 401, 'Subscription status must require login');

    const login = await jsonRequest('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@filmshop.local', password: 'admin123' })
    });
    assert.equal(login.response.status, 200, 'Admin login must succeed');
    const headers = { Authorization: `Bearer ${login.body.token}`, 'Content-Type': 'application/json' };

    const invalid = await jsonRequest('/api/meta/subscriptions', {
      method: 'POST', headers,
      body: JSON.stringify({ businessId: 'not-a-page-id' })
    });
    assert.equal(invalid.response.status, 400, 'Invalid Page IDs must be rejected before Graph API access');

    const subscribed = await jsonRequest('/api/meta/subscriptions', {
      method: 'POST', headers,
      body: JSON.stringify({
        businessId: '1142640765595371',
        subscribedFields: ['messages', 'messaging_postbacks', 'leadgen', 'unsupported_field']
      })
    });
    assert.equal(subscribed.response.status, 200, `Subscription failed: ${JSON.stringify(subscribed.body)}`);
    assert.deepEqual(subscribed.body.subscribedFields, ['messages', 'messaging_postbacks', 'leadgen']);

    const status = await jsonRequest('/api/meta/subscriptions?businessId=1142640765595371', { headers });
    assert.equal(status.response.status, 200, `Subscription status failed: ${JSON.stringify(status.body)}`);
    assert.deepEqual(status.body.apps[0].subscribedFields, ['messages', 'messaging_postbacks', 'leadgen']);

    assert.equal(graphRequests.length, 3, 'Page token resolution, subscription, and status must each be requested once');
    assert.match(graphRequests[0].url, /^\/v23\.0\/1142640765595371\?fields=id%2Caccess_token&access_token=/);
    assert.match(graphRequests[1].url, /^\/v23\.0\/1142640765595371\/subscribed_apps\?access_token=resolved-autohaus-page-token/);
    assert(graphRequests[1].url.includes('subscribed_fields=messages%2Cmessaging_postbacks%2Cleadgen'));
    assert.equal(graphRequests[1].method, 'POST');
    assert.match(graphRequests[2].url, /^\/v23\.0\/1142640765595371\/subscribed_apps\?access_token=resolved-autohaus-page-token/);
    assert(graphRequests[2].url.includes('fields=id%2Cname%2Csubscribed_fields'));
    assert.equal(graphRequests[2].method, 'GET');
    console.log('Meta Page subscription tests passed.');
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    await new Promise(resolve => fakeGraph.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
