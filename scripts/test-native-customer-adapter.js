const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-native-customer-test-'));
const PORT = 47000 + Math.floor(Math.random() * 1000);
const AI_PORT = PORT + 1000;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const API_SOURCE = path.join(ROOT, 'ios/QUaDFieldSales/LidaField/APIClient.swift');
let server;
let aiServer;

function startAiServer() {
  aiServer = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ translatedText: '来自原生 App 的隔离测试回复' }) } }]
      }));
    });
  });
  return new Promise((resolve, reject) => {
    aiServer.once('error', reject);
    aiServer.listen(AI_PORT, '127.0.0.1', resolve);
  });
}

function stopAiServer() {
  if (!aiServer?.listening) return Promise.resolve();
  return new Promise(resolve => aiServer.close(resolve));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATA_DIR,
        PORT: String(PORT),
        HOST: '127.0.0.1',
        OPENAI_API_KEY: 'isolated-native-test-key',
        OPENAI_API_BASE_URL: `http://127.0.0.1:${AI_PORT}/v1`,
        ENABLE_CLOUD_DAILY_BACKUPS: 'false'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Server startup timed out:\n${output}`)), 15000);
    const onData = chunk => {
      output += chunk.toString();
      if (output.includes('Film shop cloud app running:')) {
        clearTimeout(timeout);
        resolve();
      }
    };
    server.stdout.on('data', onData);
    server.stderr.on('data', onData);
    server.once('exit', code => {
      clearTimeout(timeout);
      if (code && !output.includes('Film shop cloud app running:')) {
        reject(new Error(`Server exited ${code}:\n${output}`));
      }
    });
  });
}

function stopServer() {
  if (!server || server.exitCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    server.once('exit', resolve);
    server.kill('SIGTERM');
  });
}

async function jsonRequest(pathname, { method = 'GET', token = '', body } = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

async function seed() {
  await startServer();
  await stopServer();
  const file = path.join(DATA_DIR, 'db.json');
  const db = JSON.parse(fs.readFileSync(file, 'utf8'));
  db.users.push({
    id: 'native-sales-user',
    name: 'Native Sales Test',
    email: 'native-sales@test.local',
    role: 'sales',
    active: true,
    avatarDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/2G7fGQAAAABJRU5ErkJggg==',
    defaultBranchId: 'las-vegas',
    branchIds: ['las-vegas'],
    passwordHash: hashPassword('isolated-password'),
    permissions: { fieldSalesView: true, fieldSalesEdit: true }
  });
  db.users.push({
    id: 'native-sales-user-two',
    name: 'Second Sales Test',
    email: 'native-sales-two@test.local',
    role: 'sales',
    active: true,
    defaultBranchId: 'las-vegas',
    branchIds: ['las-vegas'],
    passwordHash: hashPassword('isolated-password-two'),
    permissions: { fieldSalesView: true, fieldSalesEdit: true }
  });
  db.users.push({
    id: 'native-manager-user',
    name: 'Native Manager Test',
    email: 'native-manager@test.local',
    role: 'manager',
    active: true,
    avatarDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/2G7fGQAAAABJRU5ErkJggg==',
    defaultBranchId: 'las-vegas',
    branchIds: ['las-vegas'],
    passwordHash: hashPassword('isolated-manager-password'),
    permissions: { fieldSalesManage: true }
  });
  db.users.push({
    id: 'native-manager-no-field-sales',
    name: 'Manager Without Field Sales',
    email: 'manager-no-field-sales@test.local',
    role: 'manager',
    active: true,
    defaultBranchId: 'las-vegas',
    branchIds: ['las-vegas'],
    passwordHash: hashPassword('isolated-no-access-password')
  });
  db.users.push({
    id: 'native-owner-user',
    name: 'Native Owner Test',
    email: 'native-owner@test.local',
    role: 'owner',
    active: true,
    defaultBranchId: 'las-vegas',
    branchIds: ['las-vegas'],
    passwordHash: hashPassword('isolated-owner-password')
  });
  db.salesAccounts = [{
    id: 'existing-native-customer',
    businessName: 'San Francisco Isolated Tint Shop',
    address: '1 Market St, San Francisco, CA 94105',
    city: 'Las Vegas',
    contactName: 'Alex',
    phone: '7025550100',
    email: 'alex@example.test',
    customerType: '贴膜门店',
    source: '隔离测试',
    note: 'existing fixture',
    lat: 37.7936,
    lng: -122.3958,
    assignedUserId: 'native-sales-user',
    assignedUserName: 'Native Sales Test',
    createdByUserId: 'native-sales-user',
    branchId: 'las-vegas',
    stage: '待拜访',
    createdAt: '2026-09-11T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z'
  }];
  db.clockRecords = [];
  db.salesVisitPlans = [{
    id: 'isolated-visit-plan',
    accountId: 'existing-native-customer',
    businessName: 'San Francisco Isolated Tint Shop',
    address: '1 Market St, San Francisco, CA 94105',
    userId: 'native-sales-user',
    assignedUserId: 'native-sales-user',
    date: '2026-09-11',
    plannedAt: '2026-09-11T17:00:00.000Z',
    order: 1,
    status: '待出发',
    note: 'isolated visit fixture'
  }];
  db.salesLocationPoints = [
    { locationId: 'isolated-location-point-1', clientPointId: 'isolated-client-point', userId: 'native-sales-user', collectedAt: '2026-09-11T15:05:00.000Z', latitude: 36.1716, longitude: -115.1391, accuracyM: 8 },
    { locationId: 'isolated-location-point-2', clientPointId: 'isolated-client-point-2', userId: 'native-sales-user', collectedAt: '2026-09-11T16:10:00.000Z', latitude: 36.1671, longitude: -115.1487, accuracyM: 9 },
    { locationId: 'isolated-location-point-3', clientPointId: 'isolated-client-point-3', userId: 'native-sales-user', collectedAt: '2026-09-11T17:20:00.000Z', latitude: 36.1598, longitude: -115.1537, accuracyM: 7 }
  ];
  const fixturePhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/2G7fGQAAAABJRU5ErkJggg==';
  db.salesVisits = [{
    id: 'isolated-history-visit',
    accountId: 'existing-native-customer',
    businessName: 'San Francisco Isolated Tint Shop',
    userId: 'native-sales-user',
    userName: 'Native Sales Test',
    branchId: 'las-vegas',
    status: '已完成',
    startedAt: '2026-09-11T17:05:00.000Z',
    completedAt: '2026-09-11T18:10:00.000Z',
    reportText: 'Customer reviewed ceramic film options and requested a delivery quote.',
    nextAction: 'Send approved quotation tomorrow',
    checkIn: { photoUrl: fixturePhoto, address: 'Isolated storefront test address', lat: 36.1716, lng: -115.1391, locationMatched: true },
    evidencePhotoUrls: [fixturePhoto],
    aiAnalysis: { summaryEn: 'Strong interest in ceramic film.', summaryZh: '客户对陶瓷膜有较强兴趣。', managerAdviceEn: 'Send the quote promptly.', managerAdviceZh: '尽快发送正式报价。' }
  }];
  db.salesAttachments = [{
    id: 'isolated-history-meeting', objectId: 'isolated-history-visit', userId: 'native-sales-user', userName: 'Native Sales Test', branchId: 'las-vegas',
    fileName: 'customer-meeting-summary.json', contentType: 'application/json', sizeBytes: 512, url: '', artifactKind: 'meeting', customerName: 'San Francisco Isolated Tint Shop',
    transcript: 'Customer asked about ceramic film, heat rejection, and delivery timing.', analysis: 'High purchase intent; send the approved quote and follow up tomorrow.', createdAt: '2026-09-11T18:00:00.000Z'
  }, {
    id: 'isolated-history-audio', objectId: 'isolated-history-visit', userId: 'native-sales-user', userName: 'Native Sales Test', branchId: 'las-vegas',
    fileName: 'customer-visit-recording.m4a', contentType: 'audio/mp4', sizeBytes: 1024, url: '', createdAt: '2026-09-11T17:40:00.000Z'
  }];
  db.salesFieldOrders = [{
    id: 'isolated-history-order', orderNumber: 'FSO-ISOLATED-001', accountId: 'existing-native-customer', businessName: 'San Francisco Isolated Tint Shop', branchId: 'las-vegas',
    userId: 'native-sales-user', userName: 'Native Sales Test', visitId: 'isolated-history-visit', type: '批发订单', warehouse: 'Las Vegas',
    items: [{ productId: '', sku: 'ISOLATED-FILM-001', name: 'Isolated Ceramic Film', quantity: 2, unitPrice: 325, lineTotal: 650 }],
    total: 650, amountPaid: 200, amountDue: 450, status: '待仓库确认', inventoryStatus: '待仓库确认', createdAt: '2026-09-11T18:05:00.000Z', updatedAt: '2026-09-11T18:05:00.000Z'
  }];
  db.messages = [{
    id: 'isolated-internal-message',
    scope: 'direct',
    groupId: '',
    fromUserId: 'native-manager-user',
    fromName: 'Native Manager Test',
    toUserId: 'native-sales-user',
    toName: 'Native Sales Test',
    text: 'Isolated message from the QUaD main system',
    aiTranslation: {
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      text: '来自 QUaD 主系统的隔离测试消息',
      provider: 'openai',
      model: 'gpt-5-mini',
      createdAt: '2026-09-11T15:10:00.000Z'
    },
    attachment: null,
    clientRequestId: 'isolated-incoming-request',
    createdAt: '2026-09-11T15:10:00.000Z',
    readAt: '',
    readByUserIds: []
  }];
  fs.writeFileSync(file, JSON.stringify(db, null, 2));
  await startServer();
}

async function run() {
  const source = fs.readFileSync(API_SOURCE, 'utf8');
  const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert(!source.includes('https://lidaqeos.com'), 'old QEOS host must not remain');
  for (const allowed of [
    '/api/login',
    '/api/mobile/bootstrap',
    '/api/mobile/clock',
    '/api/field-sales/accounts',
    '/api/field-sales/location-points'
  ]) {
    assert(source.includes(allowed), `missing native allowlist route ${allowed}`);
  }
  assert(!source.includes('/api/field-sales/shifts/start'), 'native clock-in must not call the nonexistent legacy shift route');
  assert(!source.includes('/locations/append'), 'native tracking must use the QUaD location-points route');
  assert(!source.includes('/api/sales-force'), 'native visit flow must use QUaD field-sales routes');
  for (const route of [
    '/api/field-sales/visit-plans',
    '/api/field-sales/trips/start',
    '/api/field-sales/visits/start',
    '/api/field-sales/attachments',
    '/api/field-sales/daily-reports'
  ]) assert(source.includes(route), `missing native field-sales flow route ${route}`);
  assert(source.includes('route.hasPrefix("/api/field-sales/trips/")'), 'native app must allow old-trip cancellation');
  assert(source.includes('ACTIVE_TRIP_EXISTS'), 'native app must decode structured active-trip conflicts');
  const visitViewSource = fs.readFileSync(path.join(ROOT, 'ios/QUaDFieldSales/LidaField/VisitDetailView.swift'), 'utf8');
  assert(visitViewSource.includes('selected.planId == plan.planId'), 'visit screen must prefer the updated selected trip state');
  const appStateSource = fs.readFileSync(path.join(ROOT, 'ios/QUaDFieldSales/LidaField/AppState.swift'), 'utf8');
  assert(appStateSource.includes('APIClient.localDate(date, timeZoneIdentifier: region.timeZoneIdentifier)'), 'visit plan merging must use the configured business time zone');
  const todayViewSource = fs.readFileSync(path.join(ROOT, 'ios/QUaDFieldSales/LidaField/TodayView.swift'), 'utf8');
  assert(!todayViewSource.includes('仍超过 500 米考核范围'), 'native arrival must not block a valid actual location because the customer address differs');
  assert(!appStateSource.includes('照片位置超过客户坐标 500 米'), 'native photo evidence must keep the actual location without a customer-distance block');
  assert(!serverSource.includes("code: 'FIELD_SALES_LOCATION_MISMATCH'"), 'server must record rather than reject a customer-location difference');
  assert(!serverSource.includes("code: 'FIELD_SALES_CUSTOMER_ADDRESS_UNRESOLVED'"), 'an unresolved saved customer address must not block actual-location check-in');
  assert(source.includes('throw APIError.localOnly'), 'non-customer requests must be blocked locally');
  assert(source.includes('func dashboard(date: String)'), 'native dashboard must read QUaD mobile bootstrap');
  assert(source.includes('fieldSales.visitPlans'), 'native dashboard must map QUaD visit plans');
  assert(source.includes('fieldSales.locationPoints'), 'native dashboard must map QUaD route points');
  assert(source.includes('clockRecords'), 'native dashboard must map QUaD attendance records');
  assert(!source.includes('request("/api/collaboration")'), 'old collaboration overview route must not remain');
  assert(source.includes('request("/api/messages")'), 'native chat must read QUaD internal messages');
  assert(source.includes('"/api/messages/read"'), 'native chat must mark QUaD messages read');
  assert(source.includes('let aiTranslation: InternalMessageAITranslation?'), 'native chat must decode AI translations');
  assert(source.includes('avatarDataUrl: avatarDataUrl'), 'native chat must map QUaD employee avatars');
  const messagingViewSource = fs.readFileSync(path.join(ROOT, 'ios/QUaDFieldSales/LidaField/MessagingViews.swift'), 'utf8');
  assert(messagingViewSource.includes('translation.text'), 'native chat must render AI translations');
  const chatAudioSource = fs.readFileSync(path.join(ROOT, 'ios/QUaDFieldSales/LidaField/ChatAudio.swift'), 'utf8');
  assert(chatAudioSource.includes('chatSpeechAuthorization()'), 'speech permission callback must use a non-actor helper');
  assert(chatAudioSource.includes('chatMicrophonePermission()'), 'microphone permission callback must use a non-actor helper');
  const adminSource = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
  assert(adminSource.includes("fieldSales: '业务员管理中心'"), 'desktop module must be named 业务员管理中心');
  assert(adminSource.includes('function fieldSalesEmployeeRouteMap'), 'desktop salesperson lanes must include the daily route map');
  assert(adminSource.includes('沟通记录与 AI 总结'), 'desktop salesperson lanes must include conversation and AI summaries');
  assert(adminSource.includes('<audio controls'), 'desktop salesperson lanes must support inline recording playback');
  assert(adminSource.includes('let fieldSalesEmployeeDates = {}'), 'each salesperson lane must keep its own selected date');
  assert(adminSource.includes("let fieldSalesExpandedEmployeeId = ''"), 'salesperson lanes must start collapsed');
  assert(adminSource.includes('function toggleFieldSalesEmployeeLane'), 'salesperson summaries must expand only when clicked');
  assert(adminSource.includes('function setFieldSalesEmployeeDate(personId, value)'), 'each salesperson date must update independently');
  assert(adminSource.includes('function openFieldSalesCustomerDetail'), 'day customers must open a complete customer profile');
  assert(adminSource.includes('门店与现场照片'), 'customer profile must group storefront and visit photos');
  assert(adminSource.includes('订货、样品与放货'), 'customer profile must group orders and product activity');
  assert(adminSource.includes('历史资料均保留在本客户档案中'), 'customer profile must retain historical activity');
  assert(adminSource.includes("saveButton.textContent = lang === 'zh' ? '正在保存…' : 'Saving…'"), 'field customer save must show an immediate busy state');
  assert(adminSource.includes("const value = id => String(document.getElementById(id)?.value || '').trim();\n  const nextVisitValue"), 'field customer save must define its form value reader before collecting fields');
  assert(adminSource.includes('showActionFeedback(lang ==='), 'field customer save must show a persistent success confirmation');
  assert(adminSource.includes("timeoutMs:15000"), 'field customer save must recover from a stalled request');
  assert(serverSource.includes('const timeoutId = setTimeout(() => controller.abort(), 6000)'), 'address geocoding must never block customer saving indefinitely');
  assert(adminSource.includes("fieldSalesMatchesSelectedDate(item, ['plannedAt', 'createdAt'], selectedDate)"), 'salesperson visit plans must follow that employee selected date');
  assert(adminSource.includes("fieldSalesMatchesSelectedDate(item, ['startedAt', 'arrivedAt', 'createdAt'], selectedDate)"), 'salesperson visits must follow that employee selected date');
  assert(adminSource.includes("expanded ? `<div class=\"field-sales-employee-detail\">"), 'salesperson day details must not render while collapsed');
  assert(adminSource.includes('const visiblePeople = expandedPerson ? [expandedPerson] : people'), 'opening one salesperson must hide other salesperson cards');
  assert(adminSource.includes("manager: { ...all, fieldSalesManage: false"), 'manager role must not receive the management center without an explicit checkbox');
  assert(adminSource.includes("user?.role === 'owner' ? `<button class=\"btn danger\""), 'only owners should receive a customer delete button');
  assert(serverSource.includes("return user?.role === 'owner' || Boolean(effectivePermissions(user).fieldSalesManage)"), 'server management access must require owner or explicit permission');
  assert(serverSource.includes('FIELD_SALES_ACCOUNT_DELETE_FORBIDDEN'), 'server must reject customer deletion by non-owners');

  await startAiServer();
  await seed();
  const holdMs = Math.max(0, Number(process.env.UI_TEST_HOLD_MS || 0));
  if (holdMs) {
    console.log(`Native customer fixture ready at ${BASE_URL} for ${holdMs}ms.`);
    console.log('Login: native-sales@test.local / isolated-password');
    await new Promise(resolve => setTimeout(resolve, holdMs));
    return;
  }
  const login = await jsonRequest('/api/login', {
    method: 'POST',
    body: { email: 'native-sales@test.local', password: 'isolated-password' }
  });
  assert.equal(login.status, 200);
  assert(login.body.token);
  assert.equal(login.body.user.id, 'native-sales-user');

  const noAccessLogin = await jsonRequest('/api/login', {
    method: 'POST',
    body: { email: 'manager-no-field-sales@test.local', password: 'isolated-no-access-password' }
  });
  assert.equal(noAccessLogin.status, 200);
  assert.equal(noAccessLogin.body.user.permissions.fieldSalesManage, false);
  const noAccessBootstrap = await jsonRequest('/api/bootstrap', { token: noAccessLogin.body.token });
  assert.equal(noAccessBootstrap.status, 200);
  assert.equal(noAccessBootstrap.body.data.fieldSales.canManage, false);

  const bootstrap = await jsonRequest('/api/mobile/bootstrap', { token: login.body.token });
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.body.fieldSales.accounts.length, 1);
  assert.equal(bootstrap.body.fieldSales.accounts[0].businessName, 'San Francisco Isolated Tint Shop');
  assert.equal(bootstrap.body.clockRecords.length, 0);
  assert.equal(bootstrap.body.fieldSales.visitPlans.length, 1);
  assert.equal(bootstrap.body.fieldSales.visitPlans[0].accountId, 'existing-native-customer');
  assert.equal(bootstrap.body.fieldSales.locationPoints.length, 3);
  assert.equal(bootstrap.body.fieldSales.locationPoints[0].clientPointId, 'isolated-client-point');

  const clockIn = await jsonRequest('/api/mobile/clock', {
    method: 'POST',
    token: login.body.token,
    body: {
      type: 'in',
      lat: 37.7936,
      lng: -122.3958,
      accuracy: 7,
      locationConsent: true,
      note: 'isolated native clock-in'
    }
  });
  assert.equal(clockIn.status, 200);
  assert.equal(clockIn.body.clockRecords.length, 1);
  assert.equal(clockIn.body.clockRecords[0].type, 'in');
  assert.equal(clockIn.body.clockRecords[0].userId, 'native-sales-user');
  const isolatedShiftId = clockIn.body.clockRecords[0].id;

  const locationPoint = await jsonRequest('/api/field-sales/location-points', {
    method: 'POST',
    token: login.body.token,
    body: {
      clientPointId: 'isolated-clock-location',
      shiftId: isolatedShiftId,
      collectedAt: new Date().toISOString(),
      latitude: 36.1717,
      longitude: -115.1392,
      accuracyM: 9,
      source: 'IOS_NATIVE'
    }
  });
  assert.equal(locationPoint.status, 201);
  assert.equal(locationPoint.body.shiftId, isolatedShiftId);

  const clockOut = await jsonRequest('/api/mobile/clock', {
    method: 'POST',
    token: login.body.token,
    body: {
      type: 'out',
      lat: 36.1718,
      lng: -115.1393,
      accuracy: 8,
      locationConsent: true,
      note: 'isolated native clock-out'
    }
  });
  assert.equal(clockOut.status, 200);
  assert.equal(clockOut.body.clockRecords.length, 2);
  assert.equal(clockOut.body.clockRecords[0].type, 'out');
  assert.equal(clockOut.body.clockRecords[1].id, isolatedShiftId);

  const messages = await jsonRequest('/api/messages', { token: login.body.token });
  assert.equal(messages.status, 200);
  assert(messages.body.users.some(item => item.id === 'native-manager-user'));
  assert(messages.body.users.find(item => item.id === 'native-manager-user').avatarDataUrl.startsWith('data:image/png;base64,'));
  assert.equal(messages.body.messages.length, 1);
  assert.equal(messages.body.messages[0].text, 'Isolated message from the QUaD main system');
  assert.equal(messages.body.messages[0].aiTranslation.targetLanguage, 'zh');
  assert.equal(messages.body.messages[0].aiTranslation.text, '来自 QUaD 主系统的隔离测试消息');

  const sentMessage = await jsonRequest('/api/messages', {
    method: 'POST',
    token: login.body.token,
    body: {
      toUserId: 'native-manager-user',
      text: 'Isolated reply from the native app',
      clientRequestId: 'isolated-native-reply'
    }
  });
  assert.equal(sentMessage.status, 200);
  assert(sentMessage.body.messages.some(item =>
    item.clientRequestId === 'isolated-native-reply' && item.fromUserId === 'native-sales-user'
  ));

  const readMessage = await jsonRequest('/api/messages/read', {
    method: 'PUT',
    token: login.body.token,
    body: { fromUserId: 'native-manager-user' }
  });
  assert.equal(readMessage.status, 200);
  assert(readMessage.body.messages.find(item => item.id === 'isolated-internal-message').readAt);

  const created = await jsonRequest('/api/field-sales/accounts', {
    method: 'POST',
    token: login.body.token,
    body: {
      businessName: 'New Native Customer',
      address: '200 Local Test Rd, Las Vegas, NV',
      city: 'Las Vegas',
      phone: '7025550200',
      email: 'new@example.test',
      customerType: '贴膜门店',
      source: 'iPhone 原生 App',
      contactName: 'Morgan',
      note: 'isolated create test',
      language: 'zh',
      lat: 36.1816,
      lng: -115.1491
    }
  });
  assert.equal(created.status, 201);

  const geocodedCreateStartedAt = Date.now();
  const geocodedCreate = await jsonRequest('/api/field-sales/accounts', {
    method: 'POST',
    token: login.body.token,
    body: {
      businessName: 'Santa Monica Save Feedback Test',
      address: '3212 Santa Monica Blvd, Santa Monica, CA 90404',
      phone: '6265864446',
      email: 'isolated-save-feedback@example.test',
      contactName: 'Isolated Save Test',
      note: 'isolated address geocoding and save feedback regression'
    }
  });
  assert.equal(geocodedCreate.status, 201);
  assert(Date.now() - geocodedCreateStartedAt < 8000, 'address lookup must not block customer creation beyond its hard timeout');
  assert(geocodedCreate.body.fieldSales.accounts.some(item => item.businessName === 'Santa Monica Save Feedback Test'));
  const saved = created.body.fieldSales.accounts.find(item => item.businessName === 'New Native Customer');
  assert(saved);
  assert.equal(saved.createdByUserId, 'native-sales-user');
  assert.equal(saved.branchId, 'las-vegas');

  const trip = await jsonRequest('/api/field-sales/trips/start', {
    method: 'POST',
    token: login.body.token,
    body: {
      accountId: 'existing-native-customer',
      locationConsent: true,
      lat: 37.7936,
      lng: -122.3958,
      accuracy: 6
    }
  });
  assert.equal(trip.status, 201);
  assert.equal(trip.body.fieldSales.trips[0].status, '前往中');
  assert.equal(trip.body.fieldSales.visitPlans.find(item => item.id === 'isolated-visit-plan').status, '前往中');

  const conflict = await jsonRequest('/api/field-sales/trips/start', {
    method: 'POST',
    token: login.body.token,
    body: {
      accountId: saved.id,
      locationConsent: true,
      lat: 36.1716,
      lng: -115.1391,
      accuracy: 6
    }
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, 'ACTIVE_TRIP_EXISTS');
  assert.equal(conflict.body.activeTrip.id, trip.body.fieldSales.trips[0].id);
  assert.equal(conflict.body.activeTrip.businessName, 'San Francisco Isolated Tint Shop');

  const cancelledTrip = await jsonRequest(`/api/field-sales/trips/${conflict.body.activeTrip.id}/cancel`, {
    method: 'PUT',
    token: login.body.token,
    body: { reason: 'isolated old-trip recovery test' }
  });
  assert.equal(cancelledTrip.status, 200);
  assert.equal(cancelledTrip.body.fieldSales.trips[0].status, '已取消');
  assert.equal(cancelledTrip.body.fieldSales.trips[0].cancelReason, 'isolated old-trip recovery test');
  assert(cancelledTrip.body.fieldSales.trips[0].cancelledAt);
  assert.equal(cancelledTrip.body.fieldSales.visitPlans.find(item => item.id === 'isolated-visit-plan').status, '待出发');
  assert.equal(cancelledTrip.body.fieldSales.accounts.find(item => item.id === 'existing-native-customer').stage, '待拜访');

  const restartedTrip = await jsonRequest('/api/field-sales/trips/start', {
    method: 'POST',
    token: login.body.token,
    body: {
      accountId: 'existing-native-customer',
      locationConsent: true,
      lat: 37.7936,
      lng: -122.3958,
      accuracy: 6
    }
  });
  assert.equal(restartedTrip.status, 201);
  assert.equal(restartedTrip.body.fieldSales.trips[0].status, '前往中');

  const arrivalPhoto = await jsonRequest('/api/field-sales/attachments?objectId=isolated-visit-plan', {
    method: 'POST',
    token: login.body.token,
    body: {
      objectId: 'isolated-visit-plan',
      fileName: 'isolated-arrival.jpg',
      contentType: 'image/jpeg',
      contentBase64: Buffer.from('isolated-arrival-photo').toString('base64')
    }
  });
  assert.equal(arrivalPhoto.status, 201);
  assert(arrivalPhoto.body.url.includes('/customer-media/'));

  const visit = await jsonRequest('/api/field-sales/visits/start', {
    method: 'POST',
    token: login.body.token,
    body: {
      accountId: 'existing-native-customer',
      locationConsent: true,
      lat: 36.1716,
      lng: -115.1391,
      accuracy: 6,
      address: 'Isolated actual check-in location, Las Vegas, NV',
      photoUrl: arrivalPhoto.body.url,
      contactMet: 'Alex'
    }
  });
  assert.equal(visit.status, 201);
  assert.equal(visit.body.visit.status, '进行中');
  assert.equal(visit.body.visit.checkIn.lat, 36.1716);
  assert.equal(visit.body.visit.checkIn.lng, -115.1391);
  assert.equal(visit.body.visit.checkIn.locationMatched, false);
  assert(visit.body.visit.checkIn.distanceToAccountMeters > 500000);
  assert(visit.body.visit.checkIn.address);
  assert(visit.body.visit.checkIn.mapUrl.includes('36.1716'));
  assert.equal(visit.body.fieldSales.checkInAttempts.length, 0);
  assert.equal(visit.body.fieldSales.visitPlans.find(item => item.id === 'isolated-visit-plan').status, '拜访中');

  const audio = await jsonRequest('/api/field-sales/attachments?objectId=isolated-visit-plan', {
    method: 'POST',
    token: login.body.token,
    body: {
      objectId: 'isolated-visit-plan',
      fileName: 'isolated-meeting.m4a',
      contentType: 'audio/mp4',
      contentBase64: Buffer.from('isolated-audio-segment').toString('base64')
    }
  });
  assert.equal(audio.status, 201);
  const meetingArtifactPayload = {
    kind: 'meeting',
    customerName: 'San Francisco Isolated Tint Shop',
    createdAt: new Date().toISOString(),
    values: {
      transcript: 'Customer asked about heat rejection and delivery timing.',
      analysis: 'Customer intent is strong. Send the approved quote and follow up tomorrow.'
    },
    products: []
  };
  const meetingArtifact = await jsonRequest('/api/field-sales/attachments?objectId=isolated-visit-plan', {
    method: 'POST',
    token: login.body.token,
    body: {
      objectId: 'isolated-visit-plan',
      fileName: 'isolated-meeting-summary.json',
      contentType: 'application/json',
      contentBase64: Buffer.from(JSON.stringify(meetingArtifactPayload)).toString('base64')
    }
  });
  assert.equal(meetingArtifact.status, 201);
  const evidence = await jsonRequest('/api/field-sales/attachments?objectId=isolated-visit-plan', { token: login.body.token });
  assert.equal(evidence.status, 200);
  assert.equal(evidence.body.items.length, 3);
  const savedMeeting = evidence.body.items.find(item => item.attachmentId === meetingArtifact.body.attachmentId);
  assert.equal(savedMeeting.artifactKind, 'meeting');
  assert.equal(savedMeeting.accountId, 'existing-native-customer');
  assert.equal(savedMeeting.customerName, 'San Francisco Isolated Tint Shop');
  assert(savedMeeting.transcript.includes('heat rejection'));
  assert(savedMeeting.analysis.includes('intent is strong'));

  const fieldOrder = await jsonRequest('/api/field-sales/orders', {
    method: 'POST',
    token: login.body.token,
    body: {
      accountId: 'existing-native-customer',
      visitId: visit.body.visit.id,
      items: [{ sku: 'ISOLATED-FILM-001', name: 'Isolated Ceramic Film', quantity: 2, unitPrice: 325 }],
      amountPaid: 200,
      paymentMethod: 'isolated test',
      deliveryMethod: 'isolated pickup'
    }
  });
  assert.equal(fieldOrder.status, 201);
  const savedFieldOrder = fieldOrder.body.fieldSales.fieldOrders.find(item => item.accountId === 'existing-native-customer');
  assert(savedFieldOrder);
  assert.equal(savedFieldOrder.total, 650);
  assert.equal(savedFieldOrder.amountDue, 450);

  const completedVisit = await jsonRequest(`/api/field-sales/visits/${visit.body.visit.id}/complete`, {
    method: 'PUT',
    token: login.body.token,
    body: { reportText: 'Isolated end-to-end visit completed', outcome: '继续跟进', nextAction: 'Call tomorrow' }
  });
  assert.equal(completedVisit.status, 200);
  assert.equal(completedVisit.body.fieldSales.visits[0].status, '已完成');
  assert.equal(completedVisit.body.fieldSales.visitPlans.find(item => item.id === 'isolated-visit-plan').status, '已完成');

  const dailyReport = await jsonRequest('/api/field-sales/daily-reports', {
    method: 'POST',
    token: login.body.token,
    body: { summary: 'Isolated native field-sales daily report', date: completedVisit.body.fieldSales.dailyReports[0].date }
  });
  assert.equal(dailyReport.status, 201);
  assert.equal(dailyReport.body.fieldSales.dailyReports[0].summary, 'Isolated native field-sales daily report');

  const futureDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const planned = await jsonRequest('/api/field-sales/visit-plans', {
    method: 'POST',
    token: login.body.token,
    body: { accountIds: [saved.id], date: futureDate, startMinutes: 600, stayMinutes: 45, note: 'isolated future plan' }
  });
  assert.equal(planned.status, 201);
  const createdPlan = planned.body.fieldSales.visitPlans.find(item => item.accountId === saved.id);
  assert(createdPlan);
  const deletedPlan = await jsonRequest(`/api/field-sales/visit-plans/${createdPlan.id}`, {
    method: 'DELETE',
    token: login.body.token
  });
  assert.equal(deletedPlan.status, 200);
  assert.equal(deletedPlan.body.status, 'DELETED');
  const managerLogin = await jsonRequest('/api/login', {
    method: 'POST',
    body: { email: 'native-manager@test.local', password: 'isolated-manager-password' }
  });
  assert.equal(managerLogin.status, 200);
  const managerPlanned = await jsonRequest('/api/field-sales/visit-plans', {
    method: 'POST',
    token: managerLogin.body.token,
    body: { accountIds: [saved.id], date: futureDate, startMinutes: 660, stayMinutes: 30, note: 'manager assigned isolated plan' }
  });
  assert.equal(managerPlanned.status, 201);
  const managerCreatedPlan = managerPlanned.body.fieldSales.visitPlans.find(item => item.note === 'manager assigned isolated plan');
  assert(managerCreatedPlan);
  assert.equal(managerCreatedPlan.userId, 'native-sales-user');
  assert.equal(managerCreatedPlan.assignedUserId, 'native-sales-user');
  assert.equal(managerCreatedPlan.createdByUserId, 'native-manager-user');
  const salespersonRefresh = await jsonRequest('/api/mobile/bootstrap', { token: login.body.token });
  assert.equal(salespersonRefresh.status, 200);
  assert(salespersonRefresh.body.fieldSales.visitPlans.some(item => item.id === managerCreatedPlan.id));
  const managerDeleteCustomer = await jsonRequest(`/api/field-sales/accounts/${saved.id}`, {
    method: 'DELETE',
    token: managerLogin.body.token
  });
  assert.equal(managerDeleteCustomer.status, 403);
  assert.equal(managerDeleteCustomer.body.code, 'FIELD_SALES_ACCOUNT_DELETE_FORBIDDEN');
  const ownerLogin = await jsonRequest('/api/login', {
    method: 'POST',
    body: { email: 'native-owner@test.local', password: 'isolated-owner-password' }
  });
  assert.equal(ownerLogin.status, 200);
  const ownerDeletedCustomer = await jsonRequest(`/api/field-sales/accounts/${saved.id}`, {
    method: 'DELETE',
    token: ownerLogin.body.token
  });
  assert.equal(ownerDeletedCustomer.status, 200);
  assert.equal(ownerDeletedCustomer.body.deleted, true);
  assert(!ownerDeletedCustomer.body.fieldSales.accounts.some(item => item.id === saved.id));
  assert.equal(ownerDeletedCustomer.body.fieldSales.visitPlans.find(item => item.id === managerCreatedPlan.id).status, '已取消');
  const afterOwnerDelete = await jsonRequest('/api/mobile/bootstrap', { token: login.body.token });
  assert(!afterOwnerDelete.body.fieldSales.accounts.some(item => item.id === saved.id));
  console.log('Native QUaD login, customer, planning, trip recovery, visit evidence, recording attachment, attendance, route and internal messaging isolated regression passed.');
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  await stopServer();
  await stopAiServer();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});
