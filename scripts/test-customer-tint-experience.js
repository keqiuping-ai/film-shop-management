const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ordering = fs.readFileSync(path.join(root, 'public/customer-ordering.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/customer.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/customer.html'), 'utf8');
const i18n = fs.readFileSync(path.join(root, 'public/customer-i18n.js'), 'utf8');

for (const asset of [
  'public/retail/assets/tint-videos/basic.mp4',
  'public/retail/assets/tint-videos/nano.mp4',
  'public/retail/assets/tint-videos/premium.mp4',
  'public/retail/assets/tint/roadside-daylight.jpg'
]) assert(fs.existsSync(path.join(root, asset)), `Missing interactive tint asset: ${asset}`);

for (const model of ['P20', 'P10', 'NA70', 'NA28', 'NA15', 'NA10', 'SP70', 'SP50', 'SP20', 'SP10']) {
  assert(ordering.includes(`'${model}'`), `Interactive tint selector must include ${model}`);
}

assert(ordering.includes("video:'/retail/assets/tint-videos/nano.mp4'"), 'Nano heat animation must be wired into customer ordering');
assert(ordering.includes('/retail/assets/tint/roadside-daylight.jpg?v=2'), 'VLT selector must use the shared road preview');
assert(ordering.includes('style.opacity=String(1-Number(model[1].replace'), 'Selected VLT must change the preview shade');
assert(ordering.includes('window.selectWindowFilmModel(button,choice.catalog.name,model,false)'), 'Interactive model selection must synchronize with the order form');
assert(ordering.includes('data-window-film-model='), 'Catalog model buttons need stable model selectors');
assert(css.includes('.customer-tint-experience'), 'Customer tint experience styling is required');
assert(css.includes('.customer-tint-shade'), 'VLT preview shade styling is required');
assert(i18n.includes("Where Does the Sun's Heat Go?"), 'Interactive tint copy must be translated');
assert(html.includes('/customer.css?v=37'));
assert(html.includes('/customer-ordering.js?v=58'));
assert(html.includes('/customer-i18n.js?v=39'));

console.log('Customer tint experience tests passed: heat videos, VLT preview, model-to-order synchronization, localization, and cache versions.');
