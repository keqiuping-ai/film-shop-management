const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mobileJs = fs.readFileSync(path.join(root, 'public/mobile.js'), 'utf8');
const mobileCss = fs.readFileSync(path.join(root, 'public/mobile.css'), 'utf8');
const mobileHtml = fs.readFileSync(path.join(root, 'public/mobile.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

for (const marker of [
  '客户／门店名称', '联系人姓名', '联系电话', '电子邮箱', '详细地址', '城市／地区',
  '客户类型', '客户来源', '负责业务员', '建档人员', '建档时间', '最近拜访',
  '下次回访', '客户备注', '完整沟通记录', '客户需求', '客户关注和异议',
  '本次拜访全部照片', '本次拜访附件与沟通记录', '本次现场订单', '全部后续跟进任务'
]) assert.ok(mobileJs.includes(marker), `missing detailed review field: ${marker}`);

assert.match(mobileJs, /\.filter\(item => item\.accountId === accountId\)\s*\.sort/,
  'visit review must include every visit status for the customer');
assert.ok(!mobileJs.includes("item.accountId === accountId && item.status === '已完成'"),
  'visit review must not hide in-progress or canceled records');
assert.match(mobileJs, /sales\.attachments \|\| \[\]/, 'customer and visit attachments must be included');
assert.match(mobileJs, /checkIn\.photoUrl,[\s\S]*visit\.ownerPhotoUrl,[\s\S]*visit\.evidencePhotoUrls/,
  'all visit photo sources must be combined');
assert.match(mobileCss, /\.mobile-dialog\.sales-review-dialog[^}]*1180px[^}]*94dvh/,
  'desktop review must use a large dialog');
assert.match(mobileCss, /@media \(max-width:620px\)[\s\S]*\.mobile-dialog\.sales-review-dialog[^}]*100vw[^}]*100dvh/,
  'phone review must use the full screen');
assert.ok(mobileHtml.includes('/mobile.css?v=61'));
assert.ok(mobileHtml.includes('/mobile.js?v=67'));
assert.ok(serviceWorker.includes('film-shop-v124-customer-selection'));

console.log('Field sales customer review detail tests passed.');
