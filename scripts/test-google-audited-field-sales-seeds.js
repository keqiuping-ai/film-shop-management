const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = [
  'migrations/santa-monica-field-sales-2026-10-13.json',
  'migrations/las-vegas-field-sales-2026-10-13.json',
  'migrations/san-francisco-field-sales-2026-10-14.json',
  'migrations/seattle-field-sales-2026-10-14.json',
  'migrations/phoenix-field-sales-2026-10-14.json',
  'migrations/vancouver-field-sales-2026-10-14.json'
];

const totals = { records:0, confirmed:0, rejected:0, needs_review:0, additions:0 };
for (const file of files) {
  const seed = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  assert.strictEqual(seed.recordCount, seed.records.length, `${file}: recordCount mismatch`);
  const counts = seed.records.reduce((result, item) => {
    const status = String(item.googleVerificationStatus || 'needs_review');
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {});
  assert.deepStrictEqual(seed.googleAuditCounts, counts, `${file}: audit counts mismatch`);
  const businessKeys = seed.records.map(item => `${String(item.businessName || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${String(item.address || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`);
  assert.strictEqual(new Set(businessKeys).size, businessKeys.length, `${file}: duplicate business name and address`);
  assert(seed.records.every(item => item.googleVerificationStatus === 'confirmed' ? item.active === true : item.active === false), `${file}: active flag must follow Google verification`);
  assert(seed.records.every(item => item.googleVerificationStatus !== 'confirmed' || (item.googleHasBusinessHours && item.googleHasBusinessPhotos && item.googleAddressMatches)), `${file}: confirmed records need hours, photos, and matching address`);
  assert(seed.records.every(item => !(Number(item.lat) === 0 && Number(item.lng) === 0 && item.lat !== null && item.lng !== null)), `${file}: missing coordinates must not be stored as 0,0`);
  totals.records += seed.records.length;
  totals.confirmed += counts.confirmed || 0;
  totals.rejected += counts.rejected || 0;
  totals.needs_review += counts.needs_review || 0;
  totals.additions += seed.records.filter(item => /G\d+$/.test(String(item.publicRecordId || ''))).length;
}

assert.deepStrictEqual(totals, { records:1669, confirmed:1290, rejected:123, needs_review:256, additions:52 });
console.log('Google-audited multi-market field-sales seed test passed', totals);
