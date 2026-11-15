const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const seed = JSON.parse(fs.readFileSync(path.join(root, 'migrations', 'los-angeles-chinese-service-film-shops-2026-11-14.json'), 'utf8'));
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const mobile = fs.readFileSync(path.join(root, 'public', 'mobile.js'), 'utf8');

assert.equal(seed.marketId, 'los-angeles');
assert.equal(seed.category, 'chinese-service');
assert.equal(seed.records.length, seed.recordCount);
assert.equal(seed.recordCount, 14);
assert.equal(new Set(seed.records.map(row => row.publicRecordId)).size, seed.recordCount);
assert(seed.categoryDefinition.includes('不得据姓名、照片或外貌推断经营者族裔'));
assert(seed.records.every(row => row.businessName && row.address && row.phone && row.googleMapsUrl && row.directorySource));
assert(seed.records.every(row => row.googleVerificationStatus === 'confirmed' && row.active === true));
assert(seed.records.every(row => row.googleHasBusinessHours && row.googleHasBusinessPhotos && row.googleAddressMatches));
assert(seed.records.every(row => row.googleBusinessAddress && row.googleReviewCount > 0 && row.googleRating > 0));
assert(seed.records.every(row => row.visitRegion && row.visitBatch && row.visitStop > 0 && row.navigationUrl));
assert(seed.records.some(row => row.businessName.includes('VEERTECH')));
assert(seed.records.some(row => row.businessName.includes('T9 Color Wrapping')));
assert(seed.records.some(row => row.businessName.includes('DMC-AUTOCARE')));
assert(seed.records.some(row => row.businessName.includes('Elite Wraps')));
assert(seed.records.some(row => row.businessName.includes('Cali Auto Tint Wraps')));
assert(seed.records.some(row => row.businessName.includes('CYBER TINT')));
assert(seed.records.some(row => row.businessName.includes('Toyz Detail Studio')));

assert(server.includes('applyLosAngelesChineseServiceShopImport();'));
assert(server.includes("account.customerSegment = 'chinese-service'"));
assert(server.includes('losAngelesChineseServiceShops'));
assert(server.includes('Previous Google result belonged to a different business'));
assert(mobile.includes("return 'chinese-service'"));
assert(mobile.includes("'Chinese-Speaking Film Shops' : '中文服务贴膜店'"));
assert(mobile.includes("['automotive','architectural','chinese-service']"));
assert(mobile.includes("['automotive', 'architectural', 'chinese-service'].includes(category)"));

console.log('Los Angeles Chinese-service film-shop seed and UI regression passed');
