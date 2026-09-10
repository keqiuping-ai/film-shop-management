const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-custom-film-'));
const appPort = 45000 + Math.floor(Math.random() * 500);
const stripePort = 45500 + Math.floor(Math.random() * 500);
let appOutput = '';
const stripeRequests = [];
const webhookSecret = 'whsec_custom_printed_film_test';

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

async function waitForApp() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${appPort}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Test app did not start.\n${appOutput}`);
}

async function request(pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${appPort}${pathname}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function run() {
  const stripe = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const fields = Object.fromEntries(new URLSearchParams(raw));
      stripeRequests.push({ url:req.url, fields });
      const sequence = stripeRequests.length;
      res.writeHead(200, { 'Content-Type':'application/json' });
      res.end(JSON.stringify({ id:`cs_test_custom_${sequence}`, url:`https://checkout.stripe.test/custom-${sequence}`, livemode:false }));
    });
  });
  await listen(stripe, stripePort);

  const app = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV:'test', DATA_DIR:dataDir, PORT:String(appPort), HOST:'127.0.0.1',
      ENABLE_CLOUD_DAILY_BACKUPS:'false', STRIPE_SECRET_KEY:'sk_test_custom_printed_film',
      STRIPE_CUSTOMER_ORDER_LIVE_ENABLED:'false', STRIPE_API_BASE_URL:`http://127.0.0.1:${stripePort}`,
      STRIPE_CUSTOMER_ORDER_WEBHOOK_SECRET:webhookSecret
    },
    stdio:['ignore','pipe','pipe']
  });
  app.stdout.on('data', chunk => { appOutput += chunk; });
  app.stderr.on('data', chunk => { appOutput += chunk; });

  try {
    await waitForApp();
    const unauthenticated = await request('/api/customer/custom-printed-film/checkout-session', {
      method:'POST', headers:{ 'Content-Type':'application/json' }, body:'{}'
    });
    assert.equal(unauthenticated.response.status, 401, 'Custom checkout must require customer authentication');

    const adminLogin = await request('/api/login', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ email:'admin@filmshop.local', password:'admin123' })
    });
    assert.equal(adminLogin.response.status, 200, JSON.stringify(adminLogin.body));
    const adminHeaders = { 'Content-Type':'application/json', Authorization:`Bearer ${adminLogin.body.token}` };
    const customerCreated = await request('/api/portal-customers', {
      method:'POST', headers:adminHeaders,
      body:JSON.stringify({ businessName:'Custom Film Test', contactName:'Maria Test', email:'maria@example.test', account:'custom-film-test', password:'TestPass123', priceTier:'standard', prices:{}, status:'正常' })
    });
    assert.equal(customerCreated.response.status, 201, JSON.stringify(customerCreated.body));

    const customerLogin = await request('/api/customer/login', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ login:'custom-film-test', password:'TestPass123' })
    });
    assert.equal(customerLogin.response.status, 200, JSON.stringify(customerLogin.body));
    const customerHeaders = { 'Content-Type':'application/json', Authorization:`Bearer ${customerLogin.body.token}` };

    const invalid = await request('/api/customer/custom-printed-film/checkout-session', {
      method:'POST', headers:customerHeaders,
      body:JSON.stringify({ requestId:'invalid-amount', description:'Deposit', meters:15, amount:0, locale:'en' })
    });
    assert.equal(invalid.response.status, 400, 'Zero-dollar custom checkout must be rejected');

    const uploaded = await request('/api/customer/media', {
      method:'POST', headers:customerHeaders,
      body:JSON.stringify({ name:'design.png', type:'image/png', dataUrl:'data:image/png;base64,iVBORw0KGgo=' })
    });
    assert.equal(uploaded.response.status, 200, JSON.stringify(uploaded.body));

    const checkout = await request('/api/customer/custom-printed-film/checkout-session', {
      method:'POST', headers:customerHeaders,
      body:JSON.stringify({
        requestId:'custom-payment-001', description:'Model Y custom wrap deposit', meters:5.5, amount:725.25,
        locale:'es-MX', pattern:'Pop Art', vehicleYear:'2025', vehicleMake:'Tesla', vehicleModel:'Model Y',
        designNotes:'Use the uploaded artwork on both sides.', attachments:[uploaded.body]
      })
    });
    assert.equal(checkout.response.status, 201, JSON.stringify(checkout.body));
    assert.equal(checkout.body.checkoutUrl, 'https://checkout.stripe.test/custom-1');
    assert.equal(stripeRequests[0].fields.locale, 'es-419');
    assert.equal(stripeRequests[0].fields['line_items[0][price_data][unit_amount]'], '72525');
    assert.equal(stripeRequests[0].fields['metadata[customPrintedFilm]'], 'true');
    assert.equal(stripeRequests[0].fields['metadata[printedMeters]'], '5.5');

    const db = JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
    const order = db.salesOrders.find(row => row.id === checkout.body.orderId);
    assert(order, 'Custom printed film order must be saved');
    assert.equal(order.item, 'CUSTOM-PRINTED-FILM');
    assert.equal(order.customPrintedFilm, true);
    assert.equal(order.customerEnteredAmount, true);
    assert.equal(order.customPrintedFilmMeters, 5.5);
    assert.equal(order.checkoutTotal, 725.25);
    assert.equal(order.portalAttachments.length, 1);
    assert.equal(db.inventoryReservations.filter(row => row.orderId === order.id).length, 0, 'Custom printed film must not reserve finished inventory');

    const bootstrap = await request('/api/customer/bootstrap', { headers:customerHeaders });
    assert.equal(bootstrap.response.status, 200, JSON.stringify(bootstrap.body));
    const exposed = bootstrap.body.orders.find(row => row.id === order.id);
    assert.equal(exposed.customPrintedFilm, true);
    assert.equal(exposed.customPrintedFilmMeters, 5.5);
    assert.equal(exposed.attachments.length, 1);

    const resumed = await request(`/api/customer/orders/${order.id}/checkout-session`, {
      method:'POST', headers:customerHeaders, body:JSON.stringify({ locale:'ja' })
    });
    assert.equal(resumed.response.status, 201, JSON.stringify(resumed.body));
    assert.equal(resumed.body.checkoutUrl, 'https://checkout.stripe.test/custom-2');
    assert.equal(stripeRequests[1].fields.locale, 'ja');
    assert.equal(db.inventoryReservations.filter(row => row.orderId === order.id).length, 0);

    const event = {
      id:'evt_custom_payment_001', type:'checkout.session.completed', livemode:false,
      data:{ object:{
        id:'cs_test_custom_2', client_reference_id:order.id, payment_status:'paid',
        currency:'usd', amount_total:72525, payment_intent:'pi_custom_payment_001'
      } }
    };
    const rawEvent = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHmac('sha256', webhookSecret).update(`${timestamp}.${rawEvent}`).digest('hex');
    const webhook = await request('/api/stripe/customer-order/webhook', {
      method:'POST', headers:{ 'Content-Type':'application/json', 'Stripe-Signature':`t=${timestamp},v1=${signature}` },
      body:rawEvent
    });
    assert.equal(webhook.response.status, 200, JSON.stringify(webhook.body));
    const paidDb = JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
    const paidOrder = paidDb.salesOrders.find(row => row.id === order.id);
    assert.equal(paidOrder.paymentStatus, 'paid');
    assert.equal(paidOrder.status, '已付款待设计确认');
    assert.equal(paidOrder.paid, 725.25);
    assert.equal(paidOrder.paymentTransactions.length, 1);
    assert.equal(paidDb.inventoryReservations.filter(row => row.orderId === order.id).length, 0);

    console.log('Customer custom printed film checkout tests passed: auth, validation, upload, 5.5m custom amount, Stripe locale, persistence, no inventory reservation, resume checkout, and paid webhook confirmation.');
  } finally {
    app.kill('SIGTERM');
    if (app.exitCode === null) await new Promise(resolve => app.once('exit', resolve));
    await new Promise(resolve => stripe.close(resolve));
    fs.rmSync(dataDir, { recursive:true, force:true });
  }
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
