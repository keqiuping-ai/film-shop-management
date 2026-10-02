const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-portal-message-status-'));
const port = 46800 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;
let child;
let output = '';

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Test server did not start.\n${output}`);
}

async function request(pathname, token = '', options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function run() {
  const customerSource = fs.readFileSync(path.join(root, 'public', 'customer.js'), 'utf8');
  const customerHtml = fs.readFileSync(path.join(root, 'public', 'customer.html'), 'utf8');
  const appSource = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  assert(customerHtml.includes('customerUnreadIndicator'), 'Customer portal needs a global unread indicator');
  assert(customerSource.includes('markVisibleStaffMessagesRead'), 'Customer portal must acknowledge visible staff messages');
  assert(customerSource.includes("tab==='orders'&&!document.getElementById('app')?.classList.contains('hidden')"), 'Landing and catalog pages must keep unread messages unread until My Orders is opened');
  assert(customerSource.includes('deleteCustomerMessage'), 'Customer portal must support deleting its own sent messages');
  assert(appSource.includes('deletePortalOrderMessage'), 'Admin portal must support deleting its own sent messages');

  child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1', ENABLE_CLOUD_DAILY_BACKUPS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });

  try {
    await waitForServer();
    const adminLogin = await request('/api/login', '', { method: 'POST', body: JSON.stringify({ email: 'admin@filmshop.local', password: 'admin123' }) });
    assert.equal(adminLogin.response.status, 200, JSON.stringify(adminLogin.body));
    const adminToken = adminLogin.body.token;
    const createdCustomer = await request('/api/portal-customers', adminToken, { method: 'POST', body: JSON.stringify({ businessName: 'Message Test Dealer', contactName: 'Casey', account: 'message-test', password: 'Message123', status: '正常', priceTier: 'standard' }) });
    assert.equal(createdCustomer.response.status, 201, JSON.stringify(createdCustomer.body));

    const customerLogin = await request('/api/customer/login', '', { method: 'POST', body: JSON.stringify({ login: 'message-test', password: 'Message123' }) });
    assert.equal(customerLogin.response.status, 200, JSON.stringify(customerLogin.body));
    const customerToken = customerLogin.body.token;
    const submitted = await request('/api/customer/orders', customerToken, { method: 'POST', body: JSON.stringify({ requestId: 'message-order-1', customerDemand: 'Please confirm availability.' }) });
    assert.equal(submitted.response.status, 201, JSON.stringify(submitted.body));
    const orderId = submitted.body.orders[0].id;
    const customerMessageId = submitted.body.orders[0].portalMessages[0].id;

    const adminRead = await request(`/api/portal-orders/${orderId}/read`, adminToken, { method: 'POST', body: '{}' });
    assert.equal(adminRead.response.status, 200, JSON.stringify(adminRead.body));
    let order = adminRead.body.salesOrders.find(item => item.id === orderId);
    assert.equal(order.portalMessages[0].readState, 'read', 'Opening the order must mark customer messages read');

    const staffSent = await request(`/api/portal-orders/${orderId}/messages`, adminToken, { method: 'POST', body: JSON.stringify({ text: 'Your order is ready.', clientMessageId: 'staff-message-1' }) });
    assert.equal(staffSent.response.status, 200, JSON.stringify(staffSent.body));
    order = staffSent.body.salesOrders.find(item => item.id === orderId);
    const staffMessageId = order.portalMessages.find(message => message.clientMessageId === 'staff-message-1').id;

    const unreadSnapshot = await request('/api/customer/bootstrap', customerToken);
    assert.equal(unreadSnapshot.body.unreadMessageCount, 1, 'Staff reply must create one customer unread notification');
    assert.equal(unreadSnapshot.body.orders[0].portalMessages.find(message => message.id === staffMessageId).readState, 'unread');

    const customerRead = await request(`/api/customer/orders/${orderId}/messages/read`, customerToken, { method: 'POST', body: '{}' });
    assert.equal(customerRead.response.status, 200, JSON.stringify(customerRead.body));
    assert.equal(customerRead.body.unreadMessageCount, 0, 'Viewing My Orders must clear the global unread count');
    assert.equal(customerRead.body.orders[0].portalMessages.find(message => message.id === staffMessageId).readState, 'read');
    const adminAfterCustomerRead = await request('/api/login', '', { method: 'POST', body: JSON.stringify({ email: 'admin@filmshop.local', password: 'admin123', includeBootstrap: true }) });
    assert.equal(adminAfterCustomerRead.response.status, 200, JSON.stringify(adminAfterCustomerRead.body));
    assert.equal(adminAfterCustomerRead.body.data.salesOrders.find(item => item.id === orderId).portalMessages.find(message => message.id === staffMessageId).readState, 'read', 'Customer read receipt must be visible to staff');

    const customerDeleteForbidden = await request(`/api/customer/orders/${orderId}/messages/${staffMessageId}`, customerToken, { method: 'DELETE' });
    assert.equal(customerDeleteForbidden.response.status, 403, 'Customers must not delete staff messages');
    const customerDelete = await request(`/api/customer/orders/${orderId}/messages/${customerMessageId}`, customerToken, { method: 'DELETE' });
    assert.equal(customerDelete.response.status, 200, JSON.stringify(customerDelete.body));
    assert(!customerDelete.body.orders[0].portalMessages.some(message => message.id === customerMessageId), 'Deleted customer message must disappear from customer snapshot');

    const adminDelete = await request(`/api/portal-orders/${orderId}/messages/${staffMessageId}`, adminToken, { method: 'DELETE' });
    assert.equal(adminDelete.response.status, 200, JSON.stringify(adminDelete.body));
    order = adminDelete.body.salesOrders.find(item => item.id === orderId);
    assert(!order.portalMessages.some(message => message.id === staffMessageId), 'Deleted staff message must disappear from admin snapshot');
    const finalCustomer = await request('/api/customer/bootstrap', customerToken);
    assert.equal(finalCustomer.body.orders[0].portalMessages.length, 0, 'Both sides must see the same hard-deleted message list');

    console.log('Portal message read, unread, ownership, and two-sided deletion tests passed.');
  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise(resolve => child.once('exit', resolve));
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
