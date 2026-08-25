#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const dbFile = path.resolve(process.argv[2] || process.env.DB_FILE || path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'db.json'));
const report = { database: dbFile, checkedAt: new Date().toISOString(), critical: [], warnings: [], counts: {} };
const critical = (code, detail) => report.critical.push({ code, detail });
const warning = (code, detail) => report.warnings.push({ code, detail });

let db;
try {
  db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
} catch (error) {
  critical('DATABASE_UNREADABLE', error.message);
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

const collections = [
  'users', 'products', 'movements', 'workshopMovements', 'jobs', 'salesOrders', 'shipments',
  'shipmentReceipts', 'shipmentExceptions', 'branchTransfers', 'branchTransferExceptions',
  'schedules', 'expenses', 'reimbursements', 'clockRecords', 'leaveRequests', 'customerConversations', 'prospects'
];
const rows = name => Array.isArray(db[name]) ? db[name] : [];
const money = value => Number(value || 0);
const normalizedSku = value => String(value || '').trim().toLowerCase();
const active = item => item && !item.deletedAt;

for (const collection of collections) {
  const list = rows(collection);
  report.counts[collection] = list.length;
  const ids = new Set();
  for (const item of list) {
    if (!item?.id) { warning('MISSING_ID', `${collection} 中有记录缺少 id`); continue; }
    if (ids.has(String(item.id))) critical('DUPLICATE_ID', `${collection} 存在重复 id ${item.id}`);
    ids.add(String(item.id));
  }
}

const products = rows('products').filter(active);
const productBySku = new Map();
for (const product of products) {
  const key = normalizedSku(product.sku);
  if (!key) critical('EMPTY_SKU', `商品 ${product.id || '(无 id)'} 缺少 SKU`);
  else if (productBySku.has(key)) critical('DUPLICATE_SKU', `SKU ${product.sku} 与 ${productBySku.get(key).sku} 重复`);
  else productBySku.set(key, product);
  if (!Number.isFinite(Number(product.qty)) || Number(product.qty) < 0) critical('INVALID_PRODUCT_QTY', `${product.sku || product.id} 库存 ${product.qty}`);
}

const customSku = sku => /^custom[-_]/i.test(String(sku || ''));
const requireSku = (collection, item, sku) => {
  if (!normalizedSku(sku)) return critical('MISSING_SKU_REFERENCE', `${collection}/${item.id || '?'} 缺少 SKU`);
  if (!productBySku.has(normalizedSku(sku)) && !customSku(sku)) critical('ORPHAN_SKU_REFERENCE', `${collection}/${item.id || '?'} 引用不存在的 SKU ${sku}`);
};

for (const movement of rows('movements').filter(active)) {
  requireSku('movements', movement, movement.sku);
  if (!Number.isFinite(Number(movement.qty)) || Number(movement.qty) <= 0) critical('INVALID_MOVEMENT_QTY', `movements/${movement.id} 数量 ${movement.qty}`);
}

const jobById = new Map(rows('jobs').filter(active).map(item => [String(item.id), item]));
const workshopBalance = new Map();
for (const movement of rows('workshopMovements').filter(active)) {
  requireSku('workshopMovements', movement, movement.sku);
  const qty = Number(movement.qty);
  if (!Number.isFinite(qty) || qty <= 0) critical('INVALID_WORKSHOP_QTY', `workshopMovements/${movement.id} 数量 ${movement.qty}`);
  const branch = String(movement.branchId || 'legacy');
  const key = `${branch}:${normalizedSku(movement.sku)}`;
  const delta = movement.type === 'transfer' ? qty : movement.type === 'consume' ? -qty : 0;
  if (!delta) critical('INVALID_WORKSHOP_TYPE', `workshopMovements/${movement.id} 类型 ${movement.type}`);
  workshopBalance.set(key, (workshopBalance.get(key) || 0) + delta);
  if (movement.type === 'consume') {
    const job = jobById.get(String(movement.jobId || ''));
    if (!job) critical('ORPHAN_WORKSHOP_JOB', `workshopMovements/${movement.id} 找不到施工单 ${movement.jobId || '(空)'}`);
    else if (job.branchId && movement.branchId && job.branchId !== movement.branchId) critical('CROSS_BRANCH_WORKSHOP_USE', `workshopMovements/${movement.id} 分店 ${movement.branchId} 与施工单 ${job.branchId} 不一致`);
  }
}
for (const [key, qty] of workshopBalance) if (qty < -0.0001) critical('NEGATIVE_WORKSHOP_STOCK', `${key} 贴膜间库存 ${qty}`);

for (const job of rows('jobs').filter(active)) {
  const total = money(job.price);
  const paid = Math.max(money(job.deposit), money(job.paidAmount));
  if (total < 0 || paid < 0) critical('INVALID_JOB_PAYMENT', `jobs/${job.id} 报价 ${total}，已付 ${paid}`);
  if (paid > total + 0.01) critical('JOB_OVERPAYMENT', `jobs/${job.id} 报价 ${total}，已付 ${paid}`);
  const expected = total > 0 && paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  if (job.paymentStatus && job.paymentStatus !== expected) warning('STALE_JOB_PAYMENT_STATUS', `jobs/${job.id} 保存为 ${job.paymentStatus}，应为 ${expected}`);
}

for (const order of rows('salesOrders').filter(active)) {
  const lines = Array.isArray(order.items) ? order.items : [];
  for (const line of lines) requireSku('salesOrders', order, line.item || line.sku);
  const computed = lines.reduce((sum, line) => sum + money(line.qty) * money(line.unitPrice ?? line.price), 0);
  const total = Number.isFinite(Number(order.total)) ? Number(order.total) : computed;
  const paid = money(order.paid);
  if (total < 0 || paid < 0 || paid > total + 0.01) critical('INVALID_ORDER_PAYMENT', `salesOrders/${order.id} 合计 ${total}，已付 ${paid}`);
  if (['已发货', '已出库'].includes(order.status)) {
    const hasOut = rows('movements').some(movement => movement.salesOrderId === order.id && movement.type === 'out' && !movement.reversedAt);
    if (!hasOut && lines.some(line => !customSku(line.item || line.sku))) warning('SHIPPED_ORDER_WITHOUT_MOVEMENT', `salesOrders/${order.id} 已发货但没有出库流水`);
  }
}

for (const receipt of rows('shipmentReceipts')) requireSku('shipmentReceipts', receipt, receipt.sku);
for (const transfer of rows('branchTransfers')) {
  requireSku('branchTransfers', transfer, transfer.sku);
  if (transfer.fromBranchId && transfer.toBranchId && transfer.fromBranchId === transfer.toBranchId) critical('SAME_BRANCH_TRANSFER', `branchTransfers/${transfer.id} 调出和调入分店相同`);
}

const knownBranches = new Set((db.settings?.customerBranches || []).map(item => String(item.id || '')).filter(Boolean));
for (const collection of ['jobs', 'salesOrders', 'schedules', 'expenses', 'reimbursements', 'movements', 'workshopMovements']) {
  for (const item of rows(collection).filter(active)) {
    if (!item.branchId) warning('UNCONFIRMED_BRANCH', `${collection}/${item.id} 尚未确认所属分店`);
    else if (knownBranches.size && !knownBranches.has(String(item.branchId))) warning('UNKNOWN_BRANCH', `${collection}/${item.id} 使用未知分店 ${item.branchId}`);
  }
}

report.ok = report.critical.length === 0;
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
