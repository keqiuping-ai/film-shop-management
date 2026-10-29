const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-sales-order-role-visibility-'));
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

async function request(pathname, token, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function login(email, password) {
  const result = await request('/api/login', '', {
    method: 'POST', body: JSON.stringify({ email, password })
  });
  assert.equal(result.response.status, 200, `Login failed for ${email}: ${JSON.stringify(result.body)}`);
  const bootstrap = await request('/api/bootstrap', result.body.token);
  assert.equal(bootstrap.response.status, 200, `Bootstrap failed for ${email}`);
  return { token: result.body.token, data: bootstrap.body.data };
}

function todayInLosAngeles() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

async function createUser(owner, payload) {
  const result = await request('/api/users', owner.token, {
    method: 'POST', body: JSON.stringify(payload)
  });
  assert.equal(result.response.status, 200, `User creation failed: ${JSON.stringify(result.body)}`);
}

async function createOrder(actor, payload) {
  const result = await request('/api/salesOrders', actor.token, {
    method: 'POST', body: JSON.stringify(payload)
  });
  assert.equal(result.response.status, 200, `Order creation failed: ${JSON.stringify(result.body)}`);
  const order = result.body.salesOrders.find(row => row.clientRequestId === payload.clientRequestId);
  assert(order, `Saved order ${payload.clientRequestId} was not returned to its creator`);
  return order;
}

async function run() {
  const appSource = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  assert(appSource.includes("if (user?.role !== 'owner') return rows || [];"), 'Non-owner branch rows must rely on server scope');
  assert(html.includes('/app.js?v=170'), 'Desktop asset marker must include the role-scope release');

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
    const branches = owner.data.settings.customerBranches || [];
    const la = branches.find(row => row.id === 'los-angeles')?.id;
    const lv = branches.find(row => row.id === 'las-vegas')?.id;
    assert(la && lv, 'Los Angeles and Las Vegas branches are required');

    const managerEmail = 'ting-role-test@example.com';
    const salesAEmail = 'bryan-role-test@example.com';
    const salesBEmail = 'other-sales-role-test@example.com';
    const password = 'RoleTest123!';
    await createUser(owner, { name: '张婷婷', email: managerEmail, password, role: 'manager', active: true, defaultBranchId: la, branchIds: [la, lv] });
    await createUser(owner, { name: 'Bryan 蒋俊', email: salesAEmail, password, role: 'sales', active: true, defaultBranchId: la, branchIds: [la] });
    await createUser(owner, { name: 'Other Sales', email: salesBEmail, password, role: 'sales', active: true, defaultBranchId: la, branchIds: [la] });

    const salesA = await login(salesAEmail, password);
    const salesB = await login(salesBEmail, password);
    const product = salesA.data.products.find(row => row.sku && row.portalPurchasable !== false) || salesA.data.products[0];
    assert(product, 'A saleable product is required');
    const unitPrice = Math.max(100, Number(product.price || 0), Number(product.minPrice || 0));
    const base = {
      date: todayInLosAngeles(), branchId: la, type: 'retail-us',
      items: [{ item: product.sku, qty: 1, unitPrice }], paid: 0, status: '待收款'
    };
    const orderA = await createOrder(salesA, { ...base, customer: 'Bryan Own Customer', clientRequestId: `role-a-${Date.now()}` });
    const orderB = await createOrder(salesB, { ...base, customer: 'Other Sales Customer', clientRequestId: `role-b-${Date.now()}` });

    const manager = await login(managerEmail, password);
    assert(manager.data.salesOrders.some(row => row.id === orderA.id), 'Manager must see Bryan sales orders in an assigned branch');
    assert(manager.data.salesOrders.some(row => row.id === orderB.id), 'Manager must see every salesperson order in an assigned branch');

    const refreshedA = await login(salesAEmail, password);
    assert(refreshedA.data.salesOrders.some(row => row.id === orderA.id), 'Salesperson must see their own order');
    assert(!refreshedA.data.salesOrders.some(row => row.id === orderB.id), 'Salesperson must not see another salesperson order');
    const directList = await request('/api/salesOrders', refreshedA.token);
    assert.equal(directList.response.status, 200);
    assert(directList.body.some(row => row.id === orderA.id), 'Direct order API must include the salesperson own order');
    assert(!directList.body.some(row => row.id === orderB.id), 'Direct order API must exclude another salesperson order');

    const forbiddenEdit = await request(`/api/salesOrders/${orderB.id}`, refreshedA.token, {
      method: 'PUT', body: JSON.stringify({ note: 'must not be accepted' })
    });
    assert.equal(forbiddenEdit.response.status, 403, 'Salesperson must not modify another salesperson order');
    assert.match(String(forbiddenEdit.body.error || ''), /自己的销售单/);

    const ownEdit = await request(`/api/salesOrders/${orderA.id}`, refreshedA.token, {
      method: 'PUT', body: JSON.stringify({ note: 'own order update' })
    });
    assert.equal(ownEdit.response.status, 200, `Salesperson own-order update failed: ${JSON.stringify(ownEdit.body)}`);
    assert(ownEdit.body.salesOrders.some(row => row.id === orderA.id && row.note === 'own order update'));

    console.log('Manager all-assigned-branch and salesperson own-order visibility tests passed.');
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
