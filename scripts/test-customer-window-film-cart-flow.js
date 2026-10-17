const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ordering = fs.readFileSync(path.join(root, 'public/customer-ordering.js'), 'utf8');
const customer = fs.readFileSync(path.join(root, 'public/customer.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/customer.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/customer.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

assert(ordering.includes('let windowFilmAddLocked=false'), 'window-film add flow needs an immediate click lock');
assert(ordering.includes('if(windowFilmAddLocked)return'), 'repeated clicks must be ignored while the cart is opening');
assert(ordering.includes('addButton.disabled=true'), 'the add button must visibly lock before cart work begins');
assert(ordering.includes("item.dataset.sku===sku&&item.dataset.size===size"), 'the same SKU and size must reuse one cart row');
assert(ordering.includes("list.scrollIntoView({behavior:'smooth',block:'start'})"), 'adding window film must open and scroll to the order list');
assert(ordering.includes("row.dataset.qty=String(qty)"), 'window-film cart rows must retain an explicit quantity');
assert(ordering.includes("reduce((sum,row)=>sum+Math.max(1,Number(row.dataset.qty||1)),0)"), 'cart count must total quantities instead of duplicate rows');
assert(css.includes('.window-film-quick-order>button:disabled'), 'locked add state needs visible feedback');
assert(css.includes('.window-film-selected-list #windowFilmSelectedRows>div.just-added'), 'the added cart line needs a visible highlight');

assert(customer.includes('function checkoutReturnNoticeHtml()'), 'Stripe return needs an in-page status card');
assert(customer.includes("openCustomerArea('orders')"), 'Stripe return must open My Orders instead of leaving the customer on the brand page');
assert(!customer.includes("alert('Payment confirmed. Your order has been updated.')"), 'Stripe success must not use a blocking browser alert');
assert(customer.includes("title:'PAYMENT CONFIRMED'"), 'confirmed payment copy must be explicit');
assert(customer.includes("title:'PAYMENT RECEIVED · CONFIRMING'"), 'delayed webhook confirmation must be explicit');

assert(html.includes('/customer.css?v=40'));
assert(html.includes('/customer.js?v=24'));
assert(html.includes('/customer-ordering.js?v=63'));
assert(html.includes('/customer-i18n.js?v=40'));
assert(sw.includes('film-shop-field-sales-bilingual-workspace-20261017'));

console.log('Customer window-film cart flow tests passed: click lock, row reuse, cart scroll, compact feedback, and Stripe return routing.');
