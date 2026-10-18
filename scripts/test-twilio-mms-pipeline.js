const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-twilio-mms-'));
const appPort = 45000 + Math.floor(Math.random() * 500);
const twilioPort = appPort + 500;
let output = '';
let capturedMessage = null;
let twilioRequests = [];
let rejectMedia = false;
let sidPrefix = 'SM_TEST_MMS_PIPELINE';
let dropMediaUrl = '';

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
  const fakeTwilio = http.createServer((req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      capturedMessage = Object.fromEntries(new URLSearchParams(raw));
      twilioRequests.push(capturedMessage);
      if (dropMediaUrl && capturedMessage.MediaUrl === dropMediaUrl) {
        req.socket.destroy();
        return;
      }
      if (rejectMedia && capturedMessage.MediaUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 21612, message: 'The From phone number is not valid for MMS', more_info: 'https://www.twilio.com/docs/errors/21612' }));
        return;
      }
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sid: `${sidPrefix}_${twilioRequests.length}`, status: 'queued', from: '+17252412586' }));
    });
  });
  await listen(fakeTwilio, twilioPort);

  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT: String(appPort),
      HOST: '127.0.0.1',
      ENABLE_CLOUD_DAILY_BACKUPS: 'false',
      TWILIO_ACCOUNT_SID: 'AC_TEST_MMS_PIPELINE',
      TWILIO_AUTH_TOKEN: 'test-token',
      TWILIO_FROM_NUMBER: '+17252412586',
      TWILIO_MESSAGING_SERVICE_SID: 'MG_TEST_MMS_PIPELINE',
      TWILIO_API_BASE_URL: `http://127.0.0.1:${twilioPort}`,
      TWILIO_WEBHOOK_BASE_URL: `http://127.0.0.1:${appPort}`
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
    assert.equal(login.response.status, 200, `Admin login failed: ${JSON.stringify(login.body)}`);
    const auth = { Authorization: `Bearer ${login.body.token}` };

    const created = await jsonRequest('/api/customerConversations', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        customer: 'MMS Pipeline Test',
        phone: '(702) 555-0101',
        source: 'Meta / Facebook',
        status: '新意向'
      })
    });
    assert.equal(created.response.status, 200, `Customer creation failed with HTTP ${created.response.status}`);
    const recordId = created.body.customerConversations.find(item => item.customer === 'MMS Pipeline Test')?.id;
    assert(recordId, 'Created customer record must be returned');

    const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=', 'base64');
    const upload = await jsonRequest('/api/customer-media/upload', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'image/jpeg', 'X-File-Name': encodeURIComponent('test.jpg') },
      body: jpeg
    });
    assert.equal(upload.response.status, 200, `Image upload failed: ${JSON.stringify(upload.body)}`);
    assert.match(upload.body.url, new RegExp(`^http://127\\.0\\.0\\.1:${appPort}/customer-media/[a-f0-9]{12}\\.jpg$`));

    for (const method of ['HEAD', 'GET']) {
      const mediaResponse = await fetch(upload.body.url, { method });
      assert.equal(mediaResponse.status, 200, `${method} media request must succeed`);
      assert.equal(mediaResponse.headers.get('content-type'), 'image/jpeg');
      assert.equal(Number(mediaResponse.headers.get('content-length')), jpeg.length);
    }

    const sent = await jsonRequest('/api/twilio/send', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'customerConversations',
        id: recordId,
        text: '',
        attachment: { name: upload.body.name, type: upload.body.type, size: upload.body.size, url: upload.body.url }
      })
    });
    assert.equal(sent.response.status, 200, `MMS send failed: ${JSON.stringify(sent.body)}`);
    assert(capturedMessage, 'Twilio API must receive a message request');
    assert.equal(capturedMessage.To, '+17025550101');
    assert.equal(capturedMessage.From, '+17252412586');
    assert.equal(capturedMessage.MessagingServiceSid, undefined, 'MMS must use the explicit MMS sender');
    assert.equal(capturedMessage.MediaUrl, upload.body.url);
    assert.equal(capturedMessage.Body, '');
    assert.equal(capturedMessage.StatusCallback, `http://127.0.0.1:${appPort}/api/twilio/status`);

    const stored = sent.body.data.customerConversations.find(item => item.id === recordId);
    const message = stored.conversationMessages.find(item => item.providerSid === sent.body.sid);
    assert(message, 'Queued MMS must be stored in the customer conversation');
    assert.equal(message.attachment.url, upload.body.url);
    assert.equal(message.status, 'queued');

    const secondUpload = await jsonRequest('/api/customer-media/upload', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'image/jpeg', 'X-File-Name': encodeURIComponent('test-2.jpg') },
      body: jpeg
    });
    assert.equal(secondUpload.response.status, 200, `Second image upload failed: ${JSON.stringify(secondUpload.body)}`);
    twilioRequests = [];
    sidPrefix = 'SM_TEST_BATCH';
    const clientRequestId = 'multi-image-idempotency-test';
    const batch = await jsonRequest('/api/twilio/send', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'customerConversations',
        id: recordId,
        text: 'Here are both reference images.',
        attachments: [
          { name: upload.body.name, type: upload.body.type, size: upload.body.size, url: upload.body.url },
          { name: secondUpload.body.name, type: secondUpload.body.type, size: secondUpload.body.size, url: secondUpload.body.url }
        ],
        clientRequestId
      })
    });
    assert.equal(batch.response.status, 200, `Multi-image MMS send failed: ${JSON.stringify(batch.body)}`);
    assert.equal(batch.body.complete, true);
    assert.equal(batch.body.deliveries.length, 2);
    assert.equal(twilioRequests.length, 2, 'Each selected image must be sent as its own MMS');
    assert.equal(twilioRequests[0].Body, 'Here are both reference images.', 'Approved text must be included once on the first image');
    assert.equal(twilioRequests[1].Body, '', 'Approved text must not be duplicated on later images');
    assert.equal(twilioRequests[0].MediaUrl, upload.body.url);
    assert.equal(twilioRequests[1].MediaUrl, secondUpload.body.url);
    const batchStored = batch.body.data.customerConversations.find(item => item.id === recordId).conversationMessages
      .filter(item => item.clientRequestId === clientRequestId);
    assert.equal(batchStored.length, 2, 'Both image deliveries must be stored separately');
    assert.deepEqual(batchStored.map(item => item.batchIndex), [0, 1]);
    assert.deepEqual(batchStored.map(item => item.attachment.url), [upload.body.url, secondUpload.body.url]);

    const requestCountBeforeReplay = twilioRequests.length;
    const replay = await jsonRequest('/api/twilio/send', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'customerConversations', id: recordId, text: 'Here are both reference images.',
        attachments: [
          { name: upload.body.name, type: upload.body.type, size: upload.body.size, url: upload.body.url },
          { name: secondUpload.body.name, type: secondUpload.body.type, size: secondUpload.body.size, url: secondUpload.body.url }
        ],
        clientRequestId
      })
    });
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.duplicate, true, 'A repeated client request id must be recognized');
    assert.equal(twilioRequests.length, requestCountBeforeReplay, 'Idempotent replay must not call Twilio again');

    twilioRequests = [];
    sidPrefix = 'SM_TEST_PARTIAL';
    dropMediaUrl = secondUpload.body.url;
    const partialRequestId = 'multi-image-partial-test';
    const partial = await jsonRequest('/api/twilio/send', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'customerConversations', id: recordId, text: 'Partial delivery test.',
        attachments: [
          { name: upload.body.name, type: upload.body.type, size: upload.body.size, url: upload.body.url },
          { name: secondUpload.body.name, type: secondUpload.body.type, size: secondUpload.body.size, url: secondUpload.body.url }
        ],
        clientRequestId: partialRequestId
      })
    });
    assert.equal(partial.response.status, 200);
    assert.equal(partial.body.complete, false, 'One transport failure must make the batch partial');
    assert.equal(partial.body.failedCount, 1);
    assert.deepEqual(partial.body.deliveries.map(row => row.ok), [true, false]);
    const partialStored = partial.body.data.customerConversations.find(item => item.id === recordId).conversationMessages
      .filter(item => item.clientRequestId === partialRequestId);
    assert.equal(partialStored.length, 2);
    assert.equal(partialStored[1].status, 'failed');
    assert.equal(partialStored[1].attachment.url, secondUpload.body.url);
    dropMediaUrl = '';

    rejectMedia = true;
    twilioRequests = [];
    sidPrefix = 'SM_TEST_LINK_FALLBACK';
    const fallback = await jsonRequest('/api/twilio/send', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'customerConversations',
        id: recordId,
        text: '',
        attachment: { name: upload.body.name, type: upload.body.type, size: upload.body.size, url: upload.body.url }
      })
    });
    assert.equal(fallback.response.status, 200, `MMS link fallback failed: ${JSON.stringify(fallback.body)}`);
    assert.equal(twilioRequests.length, 2, 'Rejected MMS must be retried once as an SMS link');
    assert.equal(twilioRequests[0].MediaUrl, upload.body.url);
    assert.equal(twilioRequests[0].From, '+17252412586');
    assert.equal(twilioRequests[1].MediaUrl, undefined);
    assert.equal(twilioRequests[1].MessagingServiceSid, 'MG_TEST_MMS_PIPELINE');
    assert.match(twilioRequests[1].Body, new RegExp(upload.body.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(fallback.body.deliveryMode, 'link-fallback');
    assert.match(fallback.body.fallbackMessage, /图片链接/);
    const fallbackStored = fallback.body.data.customerConversations.find(item => item.id === recordId).conversationMessages
      .find(item => item.providerSid === fallback.body.sid);
    assert.equal(fallbackStored.mmsFallback, true);
    assert.equal(fallbackStored.mmsErrorCode, '21612');
    assert.equal(fallbackStored.deliveryMode, 'link-fallback');
    console.log('Twilio MMS pipeline tests passed.');
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    await new Promise(resolve => fakeTwilio.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
