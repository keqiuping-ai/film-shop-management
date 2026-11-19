const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

const customerBlock = app.slice(app.indexOf('function portalCustomerTable'), app.indexOf('function portalCustomerOrders'));
assert(customerBlock.includes('id="portalCustomerSearch"'), 'Customer profiles need a main search field');
for (const field of ['businessName', 'contactName', 'phone', 'email', 'account', 'address', 'salesRep']) {
  assert(customerBlock.includes(`customer.${field}`), `Customer search must include ${field}`);
}
assert(customerBlock.includes('data-portal-customer-search'), 'Customer rows must keep searchable text');
assert(customerBlock.includes('row.hidden = !matches'), 'Customer filtering must hide rows without deleting them');

const matrixBlock = app.slice(app.indexOf('function portalPriceTierView'), app.indexOf('async function savePortalPriceMatrix'));
assert(matrixBlock.includes('id="portalPriceMatrixSearch"'), 'Price matrix needs a product search field');
assert(matrixBlock.includes('portalPriceProductSearchText(product)'), 'Price matrix search must reuse SKU/model/name/specification matching');
assert(matrixBlock.includes('data-portal-matrix-search'), 'Price rows must keep searchable text');
assert(matrixBlock.includes('row.hidden = !matches'), 'Price filtering must hide rows without deleting price inputs');
assert(matrixBlock.includes('portalPriceMatrixSearchCount'), 'Price result count must update immediately');
assert(app.includes("document.querySelectorAll('.portal-table-price')"), 'Save must still collect hidden price inputs');
assert(styles.includes('.portal-main-search'), 'Both main searches must be styled');
assert(styles.includes('.portal-price-matrix tr[hidden]{display:none}'), 'Hidden price rows must not occupy table space');
assert(html.includes('/app.js?v=176') && html.includes('/styles.css?v=118'), 'Updated desktop assets must be cache-busted');

console.log('Portal customer and price matrix search checks passed.');
