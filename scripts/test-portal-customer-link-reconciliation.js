const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-portal-links-'));
const port = 45000 + Math.floor(Math.random() * 1000);
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

async function jsonRequest(pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
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
    const adminLogin = await jsonRequest('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@filmshop.local', password: 'admin123' })
    });
    assert.equal(adminLogin.response.status, 200, `Admin login failed: ${JSON.stringify(adminLogin.body)}`);
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${adminLogin.body.token}` };
    const created = await jsonRequest('/api/portal-customers', {
      method: 'POST', headers,
      body: JSON.stringify({ businessName: 'TECH', contactName: 'TECH', account: 'tech', password: 'TechPass123', status: '正常' })
    });
    assert.equal(created.response.status, 201, `Customer creation failed: ${JSON.stringify(created.body)}`);
    const formalCustomerId = created.body.item.id;

    const dbFile = path.join(dataDir, 'db.json');
    const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    const product = db.products[0];
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: db.settings.timezone || 'America/Los_Angeles' }).format(new Date());
    db.portalCustomers.push({ id: 'legacy-tech', businessName: 'Tech', phone: '9032414132', active: false, referenceOnly: true });
    db.salesOrders.push(
      {
        id: 'portal-tech-order', date: today, customer: 'TECH', customerPhone: '9032414132', portalCustomerId: 'legacy-tech', portalSource: true,
        items: [{ item: product.sku, qty: 1, unitPrice: 1200 }], item: product.sku, qty: 1, unitPrice: 1200,
        paid: 1200, status: '已付款', paymentStatus: 'paid', paymentMethod: 'Stripe',
        paymentTransactions: [{ id: 'payment-1', amount: 1200, type: 'payment', method: 'Stripe', providerEventId: 'evt-live-1', livemode: true, createdAt: new Date().toISOString() }]
      },
      {
        id: 'legacy-tech-order', date: today, customer: 'Tech', portalCustomerId: '', portalSource: false,
        items: [{ item: product.sku, qty: 1, unitPrice: 100 }], item: product.sku, qty: 1, unitPrice: 100,
        paid: 0, status: '待收款', paymentTransactions: []
      }
    );
    db.inventoryReservations.push({ id: 'reservation-1', orderId: 'portal-tech-order', portalCustomerId: formalCustomerId, sku: product.sku, qty: 1, status: 'paid' });
    fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));

    const preview = await jsonRequest('/api/portal-customer-links/reconcile', { headers });
    assert.equal(preview.response.status, 200, `Preview failed: ${JSON.stringify(preview.body)}`);
    assert.equal(preview.body.ordersRelinked, 2, 'Both stale and missing TECH order links should be detected');
    assert.equal(preview.body.paymentTransactionsPreserved, 1, 'The existing Stripe payment transaction must be preserved');

    const repaired = await jsonRequest('/api/portal-customer-links/reconcile', { method: 'POST', headers, body: '{}' });
    assert.equal(repaired.response.status, 200, `Repair failed: ${JSON.stringify(repaired.body)}`);
    assert.equal(repaired.body.ordersRelinked, 2);
    assert(repaired.body.backupFileName, 'Repair must create a database backup first');

    const repairedDb = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    const portalOrder = repairedDb.salesOrders.find(order => order.id === 'portal-tech-order');
    const legacyOrder = repairedDb.salesOrders.find(order => order.id === 'legacy-tech-order');
    assert.equal(portalOrder.portalCustomerId, formalCustomerId);
    assert.equal(legacyOrder.portalCustomerId, formalCustomerId);
    assert.equal(portalOrder.paymentTransactions.length, 1);
    assert.equal(portalOrder.paymentTransactions[0].providerEventId, 'evt-live-1');
    assert.equal(repairedDb.inventoryReservations.find(row => row.id === 'reservation-1').portalCustomerId, formalCustomerId);

    const customerLogin = await jsonRequest('/api/customer/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'tech', password: 'TechPass123' })
    });
    assert.equal(customerLogin.response.status, 200, `Customer login failed: ${JSON.stringify(customerLogin.body)}`);
    const bootstrap = await jsonRequest('/api/customer/bootstrap', { headers: { Authorization: `Bearer ${customerLogin.body.token}` } });
    assert.deepEqual(new Set(bootstrap.body.orders.map(order => order.id)), new Set(['portal-tech-order', 'legacy-tech-order']));
    assert.equal(bootstrap.body.tierProgress.currentSales, 1200, 'The repaired live payment must count toward the current customer');

    const orderBeforeEdit = repairedDb.salesOrders.find(order => order.id === 'portal-tech-order');
    const updatePayload = { ...orderBeforeEdit, portalCustomerId: '', status: '已付款' };
    const updated = await jsonRequest('/api/salesOrders/portal-tech-order', { method: 'PUT', headers, body: JSON.stringify(updatePayload) });
    assert.equal(updated.response.status, 200, `Portal order update failed: ${JSON.stringify(updated.body)}`);
    const afterUpdate = JSON.parse(fs.readFileSync(dbFile, 'utf8')).salesOrders.find(order => order.id === 'portal-tech-order');
    assert.equal(afterUpdate.portalCustomerId, formalCustomerId, 'Editing a portal order must not clear its customer link');

    console.log('Portal customer link preview, backup, repair, payment preservation, customer visibility, and edit-guard tests passed.');
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
