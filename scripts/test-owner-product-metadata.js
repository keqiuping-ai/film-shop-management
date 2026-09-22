const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-owner-product-metadata-'));
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
  return { ...result.body, data: bootstrap.body.data };
}

function losAngelesDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

async function run() {
  const appSource = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  assert(appSource.includes("['sku','SKU',isEdit ? 'readonly' : 'text'"), 'Existing SKU must be read-only in the product editor');
  assert(appSource.includes('ownerCanEditIdentity'), 'Product identity fields must be owner-gated in the UI');
  assert(appSource.includes('productCategories(item.category)'), 'Product editor must preserve the current legacy category');
  assert(appSource.includes("options.unshift([current"), 'Unknown legacy categories must remain selectable instead of falling back to the first option');
  assert(html.includes('/app.js?v=138'), 'Desktop app asset marker must be bumped');

  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1', ENABLE_CLOUD_DAILY_BACKUPS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });

  try {
    await waitForServer();
    const ownerLogin = await login('admin@filmshop.local', 'admin123');
    const ownerToken = ownerLogin.token;
    const branchId = ownerLogin.data.settings.clockLocations[0].id;
    const sku = 'OWNER-META-001';
    const productInput = {
      sku,
      model: 'Old model',
      specification: '1.52*18m',
      name: 'Old name',
      category: '窗膜卷料',
      unit: 'roll',
      cost: 10,
      price: 20,
      wholesale: 15,
      minPrice: 12,
      qty: 0,
      reorder: 1,
      location: 'Test',
      portalVisible: true,
      portalPurchasable: true
    };
    const created = await request('/api/products', ownerToken, { method: 'POST', body: JSON.stringify(productInput) });
    assert.equal(created.response.status, 200, `Product creation failed: ${JSON.stringify(created.body)}`);
    const product = created.body.products.find(row => row.sku === sku);
    assert(product, 'Created product must be returned');

    const movement = await request('/api/movements', ownerToken, {
      method: 'POST',
      body: JSON.stringify({ date: losAngelesDate(), branchId, sku, type: 'in', qty: 1, note: 'metadata test' })
    });
    assert.equal(movement.response.status, 200, `Inventory movement failed: ${JSON.stringify(movement.body)}`);
    const referencedProduct = movement.body.products.find(row => row.id === product.id);

    const ownerUpdate = await request(`/api/products/${product.id}`, ownerToken, {
      method: 'PUT',
      body: JSON.stringify({ ...referencedProduct, model: 'QD107', name: '冷冻翡翠' })
    });
    assert.equal(ownerUpdate.response.status, 200, `Owner metadata update failed: ${JSON.stringify(ownerUpdate.body)}`);
    const ownerSaved = ownerUpdate.body.products.find(row => row.id === product.id);
    assert.equal(ownerSaved.model, 'QD107');
    assert.equal(ownerSaved.name, '冷冻翡翠');
    assert.equal(ownerSaved.sku, sku, 'Metadata update must not rename SKU');
    assert.equal(ownerSaved.qty, 1, 'Metadata update must preserve inventory');

    const warehouseEmail = 'warehouse-metadata-test@example.com';
    const employee = await request('/api/users', ownerToken, {
      method: 'POST',
      body: JSON.stringify({ name: 'Warehouse Metadata Test', email: warehouseEmail, password: 'Warehouse123!', role: 'warehouse', active: true })
    });
    assert.equal(employee.response.status, 200, `Warehouse user creation failed: ${JSON.stringify(employee.body)}`);
    const warehouseLogin = await login(warehouseEmail, 'Warehouse123!');
    const visibleProduct = warehouseLogin.data.products.find(row => row.id === product.id);
    const denied = await request(`/api/products/${product.id}`, warehouseLogin.token, {
      method: 'PUT',
      body: JSON.stringify({ ...visibleProduct, model: 'Unauthorized model', name: 'Unauthorized name' })
    });
    assert.equal(denied.response.status, 403, 'Non-owner product identity edit must be rejected');
    assert.match(String(denied.body.error || ''), /只有老板账号/);

    console.log('Owner-only product name/model tests passed.');
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
