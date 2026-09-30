const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-checkout-idempotency-'));
const appPort = 46000 + Math.floor(Math.random() * 400);
const stripePort = 46500 + Math.floor(Math.random() * 400);
const webhookSecret = 'whsec_checkout_idempotency_test';
let appOutput = '';
let stripePostCount = 0;
let stripeIdempotencyKey = '';
let stripeSession = null;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
    await sleep(100);
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
    if (req.method === 'GET' && req.url === '/v1/checkout/sessions/cs_test_stable_checkout') {
      res.writeHead(200, { 'Content-Type':'application/json' });
      return res.end(JSON.stringify({ ...stripeSession, payment_status:'paid', amount_total:32500, currency:'usd', payment_intent:'pi_test_stable_checkout' }));
    }
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', async () => {
      stripePostCount += 1;
      stripeIdempotencyKey = String(req.headers['idempotency-key'] || '');
      const fields = Object.fromEntries(new URLSearchParams(raw));
      stripeSession = {
        id:'cs_test_stable_checkout', url:'https://checkout.stripe.test/stable-checkout', livemode:false,
        client_reference_id:fields.client_reference_id,
        metadata:{ orderId:fields['metadata[orderId]'], portalCustomerId:fields['metadata[portalCustomerId]'] }
      };
      await sleep(250);
      res.writeHead(200, { 'Content-Type':'application/json' });
      res.end(JSON.stringify(stripeSession));
    });
  });
  await listen(stripe, stripePort);

  const app = spawn(process.execPath, ['server.js'], {
    cwd:root,
    env:{
      ...process.env, NODE_ENV:'test', DATA_DIR:dataDir, PORT:String(appPort), HOST:'127.0.0.1',
      ENABLE_CLOUD_DAILY_BACKUPS:'false', STRIPE_SECRET_KEY:'sk_test_checkout_idempotency',
      STRIPE_CUSTOMER_ORDER_LIVE_ENABLED:'false', STRIPE_API_BASE_URL:`http://127.0.0.1:${stripePort}`,
      STRIPE_CUSTOMER_ORDER_WEBHOOK_SECRET:webhookSecret
    },
    stdio:['ignore','pipe','pipe']
  });
  app.stdout.on('data', chunk => { appOutput += chunk; });
  app.stderr.on('data', chunk => { appOutput += chunk; });

  try {
    await waitForApp();
    const admin = await request('/api/login', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ email:'admin@filmshop.local', password:'admin123' })
    });
    assert.equal(admin.response.status, 200, JSON.stringify(admin.body));
    const adminHeaders = { 'Content-Type':'application/json', Authorization:`Bearer ${admin.body.token}` };
    const sku = 'CHECKOUT-IDEMPOTENCY-001';
    const product = await request('/api/products', {
      method:'POST', headers:adminHeaders,
      body:JSON.stringify({ sku,model:sku,specification:'1.52*30m',name:'Checkout Idempotency Test',category:'Window film',unit:'roll',cost:100,price:400,wholesale:325,minPrice:300,qty:0,reorder:1,location:'Test',portalVisible:true,portalPurchasable:true })
    });
    assert.equal(product.response.status, 200, JSON.stringify(product.body));
    const movement = await request('/api/movements', {
      method:'POST', headers:adminHeaders,
      body:JSON.stringify({ date:'2026-09-30',branchId:'las-vegas',sku,type:'in',qty:10,note:'checkout idempotency test' })
    });
    assert.equal(movement.response.status, 200, JSON.stringify(movement.body));
    const customerCreated = await request('/api/portal-customers', {
      method:'POST', headers:adminHeaders,
      body:JSON.stringify({ businessName:'Checkout Idempotency Customer',contactName:'Test Buyer',email:'checkout-idempotency@example.test',account:'checkout-idempotency',password:'TestPass123',priceTier:'wholesale',prices:{},status:'正常' })
    });
    assert.equal(customerCreated.response.status, 201, JSON.stringify(customerCreated.body));
    const customerLogin = await request('/api/customer/login', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ login:'checkout-idempotency',password:'TestPass123' })
    });
    assert.equal(customerLogin.response.status, 200, JSON.stringify(customerLogin.body));
    const customerHeaders = { 'Content-Type':'application/json', Authorization:`Bearer ${customerLogin.body.token}` };
    const checkoutBody = JSON.stringify({ requestId:'stable-cart-request-001',items:[{ sku,qty:1 }],fulfillment:'pickup-las-vegas',notes:'double click test',locale:'en' });

    const [first,second] = await Promise.all([
      request('/api/customer/checkout-session',{ method:'POST',headers:customerHeaders,body:checkoutBody }),
      request('/api/customer/checkout-session',{ method:'POST',headers:customerHeaders,body:checkoutBody })
    ]);
    assert([200,201].includes(first.response.status), JSON.stringify(first.body));
    assert([200,201].includes(second.response.status), JSON.stringify(second.body));
    assert.equal(first.body.orderId, second.body.orderId, 'Concurrent double click must reuse one order');
    assert.equal(first.body.checkoutUrl, second.body.checkoutUrl, 'Concurrent double click must reuse one Stripe URL');
    assert.equal(stripePostCount, 1, 'Concurrent double click must create one Stripe Session');
    assert.match(stripeIdempotencyKey, /^quad-customer-checkout-[a-f0-9]{64}$/, 'Stripe request must carry a stable Idempotency-Key');

    const refreshedRetry = await request('/api/customer/checkout-session',{ method:'POST',headers:customerHeaders,body:checkoutBody });
    assert.equal(refreshedRetry.response.status, 200, JSON.stringify(refreshedRetry.body));
    assert.equal(refreshedRetry.body.orderId, first.body.orderId, 'A refreshed page must reuse the original order');
    assert.equal(refreshedRetry.body.checkoutUrl, first.body.checkoutUrl, 'A network retry must reuse the original payment URL');
    assert.equal(stripePostCount, 1, 'A completed retry must not call Stripe again');

    let db = JSON.parse(fs.readFileSync(path.join(dataDir,'db.json'),'utf8'));
    assert.equal(db.salesOrders.filter(order=>order.portalRequestId==='stable-cart-request-001').length,1,'Stable requestId must persist one order');
    assert.equal(db.inventoryReservations.filter(row=>row.orderId===first.body.orderId&&row.status==='pending_payment').length,1,'Stable requestId must persist one reservation');

    const confirmed = await request('/api/customer/checkout-session/confirm', {
      method:'POST', headers:customerHeaders, body:JSON.stringify({ sessionId:'cs_test_stable_checkout' })
    });
    assert.equal(confirmed.response.status, 200, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.paymentStatus, 'paid', 'Return reconciliation must confirm payment before a delayed webhook');

    const event = { id:'evt_delayed_checkout_webhook',type:'checkout.session.completed',livemode:false,data:{ object:{ ...stripeSession,payment_status:'paid',amount_total:32500,currency:'usd',payment_intent:'pi_test_stable_checkout' } } };
    const rawEvent = JSON.stringify(event);
    const timestamp = Math.floor(Date.now()/1000);
    const signature = crypto.createHmac('sha256',webhookSecret).update(`${timestamp}.${rawEvent}`).digest('hex');
    const webhook = await request('/api/stripe/customer-order/webhook', {
      method:'POST', headers:{ 'Content-Type':'application/json','Stripe-Signature':`t=${timestamp},v1=${signature}` }, body:rawEvent
    });
    assert.equal(webhook.response.status,200,JSON.stringify(webhook.body));
    db = JSON.parse(fs.readFileSync(path.join(dataDir,'db.json'),'utf8'));
    const paidOrder = db.salesOrders.find(order=>order.id===first.body.orderId);
    assert.equal(paidOrder.paymentStatus,'paid');
    assert.equal(paidOrder.paid,325);
    assert.equal(paidOrder.paymentTransactions.length,1,'Delayed webhook after return reconciliation must not double-record payment');
    assert.equal(db.inventoryReservations.filter(row=>row.orderId===paidOrder.id&&row.status==='paid').length,1,'Paid order must retain one auditable paid reservation');

    const orderingSource = fs.readFileSync(path.join(root,'public/customer-ordering.js'),'utf8');
    const customerSource = fs.readFileSync(path.join(root,'public/customer.js'),'utf8');
    assert(orderingSource.indexOf('dealerCheckoutSubmitting=true') < orderingSource.indexOf('await saveCheckoutDeliveryProfile(false)'), 'Checkout UI must lock before its first asynchronous operation');
    assert(orderingSource.includes('Saving delivery information') && orderingSource.includes('Verifying price and inventory') && orderingSource.includes('Creating secure Stripe payment') && orderingSource.includes('Redirecting to Stripe'), 'Checkout UI must expose all four progress steps');
    assert(customerSource.includes("'/api/customer/checkout-session/confirm'"), 'Stripe return page must actively reconcile the Session ID');
    assert(customerSource.includes('for(let attempt=0;attempt<10;attempt+=1)'), 'Stripe return page must poll briefly for delayed confirmation');

    console.log('Customer checkout idempotency tests passed: pre-async UI lock, four progress steps, concurrent double click, retry/refresh reuse, stable Stripe key, return reconciliation, and delayed webhook safety.');
  } finally {
    app.kill('SIGTERM');
    if (app.exitCode === null) await new Promise(resolve=>app.once('exit',resolve));
    await new Promise(resolve=>stripe.close(resolve));
    fs.rmSync(dataDir,{ recursive:true,force:true });
  }
}

run().catch(error=>{ console.error(error.stack||error);process.exitCode=1; });
