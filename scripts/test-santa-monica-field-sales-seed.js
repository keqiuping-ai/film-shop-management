const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const seedPath = path.join(root, 'migrations/santa-monica-field-sales-2026-10-13.json');
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');

assert.equal(seed.version, 'santa-monica-field-sales-2026-10-16-v4-google-expanded');
assert.equal(seed.recordCount, 412);
assert.equal(seed.photoCount, 368);
assert.equal(seed.records.length, 412);
assert.equal(new Set(seed.records.map(item => item.publicRecordId)).size, 412);
assert(seed.records.every(item => item.businessName && item.address && item.visitRegion), 'every imported record needs a name, address, and visit region');
assert.deepEqual(seed.googleAuditCounts, { confirmed:330, rejected:32, needs_review:50 });
assert(seed.records.every(item => ['confirmed', 'rejected', 'needs_review'].includes(item.googleVerificationStatus)), 'every Los Angeles prospect needs a Google verification status');
assert(seed.records.filter(item => item.googleVerificationStatus === 'confirmed').every(item => item.active === true && item.googleHasBusinessHours && item.googleHasBusinessPhotos && item.googleAddressMatches), 'confirmed stores must have hours, photos, and a matching address');
assert(seed.records.filter(item => item.googleVerificationStatus !== 'confirmed').every(item => item.active === false), 'unconfirmed records must be hidden from field visits');

const photos = seed.records.flatMap(item => item.referencePhotos || []);
assert.equal(photos.length, 368);
photos.forEach(photo => {
  if (String(photo.url || '').startsWith('/')) {
    const localPath = path.join(root, 'public', String(photo.url || '').replace(/^\//, ''));
    assert(fs.existsSync(localPath), `missing imported photo ${photo.url}`);
    assert(fs.statSync(localPath).size > 0, `empty imported photo ${photo.url}`);
  } else {
    assert(/^https:\/\//.test(photo.url), `invalid remote reference photo ${photo.url}`);
  }
});

const architectural = seed.records.filter(item => item.architecturalServices);
assert.equal(architectural.length, 5);
assert(architectural.every(item => item.customerType === '建筑膜客户'));
assert(architectural.every(item => item.interestedProducts.includes('建筑玻璃膜')));

const first = seed.records.find(item => item.publicRecordId === 'SM001');
assert(first);
assert.equal(first.businessName, "Sam's Steam Auto Detail");
assert.equal(first.phone, '(562) 296-7848');
assert.equal(first.website, 'https://www.samssteam.com/');
assert.equal(first.visitRegion, '西区／圣莫尼卡');
assert.equal(first.referencePhotos.length, 2);
assert.equal(first.googleVerificationStatus, 'confirmed');
assert(serverSource.includes("DATA_DIR === '/app/data'"), 'production data directory must activate the one-time import');
assert(dockerfile.includes('COPY migrations ./migrations'), 'Railway image must include the customer seed migration');

console.log('Santa Monica field-sales seed integrity test passed');
