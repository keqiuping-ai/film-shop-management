const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const seedPath = path.join(root, 'migrations/las-vegas-field-sales-2026-10-13.json');
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const mobileSource = fs.readFileSync(path.join(root, 'public/mobile.js'), 'utf8');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');

assert.equal(seed.version, 'las-vegas-field-sales-2026-10-13-v1');
assert.equal(seed.recordCount, 148);
assert.equal(seed.photoCount, 119);
assert.equal(seed.routeCount, 7);
assert.equal(seed.batchCount, 27);
assert.equal(seed.records.length, 148);
assert.equal(new Set(seed.records.map(item => item.publicRecordId)).size, 148);
assert.equal(new Set(seed.records.map(item => item.route)).size, 7);
assert.equal(new Set(seed.records.map(item => item.visitBatch)).size, 27);
assert(seed.records.every(item => item.businessName && item.address && item.visitRegion && item.navigationUrl), 'every imported record needs a name, address, region, and navigation link');

const regionCounts = Object.fromEntries([...new Set(seed.records.map(item => item.visitRegion))].map(region => [region, seed.records.filter(item => item.visitRegion === region).length]));
assert.deepEqual(regionCounts, {
  '公司周边／中南区': 38,
  '西区／Summerlin': 17,
  '北区／北拉斯维加斯': 29,
  '中心／东区': 46,
  '亨德森': 12,
  '博尔德城': 2,
  '外围50–100公里／Pahrump': 4
});

const photos = seed.records.flatMap(item => item.referencePhotos || []);
assert.equal(photos.length, 119);
photos.forEach(photo => {
  const localPath = path.join(root, 'public', String(photo.url || '').replace(/^\//, ''));
  assert(fs.existsSync(localPath), `missing imported photo ${photo.url}`);
  assert(fs.statSync(localPath).size > 0, `empty imported photo ${photo.url}`);
});

const first = seed.records.find(item => item.publicRecordId === 'LV001');
assert(first);
assert.equal(first.businessName, 'AT Customs LV');
assert.equal(first.phone, '702-970-0687');
assert.equal(first.website, 'https://atcustomslv.com/studio');
assert.equal(first.visitRegion, '公司周边／中南区');
assert.equal(first.referencePhotos.length, 0);

const photographed = seed.records.find(item => item.publicRecordId === 'LV002');
assert.equal(photographed.referencePhotos.length, 2);
assert(serverSource.includes('applyLasVegasFieldSalesProspectImport();'), 'production startup must run the idempotent Las Vegas import');
assert(serverSource.includes('lasVegasFieldSalesImport'), 'health endpoint must report the Las Vegas import');
assert(mobileSource.includes("'los-angeles', 'las-vegas', 'san-francisco'"), 'mobile home must separate Los Angeles, Las Vegas, and San Francisco');
assert(dockerfile.includes('COPY migrations ./migrations'), 'Railway image must include the customer seed migration');

console.log('Las Vegas field-sales seed integrity test passed');
