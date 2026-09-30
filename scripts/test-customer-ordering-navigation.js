const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const customer = fs.readFileSync(path.join(root, 'public/customer.js'), 'utf8');
const ordering = fs.readFileSync(path.join(root, 'public/customer-ordering.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/customer.html'), 'utf8');
const i18n = fs.readFileSync(path.join(root, 'public/customer-i18n.js'), 'utf8');

assert(customer.includes("const customerScreenIds=['landing','login','app','orderCenter','ppfCatalog','colorWrapCatalog','windowFilmCatalog','dealerCheckout']"));
assert(customer.includes("function showOnlyCustomerScreen(screenId)"));
assert(customer.includes("function showLogin(){if(token&&state)return openCustomerArea('orders');showOnlyCustomerScreen('login')"));
assert(customer.includes("function showHome(){showOnlyCustomerScreen('landing')}"));
assert(customer.includes("function openCustomerArea(next='orders'){if(!state)return showLogin();tab=next==='account'?'account':'orders';showOnlyCustomerScreen('app')"));
assert(customer.includes("customerMessageSnapshot=customerMessagesSignature();showOnlyCustomerScreen('landing')"), 'bootstrap refresh must also clear stale catalog screens');

for (const screen of ['orderCenter', 'ppfCatalog', 'colorWrapCatalog', 'windowFilmCatalog', 'dealerCheckout']) {
  assert(ordering.includes(`showOnlyCustomerScreen('${screen}')`), `${screen} must use exclusive screen navigation`);
}
assert(!ordering.includes("['landing','login','app','orderCenter','ppfCatalog','colorWrapCatalog','windowFilmCatalog'].forEach"));
assert(ordering.includes('article.addEventListener(\'click\''), 'the complete product-category card must be clickable');
assert(ordering.includes('onchange="syncPpfVariantRow(this)"'), 'PPF model selection must update its single valid size');
assert(ordering.includes('choices.length===1'), 'PPF size auto-selection must be limited to one valid choice');

assert(html.includes('/customer.js?v=20'));
assert(html.includes('/customer-ordering.js?v=51'));
assert(html.includes('LIVE DEALER ORDERING'));
assert(!html.includes('Product pricing, payment, and live inventory are not connected yet.'));
assert(i18n.includes('Sign in to use live inventory, dealer pricing, unified checkout, and Stripe secure payment.'));

console.log('Customer ordering navigation tests passed: exclusive screen state, full-card category entry, PPF single-size selection, live status copy, and cache versions.');
