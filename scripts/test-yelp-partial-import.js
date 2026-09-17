const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const desktopSource = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-yelp-import-'));
const port = 47000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const importToken = 'quad-yelp-import-test-token';
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

async function importYelp(payload) {
  const response = await fetch(`${baseUrl}/api/import/customer-conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Import-Token': importToken },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

function readDb() {
  return JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
}

async function run() {
  assert.match(desktopSource, /function prospectEditableNeed[\s\S]*prospectIsYelpSystemNotificationMessage/, 'Desktop must hide Yelp automatic status from the customer need field');
  assert.match(desktopSource, /id="workspaceNeed"[\s\S]{0,180}prospectEditableNeed\(item\)/, 'Workspace must use the protected Yelp need value');
  assert.match(desktopSource, /id="workspaceCity"[\s\S]{0,180}prospectEditableCity\(item\)/, 'Workspace must not present the generic branch placeholder as a customer city');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT: String(port),
      HOST: '127.0.0.1',
      ENABLE_CLOUD_DAILY_BACKUPS: 'false',
      CUSTOMER_CONVERSATION_IMPORT_TOKEN_YELP: importToken
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });

  try {
    await waitForServer();

    const original = await importYelp({
      externalId: 'yelp-lead-1',
      externalEventId: 'yelp-event-1',
      customer: 'Binh P.',
      phone: '+15307565377',
      city: 'Las Vegas',
      vehicle: '2024 Tesla Model Y',
      need: 'Full body color PPF quote',
      conversationMessages: [{
        externalEventId: 'yelp-message-1',
        speaker: 'customer',
        channel: 'yelp',
        text: 'I need a full body color PPF quote.',
        timestamp: '2026-09-17T01:00:00-07:00'
      }]
    });
    assert.equal(original.imported, 1);

    const notification = await importYelp({
      externalEventId: 'yelp-event-2',
      customer: 'Binh P',
      phone: '+1 (530) 756-5377',
      city: 'Las Vegas / Los Angeles',
      need: 'Automatic message:\nBinh P. is no longer pursuing this job.',
      sourceUpdatedAt: '2026-09-17T01:37:00-07:00'
    });
    assert.equal(notification.updated, 1, 'Status-only update should merge into the one Yelp record with the same phone');
    assert.equal(notification.imported, 0);
    assert.equal(notification.warnings.length, 1);
    assert.equal(notification.warnings[0].systemNotificationOnly, true);
    assert(notification.warnings[0].missingFields.includes('externalId'));

    let db = readDb();
    let rows = db.customerConversations.filter(row => row.phone.replace(/\D/g, '') === '15307565377');
    assert.equal(rows.length, 1, 'Status-only event must not create a duplicate customer');
    assert.equal(rows[0].externalId, 'yelp-lead-1');
    assert.equal(rows[0].city, 'Las Vegas');
    assert.equal(rows[0].vehicle, '2024 Tesla Model Y');
    assert.equal(rows[0].need, 'Full body color PPF quote');
    assert.equal(rows[0].status, '暂时无需回复');
    assert.equal(rows[0].intentLevel, '低');
    assert(rows[0].conversationMessages.some(message => message.messageType === 'system-notification'));

    const standalone = await importYelp({
      externalEventId: 'yelp-event-3',
      customer: 'Only Status',
      phone: '+17025550199',
      city: 'Las Vegas / Los Angeles',
      need: 'Automatic message: Only Status is no longer pursuing this job.'
    });
    assert.equal(standalone.imported, 1);
    db = readDb();
    rows = db.customerConversations.filter(row => row.phone.replace(/\D/g, '') === '17025550199');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].city, '', 'Generic branch placeholder is not customer city data');
    assert.equal(rows[0].need, '', 'Yelp automatic status is not a customer need');
    assert.equal(rows[0].status, '暂时无需回复');
    assert.equal(rows[0].intentLevel, '低');
    assert.equal(rows[0].conversationMessages[0].messageType, 'system-notification');

    console.log('Yelp partial import regression tests passed.');
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
