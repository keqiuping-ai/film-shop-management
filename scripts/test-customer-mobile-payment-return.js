const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const customer = fs.readFileSync(path.join(root, 'public/customer.js'), 'utf8');
const ordering = fs.readFileSync(path.join(root, 'public/customer-ordering.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/customer.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/customer.css'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

assert(html.includes('id="checkoutReturn"'), 'payment return needs a dedicated screen instead of the brand homepage');
assert(html.includes('id="checkoutLoginMessage"'), 'a lost mobile login must explain how payment verification resumes');
assert(customer.includes("sync({preserveScreen:true})"), 'checkout reconciliation must not reset the visible route');
assert(customer.includes("if(!options.preserveScreen)showOnlyCustomerScreen('landing')"), 'only ordinary bootstrap may open the homepage');
assert(customer.includes('sessionStorage.setItem(checkoutReturnStorageKey'), 'session_id recovery must survive a mobile tab reload');
assert(customer.includes("if(!token){showLogin({checkoutReturn:true});return}"), 'a missing token must stop on login rather than the homepage');
assert(customer.includes('if(completed)clearPendingCheckoutReturn()'), 'checkout parameters must only clear after a stable account screen is restored');
assert(customer.includes('checkoutReturnHandling=true'), 'parallel connectivity retries must not start duplicate reconciliation loops');
assert(ordering.includes("window.addEventListener('pageshow',event=>"), 'Safari bfcache return must unlock the checkout UI');
assert(ordering.includes('if(!event.persisted)return'), 'normal page loads must not reset an active checkout submission');
assert.equal((ordering.match(/window\.location\.assign\(result\.checkoutUrl\)/g)||[]).length, 2, 'both dealer checkout redirects must use explicit navigation');
assert.equal((customer.match(/window\.location\.assign\(result\.checkoutUrl\)/g)||[]).length, 2, 'both legacy checkout redirects must use explicit navigation');
assert(css.includes('@keyframes checkout-return-spin'), 'mobile customers need visible progress during payment verification');
assert(serviceWorker.includes("film-shop-payment-return-20261117"), 'the mobile service worker cache must invalidate the old checkout scripts');

console.log('Customer mobile payment return tests passed: no homepage reset, resumable login, serialized reconciliation, Safari bfcache recovery, and cache invalidation.');
