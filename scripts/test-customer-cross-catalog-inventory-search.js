const assert = require('assert');
const fs = require('fs');
const path = require('path');
const catalog = require('../public/customer-catalog-utils.js');

const products = [
  { sku:'G20PLUS', model:'G20PLUS', name:'G20PLUS / MG20PLUS A-', specification:'1.52*15m', category:'TPU车衣', price:900, purchasable:true, stockByWarehouse:{ 'las-vegas':2, 'los-angeles':1 } },
  { sku:'GM18-MATTE', model:'GM18-MATTE', name:'G20-YD-H', specification:'1.52*15m', category:'TPU车衣', price:800, purchasable:true, stockByWarehouse:{ 'las-vegas':0, 'los-angeles':0 } },
  { sku:'G18', model:'G18', name:'G18 / MG18', specification:'1.52*15m', category:'Car wrap film', price:600, purchasable:true, stockByWarehouse:{ 'las-vegas':4, 'los-angeles':0 } },
  { sku:'GREENSeries-TPUQD42', model:'TPUQD42', name:'Alpine White Metallic', specification:'1.52*18m', category:'Color changing film', price:950, purchasable:true, stockByWarehouse:{ 'las-vegas':5, 'los-angeles':0 } },
  { sku:'QD112', model:'QD112', name:'Satin Black', specification:'1.52*18m', category:'Car wrap film', price:900, purchasable:true, stockByWarehouse:{ 'las-vegas':1, 'los-angeles':0 } },
  { sku:'NA70 | 40*100', model:'NA70', name:'Nano ceramic tint', specification:'40*100', category:'Window film', price:280, purchasable:true, stockByWarehouse:{ 'las-vegas':4, 'los-angeles':1 } },
  { sku:'TPUQD77', model:'TPUQD77', name:'Hidden wrap', specification:'1.52*18m', category:'Color changing film', price:null, purchasable:true, stockByWarehouse:{ 'las-vegas':3 } },
  { sku:'TPUQD88', model:'TPUQD88', name:'Blocked wrap', specification:'1.52*18m', category:'Color changing film', price:900, purchasable:false, stockByWarehouse:{ 'las-vegas':3 } }
];

assert.deepEqual(catalog.search(products, 'g20', 'ppf').map(item => item.sku), ['G20PLUS']);
assert.deepEqual(catalog.search(products, 'g18', 'ppf').map(item => item.sku), ['G18']);
assert.deepEqual(catalog.search(products, 'tpuqd42', 'color-wrap').map(item => item.sku), ['GREENSeries-TPUQD42']);
assert.deepEqual(catalog.search(products, 'qd112', 'color-wrap').map(item => item.sku), ['QD112']);
assert.equal(catalog.search(products, 'gm18', 'ppf').length, 0, 'zero-stock PPF must be hidden');
assert.equal(catalog.search(products, 'tpuqd77', 'color-wrap').length, 0, 'unpriced wrap must be hidden');
assert.equal(catalog.search(products, 'tpuqd88', 'color-wrap').length, 0, 'blocked wrap must be hidden');
assert.equal(catalog.search(products, 'na70', 'ppf').length, 0, 'window film must not leak into PPF search');
assert.equal(catalog.search(products, 'g18', 'color-wrap').length, 0, '15 m PPF stored under the legacy Car wrap category must not leak into color wrap');
assert.equal(catalog.availableQty(products[0]), 3);

const root = path.resolve(__dirname, '..');
const ordering = fs.readFileSync(path.join(root, 'public/customer-ordering.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/customer.html'), 'utf8');
const i18n = fs.readFileSync(path.join(root, 'public/customer-i18n.js'), 'utf8');
assert(ordering.includes('searchPpfInventory'));
assert(ordering.includes('searchColorWrapInventory'));
assert(ordering.includes("dataset.directSku=product.sku"));
assert(ordering.includes("findBySku(state?.products||[],order.dataset.productSku,'ppf')"));
assert(ordering.includes("findBySku(state?.products||[],quickOrder.dataset.productSku,'color-wrap')"));
assert(html.indexOf('customer-catalog-utils.js?v=1') < html.indexOf('customer-ordering.js?v=49'), 'catalog utility must load before ordering code');
assert(i18n.includes('SEARCH OTHER IN-STOCK PPF MODELS'));
assert(i18n.includes('SEARCH OTHER IN-STOCK COLOR-WRAP MODELS'));

console.log('Customer cross-catalog inventory search tests passed: PPF and color wrap classification, in-stock pricing gates, legacy category handling, direct SKU cart preservation, asset order, and multilingual labels.');
