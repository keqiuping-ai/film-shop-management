const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ordering = fs.readFileSync(path.join(root, 'public/customer-ordering.js'), 'utf8');
const productPage = fs.readFileSync(path.join(root, 'public/products/architectural-window-film/index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/customer.css'), 'utf8');
const models = ['SP70', 'SP50', 'SP20', 'SP10', 'CU30', 'CU20', 'CU10', 'CU05'];

models.forEach(model => {
  assert(ordering.includes(model), `${model} missing from customer ordering catalog`);
  assert(productPage.includes(model), `${model} missing from public architectural product catalog`);
});
assert(ordering.includes("requireDealerForCatalogOrder('architectural-film')"));
assert(ordering.includes("type:'architectural-film'"), 'architectural lines must enter unified checkout');
assert(ordering.includes('Only ${available} roll(s) are currently available'), 'live stock gate must remain active');
assert(ordering.includes("entry?.price?`$${entry.price.toFixed(2)} / roll`"), 'CU public price must be visible before sign-in');
assert(productPage.match(/\$400 \/ ROLL/g)?.length === 4, 'all four CU models must show $400 per roll');
assert(productPage.includes('1.52 M × 30 M PROFESSIONAL ROLLS'));
assert(css.includes('.architectural-film-catalog'));
assert(server.includes("const version = 'architectural-film-catalog-2026-11-18-v1'"));
assert(server.includes("standardTier.prices[sku] = 400"), 'CU standard customer price must be $400');
assert(server.includes("['SP70', 'SP50', 'SP20', 'SP10']"), 'SP models must be updated without replacing existing price data');
assert(server.includes("['CU30', 'CU20', 'CU10', 'CU05']"), 'all CU models must be migrated');
assert(server.includes('qty: 0'), 'migration must not invent warehouse stock');

console.log('Architectural film catalog tests passed: eight models, 1.52 × 30m sizing, CU $400 pricing, SP price preservation, live-stock gate, unified checkout, and public catalog entry.');
