const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-shipped-order-edit-'));
const port = 47500 + Math.floor(Math.random() * 500);
let output = '';

async function request(pathname, token = '', options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function login(email, password) {
  const result = await request('/api/login', '', { method: 'POST', body: JSON.stringify({ email, password }) });
  assert.equal(result.response.status, 200, `Login failed: ${JSON.stringify(result.body)}`);
  const bootstrap = await request('/api/bootstrap', result.body.token);
  assert.equal(bootstrap.response.status, 200, `Bootstrap failed: ${JSON.stringify(bootstrap.body)}`);
  return { token: result.body.token, data: bootstrap.body.data };
}

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Test server did not start.\n${output}`);
}

async function run() {
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
    const product = owner.data.products.find(row => row.sku && row.active !== false && Number(row.minPrice || 0) <= 1000);
    assert(product, 'Seed product is required');
    const unitPrice = Math.max(1000, Number(product.minPrice || 0), Number(product.wholesale || 0));

    const stockIn = await request('/api/movements', owner.token, {
      method: 'POST', body: JSON.stringify({ date: today(), branchId, sku: product.sku, type: 'in', qty: 10, note: 'shipped order edit test stock' })
    });
    assert.equal(stockIn.response.status, 200, `Stock-in failed: ${JSON.stringify(stockIn.body)}`);
    const stockAfterIn = Number(stockIn.body.products.find(row => row.sku === product.sku).qty || 0);

    const created = await request('/api/salesOrders', owner.token, {
      method: 'POST', body: JSON.stringify({
        date: today(), branchId, type: 'retail-us', customer: 'Shipped Order Edit Test',
        items: [{ item: product.sku, qty: 2, unitPrice }], paid: unitPrice * 2,
        paymentMethod: 'card', status: '已付款', clientRequestId: `shipped-edit-${Date.now()}`
      })
    });
    assert.equal(created.response.status, 200, `Order creation failed: ${JSON.stringify(created.body)}`);
    const order = created.body.salesOrders.find(row => row.customer === 'Shipped Order Edit Test');
    assert(order, 'Created order is missing');

    const shipped = await request(`/api/sales-orders/${order.id}/ship`, owner.token, { method: 'POST', body: JSON.stringify({ branchId }) });
    assert.equal(shipped.response.status, 200, `Shipment failed: ${JSON.stringify(shipped.body)}`);
    assert.equal(shipped.body.salesOrders.find(row => row.id === order.id).status, '已出库');
    const stockAfterShip = Number(shipped.body.products.find(row => row.sku === product.sku).qty || 0);
    assert.equal(stockAfterShip, stockAfterIn - 2, 'Shipment must deduct two units');

    const reduced = await request(`/api/salesOrders/${order.id}`, owner.token, {
      method: 'PUT', body: JSON.stringify({ status: '已出库', branchId, paid: unitPrice, items: [{ item: product.sku, qty: 1, unitPrice }] })
    });
    assert.equal(reduced.response.status, 200, `Owner reduction failed: ${JSON.stringify(reduced.body)}`);
    assert.equal(Number(reduced.body.products.find(row => row.sku === product.sku).qty || 0), stockAfterShip + 1, 'Reducing shipped quantity must restore one unit');
    const restore = reduced.body.movements.find(row => row.salesOrderId === order.id && row.salesOrderCorrection && row.type === 'in');
    assert(restore && Number(restore.qty) === 1, 'Reduction must create a traceable correction stock-in');

    const increased = await request(`/api/salesOrders/${order.id}`, owner.token, {
      method: 'PUT', body: JSON.stringify({ status: '已出库', branchId, paid: unitPrice * 3, items: [{ item: product.sku, qty: 3, unitPrice }] })
    });
    assert.equal(increased.response.status, 200, `Owner increase failed: ${JSON.stringify(increased.body)}`);
    assert.equal(Number(increased.body.products.find(row => row.sku === product.sku).qty || 0), stockAfterShip - 1, 'Increasing from one to three must deduct two units');
    const extra = increased.body.movements.find(row => row.salesOrderId === order.id && row.salesOrderCorrection && row.type === 'out' && Number(row.qty) === 2);
    assert(extra, 'Increase must create a traceable correction stock-out');

    const managerEmail = 'shipped-edit-manager@example.com';
    const managerPassword = 'Manager123!';
    const managerCreate = await request('/api/users', owner.token, {
      method: 'POST', body: JSON.stringify({ name: 'Shipped Edit Manager', email: managerEmail, password: managerPassword, role: 'manager', active: true, defaultBranchId: branchId, branchIds: [branchId] })
    });
    assert.equal(managerCreate.response.status, 200, `Manager creation failed: ${JSON.stringify(managerCreate.body)}`);
    const manager = await login(managerEmail, managerPassword);
    const denied = await request(`/api/salesOrders/${order.id}`, manager.token, {
      method: 'PUT', body: JSON.stringify({ status: '已出库', branchId, paid: unitPrice * 2, items: [{ item: product.sku, qty: 2, unitPrice }] })
    });
    assert.equal(denied.response.status, 400, 'A manager must not change shipped item quantities');
    assert.match(String(denied.body.error || ''), /只有老板账号/);

    const health = await request('/api/health');
    assert.equal(health.body.shippedSalesOrderEditRevision, '2026-11-12-v1-owner-inventory-delta');
    console.log('Owner shipped-order editing, inventory delta correction, audit safety, and non-owner protection tests passed.');
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
