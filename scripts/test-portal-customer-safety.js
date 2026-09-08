const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-portal-safety-'));
const port = 44000 + Math.floor(Math.random() * 1000);
let output = '';

function currentMonthIso() {
  return new Date().toISOString();
}

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
  for (const file of ['public/customer.js', 'public/customer-ordering.js', 'public/customer.html']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert(!/\bEric\b\s*(?:·\s*QUaD Dealer)?/i.test(source), `${file} must not contain a fixed Eric customer`);
  }

  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT: String(port),
      HOST: '127.0.0.1',
      ENABLE_CLOUD_DAILY_BACKUPS: 'false',
      STRIPE_SECRET_KEY: 'sk_test_portal_safety',
      STRIPE_CUSTOMER_ORDER_LIVE_ENABLED: 'false'
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
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.body.token}` };
    const baseCustomer = { businessName: 'Portal Safety Test', contactName: 'Test', account: 'portal-safety-test', password: 'TestPass123', priceTier: 'standard', prices: {} };

    const invalid = await jsonRequest('/api/portal-customers', {
      method: 'POST', headers, body: JSON.stringify({ ...baseCustomer, status: '沙盒测试账号' })
    });
    assert.equal(invalid.response.status, 400, 'Arbitrary portal customer statuses must be rejected');

    const created = await jsonRequest('/api/portal-customers', {
      method: 'POST', headers, body: JSON.stringify({ ...baseCustomer, status: '正常' })
    });
    assert.equal(created.response.status, 201, `Valid customer creation failed: ${JSON.stringify(created.body)}`);
    const customerId = created.body.item.id;
    const invalidUpdate = await jsonRequest(`/api/portal-customers/${customerId}`, {
      method: 'PUT', headers, body: JSON.stringify({ ...baseCustomer, password: '', status: '沙盒测试账号' })
    });
    assert.equal(invalidUpdate.response.status, 400, 'Arbitrary portal customer status updates must be rejected');

    const dbFile = path.join(dataDir, 'db.json');
    const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    const now = currentMonthIso();
    db.customerCheckoutEvents.push(
      { id: 'evt_test_portal_safety', type: 'checkout.session.completed', livemode: false, createdAt: now, processed: true },
      { id: 'evt_live_portal_safety', type: 'checkout.session.completed', livemode: true, createdAt: now, processed: true }
    );
    db.salesOrders.push(
      {
        id: 'mixed-stripe-order', portalCustomerId: customerId, paymentMethod: 'Stripe', stripeCheckoutSessionId: 'cs_test_mixed', paid: 1000,
        paymentTransactions: [
          { amount: 800, type: 'payment', method: 'Stripe', providerEventId: 'evt_test_portal_safety', createdAt: now },
          { amount: 200, type: 'payment', method: 'Stripe', providerEventId: 'evt_live_portal_safety', createdAt: now }
        ]
      },
      { id: 'test-fallback-order', portalCustomerId: customerId, paymentMethod: 'Stripe', stripeCheckoutSessionId: 'cs_test_fallback', paymentEnvironment: 'test', paid: 500, paymentTransactions: [], updatedAt: now },
      { id: 'legacy-test-order', portalCustomerId: customerId, paymentMethod: 'Stripe', stripeCheckoutSessionId: 'cs_test_legacy', paid: 400, paymentTransactions: [], updatedAt: now },
      { id: 'legacy-live-order', portalCustomerId: customerId, paymentMethod: 'Stripe', stripeCheckoutSessionId: 'cs_live_legacy', paid: 75, paymentTransactions: [], updatedAt: now },
      { id: 'manual-payment-order', portalCustomerId: customerId, paymentMethod: 'Cash', paid: 50, paymentTransactions: [], updatedAt: now }
    );
    fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));

    const refreshed = await jsonRequest('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@filmshop.local', password: 'admin123', includeBootstrap: true })
    });
    assert.equal(refreshed.response.status, 200, `Bootstrap login failed: ${JSON.stringify(refreshed.body)}`);
    const testedCustomer = refreshed.body.data.portalCustomers.find(row => row.id === customerId);
    assert(testedCustomer, 'Created portal customer must be present in bootstrap data');
    assert.equal(testedCustomer.tierProgress.currentSales, 325, 'Only live Stripe payments and non-Stripe payments should count toward paid sales');
    console.log('Portal customer safety tests passed.');
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
