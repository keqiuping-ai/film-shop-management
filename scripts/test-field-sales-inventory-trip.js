const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-field-sales-test-'));
const PORT = 46000 + Math.floor(Math.random() * 1000);
const BASE_URL = `http://127.0.0.1:${PORT}`;
let server = null;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, DATA_DIR, PORT: String(PORT), HOST: '127.0.0.1', ENABLE_CLOUD_DAILY_BACKUPS: 'false' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Server startup timed out:\n${output}`)), 15000);
    const onData = chunk => {
      output += chunk.toString();
      if (output.includes('Film shop cloud app running:')) {
        clearTimeout(timeout);
        resolve();
      }
    };
    server.stdout.on('data', onData);
    server.stderr.on('data', onData);
    server.once('exit', code => {
      clearTimeout(timeout);
      if (code && !output.includes('Film shop cloud app running:')) reject(new Error(`Server exited ${code}:\n${output}`));
    });
  });
}

function stopServer() {
  if (!server || server.exitCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const child = server;
    const forceTimer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, 2000);
    forceTimer.unref();
    child.once('exit', () => {
      clearTimeout(forceTimer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

async function request(pathname, { token = '', method = 'GET', body } = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  return { status: response.status, body: payload };
}

async function login(email) {
  const result = await request('/api/login', { method:'POST', body:{ email, password:'test-password' } });
  assert.equal(result.status, 200, `login failed for ${email}`);
  return result.body.token;
}

function testUser(id, email, permissions) {
  return {
    id, name:id, email, role:'sales', passwordHash:hashPassword('test-password'), active:true,
    defaultBranchId:'', branchIds:[], permissions
  };
}

async function seedIsolatedFixture() {
  await startServer();
  await stopServer();
  const dbPath = path.join(DATA_DIR, 'db.json');
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  db.products = [
    { id:'product-qd15', sku:'QD15-BLK-15218', model:'QD15', specification:'60in x 100ft Black', name:'QD15 Ceramic Window Film', unit:'roll', wholesale:320, qty:17 },
    { id:'product-qd35', sku:'QD35-SLV-6020', model:'QD35 Silver', specification:'60in x 20ft', name:'Silver Sample Film', unit:'roll', wholesale:180, qty:4 }
  ];
  db.movements = [
    { id:'mv-lv-qd15', sku:'QD15-BLK-15218', branchId:'las-vegas', type:'in', qty:10 },
    { id:'mv-la-qd15', sku:'QD15-BLK-15218', branchId:'los-angeles', type:'in', qty:7 },
    { id:'mv-lv-qd35', sku:'QD35-SLV-6020', branchId:'las-vegas', type:'in', qty:4 }
  ];
  db.workshopMovements = [];
  db.branchTransfers = [];
  db.salesOrders = [{ id:'reserved-order', status:'待出库' }];
  db.inventoryReservations = [
    { id:'reserve-lv', orderId:'reserved-order', sku:'QD15-BLK-15218', branchId:'las-vegas', qty:3, status:'paid' },
    { id:'expired-la', orderId:'expired-order', sku:'QD15-BLK-15218', branchId:'los-angeles', qty:2, status:'pending_payment', expiresAt:'2020-01-01T00:00:00.000Z' }
  ];
  db.portalPriceTiers = [
    { id:'standard', name:'批发价', prices:{ 'QD15-BLK-15218':300 } },
    { id:'first-order', name:'首次进货价', prices:{} },
    { id:'bronze', name:'铜牌经销商价', prices:{} },
    { id:'silver', name:'银牌经销商价', prices:{} },
    { id:'gold', name:'金牌经销商价', prices:{ 'QD15-BLK-15218':250 } },
    { id:'strategic', name:'超级战略合作伙伴价', prices:{} }
  ];
  db.users.push(
    testUser('sales-none', 'none@test.local', {}),
    testUser('sales-inventory', 'inventory@test.local', { fieldSalesInventoryView:true }),
    testUser('sales-prices', 'prices@test.local', { fieldSalesPriceSilver:true, fieldSalesPriceGold:true })
  );
  db.salesAccounts = [
    { id:'old-account', businessName:'Old Hotel', address:'100 Old St', lat:36.1, lng:-115.2, assignedUserId:'sales-prices', stage:'前往中' },
    { id:'new-account', businessName:'New Film Shop', address:'200 New St', lat:36.11, lng:-115.21, assignedUserId:'sales-prices', stage:'待拜访' }
  ];
  db.salesTrips = [{
    id:'old-trip', accountId:'old-account', businessName:'Old Hotel', userId:'sales-prices', userName:'sales-prices',
    status:'前往中', routeStatus:'前往中', departedAt:'2026-09-08T12:00:00.000Z', branchId:'',
    destination:{ lat:36.1, lng:-115.2, address:'100 Old St' }, estimatedDistanceMeters:1609, estimatedMinutes:8
  }];
  db.salesVisitPlans = [
    { id:'old-plan', accountId:'old-account', businessName:'Old Hotel', userId:'sales-prices', status:'前往中', tripId:'old-trip', date:'2026-09-08' },
    { id:'new-plan', accountId:'new-account', businessName:'New Film Shop', userId:'sales-prices', status:'待出发', date:'2026-09-08' }
  ];
  db.salesVisits = [];
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  await startServer();
}

async function run() {
  await seedIsolatedFixture();
  const uiHoldMs = Math.max(0, Number(process.env.UI_TEST_HOLD_MS || 0));
  if (uiHoldMs) {
    console.log(`UI fixture ready at ${BASE_URL}/mobile.html for ${uiHoldMs}ms.`);
    await new Promise(resolve => setTimeout(resolve, uiHoldMs));
    return;
  }
  const noPermissionToken = await login('none@test.local');
  const inventoryToken = await login('inventory@test.local');
  const pricesToken = await login('prices@test.local');

  const denied = await request('/api/field-sales/inventory-pricing?q=QD15', { token:noPermissionToken });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, 'FIELD_SALES_INVENTORY_PRICING_FORBIDDEN');
  const noPermissionBootstrap = await request('/api/mobile/bootstrap', { token:noPermissionToken });
  assert.deepEqual(Object.keys(noPermissionBootstrap.body.fieldSales.products[0]).sort(), ['id','model','name','sku','specification','unit']);

  for (const query of ['QD15-BLK', 'QD15', 'Ceramic Window']) {
    const found = await request(`/api/field-sales/inventory-pricing?q=${encodeURIComponent(query)}`, { token:inventoryToken });
    assert.equal(found.status, 200);
    assert.equal(found.body.products[0].sku, 'QD15-BLK-15218');
    assert.deepEqual(found.body.products[0].inventory, { 'las-vegas':7, 'los-angeles':7 });
    assert.equal('prices' in found.body.products[0], false);
  }

  const priced = await request('/api/field-sales/inventory-pricing?q=QD15', { token:pricesToken });
  assert.equal(priced.status, 200);
  assert.equal('inventory' in priced.body.products[0], false);
  assert.deepEqual(priced.body.products[0].prices, { silver:300, gold:250 });
  const wholesaleFallback = await request('/api/field-sales/inventory-pricing?q=QD35', { token:pricesToken });
  assert.deepEqual(wholesaleFallback.body.products[0].prices, { silver:180, gold:180 });

  const conflict = await request('/api/field-sales/trips/start', { token:pricesToken, method:'POST', body:{ accountId:'new-account', locationConsent:true, lat:36.11, lng:-115.21, accuracy:5 } });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, 'ACTIVE_TRIP_EXISTS');
  assert.equal(conflict.body.activeTrip.id, 'old-trip');

  const missingReason = await request('/api/field-sales/trips/old-trip/cancel', { token:pricesToken, method:'PUT', body:{ reason:'' } });
  assert.equal(missingReason.status, 400);
  assert.equal(missingReason.body.code, 'ACTIVE_TRIP_CANCEL_REASON_REQUIRED');
  const cancelled = await request('/api/field-sales/trips/old-trip/cancel', { token:pricesToken, method:'PUT', body:{ reason:'Old route is no longer valid' } });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.fieldSales.trips.find(item => item.id === 'old-trip').status, '已取消');
  assert.equal(cancelled.body.fieldSales.visitPlans.find(item => item.id === 'old-plan').status, '待出发');
  assert.equal(cancelled.body.fieldSales.accounts.find(item => item.id === 'old-account').stage, '待拜访');

  const restarted = await request('/api/field-sales/trips/start', { token:pricesToken, method:'POST', body:{ accountId:'new-account', locationConsent:true, lat:36.11, lng:-115.21, accuracy:5 } });
  assert.equal(restarted.status, 201);
  const newTrip = restarted.body.fieldSales.trips.find(item => item.accountId === 'new-account' && item.status === '前往中');
  assert.ok(newTrip);
  const arrived = await request('/api/field-sales/visits/start', { token:pricesToken, method:'POST', body:{ accountId:'new-account', locationConsent:true, lat:36.11, lng:-115.21, accuracy:5, photoUrl:'/customer-media/test.jpg', contactMet:'Owner' } });
  assert.equal(arrived.status, 201);
  const visit = arrived.body.visit;
  assert.equal(visit.status, '进行中');
  const completed = await request(`/api/field-sales/visits/${visit.id}/complete`, { token:pricesToken, method:'PUT', body:{ reportText:'Local isolated visit test completed', outcome:'继续跟进' } });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.fieldSales.visits.find(item => item.id === visit.id).status, '已完成');
  assert.equal(completed.body.fieldSales.visitPlans.find(item => item.id === 'new-plan').status, '已完成');

  console.log('Field sales inventory/pricing permissions and trip recovery tests passed.');
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  await stopServer();
  fs.rmSync(DATA_DIR, { recursive:true, force:true });
});
