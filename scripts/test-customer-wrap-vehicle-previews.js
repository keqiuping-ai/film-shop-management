const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const catalog = require(path.join(root, 'public/assets/wrap-colors/catalog.json'));
const examples = require(path.join(root, 'public/retail/wrap-examples.json')).filter(item => item.group === 'stock');
const source = fs.readFileSync(path.join(root, 'public/customer-ordering.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/customer.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/customer.html'), 'utf8');

const sourceKey = value => String(value || '').split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
const codeKey = value => String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
const bySource = new Map(examples.map(item => [sourceKey(item.sourcePhoto), item]));
const byCode = new Map(examples.map(item => [codeKey(item.referenceCode), item]));

const resolved = catalog.map(color => {
  const preview = bySource.get(sourceKey(color.sourceFile || color.image)) || byCode.get(codeKey(color.code));
  const image = preview?.thumbnail || (sourceKey(color.sourceFile || color.image) === 'img_5693'
    ? '/retail/assets/wrap-swatches/matte-pending-thumb.png'
    : null);
  return { color, image };
});

assert.strictEqual(catalog.length, 105, 'The current customer color catalog should retain all 105 products');
assert.strictEqual(resolved.filter(item => item.image).length, catalog.length, 'Every color must resolve to a vehicle preview');
resolved.forEach(({ color, image }) => {
  assert(fs.existsSync(path.join(root, 'public', image)), `${color.code} vehicle preview is missing: ${image}`);
});
assert(source.includes("fetch('/retail/wrap-examples.json')"), 'Customer ordering must load the shared vehicle preview library');
assert(source.includes("'/retail/assets/wrap-swatches/matte-pending-thumb.png'"), 'The one unnamed matte sample needs its generated vehicle preview');
assert(css.includes('grid-template-columns:repeat(4,minmax(0,1fr))'), 'Desktop vehicle cards should use a readable four-column grid');
assert(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'), 'Mobile vehicle cards should use a readable two-column grid');
assert(css.includes('aspect-ratio:3/4'), 'Vehicle cards must preserve portrait preview framing');
assert(html.includes('/customer.css?v=34'));
assert(html.includes('/customer-ordering.js?v=54'));

console.log(`Customer wrap vehicle preview tests passed: ${catalog.length}/${catalog.length} colors resolve to existing vehicle images.`);
