const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-customer-ai-'));
const appPort = 47000 + Math.floor(Math.random() * 300);
const openAiPort = appPort + 300;
const deepSeekPort = appPort + 600;
let output = '';
let openAiRequests = 0;
let deepSeekRequests = 0;

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

function aiResponse(content) {
  return JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] });
}

async function run() {
  const fakeOpenAi = http.createServer((req, res) => {
    openAiRequests += 1;
    req.resume();
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'primary provider unavailable' } }));
  });
  const fakeDeepSeek = http.createServer((req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      deepSeekRequests += 1;
      const prompt = String(JSON.parse(raw || '{}')?.messages?.[0]?.content || '');
      let content;
      if (prompt.includes('one field: englishText')) content = { englishText: 'Hello, how can we help you?' };
      else if (prompt.includes('one field: chineseReplyText')) content = { chineseReplyText: '您好，请问我们可以怎样帮助您？' };
      else content = {
        englishReplyText: 'Hello, how can we help you?',
        disposition: 'ready_for_review',
        riskLevel: 'low',
        note: ''
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(aiResponse(content));
    });
  });
  await listen(fakeOpenAi, openAiPort);
  await listen(fakeDeepSeek, deepSeekPort);

  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT: String(appPort),
      HOST: '127.0.0.1',
      ENABLE_CLOUD_DAILY_BACKUPS: 'false',
      OPENAI_API_KEY: 'test-openai-key',
      OPENAI_API_BASE_URL: `http://127.0.0.1:${openAiPort}`,
      DEEPSEEK_API_KEY: 'test-deepseek-key',
      DEEPSEEK_API_BASE_URL: `http://127.0.0.1:${deepSeekPort}`,
      DEEPSEEK_MODEL: 'deepseek-chat',
      CUSTOMER_AI_REQUEST_TIMEOUT_MS: '5000'
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

    const translated = await jsonRequest('/api/customer-ai/translate-reply', {
      method: 'POST', headers, body: JSON.stringify({ text: '您好，请问有什么可以帮您？' })
    });
    assert.equal(translated.response.status, 200, JSON.stringify(translated.body));
    assert.equal(translated.body.provider, 'deepseek');
    assert.equal(translated.body.englishText, 'Hello, how can we help you?');

    const created = await jsonRequest('/api/customerConversations', {
      method: 'POST', headers,
      body: JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        customer: 'AI Failover Test',
        phone: '+17025550123',
        source: 'Meta / Facebook',
        status: '新意向',
        request: 'Customer wants a tint quote.'
      })
    });
    assert.equal(created.response.status, 200, JSON.stringify(created.body));
    const recordId = created.body.customerConversations.find(item => item.customer === 'AI Failover Test')?.id;
    assert(recordId, 'Created customer record must be returned');

    const drafted = await jsonRequest('/api/customer-ai/reply-draft', {
      method: 'POST', headers,
      body: JSON.stringify({ collection: 'customerConversations', id: recordId, channel: 'sms' })
    });
    assert.equal(drafted.response.status, 200, JSON.stringify(drafted.body));
    assert.equal(drafted.body.draft.provider, 'deepseek');
    assert.equal(drafted.body.draft.englishText, 'Hello, how can we help you?');
    assert.equal(drafted.body.draft.chineseText, '您好，请问我们可以怎样帮助您？');
    assert(openAiRequests >= 3, 'OpenAI must remain the first provider attempted');
    assert(deepSeekRequests >= 3, 'DeepSeek must handle translation, draft, and bilingual review after failover');
    assert.match(output, /Customer AI provider failed/, 'Provider failures must be visible in sanitized server logs');

    console.log('Customer AI provider failover tests passed.');
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    await Promise.all([
      new Promise(resolve => fakeOpenAi.close(resolve)),
      new Promise(resolve => fakeDeepSeek.close(resolve))
    ]);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
