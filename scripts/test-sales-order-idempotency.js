const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-sales-order-idempotency-'));
const port = 46000 + Math.floor(Math.random() * 1000);
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

async function request(pathname, token, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function login(email, password) {
  const result = await request('/api/login', '', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  assert.equal(result.response.status, 200, `Login failed: ${JSON.stringify(result.body)}`);
  const bootstrap = await request('/api/bootstrap', result.body.token);
  assert.equal(bootstrap.response.status, 200, `Bootstrap failed: ${JSON.stringify(bootstrap.body)}`);
  return { token: result.body.token, data: bootstrap.body.data };
}

function losAngelesDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

async function run() {
  const appSource = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  assert(appSource.includes("正在保存…"), 'Modal save button must show an in-progress state');
  assert(appSource.includes("✓ 保存完成"), 'Modal save button must show a completed state');
  assert(appSource.includes("collection !== 'salesOrders' || user?.role === 'owner'"), 'Sales order delete action must be owner-only in the UI');
  assert(appSource.includes("订单号"), 'Sales order table must display the order number');
  assert(html.includes('/app.js?v=141'), 'Desktop app asset marker must include the employee verification release');

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
    assert(owner.data.salesOrders.every(order => /^SO-\d{8}-(?:LV|LA|HQ)-[A-Z0-9]+(?:-\d+)?$/.test(order.orderNo)), 'Existing sales orders must receive durable order numbers');
    const product = owner.data.products.find(row => row.sku && row.portalPurchasable !== false) || owner.data.products[0];
    assert(product, 'Seed product is required');
    const branchId = owner.data.settings.clockLocations[0].id;
    const clientRequestId = `sales-order-test-${Date.now()}`;
    const payload = {
      date: losAngelesDate(),
      branchId,
      type: 'retail-us',
      customer: 'Idempotency Test Customer',
      items: [{ item: product.sku, qty: 1, unitPrice: Math.max(100, Number(product.price || 0), Number(product.minPrice || 0)) }],
      paid: 0,
      status: '待收款',
      clientRequestId
    };

    const first = await request('/api/salesOrders', owner.token, { method: 'POST', body: JSON.stringify(payload) });
    assert.equal(first.response.status, 200, `First save failed: ${JSON.stringify(first.body)}`);
    const second = await request('/api/salesOrders', owner.token, { method: 'POST', body: JSON.stringify(payload) });
    assert.equal(second.response.status, 200, `Repeated save failed: ${JSON.stringify(second.body)}`);
    const matches = second.body.salesOrders.filter(order => order.clientRequestId === clientRequestId);
    assert.equal(matches.length, 1, 'Repeated saves with the same request id must create exactly one order');
    const savedOrder = matches[0];
    assert.match(savedOrder.orderNo, /^SO-\d{8}-(?:LV|LA|HQ)-[A-Z0-9]+(?:-\d+)?$/, 'New sales order must have a durable order number');

    const managerEmail = 'sales-order-manager-test@example.com';
    const managerPassword = 'Manager123!';
    const managerCreate = await request('/api/users', owner.token, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Sales Order Manager Test', email: managerEmail, password: managerPassword,
        role: 'manager', active: true, defaultBranchId: branchId, branchIds: [branchId]
      })
    });
    assert.equal(managerCreate.response.status, 200, `Manager creation failed: ${JSON.stringify(managerCreate.body)}`);
    const manager = await login(managerEmail, managerPassword);
    const denied = await request(`/api/salesOrders/${savedOrder.id}`, manager.token, { method: 'DELETE' });
    assert.equal(denied.response.status, 403, 'Non-owner sales order deletion must be rejected');
    assert.match(String(denied.body.error || ''), /只有老板账号/);

    const deleted = await request(`/api/salesOrders/${savedOrder.id}`, owner.token, { method: 'DELETE' });
    assert.equal(deleted.response.status, 200, `Owner deletion failed: ${JSON.stringify(deleted.body)}`);
    assert(!deleted.body.salesOrders.some(order => order.id === savedOrder.id), 'Owner must be able to delete an unpaid order without inventory movements');

    console.log('Sales order number, idempotency, save feedback, and owner deletion tests passed.');
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
