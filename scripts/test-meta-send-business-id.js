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
      const request = { method: req.method, url: req.url, body: raw ? JSON.parse(raw) : null };
      graphRequests.push(request);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.method === 'GET') {
        const pageId = req.url.split('?')[0].split('/').pop();
        res.end(JSON.stringify({
          id: pageId,
          access_token: 'resolved-page-access-token',
          instagram_business_account: pageId === '123456789012345' ? { id: '17841476523081629' } : undefined
        }));
      } else {
        res.end(JSON.stringify({ recipient_id: 'meta-customer-1', message_id: 'meta-message-1' }));
      }
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
      META_AUTO_SUBSCRIBE_PAGE_IDS: '123456789012345',
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
        externalBusinessId: '123456789012345',
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
    assert.equal(graphRequests.length, 2);
    assert.match(graphRequests[0].url, /^\/v23\.0\/123456789012345\?fields=id%2Caccess_token&access_token=/);
    assert.equal(graphRequests[0].method, 'GET', 'The long-lived business token must resolve a Page access token first');
    assert.match(graphRequests[1].url, /^\/v23\.0\/123456789012345\/messages\?access_token=resolved-page-access-token/);
    assert(!graphRequests[1].url.includes('/me/messages'), 'Meta send must use the explicit Page ID');
    assert.deepEqual(graphRequests[1].body, {
      recipient: { id: 'meta-customer-1' },
      messaging_type: 'RESPONSE',
      message: { text: 'Meta Page ID route test' }
    });
    const stored = sent.body.data.customerConversations.find(item => item.id === recordId).conversationMessages
      .find(message => message.providerSid === 'meta-message-1');
    assert(stored, 'Successful Meta message must be stored');
    assert.equal(stored.from, '123456789012345');
    assert.equal(stored.to, 'meta-customer-1');

    graphRequests.length = 0;
    const instagramCreated = await jsonRequest('/api/customerConversations', {
      method: 'POST', headers,
      body: JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        customer: 'Instagram Send Test',
        source: 'Meta / Instagram',
        status: '新意向',
        externalId: 'meta-instagram:ig-customer-1',
        externalBusinessId: '17841476523081629',
        metaPsid: 'ig-customer-1',
        metaPlatform: 'instagram'
      })
    });
    assert.equal(instagramCreated.response.status, 200, `Instagram customer creation failed with HTTP ${instagramCreated.response.status}`);
    const instagramRecordId = instagramCreated.body.customerConversations.find(item => item.customer === 'Instagram Send Test')?.id;
    assert(instagramRecordId, 'Created Instagram customer record must be returned');
    const instagramSent = await jsonRequest('/api/meta/send', {
      method: 'POST', headers,
      body: JSON.stringify({ collection: 'customerConversations', id: instagramRecordId, text: 'Instagram Page mapping test' })
    });
    assert.equal(instagramSent.response.status, 200, `Instagram send failed: ${JSON.stringify(instagramSent.body)}`);
    assert.equal(graphRequests.length, 2);
    assert.match(graphRequests[0].url, /^\/v23\.0\/123456789012345\?fields=id%2Caccess_token%2Cinstagram_business_account&access_token=/);
    assert.match(graphRequests[1].url, /^\/v23\.0\/123456789012345\/messages\?access_token=resolved-page-access-token/);
    assert.equal(graphRequests[1].method, 'POST');
    assert.deepEqual(graphRequests[1].body, {
      recipient: { id: 'ig-customer-1' },
      messaging_type: 'RESPONSE',
      message: { text: 'Instagram Page mapping test' }
    });
    const storedInstagram = instagramSent.body.data.customerConversations.find(item => item.id === instagramRecordId);
    assert.equal(storedInstagram.source, 'Meta / Instagram', 'Sending must not relabel an Instagram conversation as Facebook');
    assert.equal(storedInstagram.metaPlatform, 'instagram');
    assert.equal(storedInstagram.conversationMessages.at(-1).provider, 'meta-instagram');
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
