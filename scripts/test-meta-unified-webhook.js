const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-meta-webhook-'));
const port = 45000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const verifyToken = 'quad-meta-test-token';
const appSecret = 'quad-meta-test-secret';
let output = '';

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

async function postWebhook(pathname, payload) {
  const rawBody = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': `sha256=${signature}` },
    body: rawBody
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function readDb() {
  return JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
}

async function run() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT: String(port),
      HOST: '127.0.0.1',
      ENABLE_CLOUD_DAILY_BACKUPS: 'false',
      META_WEBHOOK_VERIFY_TOKEN: verifyToken,
      META_PAGE_ACCESS_TOKEN: '',
      FACEBOOK_PAGE_ACCESS_TOKEN: '',
      META_APP_SECRET: appSecret
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });

  try {
    await waitForServer();

    const challenge = await fetch(`${baseUrl}/api/meta/webhook?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=verified`);
    assert.equal(challenge.status, 200);
    assert.equal(await challenge.text(), 'verified');

    const unsigned = await fetch(`${baseUrl}/api/meta/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ object: 'page', entry: [] })
    });
    assert.equal(unsigned.status, 403, 'Unsigned production-style requests must be rejected when App Secret is configured');

    const facebook = await postWebhook('/api/meta/webhook', {
      object: 'page',
      entry: [{
        id: 'page-1',
        messaging: [{ sender: { id: 'facebook-user-1' }, recipient: { id: 'page-1' }, timestamp: Date.now(), message: { mid: 'fb-mid-1', text: 'Facebook webhook test' } }]
      }]
    });
    assert.equal(facebook.response.status, 200, JSON.stringify(facebook.body));
    assert.equal(facebook.body.messaging.imported, 1);
    assert.equal(facebook.body.messaging.platform, 'facebook');

    const instagram = await postWebhook('/api/meta/messenger/webhook', {
      object: 'instagram',
      entry: [{
        id: 'instagram-business-1',
        messaging: [{ sender: { id: 'instagram-user-1' }, recipient: { id: 'instagram-business-1' }, timestamp: Date.now(), message: { mid: 'ig-mid-1', text: 'Instagram webhook test' } }]
      }]
    });
    assert.equal(instagram.response.status, 200, JSON.stringify(instagram.body));
    assert.equal(instagram.body.messaging.imported, 1);
    assert.equal(instagram.body.messaging.platform, 'instagram');

    const postback = await postWebhook('/api/meta/lead-ads/webhook', {
      object: 'page',
      entry: [{
        id: 'page-1',
        messaging: [{ sender: { id: 'facebook-user-1' }, recipient: { id: 'page-1' }, timestamp: Date.now(), postback: { mid: 'fb-postback-1', title: 'Book now', payload: 'BOOK_NOW' } }]
      }]
    });
    assert.equal(postback.response.status, 200, JSON.stringify(postback.body));
    assert.equal(postback.body.messaging.updated, 1);

    const duplicate = await postWebhook('/api/meta/webhook', {
      object: 'page',
      entry: [{
        id: 'page-1',
        messaging: [{ sender: { id: 'facebook-user-1' }, recipient: { id: 'page-1' }, timestamp: Date.now(), message: { mid: 'fb-mid-1', text: 'Facebook webhook test' } }]
      }]
    });
    assert.equal(duplicate.response.status, 200, JSON.stringify(duplicate.body));
    assert.equal(duplicate.body.messaging.imported, 0);
    assert.equal(duplicate.body.messaging.updated, 0);

    const leadgen = await postWebhook('/api/meta/webhook', {
      object: 'page',
      entry: [{ id: 'page-1', changes: [{ field: 'leadgen', value: { leadgen_id: 'lead-1', page_id: 'page-1' } }] }]
    });
    assert.equal(leadgen.response.status, 500);
    assert.match(String(leadgen.body.error || ''), /PAGE_ACCESS_TOKEN/);

    const db = readDb();
    const facebookRow = db.customerConversations.find(row => row.externalId === 'meta-messenger:facebook-user-1');
    const instagramRow = db.customerConversations.find(row => row.externalId === 'meta-instagram:instagram-user-1');
    assert(facebookRow, 'Facebook message must be stored');
    assert(instagramRow, 'Instagram message must be stored');
    assert.equal(instagramRow.source, 'Meta / Instagram');
    assert.equal(facebookRow.conversationMessages.length, 2, 'Postback must be added once and duplicate message ignored');

    console.log('Meta unified webhook tests passed.');
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
