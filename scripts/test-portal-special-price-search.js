const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

const searchBlock = app.slice(
  app.indexOf('function portalPriceProductSearchText'),
  app.indexOf('function updatePortalCustomerTierPreview')
);
assert(searchBlock.includes('product.sku'), 'Special price search must include SKU');
assert(searchBlock.includes('product.model'), 'Special price search must include product model');
assert(searchBlock.includes('product.name'), 'Special price search must include product name');
assert(searchBlock.includes('product.specification'), 'Special price search must include product specification');
assert(searchBlock.includes('data-portal-price-search'), 'Each special-price row must carry searchable text');
assert(searchBlock.includes('row.hidden = !matches'), 'Filtering must hide rows without deleting their price inputs');
assert(searchBlock.includes('portalSpecialPriceSearchCount'), 'Search result count must update immediately');
assert(searchBlock.includes('portalSpecialPriceSearchEmpty'), 'No-results feedback must be available');

const editorBlock = app.slice(
  app.indexOf('function openPortalCustomer'),
  app.indexOf('function generatePortalTemporaryPassword')
);
assert(editorBlock.includes('id="portalSpecialPriceSearch"'), 'Customer editor must show the special-price search box');
assert(editorBlock.includes('搜索 SKU、型号、名称或规格'), 'Chinese search prompt must explain supported fields');
assert(editorBlock.includes("document.querySelectorAll('.portal-price-input')"), 'Saving must still collect visible and filtered-out price inputs');
assert(styles.includes('.portal-special-price-search'), 'Special price search controls must be styled');
assert(styles.includes('.portal-special-price-table tr[hidden]{display:none}'), 'Filtered rows must be visually hidden');
assert(html.includes('/app.js?v=147') && html.includes('/styles.css?v=99'), 'Desktop assets must be cache-busted');

console.log('Portal customer special-price SKU/model/name search checks passed.');
