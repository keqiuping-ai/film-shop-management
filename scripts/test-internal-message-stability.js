const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-internal-message-stability-'));
const port = 49100 + Math.floor(Math.random() * 400);
const baseUrl = `http://127.0.0.1:${port}`;
let child;
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
  const indexSource = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');

  assert.match(appSource, /selectedUserId \|\| activeMessageUserId \|\| rememberedMessageUserId \|\| \(firstUnread/, 'Remembered conversation must be considered before unread fallback');
  const renderMessageModalSource = appSource.slice(appSource.indexOf('function renderMessageModal'), appSource.indexOf('function messageModalHtml'));
  assert(renderMessageModalSource.indexOf('resolveActiveMessageThread(users);') < renderMessageModalSource.indexOf('messageModalHtml(users)'), 'Conversation must be resolved before its messages are rendered');
  assert.doesNotMatch(appSource, /const activeUser = isGroup \? null : \(users\.find[\s\S]{0,80}\|\| users\[0\]\)/, 'A transient contact list must not switch the visible conversation');
  assert.match(appSource, /message-row[^>]+data-message-id=/, 'Message rows need stable ids for scroll anchoring');
  assert.match(appSource, /captureMessageThreadScrollAnchor/, 'Message refresh must preserve the visible message anchor');
  assert.match(appSource, /\[0, 80, 180\]\.forEach/, 'Late timers must not keep moving the thread after the user starts reading');
  assert.match(appSource, /api\('\/api\/messages', \{ timeoutMs: 30000 \}\)/, 'Open chat must refresh from the dedicated durable messages endpoint');
  assert(indexSource.includes('/app.js?v=146'), 'Desktop app asset marker must be bumped');
  assert(serviceWorker.includes('film-shop-v123-internal-message-stability'), 'Service worker cache must be bumped');

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

  for (const text of ['第一条稳定性测试消息', '第二条稳定性测试消息']) {
    const sent = await request('/api/messages', token, {
      method: 'POST',
      body: JSON.stringify({ groupId: 'all-staff', text, clientRequestId: `stability-${text}` })
    });
    assert.equal(sent.response.status, 200, JSON.stringify(sent.body));
  }

  const beforeRead = await request('/api/messages', token);
  assert.equal(beforeRead.response.status, 200);
  const idsBeforeRead = beforeRead.body.messages.map(message => message.id);
  assert.deepEqual(beforeRead.body.messages.slice(-2).map(message => message.text), ['第一条稳定性测试消息', '第二条稳定性测试消息']);

  const markedRead = await request('/api/messages/read', token, {
    method: 'PUT', body: JSON.stringify({ groupId: 'all-staff' })
  });
  assert.equal(markedRead.response.status, 200);

  const afterRead = await request('/api/messages', token);
  assert.equal(afterRead.response.status, 200);
  assert.deepEqual(afterRead.body.messages.map(message => message.id), idsBeforeRead, 'Marking a thread read must never remove or reorder its messages');
  console.log('Internal message stability regression tests passed.');
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  await stopServer();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
