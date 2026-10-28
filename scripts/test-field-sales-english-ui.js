const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mobile = fs.readFileSync(path.join(root, 'public/mobile.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/mobile.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

for (const label of ['Los Angeles','Las Vegas','San Francisco','Seattle','Phoenix','Vancouver']) {
  assert(mobile.includes(`en:'${label}'`), `missing English city label: ${label}`);
}
for (const label of ['Westside / Santa Monica','Near Company / South Central','San Francisco / North Peninsula','Seattle / Central Corridor','Central Phoenix','Vancouver City']) {
  assert(mobile.includes(`'${label}'`), `missing English region label: ${label}`);
}
for (const label of ['Google Verified Additions / Route Pending','East Bay / Google Verified Additions','Henderson / Google Verified Additions']) {
  assert(mobile.includes(`'${label}'`), `missing Google-added English region label: ${label}`);
}
assert(mobile.includes("function salesRegionLabel(region)"), 'English region display helper is required');
assert(mobile.includes("salesRegionLabel(salesSelectedRegion)"), 'selected region must use localized display label');
assert(mobile.includes("salesCityLabel(city)"), 'city buttons must use localized display labels');
assert(mobile.includes("lang === 'en' ? 'customers' : '位客户'"), 'customer count unit must be localized');
assert(mobile.includes("SALES_PRODUCT_INTEREST_ENGLISH"), 'product interest labels must have English display values');
assert(mobile.includes("salesStatusLabel(value)"), 'customer stages must use English display labels');
assert(mobile.includes("SALES_CUSTOMER_TYPE_ENGLISH"), 'system customer types must have English display values');
assert(mobile.includes("salesCategoryLabel(category)"), 'customer category selector must have localized labels');
assert(mobile.includes("Public Prospect Import"), 'system importer name must have an English display value');
assert(mobile.includes("Reference Photo $1"), 'generated reference-photo names must be localized');
assert(mobile.includes("value=\"${value}\""), 'localized stage options must preserve API values');
assert(html.includes('/mobile.js?v=85'), 'mobile bundle cache key was not bumped');
assert(sw.includes('film-shop-field-sales-roster-filters-20261017'), 'service-worker cache key was not bumped');

console.log('field sales English UI regression passed');
