const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const expected = {
  'san-francisco': { file:'san-francisco-field-sales-2026-10-14.json', records:271, photos:253, routes:7, batches:60, prefix:'SF', architectural:62, architecturalOnly:2 },
  seattle: { file:'seattle-field-sales-2026-10-14.json', records:219, photos:240, routes:7, batches:41, prefix:'SEA', architectural:51, architecturalOnly:4 },
  phoenix: { file:'phoenix-field-sales-2026-10-14.json', records:333, photos:386, routes:6, batches:57, prefix:'PHX', architectural:108, architecturalOnly:2 },
  vancouver: { file:'vancouver-field-sales-2026-10-14.json', records:243, photos:215, routes:7, batches:48, prefix:'VAN', architectural:26, architecturalOnly:1 }
};

for (const [marketId, config] of Object.entries(expected)) {
  const seed = JSON.parse(fs.readFileSync(path.join(root, 'migrations', config.file), 'utf8'));
  assert.equal(seed.marketId, marketId);
  assert.equal(seed.recordCount, config.records);
  assert.equal(seed.photoCount, config.photos);
  assert.equal(seed.routeCount, config.routes);
  assert.equal(seed.batchCount, config.batches);
  assert.equal(seed.records.length, config.records);
  assert.equal(new Set(seed.records.map(item => item.publicRecordId)).size, config.records);
  assert(seed.records.every(item => item.publicRecordId.startsWith(config.prefix) || item.publicRecordId.startsWith(`ARCH-${config.prefix}`)), `${marketId} record prefix mismatch`);
  assert(seed.records.every(item => item.marketId === marketId), `${marketId} market marker missing`);
  assert(seed.records.every(item => item.businessName && item.address && item.visitRegion && item.visitBatch && item.navigationUrl), `${marketId} required visit fields missing`);
  assert.equal(seed.records.reduce((sum, item) => sum + (item.architecturalSourceIds || []).length, 0), config.architectural, `${marketId} architectural source coverage mismatch`);
  assert.equal(seed.records.filter(item => item.publicRecordId.startsWith('ARCH-')).length, config.architecturalOnly, `${marketId} architectural-only customer mismatch`);
  assert(seed.records.filter(item => item.architecturalSourceId).every(item => item.interestedProducts?.includes('建筑玻璃膜')), `${marketId} architectural interest missing`);
  assert(seed.supplementalSourceWorkbook === 'Architectural_Film_Four_Cities_EN_CN.xlsx', `${marketId} supplemental source missing`);
  const photos = seed.records.flatMap(item => item.referencePhotos || []);
  assert.equal(photos.length, config.photos);
  photos.forEach(photo => {
    const localPath = path.join(root, 'public', String(photo.url || '').replace(/^\//, ''));
    assert(fs.existsSync(localPath), `missing imported photo ${photo.url}`);
    assert(fs.statSync(localPath).size > 0, `empty imported photo ${photo.url}`);
  });
}

const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const mobile = fs.readFileSync(path.join(root, 'public', 'mobile.js'), 'utf8');
assert(server.includes('applyRegionalFieldSalesProspectImports();'), 'production startup must run the regional import');
assert(server.includes('regionalFieldSalesImports'), 'health endpoint must report regional import counts');
assert(mobile.includes("'san-francisco', 'seattle', 'phoenix', 'vancouver'"), 'mobile selector must expose every imported market');
assert(mobile.includes("const marketId = String(account.marketId || '').toLowerCase()"), 'mobile grouping must use the explicit market marker');
assert(mobile.includes('routeForRegion'), 'regional directions must follow route order');

console.log('regional field-sales seed integrity test passed');
