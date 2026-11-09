const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-rfid-stocktake-'));
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

async function request(pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function run() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT: String(port),
      HOST: '127.0.0.1',
      ENABLE_CLOUD_DAILY_BACKUPS: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });

  try {
    await waitForServer();
    const health = await request('/api/health');
    assert.equal(health.body.rfidStocktakeApiRevision, '2026-11-08-v1-safe-stocktake');
    const login = await request('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@filmshop.local', password: 'admin123' })
    });
    assert.equal(login.response.status, 200, JSON.stringify(login.body));
    const ownerHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.body.token}` };
    const enrolled = await request('/api/inventory/rfid-devices', {
      method: 'POST', headers: ownerHeaders,
      body: JSON.stringify({ deviceId: 'PDA3109-01', name: 'Los Angeles PDA3109', branchId: 'los-angeles' })
    });
    assert.equal(enrolled.response.status, 200, JSON.stringify(enrolled.body));
    assert.match(enrolled.body.deviceKey || '', /^[A-Za-z0-9_-]{40,}$/, 'Enrollment must generate a one-time random key');
    const duplicateEnrollment = await request('/api/inventory/rfid-devices', {
      method: 'POST', headers: ownerHeaders,
      body: JSON.stringify({ deviceId: 'PDA3109-01', branchId: 'los-angeles' })
    });
    assert.equal(duplicateEnrollment.response.status, 409, 'Existing device id must not silently rotate its key');
    const before = JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
    const sku = before.products[0].sku;
    const requestId = `rfid-map-${Date.now()}`;
    const mapping = {
      requestId, branchId: 'los-angeles', source: 'Automated RFID API test',
      items: [
        { epc: 'E28068940000501111223344', sku, branchId: 'los-angeles', labelName: 'LA test roll' },
        { epc: 'E28068940000501111223355', sku, branchId: 'las-vegas', labelName: 'LV test roll' }
      ]
    };
    const preview = await request('/api/inventory/rfid-catalog/preview', {
      method: 'POST', headers: ownerHeaders, body: JSON.stringify(mapping)
    });
    assert.equal(preview.response.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.ok, true);
    assert.deepEqual(preview.body.totals, { input: 2, create: 2, unchanged: 0, conflict: 0, invalid: 0 });

    const applied = await request('/api/inventory/rfid-catalog/apply', {
      method: 'POST', headers: ownerHeaders, body: JSON.stringify(mapping)
    });
    assert.equal(applied.response.status, 200, JSON.stringify(applied.body));
    assert.equal(applied.body.inventoryChanged, false);
    const repeatedApply = await request('/api/inventory/rfid-catalog/apply', {
      method: 'POST', headers: ownerHeaders, body: JSON.stringify(mapping)
    });
    assert.equal(repeatedApply.body.alreadyApplied, true);
    const conflictingApply = await request('/api/inventory/rfid-catalog/apply', {
      method: 'POST', headers: ownerHeaders,
      body: JSON.stringify({ ...mapping, items: mapping.items.slice(0, 1) })
    });
    assert.equal(conflictingApply.response.status, 409, 'Same mapping request id with different content must be rejected');

    const unauthorized = await request('/api/inventory/rfid-receipts/capabilities');
    assert.equal(unauthorized.response.status, 401);
    const deviceHeaders = {
      'Content-Type': 'application/json',
      'X-QEOS-Device-Key': enrolled.body.deviceKey,
      'X-QEOS-Device-Id': 'PDA3109-01'
    };
    const capabilities = await request('/api/inventory/rfid-receipts/capabilities', { headers: deviceHeaders });
    assert.equal(capabilities.response.status, 200, JSON.stringify(capabilities.body));
    assert.deepEqual(capabilities.body.modes, ['stocktake']);
    assert.equal(capabilities.body.inventoryMutationEnabled, false);

    const catalog = await request('/api/inventory/rfid-catalog/items', { headers: deviceHeaders });
    assert.equal(catalog.response.status, 200, JSON.stringify(catalog.body));
    assert.equal(catalog.body.branchId, 'los-angeles');
    assert.equal(catalog.body.count, 1, 'LA device must not receive the Las Vegas mapping');

    const stocktakeRequestId = `stocktake-${Date.now()}`;
    const stocktakePayload = {
      requestId: stocktakeRequestId,
      scans: [
        { epc: 'E28068940000501111223344', rssi: -41 },
        { epc: 'E28068940000501111223355' },
        { epc: 'E28068940000501111229999' },
        { epc: 'E28068940000501111223344' },
        { epc: 'bad-epc' }
      ]
    };
    const stocktake = await request('/api/inventory/rfid-receipts', {
      method: 'POST', headers: deviceHeaders, body: JSON.stringify(stocktakePayload)
    });
    assert.equal(stocktake.response.status, 200, JSON.stringify(stocktake.body));
    assert.equal(stocktake.body.inventoryChanged, false);
    assert.deepEqual(stocktake.body.session.totals, {
      input: 5, unique: 4, known: 1, unknown: 1, wrongBranch: 1, duplicate: 1, invalid: 1
    });
    const repeatedStocktake = await request('/api/inventory/rfid-receipts', {
      method: 'POST', headers: deviceHeaders, body: JSON.stringify(stocktakePayload)
    });
    assert.equal(repeatedStocktake.body.alreadyRecorded, true);
    const conflictingStocktake = await request('/api/inventory/rfid-receipts', {
      method: 'POST', headers: deviceHeaders,
      body: JSON.stringify({ ...stocktakePayload, scans: stocktakePayload.scans.slice(0, 1) })
    });
    assert.equal(conflictingStocktake.response.status, 409, 'Same stocktake request id with different scans must be rejected');

    const after = JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
    assert.equal(after.movements.length, before.movements.length, 'RFID mapping and stocktake must not create inventory movements');
    assert.equal(after.rfidCatalogItems.length, 2);
    assert.equal(after.rfidCatalogImportBatches.length, 1);
    assert.equal(after.rfidStocktakeSessions.length, 1);
    assert.equal(after.rfidDevices.length, 1);
    assert(!JSON.stringify(after.rfidDevices).includes(enrolled.body.deviceKey), 'Plaintext device key must never be stored');
    assert(fs.readdirSync(path.join(dataDir, 'backups')).some(name => name.startsWith('db-before-rfid-catalog-')),
      'RFID catalog apply must create a database backup');

    console.log('RFID mapping, device isolation, stocktake idempotency, and no-inventory-mutation tests passed.');
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
