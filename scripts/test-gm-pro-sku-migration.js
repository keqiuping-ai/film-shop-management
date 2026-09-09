const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-gm-pro-migration-test-'));
const DB_PATH = path.join(DATA_DIR, 'db.json');
const PORT = 47000 + Math.floor(Math.random() * 1000);
let server = null;

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
        resolve(output);
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
    const forceTimer = setTimeout(() => child.exitCode === null && child.kill('SIGKILL'), 2000);
    forceTimer.unref();
    child.once('exit', () => { clearTimeout(forceTimer); resolve(); });
    child.kill('SIGTERM');
  });
}

async function run() {
  await startServer();
  await stopServer();

  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  for (const collection of [
    'workshopMovements', 'inventoryReservations', 'shipments', 'shipmentReceipts',
    'shipmentExceptions', 'branchTransfers', 'branchTransferExceptions', 'salesTrialRolls',
    'salesConsignments', 'salesFieldOrders', 'salesOrders', 'portalCustomers'
  ]) db[collection] ||= [];
  const sourceProduct = { id:'product-g20yd', sku:'G20YD', model:'G20YD', name:'GM-PRO (1.52*15)', category:'零售商品', unit:'件', qty:5, portalVisible:true, portalPurchasable:true };
  const targetProduct = { id:'product-gm-pro', sku:'GM-PRO', model:'GM-PRO', name:'G20-YD (1.52*15m)', category:'TPU车衣', unit:'roll', qty:2, wholesale:800, portalVisible:true, portalPurchasable:true };
  db.products.push(sourceProduct, targetProduct);
  db.movements.push({ id:'movement-source', sku:'G20YD', branchId:'las-vegas', type:'in', qty:5 });
  db.workshopMovements.push({ id:'workshop-source', sku:'G20YD', branchId:'las-vegas', type:'transfer', qty:1 });
  db.inventoryReservations.push({ id:'reservation-source', sku:'G20YD', branchId:'las-vegas', qty:1, status:'paid' });
  db.shipments.push({ id:'shipment-source', sku:'G20YD' });
  db.shipmentReceipts.push({ id:'receipt-source', sku:'G20YD' });
  db.shipmentExceptions.push({ id:'shipment-exception-source', sku:'G20YD' });
  db.branchTransfers.push({ id:'transfer-source', sku:'G20YD', status:'待发货' });
  db.branchTransferExceptions.push({ id:'transfer-exception-source', sku:'G20YD' });
  db.salesTrialRolls.push({ id:'trial-source', productId:sourceProduct.id, productSku:'G20YD' });
  db.salesConsignments.push({ id:'consignment-source', items:[{ productId:sourceProduct.id, productSku:'G20YD' }] });
  db.salesFieldOrders.push({ id:'field-order-source', items:[{ productId:sourceProduct.id, sku:'G20YD' }] });
  db.salesOrders.push({ id:'order-source', item:'G20YD', items:[{ productId:sourceProduct.id, item:'G20YD', sku:'G20YD', qty:1, unitPrice:600 }] });
  db.portalPriceTiers[0].prices.G20YD = 700;
  db.portalPriceTiers[0].prices['GM-PRO'] = 800;
  db.portalCustomers.push(
    { id:'customer-source-only', prices:{ G20YD:610 } },
    { id:'customer-both', prices:{ G20YD:620, 'GM-PRO':600 } }
  );
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

  const output = await startServer();
  assert.match(output, /G20YD merged into GM-PRO/);
  await stopServer();

  const migrated = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const canonical = migrated.products.find(product => product.sku === 'GM-PRO');
  const duplicate = migrated.products.find(product => product.sku === 'G20YD');
  assert.deepEqual(
    { name:canonical.name, model:canonical.model, specification:canonical.specification, unit:canonical.unit, qty:canonical.qty, active:canonical.active },
    { name:'GM-PRO / G20-YD', model:'GM-PRO', specification:'1.52 × 15m', unit:'roll', qty:7, active:true }
  );
  assert.deepEqual(
    { qty:duplicate.qty, active:duplicate.active, portalVisible:duplicate.portalVisible, portalPurchasable:duplicate.portalPurchasable, mergedIntoSku:duplicate.mergedIntoSku },
    { qty:0, active:false, portalVisible:false, portalPurchasable:false, mergedIntoSku:'GM-PRO' }
  );

  for (const collection of ['movements', 'workshopMovements', 'inventoryReservations', 'shipments', 'shipmentReceipts', 'shipmentExceptions', 'branchTransfers', 'branchTransferExceptions']) {
    assert.ok(migrated[collection].every(record => record.sku !== 'G20YD'), `${collection} retained G20YD`);
  }
  assert.ok(migrated.salesTrialRolls.every(record => record.productSku !== 'G20YD'));
  assert.ok(migrated.salesConsignments.every(record => (record.items || []).every(line => line.productSku !== 'G20YD' && line.sku !== 'G20YD')));
  assert.ok(migrated.salesFieldOrders.every(record => (record.items || []).every(line => line.sku !== 'G20YD')));
  assert.ok(migrated.salesOrders.every(order => order.item !== 'G20YD' && (order.items || []).every(line => line.item !== 'G20YD' && line.sku !== 'G20YD')));
  assert.equal(migrated.portalPriceTiers[0].prices['GM-PRO'], 800, 'canonical tier price must win');
  assert.equal(Object.hasOwn(migrated.portalPriceTiers[0].prices, 'G20YD'), false);
  assert.equal(migrated.portalCustomers.find(customer => customer.id === 'customer-source-only').prices['GM-PRO'], 610);
  assert.equal(migrated.portalCustomers.find(customer => customer.id === 'customer-both').prices['GM-PRO'], 600, 'canonical customer price must win');

  const backupName = migrated.gmProCanonicalSkuMigrationBackup;
  const backupPath = path.join(DATA_DIR, 'backups', backupName);
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  assert.equal(backup.products.find(product => product.sku === 'G20YD').qty, 5);
  assert.equal(backup.products.find(product => product.sku === 'GM-PRO').qty, 2);
  const backupNamesBeforeRestart = fs.readdirSync(path.join(DATA_DIR, 'backups')).filter(name => name.includes('gm-pro-canonical-sku'));

  await startServer();
  await stopServer();
  const afterRestart = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const backupNamesAfterRestart = fs.readdirSync(path.join(DATA_DIR, 'backups')).filter(name => name.includes('gm-pro-canonical-sku'));
  assert.equal(afterRestart.products.find(product => product.sku === 'GM-PRO').qty, 7, 'migration must be idempotent');
  assert.deepEqual(backupNamesAfterRestart, backupNamesBeforeRestart, 'idempotent restart must not create another migration backup');

  console.log('GM-PRO canonical SKU migration, backup verification, reference coverage, pricing merge, and idempotency tests passed.');
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  await stopServer();
  fs.rmSync(DATA_DIR, { recursive:true, force:true });
});
