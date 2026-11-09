const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-personal-note-photos-'));
const port = 48000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
let output = '';

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Test server did not start.\n${output}`);
}

async function jsonRequest(pathname, token, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function run() {
  const appSource = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  assert(appSource.includes("addEventListener('paste', handlePersonalNotePhotoPaste)"), 'Desktop note editor must handle pasted images');
  assert(appSource.includes("uploadCloudMedia('/api/personal-note-media/upload'"), 'Desktop note editor must upload note photos');
  assert(html.includes('/app.js?v=173'), 'Desktop asset marker must include the note-photo release');
  assert(appSource.indexOf('personal-note-photo-editor span-2') < appSource.indexOf('personal-note-content-field'), 'Photo controls must appear above the note details field');

  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1', ENABLE_CLOUD_DAILY_BACKUPS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });

  try {
    await waitForServer();
    const login = await jsonRequest('/api/login', '', { method: 'POST', body: JSON.stringify({ email: 'admin@filmshop.local', password: 'admin123' }) });
    assert.equal(login.response.status, 200, JSON.stringify(login.body));
    const token = login.body.token;

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const uploadResponse = await fetch(`${baseUrl}/api/personal-note-media/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png', 'X-File-Name': encodeURIComponent('order-photo.png') },
      body: png
    });
    const uploaded = await uploadResponse.json();
    assert.equal(uploadResponse.status, 200, JSON.stringify(uploaded));
    assert.match(uploaded.url, /\/customer-media\/[a-f0-9]{12}\.png$/);

    const attachment = { name: uploaded.name, type: uploaded.type, size: uploaded.size, url: uploaded.url };
    const created = await jsonRequest('/api/personal-notes', token, {
      method: 'POST',
      body: JSON.stringify({ type: 'memo', title: '订单文字和照片', content: '客户订单文字内容', attachments: [attachment], shareScope: 'private', requestId: `photo-note-${Date.now()}` })
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.item.content, '客户订单文字内容');
    assert.deepEqual(created.body.item.attachments, [attachment]);

    const listed = await jsonRequest('/api/personal-notes', token);
    assert.equal(listed.response.status, 200);
    const saved = listed.body.find(item => item.id === created.body.item.id);
    assert(saved, 'Saved note must be returned after reopening the notebook');
    assert.deepEqual(saved.attachments, [attachment], 'Photo metadata must survive a reload');

    const updated = await jsonRequest(`/api/personal-notes/${saved.id}`, token, {
      method: 'PUT', body: JSON.stringify({ ...saved, content: '更新后的文字内容' })
    });
    assert.equal(updated.response.status, 200, JSON.stringify(updated.body));
    assert.deepEqual(updated.body.item.attachments, [attachment], 'Editing text must preserve photos');

    const badUpload = await fetch(`${baseUrl}/api/personal-note-media/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain', 'X-File-Name': 'bad.txt' }, body: 'not an image'
    });
    assert.equal(badUpload.status, 400, 'Note media endpoint must reject non-images');

    const badNote = await jsonRequest('/api/personal-notes', token, {
      method: 'POST', body: JSON.stringify({ type: 'memo', title: 'Invalid image', attachments: [{ name: 'bad.png', type: 'image/png', url: 'https://example.com/bad.png' }] })
    });
    assert.equal(badNote.response.status, 400, 'Note API must reject external attachment URLs');

    console.log('Personal note text + pasted/photo attachment tests passed.');
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
