const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/customer-ordering.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/customer.css'), 'utf8');
const i18n = fs.readFileSync(path.join(root, 'public/customer-i18n.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/customer.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

[
  'wrap-material-guide',
  '选颜色前，先看懂材质差别',
  '下方选色和库存下单方式保持不变',
  'PVC / Vinyl 改色膜',
  'TPU 彩色保护膜',
  'vinyl-swirl-detail.jpeg',
  'tpu-reflection-clean.png',
  'vinyl-aged-two-years.jpeg',
  '了解使用年限与未来更换成本',
  'searchColorWrapInventory',
  'filterWrapSwatches',
  'addManualWrapColor'
].forEach(token => assert(source.includes(token), `Missing display-only material guide or preserved ordering behavior: ${token}`));

[
  'data-wrap-material',
  'selectWrapMaterial',
  'selectedWrapMaterial',
  'manualWrapMaterial',
  'filterProduct:product=>',
  'wrapProductMaterial',
  'row.dataset.material'
].forEach(token => assert(!source.includes(token), `Material guide must not control product selection: ${token}`));

assert(css.includes('.wrap-material-compare'), 'Material comparison layout is missing');
assert(css.includes('.wrap-material-lifecycle'), 'Lifecycle and removal-cost module is missing');
assert(css.includes('@media(max-width:760px)'), 'Material experience needs a mobile layout');
assert(!css.includes('.wrap-material-tabs'), 'Material selection tabs must not be rendered or styled');
assert(!css.includes('.wrap-material-card.selected'), 'Informational cards must not have a selected state');
assert(i18n.includes('Understand the materials before choosing a color'), 'Display-only guide English localization is missing');
assert(i18n.includes('Color selection and inventory ordering below work exactly as before.'), 'Preserved workflow explanation localization is missing');
assert(!i18n.includes('Your material choice filters the products'), 'Material filter wording must be removed');
assert(html.includes('/customer.css?v=39'));
assert(html.includes('/customer-ordering.js?v=62'));
assert(html.includes('/customer-i18n.js?v=40'));
assert(sw.includes('film-shop-v175-live-camera-customer-edit'));

['vinyl-swirl-detail.jpeg', 'tpu-reflection-clean.png', 'vinyl-aged-two-years.jpeg'].forEach(file => {
  assert(fs.existsSync(path.join(root, 'public/retail/assets/wrap-comparison', file)), `Missing comparison asset: ${file}`);
});

console.log('Customer wrap display-only material guide tests passed.');
