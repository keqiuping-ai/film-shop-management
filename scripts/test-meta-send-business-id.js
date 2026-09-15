const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-meta-send-'));
const appPort = 46000 + Math.floor(Math.random() * 400);
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
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      graphRequests.push({ method: req.method, url: req.url, body: raw ? JSON.parse(raw) : null });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ recipient_id: 'meta-customer-1', message_id: 'meta-message-1' }));
    });
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
      META_PAGE_ACCESS_TOKEN: 'test-page-access-token-with-safe-length',
      META_GRAPH_API_VERSION: 'v23.0',
      META_GRAPH_API_BASE_URL: `http://127.0.0.1:${graphPort}`
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

    const created = await jsonRequest('/api/customerConversations', {
      method: 'POST', headers,
      body: JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        customer: 'Meta Send Test',
        source: 'Meta / Facebook',
        status: '新意向',
        externalId: 'meta-messenger:meta-customer-1',
        externalBusinessId: 'page-business-123',
        metaPsid: 'meta-customer-1',
        metaPlatform: 'facebook'
      })
    });
    assert.equal(created.response.status, 200, `Customer creation failed with HTTP ${created.response.status}`);
    const recordId = created.body.customerConversations.find(item => item.customer === 'Meta Send Test')?.id;
    assert(recordId, 'Created Meta customer record must be returned');

    const sent = await jsonRequest('/api/meta/send', {
      method: 'POST', headers,
      body: JSON.stringify({ collection: 'customerConversations', id: recordId, text: 'Meta Page ID route test' })
    });
    assert.equal(sent.response.status, 200, `Meta send failed: ${JSON.stringify(sent.body)}`);
    assert.equal(graphRequests.length, 1);
    assert.match(graphRequests[0].url, /^\/v23\.0\/page-business-123\/messages\?access_token=/);
    assert(!graphRequests[0].url.includes('/me/messages'), 'Meta send must never fall back to /me/messages');
    assert.deepEqual(graphRequests[0].body, {
      recipient: { id: 'meta-customer-1' },
      messaging_type: 'RESPONSE',
      message: { text: 'Meta Page ID route test' }
    });
    const stored = sent.body.data.customerConversations.find(item => item.id === recordId).conversationMessages
      .find(message => message.providerSid === 'meta-message-1');
    assert(stored, 'Successful Meta message must be stored');
    assert.equal(stored.from, 'page-business-123');
    assert.equal(stored.to, 'meta-customer-1');
    console.log('Meta business ID send tests passed.');
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
