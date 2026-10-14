const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const seedPath = path.join(root, 'data/seeds/santa-monica-field-sales-2026-10-13.json');
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

assert.equal(seed.version, 'santa-monica-field-sales-2026-10-13-v1');
assert.equal(seed.recordCount, 398);
assert.equal(seed.photoCount, 366);
assert.equal(seed.records.length, 398);
assert.equal(new Set(seed.records.map(item => item.publicRecordId)).size, 398);
assert(seed.records.every(item => item.businessName && item.address && item.visitRegion), 'every imported record needs a name, address, and visit region');

const photos = seed.records.flatMap(item => item.referencePhotos || []);
assert.equal(photos.length, 366);
photos.forEach(photo => {
  const localPath = path.join(root, 'public', String(photo.url || '').replace(/^\//, ''));
  assert(fs.existsSync(localPath), `missing imported photo ${photo.url}`);
  assert(fs.statSync(localPath).size > 0, `empty imported photo ${photo.url}`);
});

const first = seed.records.find(item => item.publicRecordId === 'SM001');
assert(first);
assert.equal(first.businessName, "Sam's Steam Auto Detail");
assert.equal(first.phone, '+1 562-296-7848');
assert.equal(first.website, 'https://www.samssteam.com/');
assert.equal(first.visitRegion, '西区／圣莫尼卡');
assert.equal(first.referencePhotos.length, 2);
assert(serverSource.includes("DATA_DIR === '/app/data'"), 'production data directory must activate the one-time import');

console.log('Santa Monica field-sales seed integrity test passed');
