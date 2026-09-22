const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-employee-verification-'));
const port = 47000 + Math.floor(Math.random() * 1000);
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

async function request(pathname, token, options = {}, binary = false) {
  const headers = { ...(options.headers || {}) };
  if (!binary) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { ...options, headers });
  const body = binary ? Buffer.from(await response.arrayBuffer()) : await response.json().catch(() => ({}));
  return { response, body };
}

async function login(email, password) {
  const result = await request('/api/login', '', { method: 'POST', body: JSON.stringify({ email, password }) });
  assert.equal(result.response.status, 200, `Login failed: ${JSON.stringify(result.body)}`);
  const bootstrap = await request('/api/bootstrap', result.body.token);
  assert.equal(bootstrap.response.status, 200);
  return { token: result.body.token, data: bootstrap.body.data };
}

async function run() {
  const appSource = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  assert(appSource.includes('法定姓名与 I-9 身份核验'), 'Owner employee editor must show the I-9 section');
  assert(appSource.includes("user?.role !== 'owner'"), 'Sensitive section must be owner-gated in the UI');
  assert(appSource.includes('员工可以自行选择 Form I-9 可接受文件'), 'UI must warn against document over-requesting');
  assert(html.includes('/app.js?v=141') && html.includes('/styles.css?v=95'), 'Desktop assets must be cache-busted');

  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1', ENABLE_CLOUD_DAILY_BACKUPS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });

  try {
    await waitForServer();
    const owner = await login('admin@filmshop.local', 'admin123');
    const branchId = owner.data.settings.clockLocations[0].id;
    const email = 'employee-i9-test@example.com';
    const password = 'Employee123!';
    const created = await request('/api/users', owner.token, {
      method: 'POST',
      body: JSON.stringify({
        name: 'T. Employee', legalName: 'Taylor Employee', email, password,
        role: 'frontdesk', active: true, defaultBranchId: branchId, branchIds: [branchId],
        i9Status: 'pending', i9CompletedAt: '', workAuthorizationExpiresAt: ''
      })
    });
    assert.equal(created.response.status, 200, JSON.stringify(created.body));
    const employee = created.body.users.find(item => item.email === email);
    assert(employee, 'Created employee must be returned');
    assert.equal(employee.legalName, 'Taylor Employee');
    assert.equal(employee.i9Status, 'pending');

    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const uploaded = await request(`/api/users/${employee.id}/employment-documents`, owner.token, {
      method: 'POST',
      body: JSON.stringify({ fileName: 'identity.png', dataUrl: `data:image/png;base64,${fakePng.toString('base64')}` })
    });
    assert.equal(uploaded.response.status, 200, JSON.stringify(uploaded.body));
    const ownerEmployee = uploaded.body.users.find(item => item.id === employee.id);
    assert.equal(ownerEmployee.employmentDocuments.length, 1);
    assert(!ownerEmployee.employmentDocuments[0].storageName, 'Storage filename must never be sent to the browser');
    const documentId = ownerEmployee.employmentDocuments[0].id;
    const documentDir = path.join(dataDir, 'employee-verification-documents');
    const storedFiles = fs.readdirSync(documentDir);
    assert.equal(storedFiles.length, 1);
    const encryptedBytes = fs.readFileSync(path.join(documentDir, storedFiles[0]));
    assert.equal(encryptedBytes.subarray(0, 4).toString('ascii'), 'QED1', 'Stored documents must use the encrypted vault format');
    assert(!encryptedBytes.includes(fakePng), 'Original document bytes must not be stored in plaintext');

    const downloaded = await request(`/api/users/${employee.id}/employment-documents/${documentId}`, owner.token, {}, true);
    assert.equal(downloaded.response.status, 200);
    assert.deepEqual(downloaded.body, fakePng);
    assert.match(String(downloaded.response.headers.get('cache-control')), /no-store/);

    const managerEmail = 'i9-manager-test@example.com';
    const managerCreated = await request('/api/users', owner.token, {
      method: 'POST',
      body: JSON.stringify({ name: 'Manager', legalName: 'Manager Legal', email: managerEmail, password, role: 'manager', active: true, defaultBranchId: branchId, branchIds: [branchId] })
    });
    assert.equal(managerCreated.response.status, 200);
    const manager = await login(managerEmail, password);
    const managerView = manager.data.users.find(item => item.id === employee.id);
    assert(managerView, 'Manager may still manage normal employee account fields');
    assert(!Object.prototype.hasOwnProperty.call(managerView, 'legalName'), 'Manager bootstrap must not expose legal name');
    assert(!Object.prototype.hasOwnProperty.call(managerView, 'employmentDocuments'), 'Manager bootstrap must not expose document metadata');
    const deniedRead = await request(`/api/users/${employee.id}/employment-documents/${documentId}`, manager.token, {}, true);
    assert.equal(deniedRead.response.status, 403, 'Manager must not read employee documents');
    const deniedWrite = await request(`/api/users/${employee.id}`, manager.token, {
      method: 'PUT', body: JSON.stringify({ ...managerView, legalName: 'Unauthorized' })
    });
    assert.equal(deniedWrite.response.status, 403, 'Manager must not edit verification fields');

    const removed = await request(`/api/users/${employee.id}/employment-documents/${documentId}`, owner.token, { method: 'DELETE' });
    assert.equal(removed.response.status, 200);
    assert.equal(removed.body.users.find(item => item.id === employee.id).employmentDocuments.length, 0);
    assert.equal(fs.readdirSync(documentDir).length, 0, 'Deleted document must be removed from disk');

    console.log('Owner-only employee legal-name and I-9 document vault tests passed.');
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
