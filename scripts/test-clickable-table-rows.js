const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

const enhancer = app.slice(
  app.indexOf('function editableTableRowButton'),
  app.indexOf('function openPanelZoom')
);
assert(enhancer.includes("['编辑', 'edit', '管理', 'manage', '查看', 'view']"), 'Row enhancer must support text edit/manage/view actions');
assert(enhancer.includes('open[A-Z][A-Za-z0-9_]*'), 'Row enhancer must only proxy safe open actions');
assert(enhancer.includes('[contenteditable="true"]'), 'Interactive controls must not be hijacked by row clicks');
assert(enhancer.includes("row.tabIndex = 0"), 'Editable rows must remain keyboard accessible');
assert(enhancer.includes('new MutationObserver'), 'Rows inserted by searches and live refreshes must also become clickable');

const salesOrderTable = app.slice(
  app.indexOf('function salesOrderTable()'),
  app.indexOf('function updateSalesOrderSearch')
);
assert(salesOrderTable.includes('class="sales-order-table"'), 'Sales order table must use its compact layout');
assert(!salesOrderTable.includes("t('orderTrackingNo')"), 'Tracking number column must be removed from the order list');
assert(!salesOrderTable.includes('o.trackingNo'), 'Tracking values must not consume a list column');
assert(salesOrderTable.includes('colspan="14"'), 'Empty order list row must match the compact column count');

const salesOrderEditor = app.slice(
  app.indexOf('function openSalesOrder(id)'),
  app.indexOf('const portalOrderPendingReplies')
);
assert(salesOrderEditor.includes("['trackingNo'"), 'Tracking number must remain available inside the order editor');
assert(app.includes('enhanceEditableTableRows(container);'), 'Dynamically filtered order rows must retain whole-row click behavior');
assert(styles.includes('.sales-order-table-wrap { overflow-x: hidden; }'), 'Order list must not require horizontal scrolling');
assert(styles.includes('.sales-order-table {') && styles.includes('table-layout: fixed;'), 'Order columns must be compressed into the visible width');
assert(html.includes('/app.js?v=148') && html.includes('/styles.css?v=99'), 'Desktop assets must be cache-busted');

console.log('Clickable table rows and compact sales order list regression checks passed.');
