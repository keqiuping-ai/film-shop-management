const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mobile = fs.readFileSync(path.join(root, 'public/mobile.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/mobile.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/mobile.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

assert(mobile.includes('选择拜访区域'), 'home must start with region selection');
assert(mobile.includes('visibleAccounts.map(salesSimpleCustomerCard)'), 'home must list only customers in the selected region');
assert(mobile.includes('拍照拜访'), 'customer card must open direct photo check-in');
assert(!mobile.match(/function salesHomeHtml\(\)[\s\S]*?标准业务流程[\s\S]*?function salesAccountRegion/), 'home must not render the old six-step workflow');
assert(mobile.includes('当时谈了什么 *'), 'simple visit must capture the conversation');
assert(mobile.includes('下一步要做什么'), 'simple visit must capture the next action');
assert(mobile.includes('salesSimpleProduct'), 'simple visit must capture product details');
assert(mobile.includes('salesSimplePrice'), 'simple visit must capture price');
assert(mobile.includes('salesSimpleContact'), 'simple visit must capture the contact');
assert(mobile.includes('拜访资料已保存并同步到主系统'), 'save must give explicit success feedback');
assert(server.includes('simplifiedDirectCheckIn:true'), 'server must permit direct check-in without a separate trip step');
assert(server.includes('soldItems: (Array.isArray(body.soldItems)'), 'server must persist product and price records');
assert(server.includes('contactMet: String(body.contactMet ?? visit.contactMet'), 'server must persist the visit contact');
assert(css.includes('.sales-region-grid'), 'region selector must have mobile styling');
assert(html.includes('/mobile.js?v=70') && html.includes('/mobile.css?v=62'), 'mobile asset cache keys must be updated');

console.log('simple field visits regression test passed');
