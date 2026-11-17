const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const index = read('public/index.html');
const mobile = read('public/mobile.html');
const customer = read('public/customer.html');
const app = read('public/app.js');
const customerJs = read('public/customer.js');
const serviceWorker = read('public/sw.js');

for (const [name, html] of [['management', index], ['staff', mobile], ['customer', customer]]) {
  assert(html.includes('/connectivity.js?v=1'), `${name} entry must load the connectivity guard`);
}
assert(app.includes('服务器线路异常 · 点击顶部提示重试'), 'management sync must show an explicit route failure');
const syncSource = app.slice(app.indexOf('async function sync(options = {})'), app.indexOf('function renderAuth()'));
assert(!syncSource.includes("localStorage.removeItem('filmShopCloud.token')"), 'management sync must not erase a valid login on a network failure');
assert(customerJs.includes('timeoutMs=Number(options.timeoutMs??30000)'), 'customer requests must have a bounded timeout');
assert(serviceWorker.includes("'/offline.html'"), 'service worker must cache the offline route page');
assert(serviceWorker.includes("caches.match('/offline.html')"), 'navigation failures must render the offline route page');

console.log('Connectivity resilience source checks passed.');
