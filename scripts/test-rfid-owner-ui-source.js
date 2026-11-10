const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

assert(source.includes('onclick="openRfidManagement()"'), 'Inventory page must expose the owner RFID management entry');
assert(source.includes("'/api/inventory/rfid-catalog/preview'"), 'RFID mapping must be previewed before apply');
assert(source.includes("'/api/inventory/rfid-catalog/apply'"), 'RFID mapping apply endpoint is missing');
assert(source.includes("'/api/inventory/rfid-devices'"), 'RFID device enrollment endpoint is missing');
assert(source.includes("branchId:'los-angeles'"), 'Scanner enrollment must be bound to Los Angeles');
assert(source.includes('库存数量不会变化'), 'Owner UI must make the no-inventory-mutation guarantee explicit');
assert(source.includes('一次性设备密钥（只显示这一次）'), 'One-time key warning is missing');
assert(source.includes('rotate = Boolean(existing)'), 'Existing device keys must never rotate silently');

console.log('RFID owner UI source contract passed: preview-first mapping, LA-scoped device enrollment, and no inventory mutation.');
