const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-inventory-documents-'));
const port = 47000 + Math.floor(Math.random() * 1000);
let output = '';

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return; } catch {}
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

async function login() {
  const result = await request('/api/login', '', { method:'POST', body:JSON.stringify({ email:'admin@filmshop.local', password:'admin123' }) });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  const bootstrap = await request('/api/bootstrap', result.body.token);
  return { token:result.body.token, data:bootstrap.body.data };
}

function localDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone:'America/Los_Angeles', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
}

async function run() {
  const appSource = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
  assert(appSource.includes("'待出库单'"), 'Inventory page must include a separate pending stock-out document');
  assert(appSource.includes("'出库单'"), 'Inventory page must include a separate stock-out document');
  assert(appSource.includes("'入库单'"), 'Inventory page must include a separate stock-in document');
  assert(appSource.includes("'库存单'"), 'Inventory page must label the stock list as inventory document');
  assert(!appSource.includes('<h3>${lang === \'zh\' ? \'出入库流水\''), 'Inventory page must not keep the mixed movement title');
  assert(appSource.includes('inventory-workbench-panel'), 'Inventory documents must use full-width stacked workbench panels');
  assert(appSource.includes('inventory-document-table-scroll'), 'Inventory document tables must use a bounded vertical scroll area');
  assert(appSource.includes("productTable(searchedProducts(), true, 'inventory-stock-table-scroll')"), 'Inventory list must use its own five-row scroll viewport');
  assert(appSource.includes('openPendingStockOutDocument'), 'Pending stock-out rows must open a full document review');
  assert(appSource.includes('stockOutLineReconciliation'), 'Pending stock-out must compare order, shipped, and branch inventory quantities');
  assert(appSource.includes('openStockOutDocument'), 'Stock-out rows must open a grouped document detail');
  const cssSource = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');
  assert(cssSource.includes('.inventory-stock-table-scroll{max-height:570px;overflow:auto'), 'Inventory list must stay compact and scroll internally');
  assert(cssSource.includes('.pending-stockout-table{width:100%;min-width:900px!important;table-layout:fixed'), 'Pending stock-out columns must stay compact enough to expose the action button');

  const child = spawn(process.execPath, ['server.js'], {
    cwd:root,
    env:{ ...process.env, DATA_DIR:dataDir, PORT:String(port), HOST:'127.0.0.1', ENABLE_CLOUD_DAILY_BACKUPS:'false' },
    stdio:['ignore','pipe','pipe']
  });
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });

  try {
    await waitForServer();
    const owner = await login();
    const branchId = owner.data.settings.clockLocations[0].id;
    const product = owner.data.products.find(row => row.sku && !['CUSTOM-PRINTED-FILM','CUSTOM-CUSTOMER-REQUEST'].includes(row.sku));
    assert(product, 'Seed product required');
    const beforeQty = Number(product.qty || 0);
    const receive = await request('/api/movements', owner.token, {
      method:'POST', body:JSON.stringify({ date:localDate(), branchId, sku:product.sku, type:'in', qty:5, note:'workflow test receipt' })
    });
    assert.equal(receive.response.status, 200, `Stock-in failed: ${JSON.stringify(receive.body)}`);

    const unitPrice = Math.max(100, Number(product.minPrice || 0), Number(product.wholesale || 0));
    const paidOrder = await request('/api/salesOrders', owner.token, {
      method:'POST', body:JSON.stringify({
        date:localDate(), branchId, type:'retail-us', customer:'Paid Stock-out Test',
        items:[{ item:product.sku, qty:2, unitPrice }], paid:unitPrice * 2,
        paymentStatus:'paid', status:'已付款', clientRequestId:`stockout-paid-${Date.now()}`
      })
    });
    assert.equal(paidOrder.response.status, 200, `Paid order failed: ${JSON.stringify(paidOrder.body)}`);
    const order = paidOrder.body.salesOrders.find(row => row.customer === 'Paid Stock-out Test');
    assert(order, 'Paid order not found');

    const shipped = await request(`/api/sales-orders/${order.id}/ship`, owner.token, { method:'POST', body:JSON.stringify({ branchId }) });
    assert.equal(shipped.response.status, 200, `Stock-out failed: ${JSON.stringify(shipped.body)}`);
    const shippedOrder = shipped.body.salesOrders.find(row => row.id === order.id);
    assert.equal(shippedOrder.status, '已出库');
    assert.match(shippedOrder.shipmentNo, /^CK-\d{8}-[A-Z0-9]+$/);
    assert.equal(shipped.body.movements.filter(row => row.salesOrderId === order.id && row.type === 'out').length, 1);
    assert.equal(Number(shipped.body.products.find(row => row.sku === product.sku).qty), beforeQty + 3);

    const repeated = await request(`/api/sales-orders/${order.id}/ship`, owner.token, { method:'POST', body:JSON.stringify({ branchId }) });
    assert.equal(repeated.response.status, 200, 'Repeated confirmation should be idempotent');
    assert.equal(repeated.body.movements.filter(row => row.salesOrderId === order.id && row.type === 'out').length, 1, 'Repeated confirmation must not deduct stock twice');
    assert.equal(Number(repeated.body.products.find(row => row.sku === product.sku).qty), beforeQty + 3);

    const unpaidCreate = await request('/api/salesOrders', owner.token, {
      method:'POST', body:JSON.stringify({
        date:localDate(), branchId, type:'retail-us', customer:'Unpaid Stock-out Test',
        items:[{ item:product.sku, qty:1, unitPrice }], paid:0,
        paymentStatus:'pending', status:'待收款', clientRequestId:`stockout-unpaid-${Date.now()}`
      })
    });
    const unpaid = unpaidCreate.body.salesOrders.find(row => row.customer === 'Unpaid Stock-out Test');
    const denied = await request(`/api/sales-orders/${unpaid.id}/ship`, owner.token, { method:'POST', body:JSON.stringify({ branchId }) });
    assert.equal(denied.response.status, 400, 'Unpaid order must not be shipped');
    assert.match(String(denied.body.error || ''), /已经付清/);

    console.log('Separate inventory documents, paid-order stock-out, atomic deduction, and duplicate protection tests passed.');
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    fs.rmSync(dataDir, { recursive:true, force:true });
  }
}

run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
