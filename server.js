const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { AccessToken } = require('livekit-server-sdk');
const execFileAsync = promisify(execFile);

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const CUSTOMER_MEDIA_DIR = path.join(DATA_DIR, 'customer-media');
const MEDIA_UPLOAD_PARTS_DIR = path.join(DATA_DIR, 'media-upload-parts');
const SESSION_SECRET_FILE = path.join(DATA_DIR, 'session-secret');
const CONFIG_FILE = path.join(ROOT, 'server-config.json');
const VERSION_FILE = path.join(ROOT, 'version.json');
const MAX_MESSAGE_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_AVATAR_DATA_URL_BYTES = 2 * 1024 * 1024;
const MAX_CUSTOMER_VIDEO_SOURCE_BYTES = 200 * 1024 * 1024;
const MAX_CLOUD_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_CLOUD_FILE_BYTES = 20 * 1024 * 1024;
const MAX_CLOUD_VIDEO_SECONDS = 5 * 60;
const MAX_INTERNAL_MESSAGE_VIDEO_SECONDS = 30;
const INTERNAL_MESSAGE_VIDEO_RETENTION_MS = 5 * 24 * 60 * 60 * 1000;
const MAX_TWILIO_IMAGE_BYTES = 4.5 * 1024 * 1024;
const MEDIA_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
const CUSTOM_PRINTED_FILM_SKU = 'CUSTOM-PRINTED-FILM';
const sessions = new Map();
const eventClients = new Set();
const warrantyLookupAttempts = new Map();

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.icns': 'image/icns',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function id() {
  return crypto.randomBytes(8).toString('hex');
}

function readConfig() {
  const defaults = {
    port: 4318,
    host: '0.0.0.0',
    publicUrl: '',
    update: {
      channel: 'stable',
      checkUrl: '',
      allowRemoteUpgrade: false
    }
  };
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaults, null, 2));
      return defaults;
    }
    return { ...defaults, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {
    return defaults;
  }
}

function readVersion() {
  const defaults = {
    appName: '美国贴膜店管理系统',
    version: '1.0.0',
    build: '2026.06.23.1',
    channel: 'stable',
    minimumDataVersion: 1,
    dataVersion: 1
  };
  try {
    if (!fs.existsSync(VERSION_FILE)) {
      fs.writeFileSync(VERSION_FILE, JSON.stringify(defaults, null, 2));
      return defaults;
    }
    return { ...defaults, ...JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')) };
  } catch {
    return defaults;
  }
}

const config = readConfig();
const version = readVersion();
const PORT = Number(process.env.PORT || config.port || 4318);
const HOST = String(process.env.HOST || config.host || '0.0.0.0');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(test));
}

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function readSessionSecret() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (process.env.SESSION_SECRET) return String(process.env.SESSION_SECRET);
  if (!fs.existsSync(SESSION_SECRET_FILE)) {
    fs.writeFileSync(SESSION_SECRET_FILE, crypto.randomBytes(32).toString('hex'));
  }
  return fs.readFileSync(SESSION_SECRET_FILE, 'utf8').trim();
}

function signSessionPayload(payload) {
  return crypto.createHmac('sha256', readSessionSecret()).update(payload).digest('base64url');
}

function createSessionToken(user) {
  const payload = base64Url(JSON.stringify({
    userId: user.id,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    passwordVersion: crypto.createHash('sha256').update(String(user.passwordHash || '')).digest('hex').slice(0, 16)
  }));
  return `v1.${payload}.${signSessionPayload(payload)}`;
}

function verifySessionToken(token, db) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const expected = signSessionPayload(parts[1]);
  if (!crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected))) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload.expiresAt || Date.now() > payload.expiresAt) return null;
  const user = db.users.find(u => u.id === payload.userId && u.active);
  if (!user) return null;
  const passwordVersion = crypto.createHash('sha256').update(String(user.passwordHash || '')).digest('hex').slice(0, 16);
  if (payload.passwordVersion !== passwordVersion) return null;
  return user;
}

function createCustomerSessionToken(customer) {
  const payload = base64Url(JSON.stringify({ customerId: customer.id, issuedAt: Date.now(), expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, passwordVersion: crypto.createHash('sha256').update(String(customer.passwordHash || '')).digest('hex').slice(0, 16) }));
  return `c1.${payload}.${signSessionPayload(payload)}`;
}

function currentPortalCustomer(req, db) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'c1') return null;
  const expected = signSessionPayload(parts[1]);
  if (parts[2].length !== expected.length || !crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected))) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
  if (!payload.expiresAt || Date.now() > payload.expiresAt) return null;
  const customer = (db.portalCustomers || []).find(item => item.id === payload.customerId && item.active !== false);
  if (!customer) return null;
  const version = crypto.createHash('sha256').update(String(customer.passwordHash || '')).digest('hex').slice(0, 16);
  return payload.passwordVersion === version ? customer : null;
}

function safePortalCustomer(customer) {
  const { passwordHash, ...safe } = customer || {};
  return safe;
}

function syncSalesOrderCustomer(db, order) {
  const businessName = String(order.customer || '').trim().slice(0, 160);
  if (!businessName) return null;
  const contact = String(order.customerContact || '').trim().slice(0, 500);
  const email = String(contact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '').toLowerCase();
  const phoneText = contact.replace(email, '').replace(/^[\s,;|/·-]+|[\s,;|/·-]+$/g, '');
  const phone = normalizePhone(phoneText).length >= 7 ? phoneText.slice(0, 80) : '';
  const phoneKey = normalizedPhone(phone);
  const nameKey = businessName.toLowerCase();
  let customer = (db.portalCustomers || []).find(item => item.id === order.portalCustomerId);
  if (!customer && email) customer = db.portalCustomers.find(item => String(item.email || '').trim().toLowerCase() === email);
  if (!customer && phoneKey) customer = db.portalCustomers.find(item => normalizedPhone(item.phone) === phoneKey);
  if (!customer) customer = db.portalCustomers.find(item => String(item.businessName || '').trim().toLowerCase() === nameKey);
  const now = new Date().toISOString();
  if (!customer) {
    customer = {
      id: id(), businessName, contactName: businessName,
      account: email || phoneKey || `order-${order.id}`,
      email, phone, address: String(order.customerAddress || '').trim().slice(0, 500),
      salesRep: String(order.salesRep || '').trim().slice(0, 120), status: '正常',
      note: '由零售/批发订单自动同步', active: true, prices: {},
      passwordHash: hashPassword(crypto.randomBytes(32).toString('hex')),
      createdAt: now, updatedAt: now, syncedFromSalesOrder: true
    };
    db.portalCustomers.push(customer);
  } else {
    customer.businessName = businessName;
    if (email) customer.email = email;
    if (phone) customer.phone = phone;
    if (order.customerAddress) customer.address = String(order.customerAddress).trim().slice(0, 500);
    if (order.salesRep) customer.salesRep = String(order.salesRep).trim().slice(0, 120);
    customer.updatedAt = now;
  }
  order.portalCustomerId = customer.id;
  return customer;
}

function portalProductForCustomer(db, product, customer) {
  const hasAgreedPrice = Object.prototype.hasOwnProperty.call(customer?.prices || {}, product.sku);
  const previousLine = hasAgreedPrice ? null : (db.salesOrders || []).filter(order => order.portalCustomerId === customer.id || (!order.portalCustomerId && String(order.customer || '').trim().toLowerCase() === String(customer.businessName || '').trim().toLowerCase())).sort((a, b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || ''))).flatMap(salesOrderItems).find(line => line.item === product.sku);
  const agreed = Number(hasAgreedPrice ? customer.prices[product.sku] : previousLine?.unitPrice);
  return { sku: product.sku, name: product.name, category: product.category, unit: product.unit, availability: Number(product.qty || 0) <= 0 ? '需预订' : Number(product.reorder || 0) > 0 && Number(product.qty || 0) <= Number(product.reorder || 0) ? '库存紧张' : '有货', price: Number.isFinite(agreed) ? agreed : null, description: String(product.portalDescription || ''), imageUrl: String(product.portalImageUrl || ''), videoUrl: String(product.portalVideoUrl || ''), isNew: Boolean(product.portalNewProduct) };
}

function portalCustomerSnapshot(db, customer) {
  return { customer: safePortalCustomer(customer), products: (db.products || []).filter(product => product.portalVisible !== false).map(product => portalProductForCustomer(db, product, customer)), orders: (db.salesOrders || []).filter(order => order.portalCustomerId === customer.id).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).map(order => ({ id: order.id, date: order.date, status: order.status, items: salesOrderItems(order), customerDemand: order.customerDemand || '', shipping: order.shipping || '', trackingNo: order.trackingNo || '', paid: Number(order.paid || 0), paymentMethod: order.paymentMethod || '', createdAt: order.createdAt, portalMessages: order.portalMessages || [], attachments: order.portalAttachments || [] })) };
}

function seedDb() {
  return {
    settings: {
      shopName: 'Tint & Wrap Shop',
      taxRate: 8.38,
      monthlyFixedCost: 29000,
      timezone: 'America/Los_Angeles',
      officeAddress: '3359 W Oquendo Rd, Las Vegas, NV 89118',
      officeLat: 36.0824712,
      officeLng: -115.1850945,
      clockRadiusMeters: 150,
      callForwardEnabled: false,
      callForwardNumber: ''
    },
    users: [
      { id: id(), name: '老板账号', email: 'admin@filmshop.local', role: 'owner', passwordHash: hashPassword('admin123'), active: true }
    ],
    installers: [
      { id: id(), name: 'Angel Gonzales', city: 'Las Vegas', phone: '1 909 803 4021', skills: '改色膜, 高端车, 项目管理', mode: 'percent', tint: 25, ppf: 25, wrap: 25, ceramic: 20, base: 0, active: true },
      { id: id(), name: 'Maria', city: 'Vegas', phone: '7028330718', skills: 'PPF, 窗膜', mode: 'percent', tint: 25, ppf: 25, wrap: 25, ceramic: 20, base: 0, active: true },
      { id: id(), name: '高级全职师傅', city: 'Vegas / California', phone: '微信', skills: 'TPU车衣, 窗膜, 改色', mode: 'basePlus', tint: 100, ppf: 400, wrap: 400, ceramic: 120, base: 6000, active: true }
    ],
    products: [
      { id: id(), sku: 'CW-TC881', name: 'CW-TC881 基膜', category: '窗膜卷料', unit: 'm', cost: 1, price: 4, wholesale: 3, qty: 16000, reorder: 3000, location: '仓库A' },
      { id: id(), sku: 'CW-TC8870', name: 'CW-TC8870 基膜', category: '窗膜卷料', unit: 'm', cost: 1, price: 4, wholesale: 3, qty: 40000, reorder: 3000, location: '仓库A' },
      { id: id(), sku: 'WRAP-BASIC', name: '基本款改色膜', category: '改色膜', unit: 'roll', cost: 520, price: 900, wholesale: 760, qty: 12, reorder: 4, location: '展示仓' },
      { id: id(), sku: 'PPF-PRO', name: '豪华款TPU车衣', category: 'TPU车衣', unit: 'roll', cost: 980, price: 1600, wholesale: 1380, qty: 9, reorder: 3, location: '展示仓' }
    ],
    priceRules: [
      { id: id(), service: 'tint', vehicleClass: '小型轿车', package: '基本款', base: 299, materialCost: 45, hours: 2.5 },
      { id: id(), service: 'tint', vehicleClass: '中型SUV', package: '热门款', base: 499, materialCost: 70, hours: 3 },
      { id: id(), service: 'ppf', vehicleClass: '小型轿车', package: 'Full Front', base: 1899, materialCost: 420, hours: 10 },
      { id: id(), service: 'ppf', vehicleClass: '中型SUV', package: 'Full Body', base: 5999, materialCost: 1150, hours: 28 },
      { id: id(), service: 'wrap', vehicleClass: '小型轿车', package: '基本款', base: 3600, materialCost: 650, hours: 26 },
      { id: id(), service: 'wrap', vehicleClass: '中型SUV', package: '豪华款', base: 8600, materialCost: 1350, hours: 42 }
    ],
    jobs: [
      { id: id(), date: new Date().toISOString().slice(0, 10), customer: 'Walk-in 客户', phone: '(702) 000-0000', vehicle: '2024 Tesla Model Y', vin: '', salesRep: '', service: 'tint', vehicleClass: '中型SUV', package: '热门款', installerId: '', status: '排期', price: 499, materialCost: 70, deposit: 100, notes: '前挡和侧后窗确认透光率' }
    ],
    salesOrders: [
      { id: id(), date: new Date().toISOString().slice(0, 10), type: 'wholesale-us', customer: 'LA Dealer', salesRep: '', preparedBy: 'System', item: 'CW-TC8870', qty: 200, unitPrice: 3, status: '待出库', shipping: 'UPS Freight', paid: 300 }
    ],
    shipments: [],
    schedules: [],
    scheduleReminderLogs: [],
    personalNotes: [],
    aiBossTasks: [],
    aiBossProfiles: [],
    voiceCalls: [],
    reimbursements: [],
    portalCustomers: [],
    warranties: [],
    customerServiceReps: [
      { id: id(), name: '前台客服', role: '前台', invitePay: 20, closePay: 50, active: true }
    ],
    leads: [
      { id: id(), date: new Date().toISOString().slice(0, 10), source: 'Yelp', customer: 'Internet Lead', phone: '(702) 000-0001', service: 'tint', repId: '', status: '已邀约', quote: 399, soldAmount: 0, note: '互联网客资示例' }
    ],
    prospects: [],
    customerConversations: [],
    replyTemplates: [],
    expenses: [
      { id: id(), date: new Date().toISOString().slice(0, 10), category: '房屋租金', vendor: 'Landlord', amount: 10000, recurring: true, note: '月租金' },
      { id: id(), date: new Date().toISOString().slice(0, 10), category: '水电费', vendor: 'Utilities', amount: 1200, recurring: true, note: '水、电、网、电费预估' }
    ],
    movements: [
      { id: id(), date: new Date().toISOString().slice(0, 10), sku: 'CW-TC881', type: 'in', qty: 16000, note: '初始库存' }
    ],
    workshopMovements: [],
    messages: [],
    clockRecords: [],
    leaveRequests: [],
    employeeActivity: [],
    auditLogs: []
  };
}

function ensureDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) writeDb(seedDb());
}

let cachedDb = null;
let cachedDbRevision = '';
let deferredDbWriteTimer = null;

function readDb() {
  ensureDb();
  const revision = databaseRevision();
  if (cachedDb && revision && revision === cachedDbRevision) return cachedDb;
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (!db.settings) db.settings = {};
  if (!db.settings.timezone) db.settings.timezone = 'America/Los_Angeles';
  if (!db.settings.entryTimezone || db.settings.entryTimezone === 'Asia/Shanghai') db.settings.entryTimezone = 'America/Los_Angeles';
  if (!db.settings.officeAddress) db.settings.officeAddress = '3359 W Oquendo Rd, Las Vegas, NV 89118';
  if (!Number.isFinite(Number(db.settings.officeLat))) db.settings.officeLat = 36.0824712;
  if (!Number.isFinite(Number(db.settings.officeLng))) db.settings.officeLng = -115.1850945;
  if (!Number.isFinite(Number(db.settings.clockRadiusMeters))) db.settings.clockRadiusMeters = 150;
  if (typeof db.settings.callForwardEnabled !== 'boolean') db.settings.callForwardEnabled = false;
  if (typeof db.settings.callForwardNumber !== 'string') db.settings.callForwardNumber = '';
  if (!Array.isArray(db.expenses)) db.expenses = [];
  if (!Array.isArray(db.customerServiceReps)) db.customerServiceReps = [];
  if (!Array.isArray(db.leads)) db.leads = [];
  if (!Array.isArray(db.prospects)) db.prospects = [];
  if (!Array.isArray(db.customerConversations)) db.customerConversations = [];
  if (!Array.isArray(db.replyTemplates)) db.replyTemplates = [];
  if (!Array.isArray(db.shipments)) db.shipments = [];
  if (!Array.isArray(db.schedules)) db.schedules = [];
  if (!Array.isArray(db.scheduleReminderLogs)) db.scheduleReminderLogs = [];
  if (!Array.isArray(db.personalNotes)) db.personalNotes = [];
  if (!Array.isArray(db.aiBossTasks)) db.aiBossTasks = [];
  if (!Array.isArray(db.aiBossProfiles)) db.aiBossProfiles = [];
  if (!Array.isArray(db.voiceCalls)) db.voiceCalls = [];
  if (!Array.isArray(db.reimbursements)) db.reimbursements = [];
  if (!Array.isArray(db.portalCustomers)) db.portalCustomers = [];
  if (!Array.isArray(db.warranties)) db.warranties = [];
  if (!Array.isArray(db.messages)) db.messages = [];
  if (!Array.isArray(db.clockRecords)) db.clockRecords = [];
  if (!Array.isArray(db.leaveRequests)) db.leaveRequests = [];
  if (!Array.isArray(db.employeeActivity)) db.employeeActivity = [];
  if (!Array.isArray(db.workshopMovements)) db.workshopMovements = [];
  cachedDb = db;
  cachedDbRevision = revision;
  return db;
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  cachedDb = db;
  cachedDbRevision = databaseRevision();
}

function scheduleDbWrite(db, delayMs = 10000) {
  if (deferredDbWriteTimer) clearTimeout(deferredDbWriteTimer);
  deferredDbWriteTimer = setTimeout(() => {
    deferredDbWriteTimer = null;
    try { writeDb(db); } catch (error) { console.error('Deferred database write failed:', error); }
  }, delayMs);
}

function databaseRevision() {
  try {
    const stat = fs.statSync(DB_FILE);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return '';
  }
}

function backupFileName(kind, dateValue = new Date().toISOString().slice(0, 10)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return kind === 'daily' ? `daily-${dateValue}.json` : `manual-${stamp}.json`;
}

function backupPath(fileName) {
  return path.join(BACKUP_DIR, path.basename(fileName));
}

function listBackups() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  return fs.readdirSync(BACKUP_DIR)
    .filter(name => name.endsWith('.json'))
    .map(name => {
      const filePath = backupPath(name);
      const stat = fs.statSync(filePath);
      return {
        name,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
        type: name.startsWith('daily-') ? 'daily' : name.startsWith('manual-') ? 'manual' : 'system'
      };
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function pruneDailyBackups(keepDays = 60) {
  const daily = listBackups().filter(item => item.name.startsWith('daily-')).sort((a, b) => String(b.name).localeCompare(String(a.name)));
  daily.slice(keepDays).forEach(item => {
    try { fs.unlinkSync(backupPath(item.name)); } catch {}
  });
}

function createDatabaseBackup(db, kind = 'manual', actor = { id: 'system', name: 'System' }) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const dateValue = dateInTimezone(db.settings?.timezone || 'America/Los_Angeles', 0);
  const fileName = backupFileName(kind, dateValue);
  const filePath = backupPath(fileName);
  if (kind === 'daily' && fs.existsSync(filePath)) return { fileName, created: false };
  fs.writeFileSync(filePath, JSON.stringify(db, null, 2));
  if (kind !== 'daily') {
    audit(db, actor, 'create-backup', {
      collection: 'backups',
      recordId: fileName,
      recordLabel: fileName,
      detail: `创建数据库备份 ${fileName}`
    });
    writeDb(db);
  }
  pruneDailyBackups();
  return { fileName, created: true };
}

function applyStartupPasswordReset() {
  const resetPassword = process.env.RESET_ADMIN_PASSWORD;
  const resetNewEmail = process.env.RESET_ADMIN_NEW_EMAIL;
  if (!resetPassword && !resetNewEmail) return;
  const resetEmail = String(process.env.RESET_ADMIN_EMAIL || 'admin@filmshop.local').toLowerCase();
  if (resetPassword && String(resetPassword).length < 8) {
    console.warn('RESET_ADMIN_PASSWORD was ignored because it is shorter than 8 characters.');
    return;
  }
  const db = readDb();
  const admin = db.users.find(u => String(u.email || '').toLowerCase() === resetEmail) || db.users.find(u => u.role === 'owner');
  if (!admin) {
    console.warn('Admin reset was ignored because no owner account was found.');
    return;
  }
  if (resetNewEmail) {
    const nextEmail = String(resetNewEmail).trim().toLowerCase();
    const duplicate = db.users.find(u => u.id !== admin.id && String(u.email || '').toLowerCase() === nextEmail);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail) && !duplicate) admin.email = nextEmail;
  }
  if (resetPassword) admin.passwordHash = hashPassword(resetPassword);
  audit(db, admin, 'startup-admin-reset', `Reset owner account from environment variable`);
  writeDb(db);
  console.log(`Owner account reset applied for ${admin.email}. Remove RESET_ADMIN_* variables after confirming login.`);
}

function applyProvisionedManager() {
  const email = String(process.env.PROVISION_MANAGER_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.PROVISION_MANAGER_PASSWORD || '');
  const name = String(process.env.PROVISION_MANAGER_NAME || 'Mona').trim() || 'Mona';
  if (!email && !password) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.warn('PROVISION_MANAGER_EMAIL was ignored because the email is invalid.');
    return;
  }
  if (password.length < 8) {
    console.warn('PROVISION_MANAGER_PASSWORD was ignored because it is shorter than 8 characters.');
    return;
  }
  const db = readDb();
  let manager = db.users.find(u => String(u.email || '').toLowerCase() === email);
  if (!manager) {
    manager = { id: id(), name, email, role: 'manager', active: true };
    db.users.push(manager);
  }
  const managerPermissions = defaultPermissions('manager');
  if (manager.managerProvisioned && manager.role === 'manager' && manager.permissions?.usersManage === managerPermissions.usersManage) return;
  manager.name = name;
  manager.email = email;
  manager.role = 'manager';
  manager.active = true;
  if (!manager.managerProvisioned) manager.passwordHash = hashPassword(password);
  manager.permissions = { ...managerPermissions, ...(manager.permissions || {}), usersManage: true };
  manager.managerProvisioned = true;
  audit(db, manager, 'provision-manager', `Created or updated manager account ${email}`);
  writeDb(db);
  console.log(`Manager account provisioned for ${email}.`);
}

function applyFormalDataReset() {
  const resetKey = String(process.env.RESET_FORMAL_DATA_KEY || '').trim();
  if (!resetKey) return;
  const db = readDb();
  if (db.formalDataResetKey === resetKey) return;
  const backupDir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupName = `db-before-formal-reset-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(path.join(backupDir, backupName), JSON.stringify(db, null, 2));
  db.settings = {
    ...(db.settings || {}),
    shopName: db.settings?.shopName && db.settings.shopName !== 'Tint & Wrap Shop' ? db.settings.shopName : 'QUAD FILM',
    monthlyFixedCost: 0
  };
  db.installers = [];
  db.products = [];
  db.priceRules = [];
  db.jobs = [];
  db.salesOrders = [];
  db.shipments = [];
  db.schedules = [];
  db.scheduleReminderLogs = [];
  db.customerServiceReps = [];
  db.leads = [];
  db.expenses = [];
  db.movements = [];
  db.messages = [];
  db.clockRecords = [];
  db.leaveRequests = [];
  db.auditLogs = [];
  db.formalDataResetKey = resetKey;
  db.formalDataResetAt = new Date().toISOString();
  db.formalDataResetBackup = backupName;
  writeDb(db);
  console.log(`Formal data reset applied. Backup saved as ${backupName}.`);
}

function applyStaffContactsImport() {
  const importVersion = 'staff-contacts-2026-06-25';
  const db = readDb();
  if (db.staffContactsImportVersion === importVersion) return;
  if (!Array.isArray(db.customerServiceReps)) db.customerServiceReps = [];
  if (!Array.isArray(db.installers)) db.installers = [];
  const upsertByEmailOrPhone = (collection, record) => {
    const email = String(record.email || '').toLowerCase();
    const phone = String(record.phone || '').replace(/\D/g, '');
    let item = collection.find(existing => email && String(existing.email || '').toLowerCase() === email);
    if (!item) item = collection.find(existing => phone && String(existing.phone || '').replace(/\D/g, '') === phone);
    if (!item) {
      item = { id: id() };
      collection.push(item);
    }
    Object.assign(item, record);
    item.active = record.active !== false;
    return item;
  };
  [
    { name: 'Jackson 王子奕', phone: '7252547928', email: 'Jackson@qdautoimage.com', role: '客服/销售', plan: 'couple', invitePay: 0, closePay: 0, arrivalTarget: 20, closeTarget: 50, minCloseAmount: 10000 },
    { name: 'Angelina 章嘉怡', phone: '9159994085', email: 'Angelina@qdautoimage.com', role: '客服/销售', plan: 'couple', invitePay: 0, closePay: 0, arrivalTarget: 20, closeTarget: 50, minCloseAmount: 10000 },
    { name: 'Judy 费雯君', phone: '7028867604', email: 'judyfei@gmail.com', role: '前台客服', plan: 'judy', invitePay: 0, closePay: 0, arrivalTarget: 20, closeTarget: 50, minCloseAmount: 0 },
    { name: 'Bryan 蒋俊', phone: '7253041424', email: 'bryan@quadfilmus.com', role: '客服/销售', plan: 'onlineTier', invitePay: 0, closePay: 0, arrivalTarget: 20, closeTarget: 50, minCloseAmount: 0 }
  ].forEach(rep => upsertByEmailOrPhone(db.customerServiceReps, rep));
  [
    { name: 'D 小龙', city: 'Las Vegas', phone: '7028076213', email: 'biglong888999@gmail.com', skills: '贴膜技师', mode: 'percent', tint: 0, ppf: 0, wrap: 0, ceramic: 0, base: 0 },
    { name: '潘龙', city: 'Las Vegas', phone: '6262336805', email: '', skills: '高级贴膜技师', mode: 'percent', tint: 0, ppf: 0, wrap: 0, ceramic: 0, base: 0 },
    { name: 'Bently 李辉', city: 'Las Vegas', phone: '7253408946', email: 'quadbentley@gmail.com', skills: '贴膜技师', mode: 'percent', tint: 0, ppf: 0, wrap: 0, ceramic: 0, base: 0 }
  ].forEach(installer => upsertByEmailOrPhone(db.installers, installer));
  db.staffContactsImportVersion = importVersion;
  audit(db, { id: 'system', name: 'System' }, 'import-staff-contacts', 'Imported official staff contact list');
  writeDb(db);
  console.log('Official staff contacts imported.');
}

function applyStaffUserAccounts() {
  const importVersion = 'staff-user-accounts-2026-06-25-phone-passwords';
  const db = readDb();
  if (db.staffUserAccountsVersion === importVersion) return;
  const staffAccounts = [
    { name: 'Jackson 王子奕', email: 'Jackson@qdautoimage.com', phone: '7252547928', role: 'frontdesk' },
    { name: 'Angelina 章嘉怡', email: 'Angelina@qdautoimage.com', phone: '9159994085', role: 'frontdesk' },
    { name: 'Judy 费雯君', email: 'judyfei@gmail.com', phone: '7028867604', role: 'frontdesk' },
    { name: 'Bryan 蒋俊', email: 'bryan@quadfilmus.com', phone: '7253041424', role: 'frontdesk' },
    { name: 'D 小龙', email: 'biglong888999@gmail.com', phone: '7028076213', role: 'installer' },
    { name: 'Bently 李辉', email: 'quadbentley@gmail.com', phone: '7253408946', role: 'installer' }
  ];
  staffAccounts.forEach(account => {
    const email = String(account.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    let user = db.users.find(existing => String(existing.email || '').toLowerCase() === email);
    if (!user) {
      user = { id: id() };
      db.users.push(user);
    }
    user.name = account.name;
    user.email = email;
    user.role = account.role;
    user.active = true;
    user.passwordHash = hashPassword(account.phone);
    user.permissions = defaultPermissions(account.role);
  });
  db.staffUserAccountsVersion = importVersion;
  db.staffUserAccountsImportedAt = new Date().toISOString();
  audit(db, { id: 'system', name: 'System' }, 'import-staff-user-accounts', 'Created staff login accounts with phone-number temporary passwords');
  writeDb(db);
  console.log(`Staff login accounts imported: ${staffAccounts.length}.`);
}

function applyShippingCoordinatorAccount() {
  const importVersion = 'shipping-coordinator-xiao-2026-06-26-v1';
  const db = readDb();
  if (db.shippingCoordinatorAccountVersion === importVersion) return;
  const email = 'xiao@qdautoimage.com';
  let user = db.users.find(existing => String(existing.email || '').toLowerCase() === email);
  if (!user) {
    user = { id: id() };
    db.users.push(user);
  }
  const none = Object.fromEntries(Object.keys(defaultPermissions('')).map(key => [key, false]));
  user.name = 'Xiao 中国物流';
  user.email = email;
  user.role = 'warehouse';
  user.active = true;
  user.passwordHash = hashPassword('Xiao@2026');
  user.permissions = { ...none, shipmentsView: true, shipmentsEdit: true };
  db.shippingCoordinatorAccountVersion = importVersion;
  db.shippingCoordinatorAccountImportedAt = new Date().toISOString();
  audit(db, { id: 'system', name: 'System' }, 'provision-shipping-account', `Created shipping coordinator account ${email}`);
  writeDb(db);
  console.log(`Shipping coordinator account provisioned for ${email}.`);
}

function applyCommissionPlansImport() {
  const importVersion = 'commission-plans-2026-06-25-v1';
  const db = readDb();
  if (db.commissionPlansImportVersion === importVersion) return;
  if (!Array.isArray(db.customerServiceReps)) db.customerServiceReps = [];
  const plans = [
    {
      name: 'Bryan 蒋俊',
      role: '店长接待',
      plan: 'managerTier',
      arrivalTarget: 0,
      closeTarget: 50,
      minCloseAmount: 0,
      ruleDetail: '按订单金额X阶梯：X<=1000: $20；1000<X<=2000: $30；2000<X<=3000: $50；3000<X<=4000: $100。',
      note: '到店成交率大于50%；低于30%换人。以实际收款为准。'
    },
    {
      name: 'Mona 王猛',
      role: '杭州运营',
      plan: 'operationTier',
      arrivalTarget: 0,
      closeTarget: 0,
      minCloseAmount: 0,
      ruleDetail: '按订单金额X阶梯：X<=1000: $20；1000<X<=2000: $30；2000<X<=3000: $50；3000<X<=4000: $100；4000<X<=5000: $200。',
      note: '单店每月营业额大于$30,000才计提成，小于$30,000不计提成。'
    },
    {
      name: 'Archer 吴家聪',
      role: '杭州运营',
      plan: 'operationTier',
      arrivalTarget: 0,
      closeTarget: 0,
      minCloseAmount: 0,
      ruleDetail: '按订单金额X阶梯：X<=1000: $20；1000<X<=2000: $30；2000<X<=3000: $50；3000<X<=4000: $100；4000<X<=5000: $200。',
      note: '单店每月营业额大于$30,000才计提成，小于$30,000不计提成。'
    },
    {
      name: 'Judy 费雯君',
      role: '前台',
      plan: 'judy',
      arrivalTarget: 20,
      closeTarget: 50,
      minCloseAmount: 0,
      ruleDetail: '自然到店全程接待贴膜客户，按Angelina/Jackson同阶梯；只卖膜：自己的关系6%，自然到店/电话询问3%。',
      note: '不给线上引流客资。自然到店、自己的关系、客户电话来访主动回访可计。'
    },
    {
      name: 'Angelina 章嘉怡',
      role: '美国销售/客服',
      plan: 'couple',
      arrivalTarget: 20,
      closeTarget: 50,
      minCloseAmount: 0,
      ruleDetail: '按订单金额X阶梯：X<2000: $20；2000<X<=4000: $30；4000<X<=6000: $50；X>6000: $100。',
      note: '毛资到店率大于20%，到店成交率大于50%；次月毛资到店率低于10%或成交率低于30%换人。'
    },
    {
      name: 'Jackson 王子奕',
      role: '美国销售/客服',
      plan: 'couple',
      arrivalTarget: 20,
      closeTarget: 50,
      minCloseAmount: 0,
      ruleDetail: '按订单金额X阶梯：X<2000: $20；2000<X<=4000: $30；4000<X<=6000: $50；X>6000: $100。',
      note: '毛资到店率大于20%，到店成交率大于50%；次月毛资到店率低于10%或成交率低于30%换人。'
    },
    {
      name: 'Vitor',
      role: '美国销售 1099',
      plan: 'salesPercent30',
      arrivalTarget: 0,
      closeTarget: 0,
      minCloseAmount: 0,
      ruleDetail: '产品正价提成30%。',
      note: '特殊价格需公司审批，特殊价格提点解释权归公司所有。'
    },
    {
      name: 'Adrian',
      role: '美国销售/外贸 1099',
      plan: 'salesPercent30',
      arrivalTarget: 0,
      closeTarget: 0,
      minCloseAmount: 0,
      ruleDetail: '美国销售按产品正价提成30%；外贸1099可按产品正价提成20%。',
      note: '特殊价格需公司审批，特殊价格提点解释权归公司所有。'
    },
    {
      name: 'Katy 黎艳',
      role: '力达外贸',
      plan: 'foreignTrade6',
      arrivalTarget: 0,
      closeTarget: 0,
      minCloseAmount: 0,
      ruleDetail: '引荐客户，按已签字分成案提成6%。',
      note: '按已签字分成方案执行。'
    }
  ];
  plans.forEach(plan => {
    let rep = db.customerServiceReps.find(existing => String(existing.name || '').toLowerCase() === String(plan.name || '').toLowerCase());
    if (!rep && plan.name.includes('Bryan')) {
      rep = db.customerServiceReps.find(existing => /bryan|蒋俊/i.test(String(existing.name || '')));
    }
    if (!rep && plan.name.includes('Judy')) {
      rep = db.customerServiceReps.find(existing => /judy|费雯君/i.test(String(existing.name || '')));
    }
    if (!rep) {
      rep = { id: id(), invitePay: 0, closePay: 0 };
      db.customerServiceReps.push(rep);
    }
    Object.assign(rep, plan, { active: true });
  });
  db.commissionPlansImportVersion = importVersion;
  db.commissionPlansImportedAt = new Date().toISOString();
  audit(db, { id: 'system', name: 'System' }, 'import-commission-plans', 'Imported commission plan spreadsheet rules');
  writeDb(db);
  console.log(`Commission plans imported: ${plans.length}.`);
}

function applySabrinaCustomerServiceRep() {
  const importVersion = 'customer-service-sabrina-sun-2026-07-03';
  const db = readDb();
  if (db.sabrinaCustomerServiceRepVersion === importVersion) return;
  if (!Array.isArray(db.customerServiceReps)) db.customerServiceReps = [];
  const email = 'sabrina@qdautoimage.com';
  const user = (db.users || []).find(item =>
    String(item.email || '').toLowerCase() === email ||
    /sabrina|孙佳怡/i.test(String(item.name || ''))
  );
  let rep = db.customerServiceReps.find(item =>
    String(item.email || '').toLowerCase() === email ||
    /sabrina|孙佳怡/i.test(String(item.name || ''))
  );
  if (!rep) {
    rep = { id: id(), invitePay: 0, closePay: 0 };
    db.customerServiceReps.push(rep);
  }
  Object.assign(rep, {
    name: user?.name || 'Sabrina 孙佳怡',
    email,
    role: '文员/客服',
    plan: 'onlineTier',
    arrivalTarget: 20,
    closeTarget: 50,
    minCloseAmount: 0,
    active: true
  });
  db.sabrinaCustomerServiceRepVersion = importVersion;
  db.sabrinaCustomerServiceRepImportedAt = new Date().toISOString();
  audit(db, { id: 'system', name: 'System' }, 'upsert-customer-service-rep', `Added Sabrina 孙佳怡 to customer service rep list`);
  writeDb(db);
  console.log('Sabrina customer service rep added.');
}

function applyInventoryImport() {
  const importFile = path.join(ROOT, 'imports', 'wangmeng-inventory-2026-06-25.json');
  if (!fs.existsSync(importFile)) return;
  const payload = JSON.parse(fs.readFileSync(importFile, 'utf8'));
  const db = readDb();
  if (db.inventoryImportVersion === payload.version) return;
  const backupDir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupName = `db-before-inventory-import-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(path.join(backupDir, backupName), JSON.stringify(db, null, 2));
  db.products = (payload.products || []).map(product => ({
    id: id(),
    sku: String(product.sku || '').trim(),
    name: String(product.name || '').trim(),
    category: String(product.category || 'Inventory').trim(),
    unit: String(product.unit || 'pcs').trim(),
    cost: Number(product.cost || 0),
    price: Number(product.price || 0),
    wholesale: Number(product.wholesale || 0),
    qty: Number(product.qty || 0),
    reorder: Number(product.reorder || 1),
    location: String(product.location || '').trim(),
    spec: String(product.spec || '').trim(),
    sourceRow: product.sourceRow || null
  })).filter(product => product.sku && product.name);
  db.movements = [];
  db.inventoryImportVersion = payload.version;
  db.inventoryImportAt = new Date().toISOString();
  db.inventoryImportSource = `${payload.sourceFile} / ${payload.sourceSheet}`;
  db.inventoryImportBackup = backupName;
  audit(db, { id: 'system', name: 'System' }, 'import-inventory', `Imported ${db.products.length} inventory items from ${payload.sourceFile}`);
  writeDb(db);
  console.log(`Inventory imported: ${db.products.length} items. Backup saved as ${backupName}.`);
}

function applyJobLedgerImport() {
  const importFile = path.join(ROOT, 'imports', 'qd-job-ledger-2026-06-24.json');
  if (!fs.existsSync(importFile)) return;
  const payload = JSON.parse(fs.readFileSync(importFile, 'utf8'));
  const db = readDb();
  if (db.jobLedgerImportVersion === payload.version) return;
  const backupDir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupName = `db-before-job-ledger-import-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(path.join(backupDir, backupName), JSON.stringify(db, null, 2));
  const importedJobs = (payload.jobs || []).map(job => ({
    id: id(),
    date: String(job.date || '').trim(),
    scheduleDate: String(job.scheduleDate || '').trim(),
    customer: String(job.customer || '').trim() || '未填写客户',
    phone: String(job.phone || '').trim(),
    source: String(job.source || '').trim(),
    leadRepId: String(job.leadRepId || '').trim(),
    receptionRepId: String(job.receptionRepId || '').trim(),
    vehicle: String(job.vehicle || '').trim() || '未填写车型',
    vin: String(job.vin || '').trim(),
    salesRep: String(job.salesRep || '').trim(),
    service: ['tint', 'ppf', 'wrap', 'ceramic'].includes(job.service) ? job.service : 'tint',
    vehicleClass: String(job.vehicleClass || '小型轿车').trim(),
    package: String(job.package || '贴膜服务').trim(),
    installerId: String(job.installerId || '').trim(),
    status: String(job.status || '已交车').trim(),
    price: Number(job.price || 0),
    materialCost: Number(job.materialCost || 0),
    deposit: Number(job.deposit || 0),
    notes: String(job.notes || '').trim(),
    sourceSheet: String(job.sourceSheet || '').trim(),
    sourceLedger: String(job.sourceLedger || payload.sourceFile || '').trim()
  })).filter(job => job.date && job.customer);
  db.jobs.push(...importedJobs);
  db.jobLedgerImportVersion = payload.version;
  db.jobLedgerImportAt = new Date().toISOString();
  db.jobLedgerImportSource = payload.sourceFile || '';
  db.jobLedgerImportBackup = backupName;
  audit(db, { id: 'system', name: 'System' }, 'import-job-ledger', `Imported ${importedJobs.length} job ledger rows from ${payload.sourceFile}`);
  writeDb(db);
  console.log(`Job ledger imported: ${importedJobs.length} jobs. Backup saved as ${backupName}.`);
}

function applyJobSalesRepMigration() {
  const migrationVersion = 'job-sales-rep-field-2026-06-25-v1';
  const db = readDb();
  if (db.jobSalesRepMigrationVersion === migrationVersion) return;
  let changed = 0;
  (db.jobs || []).forEach(job => {
    if (String(job.salesRep || '').trim()) return;
    const match = String(job.notes || '').match(/销售员：([^；\n]+)/);
    if (!match) return;
    job.salesRep = match[1].trim();
    changed += 1;
  });
  db.jobSalesRepMigrationVersion = migrationVersion;
  db.jobSalesRepMigrationAt = new Date().toISOString();
  if (changed) audit(db, { id: 'system', name: 'System' }, 'migrate-job-sales-rep', `Filled salesRep on ${changed} jobs from notes`);
  writeDb(db);
  console.log(`Job sales rep migration filled ${changed} jobs.`);
}

function applyJobCommissionPeopleMigration() {
  const migrationVersion = 'job-commission-people-2026-06-26-v1';
  const db = readDb();
  if (db.jobCommissionPeopleMigrationVersion === migrationVersion) return;
  const reps = db.customerServiceReps || [];
  const findRep = value => {
    const text = String(value || '').toLowerCase();
    if (!text) return null;
    return reps.find(rep => {
      const name = String(rep.name || '').toLowerCase();
      return name && (text.includes(name) || name.split(/\s+/).some(part => part && text.includes(part)));
    }) || null;
  };
  let changed = 0;
  (db.jobs || []).forEach(job => {
    const text = `${job.salesRep || ''} ${job.notes || ''}`;
    const rep = findRep(text);
    if (!job.receptionRepId && rep) {
      job.receptionRepId = rep.id;
      changed += 1;
    }
    if (!job.source) {
      job.source = 'Imported Ledger';
      changed += 1;
    }
  });
  db.jobCommissionPeopleMigrationVersion = migrationVersion;
  db.jobCommissionPeopleMigrationAt = new Date().toISOString();
  if (changed) audit(db, { id: 'system', name: 'System' }, 'migrate-job-commission-people', `Filled commission people/source fields on ${changed} job fields`);
  writeDb(db);
  console.log(`Job commission people migration changed ${changed} fields.`);
}

function applySalesOrderSalesRepMigration() {
  const migrationVersion = 'sales-order-sales-rep-2026-06-26-v1';
  const db = readDb();
  if (db.salesOrderSalesRepMigrationVersion === migrationVersion) return;
  let changed = 0;
  (db.salesOrders || []).forEach(order => {
    if (!String(order.salesRep || '').trim()) {
      order.salesRep = String(order.preparedBy || '').trim();
      changed += 1;
    }
    if (!String(order.preparedBy || '').trim()) {
      order.preparedBy = order.salesRep || '';
      changed += 1;
    }
  });
  db.salesOrderSalesRepMigrationVersion = migrationVersion;
  db.salesOrderSalesRepMigrationAt = new Date().toISOString();
  if (changed) audit(db, { id: 'system', name: 'System' }, 'migrate-sales-order-sales-rep', `Filled salesRep/preparedBy on ${changed} sales order fields`);
  writeDb(db);
  console.log(`Sales order sales rep migration changed ${changed} fields.`);
}

function applyCustomPrintedFilmSalesOrderMigration() {
  const migrationVersion = 'custom-printed-film-sales-order-2026-07-07-v1';
  const db = readDb();
  if (db.customPrintedFilmSalesOrderMigrationVersion === migrationVersion) return;
  const existing = (db.salesOrders || []).find(order =>
    order.customPrintedFilmSource === migrationVersion ||
    (
      String(order.item || '') === CUSTOM_PRINTED_FILM_SKU &&
      String(order.date || '') === '2026-07-06' &&
      String(order.customer || '').toLowerCase() === 'ripped' &&
      Number(order.unitPrice || 0) === 2000
    )
  );
  if (!existing) {
    db.salesOrders.push({
      id: id(),
      date: '2026-07-06',
      type: 'retail-us',
      customer: 'Ripped',
      salesRep: 'Adrian',
      preparedBy: 'Bryan 蒋俊',
      item: CUSTOM_PRINTED_FILM_SKU,
      qty: 1,
      unitPrice: 2000,
      status: '已付款',
      shipping: '',
      paid: 2000,
      paymentMethod: 'visa',
      note: '照片台账第一条打勾订单：Custom Roll / 定制喷绘膜；虚拟商品，不扣库存。',
      customPrintedFilm: true,
      customPrintedFilmSource: migrationVersion,
      createdAt: new Date().toISOString()
    });
    audit(db, { id: 'system', name: 'System' }, 'add-custom-printed-film-order', 'Added custom printed film sales order from paper ledger');
  }
  db.customPrintedFilmSalesOrderMigrationVersion = migrationVersion;
  db.customPrintedFilmSalesOrderMigrationAt = new Date().toISOString();
  writeDb(db);
  console.log('Custom printed film sales order migration applied.');
}

function publicDb(db) {
  return {
    ...db,
    users: db.users.map(safeUser)
  };
}

function defaultPermissions(role) {
  const none = {
    jobsView: false,
    jobsCreate: false,
    jobsEdit: false,
    jobsDelete: false,
    pricingView: false,
    pricingEdit: false,
    installerView: false,
    installerPayView: false,
    installerEdit: false,
    inventoryView: false,
    inventoryEdit: false,
    ordersView: false,
    ordersEdit: false,
    shipmentsView: false,
    shipmentsEdit: false,
    schedulesView: false,
    schedulesEdit: false,
    leadsView: false,
    leadsEdit: false,
    prospectsView: false,
    prospectsEdit: false,
    commissionView: false,
    commissionEdit: false,
    expensesView: false,
    expensesEdit: false,
    reimbursementsView: false,
    reimbursementsCreate: false,
    reimbursementsApprove: false,
    reportsView: false,
    fullFinanceView: false,
    usersManage: false,
    settingsEdit: false
  };
  const all = Object.fromEntries(Object.keys(none).map(k => [k, true]));
  const byRole = {
    owner: all,
    manager: all,
    frontdesk: { ...none, jobsView: true, jobsCreate: true, pricingView: true, ordersView: true, ordersEdit: true, shipmentsView: true, schedulesView: true, leadsView: true, leadsEdit: true, prospectsView: true, prospectsEdit: true, reimbursementsView: true, reimbursementsCreate: true },
    sales: { ...none, jobsView: true, jobsCreate: true, pricingView: true, ordersView: true, ordersEdit: true, shipmentsView: true, schedulesView: true, leadsView: true, leadsEdit: true, prospectsView: true, prospectsEdit: true, reimbursementsView: true, reimbursementsCreate: true },
    clerk: { ...none, jobsView: true, jobsCreate: true, jobsEdit: true, pricingView: true, inventoryView: true, ordersView: true, ordersEdit: true, shipmentsView: true, shipmentsEdit: true, schedulesView: true, schedulesEdit: true, leadsView: true, leadsEdit: true, prospectsView: true, prospectsEdit: true, expensesView: true, expensesEdit: true, reimbursementsView: true, reimbursementsCreate: true },
    warehouse: { ...none, inventoryView: true, inventoryEdit: true, ordersView: true, shipmentsView: true, shipmentsEdit: true, schedulesView: true, reimbursementsView: true, reimbursementsCreate: true },
    installer: { ...none, jobsView: true, reimbursementsView: true, reimbursementsCreate: true },
    finance: { ...none, jobsView: true, ordersView: true, shipmentsView: true, schedulesView: true, leadsView: true, prospectsView: true, commissionView: true, reportsView: true, fullFinanceView: true, expensesView: true, expensesEdit: true, reimbursementsView: true, reimbursementsCreate: true, reimbursementsApprove: true, inventoryView: true, settingsEdit: true }
  };
  return byRole[role] || none;
}

function effectivePermissions(user) {
  if (!user) return defaultPermissions('');
  if (user.role === 'owner') return defaultPermissions('owner');
  return { ...defaultPermissions(user.role), ...(user.permissions || {}) };
}

function safeUser(user) {
  const { passwordHash, ...safe } = user;
  safe.permissions = effectivePermissions(user);
  return safe;
}

function normalizeAvatarDataUrl(value) {
  const avatar = String(value || '').trim();
  if (!avatar) return '';
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(avatar)) return null;
  if (Buffer.byteLength(avatar, 'utf8') > MAX_AVATAR_DATA_URL_BYTES) return null;
  return avatar;
}

function personalNoteVisibleTo(item, user) {
  if (!item || !user) return false;
  if (item.ownerUserId === user.id) return true;
  if (item.shareScope === 'all') return true;
  return item.shareScope === 'users' && Array.isArray(item.sharedUserIds) && item.sharedUserIds.includes(user.id);
}

function personalNoteForUser(db, item, user) {
  const owner = (db.users || []).find(row => row.id === item.ownerUserId);
  const creationLog = !owner && !item.ownerName
    ? (db.auditLogs || []).find(row => row.recordId === item.id && row.action === 'create-personal-note')
    : null;
  return {
    ...item,
    shareScope: ['all', 'users'].includes(item.shareScope) ? item.shareScope : 'private',
    sharedUserIds: Array.isArray(item.sharedUserIds) ? item.sharedUserIds : [],
    ownerName: item.ownerName || owner?.name || owner?.email || creationLog?.userName || '已停用员工',
    canEdit: item.ownerUserId === user.id
  };
}

function normalizePersonalNoteSharing(db, user, body, existing = {}) {
  const requested = ['all', 'users'].includes(body.shareScope) ? body.shareScope : 'private';
  const activeIds = new Set((db.users || []).filter(row => row.active !== false && row.id !== user.id).map(row => row.id));
  const sharedUserIds = requested === 'users'
    ? [...new Set(Array.isArray(body.sharedUserIds) ? body.sharedUserIds.map(String).filter(id => activeIds.has(id)) : [])]
    : [];
  return {
    shareScope: requested === 'users' && !sharedUserIds.length ? 'private' : requested,
    sharedUserIds,
    sharedAt: requested === 'private' ? '' : (existing.sharedAt || new Date().toISOString())
  };
}

function sanitizeDbForUser(db, user) {
  const p = effectivePermissions(user);
  const canSeeCosts = user?.role === 'owner';
  const canApproveReimbursements = Boolean(p.reimbursementsApprove);
  return {
    settings: db.settings,
    users: p.usersManage || p.schedulesView || p.reportsView ? db.users.map(safeUser) : [safeUser(user)],
    messageUsers: db.users.filter(item => item.active !== false).map(safeUser),
    messages: messagesForUser(db, user),
    voiceCalls: voiceCallsForUser(db, user),
    personalNotes: (db.personalNotes || []).filter(item => personalNoteVisibleTo(item, user)).map(item => personalNoteForUser(db, item, user)),
    aiBossTasks: aiBossTasksForUser(db, user),
    aiBossProfiles: (db.aiBossProfiles || []).map(profile => ['owner', 'manager'].includes(user.role)
      ? { ...profile }
      : { id: profile.id, userId: profile.userId, userName: profile.userName, department: profile.department, duties: profile.duties, skills: profile.skills, backupUserId: profile.backupUserId, updatedAt: profile.updatedAt }),
    installers: p.installerView || p.jobsView ? db.installers.map(installer => sanitizeInstaller(installer, p)) : [],
    products: p.inventoryView || p.ordersEdit ? sanitizeProducts(db.products, canSeeCosts) : [],
    priceRules: p.pricingView ? db.priceRules.map(rule => canSeeCosts ? rule : { ...rule, materialCost: 0 }) : [],
    jobs: p.jobsView || p.jobsEdit || p.jobsDelete ? db.jobs.map(job => sanitizeJob(job, p, canSeeCosts)) : [],
    salesOrders: p.ordersView ? db.salesOrders.map(order => sanitizeSalesOrder(order, p)) : [],
    portalCustomers: p.ordersView ? (db.portalCustomers || []).map(safePortalCustomer) : [],
    warranties: p.jobsView || p.jobsCreate || p.jobsEdit || p.jobsDelete ? (db.warranties || []) : [],
    shipments: p.shipmentsView ? db.shipments : [],
    schedules: p.schedulesView ? (db.schedules || []) : [],
    scheduleReminderLogs: p.schedulesView ? (db.scheduleReminderLogs || []).slice(0, 200) : [],
    customerServiceReps: p.leadsView ? sanitizeCustomerServiceReps(db.customerServiceReps || [], p) : [],
    leads: p.leadsView ? sanitizeLeads(db.leads || [], p) : [],
    prospects: p.prospectsView ? (db.prospects || []) : [],
    customerConversations: p.prospectsView ? (db.customerConversations || []) : [],
    replyTemplates: p.prospectsView ? (db.replyTemplates || []) : [],
    expenses: p.expensesView || p.fullFinanceView ? (db.expenses || []) : [],
    reimbursements: p.reimbursementsView ? (db.reimbursements || []).filter(item => canApproveReimbursements || item.employeeUserId === user.id) : [],
    movements: p.inventoryView ? db.movements : [],
    workshopMovements: p.inventoryView ? (db.workshopMovements || []) : [],
    auditLogs: p.usersManage || p.reportsView ? db.auditLogs : [],
    employeeActivity: p.usersManage || p.reportsView ? (db.employeeActivity || []) : [],
    permissions: p
  };
}

function messagesForUser(db, user) {
  const userId = user?.id || '';
  return (db.messages || [])
    .filter(message => message.scope === 'group' || message.fromUserId === userId || message.toUserId === userId)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .slice(-500);
}

function voiceCallsForUser(db, user) {
  const userId = user?.id || '';
  return (db.voiceCalls || [])
    .filter(call => call.callerUserId === userId || (call.participantUserIds || []).includes(userId))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 100);
}

function aiBossTasksForUser(db, user) {
  const canSeeAll = user?.role === 'owner' || user?.role === 'manager';
  return (db.aiBossTasks || []).filter(task => canSeeAll
    || task.createdByUserId === user.id
    || task.assigneeUserId === user.id
    || (task.helperUserIds || []).includes(user.id));
}

function unreadMessageCount(db, user) {
  const userId = user?.id || '';
  return (db.messages || []).filter(message => {
    if (message.fromUserId === userId) return false;
    if (message.scope === 'group') return !(message.readByUserIds || []).includes(userId);
    return message.toUserId === userId && !message.readAt;
  }).length;
}

function expireInternalMessageVideos() {
  const db = readDb();
  const cutoff = Date.now() - INTERNAL_MESSAGE_VIDEO_RETENTION_MS;
  const serializedDb = JSON.stringify(db);
  let changed = false;
  for (const message of db.messages || []) {
    const attachment = message?.attachment;
    if (attachment?.kind !== 'video' || attachment.expired || !attachment.url) continue;
    const createdAt = Date.parse(message.createdAt || '');
    if (!Number.isFinite(createdAt) || createdAt > cutoff) continue;
    const url = String(attachment.url);
    const referenceCount = serializedDb.split(url).length - 1;
    if (url.includes('/customer-media/') && referenceCount <= 1) {
      const fileName = path.basename(url.split('?')[0]);
      try { fs.unlinkSync(path.join(CUSTOMER_MEDIA_DIR, fileName)); } catch {}
    }
    message.attachment = {
      kind: 'video',
      name: String(attachment.name || '站内视频'),
      type: String(attachment.type || 'video/mp4'),
      size: Number(attachment.size || 0),
      expired: true,
      expiredAt: new Date().toISOString()
    };
    changed = true;
  }
  if (changed) writeDb(db);
}

function cleanupStaleMediaUploadParts() {
  if (!fs.existsSync(MEDIA_UPLOAD_PARTS_DIR)) return;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const fileName of fs.readdirSync(MEDIA_UPLOAD_PARTS_DIR)) {
    const filePath = path.join(MEDIA_UPLOAD_PARTS_DIR, path.basename(fileName));
    try { if (fs.statSync(filePath).mtimeMs < cutoff) fs.unlinkSync(filePath); } catch {}
  }
}

function mapUrlForLatLng(lat, lng) {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = degrees => degrees * Math.PI / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function reverseGeocode(lat, lng) {
  const timeout = AbortSignal.timeout ? AbortSignal.timeout(4500) : undefined;
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`, {
      headers: {
        'User-Agent': 'QUAD-FILM-Management/1.0 contact@quadfilmus.com',
        Accept: 'application/json'
      },
      signal: timeout
    });
    if (!response.ok) return '';
    const body = await response.json().catch(() => ({}));
    return String(body.display_name || '').trim().slice(0, 300);
  } catch {
    return '';
  }
}

function canApproveLeave(user) {
  const p = effectivePermissions(user);
  return user?.role === 'owner' || user?.role === 'manager' || p.schedulesEdit || p.usersManage;
}

function mobileSnapshot(db, user) {
  const userId = user?.id || '';
  const approver = canApproveLeave(user);
  const permissions = effectivePermissions(user);
  const canApproveReimbursements = Boolean(permissions.reimbursementsApprove);
  return {
    user: safeUser(user),
    users: db.users.filter(item => item.active !== false).map(safeUser),
    messages: messagesForUser(db, user),
    voiceCalls: voiceCallsForUser(db, user),
    unread: unreadMessageCount(db, user),
    canApproveLeave: approver,
    canCreateReimbursements: Boolean(permissions.reimbursementsCreate),
    reimbursements: permissions.reimbursementsView
      ? (db.reimbursements || [])
        .filter(item => canApproveReimbursements || item.employeeUserId === userId)
        .sort((a, b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')))
        .slice(0, 200)
      : [],
    clockRecords: (db.clockRecords || [])
      .filter(item => approver || item.userId === userId)
      .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
      .slice(0, 200),
    leaveRequests: (db.leaveRequests || [])
      .filter(item => approver || item.userId === userId)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 200),
    personalNotes: (db.personalNotes || [])
      .filter(item => personalNoteVisibleTo(item, user))
      .map(item => personalNoteForUser(db, item, user))
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))),
    aiBossTasks: aiBossTasksForUser(db, user)
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))),
    aiBossProfiles: (db.aiBossProfiles || []).map(profile => ({
      id: profile.id, userId: profile.userId, userName: profile.userName,
      department: profile.department, duties: profile.duties, skills: profile.skills,
      backupUserId: profile.backupUserId, updatedAt: profile.updatedAt
    }))
  };
}

function dataUrlAudio(value) {
  const match = String(value || '').match(/^data:([^;,]+)(?:;[^,]*)?;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 12 * 1024 * 1024) return null;
  return { type: match[1], buffer };
}

async function fetchAiJson(url, options, timeoutMs = 45_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let value = {};
    try { value = text ? JSON.parse(text) : {}; } catch { value = { error: { message: text.slice(0, 300) } }; }
    if (!response.ok) throw new Error(value?.error?.message || `AI service returned ${response.status}`);
    return value;
  } finally {
    clearTimeout(timer);
  }
}

function parseAiBossDraft(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = raw.indexOf('{'); const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 没有返回可用的任务草稿');
  return JSON.parse(raw.slice(start, end + 1));
}

function zonedDateTimeToIso(timeZone, dateValue, hour = 17, minute = 0) {
  const [year, month, day] = String(dateValue || '').split('-').map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return '';
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = targetAsUtc;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'America/Los_Angeles', year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
  });
  for (let index = 0; index < 3; index += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(part => [part.type, part.value]));
    const representedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
    candidate += targetAsUtc - representedAsUtc;
  }
  return new Date(candidate).toISOString();
}

function defaultAiBossDueAt(db, now = new Date()) {
  const timezone = db?.settings?.timezone || 'America/Los_Angeles';
  return zonedDateTimeToIso(timezone, dateInTimezone(timezone, 1), 17, 0);
}

function normalizeAiBossDraftDueAt(db, value, now = new Date()) {
  const parsed = parseAiBossDueAt(db, value);
  return Number.isFinite(parsed.getTime()) && parsed.getTime() > now.getTime()
    ? parsed.toISOString()
    : defaultAiBossDueAt(db, now);
}

function parseAiBossDueAt(db, value) {
  const raw = String(value || '').trim();
  const localMatch = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/);
  if (localMatch) return new Date(zonedDateTimeToIso(db?.settings?.timezone || 'America/Los_Angeles', localMatch[1], Number(localMatch[2]), Number(localMatch[3])));
  return new Date(raw);
}

function validFutureAiBossDueAt(db, value, now = new Date()) {
  const parsed = parseAiBossDueAt(db, value);
  return Number.isFinite(parsed.getTime()) && parsed.getTime() > now.getTime() ? parsed.toISOString() : '';
}

function aiBossPrompt(db, sourceText) {
  const people = (db.users || []).filter(row => row.active !== false).map(person => {
    const profile = (db.aiBossProfiles || []).find(row => row.userId === person.id) || {};
    return { id: person.id, name: person.name || person.email, role: person.role, department: profile.department || '', duties: profile.duties || '', skills: profile.skills || '' };
  });
  const timezone = db.settings?.timezone || 'America/Los_Angeles';
  const nowText = new Date().toLocaleString('en-CA', { timeZone:timezone, hour12:false });
  return `你是 QUaD 智能督办中心的任务分析助手。把口语需求整理成一张可确认的任务单。\n当前时间：${nowText}（${timezone}）。任何截止时间必须晚于当前时间，绝对不能返回过去的日期或年份。\n可选员工：${JSON.stringify(people)}\n用户原话：${sourceText}\n只返回 json 对象，字段必须是：title,description,assigneeUserId,dueAt,priority,difficulty,acceptanceCriteria,reason。dueAt 使用 ISO 8601；未提时间、日期不明确或识别出的时间已经过去时，设为明天下午5点（${timezone}）。priority 只能为低、普通、高、紧急；difficulty 为1到10。若用户明确指定人员必须尊重；否则根据职责技能选择最合适的人。`;
}

async function createAiBossDraft(db, sourceText, requestedProvider) {
  const provider = requestedProvider === 'openai' ? 'openai' : requestedProvider === 'deepseek' ? 'deepseek' : (process.env.AI_BOSS_PROVIDER || 'deepseek');
  const prompt = aiBossPrompt(db, sourceText);
  if (provider === 'deepseek') {
    if (!process.env.DEEPSEEK_API_KEY) throw new Error('DeepSeek API Key 尚未配置');
    const value = await fetchAiJson('https://api.deepseek.com/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.2 })
    });
    return { provider, draft: parseAiBossDraft(value?.choices?.[0]?.message?.content) };
  }
  if (!process.env.OPENAI_API_KEY) throw new Error('OpenAI API Key 尚未配置');
  const value = await fetchAiJson('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: process.env.OPENAI_TASK_MODEL || 'gpt-5-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } })
  });
  return { provider, draft: parseAiBossDraft(value?.choices?.[0]?.message?.content) };
}

function sanitizeMessageAttachment(input) {
  if (!input || typeof input !== 'object') return null;
  const kind = String(input.kind || '').trim();
  const allowedKinds = new Set(['image', 'video', 'file', 'audio']);
  if (!allowedKinds.has(kind)) return { error: '附件类型不正确' };
  const name = String(input.name || (kind === 'audio' ? 'voice-message.webm' : 'attachment')).trim().slice(0, 160);
  const type = String(input.type || 'application/octet-stream').trim().slice(0, 120);
  const dataUrl = String(input.dataUrl || '').trim();
  const url = String(input.url || '').trim();
  const size = Number(input.size || 0);
  const storedMediaUrl = url.startsWith('/customer-media/') || /^https?:\/\/[^/]+\/customer-media\/[a-z0-9._-]+$/i.test(url);
  if (!dataUrl.startsWith('data:') && !storedMediaUrl) return { error: '附件内容格式不正确' };
  if (!Number.isFinite(size) || size <= 0) return { error: '附件大小不正确' };
  if (size > (kind === 'video' ? MAX_CUSTOMER_VIDEO_SOURCE_BYTES : MAX_MESSAGE_ATTACHMENT_BYTES)) return { error: kind === 'video' ? '视频不能超过 200MB' : '附件不能超过 20MB' };
  if (dataUrl && dataUrl.length > 12_000_000) return { error: '附件内容太大' };
  if (kind === 'image' && !type.startsWith('image/')) return { error: '请选择图片文件' };
  if (kind === 'video' && !type.startsWith('video/')) return { error: '请选择视频文件' };
  if (kind === 'audio' && !type.startsWith('audio/')) return { error: '语音文件格式不正确' };
  return { kind, name, type, size, ...(dataUrl ? { dataUrl } : {}), ...(url ? { url } : {}) };
}

function sanitizeCustomerServiceReps(reps, p) {
  if (p.commissionView || p.fullFinanceView) return reps;
  return reps.map(rep => ({ ...rep, invitePay: 0, closePay: 0, minCloseAmount: 0 }));
}

function sanitizeLeads(leads, p) {
  if (p.commissionView || p.fullFinanceView) return leads;
  return leads.map(lead => ({ ...lead, soldAmount: 0, commissionBase: 0 }));
}

function sanitizeInstaller(installer, p) {
  if (p.installerPayView || p.fullFinanceView) return installer;
  return { ...installer, mode: 'hidden', tint: 0, ppf: 0, wrap: 0, ceramic: 0, base: 0 };
}

function sanitizeProducts(products, canSeeCosts) {
  if (canSeeCosts) return products;
  return products.map(product => ({ ...product, cost: 0 }));
}

function sanitizeJob(job, p, canSeeCosts) {
  if (canSeeCosts) return job;
  return { ...job, materialCost: 0 };
}

function normalizeJobServices(job) {
  job.scheduleDate = String(job.scheduleDate || '').trim();
  const allowed = new Set(['tint', 'ppf', 'wrap', 'ceramic']);
  const raw = Array.isArray(job.services) ? job.services : String(job.services || job.service || '').split(',');
  const services = [...new Set(raw.map(value => String(value || '').trim()).filter(value => allowed.has(value)))];
  job.services = services.length ? services : ['tint'];
  job.service = job.services[0];
  const installerIds = Array.isArray(job.installerIds)
    ? job.installerIds
    : String(job.installerIds || job.installerId || '').split(',');
  job.installerIds = [...new Set(installerIds.map(value => String(value || '').trim()).filter(Boolean))];
  job.installerId = job.installerIds[0] || '';
}

function normalizeExpense(expense) {
  expense.adPlacement = String(expense.adPlacement || '').trim();
  expense.adStartDate = String(expense.adStartDate || '').trim();
  expense.adEndDate = String(expense.adEndDate || '').trim();
}

function normalizeReimbursement(item) {
  item.date = String(item.expenseDate || item.date || '').trim().slice(0, 10);
  item.expenseDate = item.date;
  item.category = String(item.category || '').trim().slice(0, 80);
  item.vendor = String(item.vendor || '').trim().slice(0, 120);
  item.purpose = String(item.purpose || '').trim().slice(0, 500);
  item.paymentMethod = String(item.paymentMethod || '').trim().slice(0, 60);
  item.notes = String(item.notes || '').trim().slice(0, 2000);
  item.amount = Math.round(Number(item.amount || 0) * 100) / 100;
  item.attachments = (Array.isArray(item.attachments) ? item.attachments : [])
    .filter(file => String(file?.url || '').includes('/customer-media/'))
    .slice(0, 10)
    .map(file => ({
      url: String(file.url),
      name: String(file.name || '报销凭证').slice(0, 160),
      type: String(file.type || 'application/octet-stream').slice(0, 100)
    }));
}

function validateReimbursement(item) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(item.date || ''))) return '请选择实际消费日期';
  if (!item.category) return '请选择报销类别';
  if (!item.purpose) return '请填写费用用途';
  if (!Number.isFinite(item.amount) || item.amount <= 0) return '报销金额必须大于 0';
  if (!item.attachments.length && !item.notes) return '请上传小票/凭证；如果没有小票，请在备注中说明原因';
  return '';
}

function reimbursementNumber() {
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `ER-${day}-${String(id()).replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}`;
}

function minimumSalePrice(product) {
  return Number(product?.minPrice || product?.wholesale || 0);
}

function isCustomPrintedFilmSku(sku) {
  return [CUSTOM_PRINTED_FILM_SKU, 'CUSTOM-CUSTOMER-REQUEST'].includes(String(sku || ''));
}

function salesOrderItems(order) {
  const source = Array.isArray(order?.items) && order.items.length
    ? order.items
    : [{ item: order?.item, qty: order?.qty, unitPrice: order?.unitPrice }];
  return source.map(line => ({
    item: String(line?.item || line?.sku || '').trim(),
    qty: Number(line?.qty || 0),
    unitPrice: Number(line?.unitPrice || 0)
  })).filter(line => line.item);
}

function validateSalesOrder(db, order) {
  const items = salesOrderItems(order).slice(0, 50).map(line => ({ ...line, item: line.item.slice(0, 160) }));
  if (!items.length) return '请至少添加一种商品';
  if (new Set(items.map(line => line.item)).size !== items.length) return '同一个 SKU 请合并为一行填写';
  for (const line of items) {
    const product = db.products.find(product => product.sku === line.item);
    if (!product && !isCustomPrintedFilmSku(line.item)) return `找不到商品 ${line.item}，不能保存订单`;
    if (!Number.isFinite(line.qty) || line.qty <= 0) return `${line.item} 数量必须大于 0`;
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) return `${line.item} 单价不正确`;
    const minPrice = minimumSalePrice(product);
    if (minPrice > 0 && line.unitPrice < minPrice) {
      return `${product.sku} 最低售价是 $${minPrice}，当前单价 $${line.unitPrice} 低于最低售价，不能保存订单`;
    }
  }
  order.items = items;
  order.item = items[0].item;
  order.qty = items[0].qty;
  order.unitPrice = items[0].unitPrice;
  return '';
}

function validateEntryDate(db, item, collection) {
  const restricted = new Set(['jobs', 'salesOrders', 'movements', 'workshopMovements', 'leads']);
  if (!restricted.has(collection)) return '';
  const value = String(item.date || '').slice(0, 10);
  if (!value) return '日期不能为空';
  const todayValue = dateInTimezone(db.settings?.entryTimezone || db.settings?.timezone || 'America/Los_Angeles', 0);
  if (value < todayValue) return `不能补录过去日期。今天是 ${todayValue}，不允许录入 ${value} 的单据`;
  if (collection === 'jobs') return '';
  if (value > todayValue) return `不能录入未来日期。今天是 ${todayValue}，不允许录入 ${value} 的单据`;
  return '';
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function prospectTextKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function prospectIdentityKey(item) {
  const externalId = prospectTextKey(item.externalId || item.conversationId || item.profileUrl);
  if (externalId) return `external:${prospectTextKey(item.source)}:${externalId}`;
  const phone = normalizePhone(item.phone);
  if (phone && phone.length >= 7) return `phone:${phone}`;
  const source = prospectTextKey(item.source);
  const customer = prospectTextKey(item.customer);
  const vehicle = prospectTextKey(item.vehicle || item.need);
  if (source && customer && vehicle) return `soft:${source}:${customer}:${vehicle}`;
  if (source && customer) return `soft:${source}:${customer}`;
  return '';
}

function parseMaybeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  const text = value.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const PROSPECT_SHOP_SPEAKERS = [
  'shop', 'store', 'us', 'we', 'our', 'ours', 'agent', 'business', 'staff', 'employee',
  'owner', 'admin', 'seller', 'sales', 'me', 'mine',
  'quad', 'quad film', 'quadfilm', 'quad films', 'qd', 'qd auto', 'qd auto image',
  'qdautoimage', 'qdautoimage.com', 'quadfilmus', 'quadfilmus.com',
  '客服', '我们', '店铺', '店里', '商家', '销售', '前台', '店员', '业务员'
];

const PROSPECT_SYSTEM_SPEAKERS = [
  'system', 'note', 'notes', 'record', 'log', 'robot', 'bot', 'automation', 'auto',
  '系统', '记录', '备注', '机器人', '自动'
];

function prospectSpeakerNameMatches(list, value) {
  const key = prospectTextKey(value);
  if (!key) return false;
  return list.some((name) => {
    const isCjk = /[^\x00-\x7F]/.test(name);
    const minLength = isCjk ? 2 : 3;
    return name.length >= minLength && key.includes(name);
  });
}

function normalizeProspectSpeaker(value, fallbackName = '') {
  const key = prospectTextKey(value);
  if (PROSPECT_SYSTEM_SPEAKERS.includes(key)) return 'system';
  if (PROSPECT_SHOP_SPEAKERS.includes(key)) return 'shop';
  if (prospectSpeakerNameMatches(PROSPECT_SYSTEM_SPEAKERS, fallbackName)) return 'system';
  if (prospectSpeakerNameMatches(PROSPECT_SHOP_SPEAKERS, fallbackName)) return 'shop';
  return 'customer';
}

const WINDOWS_1252_BYTES = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
  [0x017e, 0x9e], [0x0178, 0x9f]
]);

function mojibakeScore(value) {
  return (String(value || '').match(/[ÃÂâð�]|[\u0080-\u009f]/g) || []).length;
}

function repairUtf8Mojibake(value) {
  const original = String(value ?? '');
  if (/\r?\n/.test(original)) return original.split(/\r?\n/).map(repairUtf8Mojibake).join('\n');
  if (!mojibakeScore(original)) return original;
  const bytes = [];
  for (const char of original) {
    const code = char.codePointAt(0);
    if (code <= 0xff) bytes.push(code);
    else if (WINDOWS_1252_BYTES.has(code)) bytes.push(WINDOWS_1252_BYTES.get(code));
    else return original.replace(/â€\s*/g, '— ');
  }
  try {
    const repaired = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
    return mojibakeScore(repaired) < mojibakeScore(original) ? repaired : original.replace(/â€\s*/g, '— ');
  } catch {
    return original.replace(/â€\s*/g, '— ');
  }
}

function cleanImportedText(value) {
  return repairUtf8Mojibake(value).replace(/\u0000/g, '').trim();
}

function cleanImportedConversationText(value) {
  return cleanImportedText(value)
    .split(/\r?\n/)
    .filter(line => !/^[Ççåé±\s]{1,8}$/.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeProspectMessages(value) {
  return parseMaybeJsonArray(value).map((item, index) => {
    const speakerName = cleanImportedText(item.speakerName || item.name || item.sender || '');
    const speaker = normalizeProspectSpeaker(
      item.speaker || item.role || item.type || item.side || item.from || item.senderType,
      speakerName
    );
    const text = cleanImportedConversationText(item.text || item.message || item.content || item.body || '');
    if (!text) return null;
    const direction = String(item.direction || '').trim().toLowerCase()
      || (speaker === 'shop' ? 'outbound' : speaker === 'customer' ? 'inbound' : '');
    const channel = String(item.channel || item.provider || item.platform || '').trim().toLowerCase() || 'unknown';
    return {
      id: String(item.id || item.externalEventId || item.eventId || '').trim(),
      speaker,
      speakerName,
      direction,
      channel,
      timestamp: String(item.timestamp || item.time || item.createdAt || '').trim(),
      text,
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
      externalEventId: String(item.externalEventId || item.eventId || item.id || '').trim(),
      provider: String(item.provider || item.platform || '').trim(),
      providerSid: String(item.providerSid || item.messageSid || '').trim(),
      status: String(item.status || '').trim(),
      from: String(item.from || '').trim(),
      to: String(item.to || '').trim(),
      attachment: item.attachment && typeof item.attachment === 'object' ? { ...item.attachment } : null
    };
  }).filter(Boolean);
}

function prospectMessagesToText(messages) {
  return normalizeProspectMessages(messages).map(item => {
    const label = item.speaker === 'shop' ? '我们' : item.speaker === 'system' ? '系统' : '客户';
    const name = item.speakerName ? `(${item.speakerName})` : '';
    const time = item.timestamp ? ` ${item.timestamp}` : '';
    return `${label}${name}${time}: ${item.text}`;
  }).join('\n');
}

function prospectMessageKey(message) {
  const providerSid = prospectTextKey(message.providerSid);
  if (providerSid) return `provider:${prospectTextKey(message.channel || message.provider)}:${providerSid}`;
  const externalEventId = prospectTextKey(message.externalEventId);
  if (externalEventId) return `event:${prospectTextKey(message.channel || message.provider)}:${externalEventId}`;
  return [
    normalizeProspectSpeaker(message.speaker, message.speakerName),
    prospectTextKey(message.speakerName),
    prospectTextKey(message.timestamp),
    prospectTextKey(message.text)
  ].join('|');
}

function yelpReplyConfig() {
  return {
    webhookUrl: String(process.env.YELP_REPLY_WEBHOOK_URL || '').trim(),
    webhookToken: String(process.env.YELP_REPLY_WEBHOOK_TOKEN || '').trim()
  };
}

async function sendYelpReply({ leadId, businessId, text, requestId }) {
  const config = yelpReplyConfig();
  if (!config.webhookUrl) throw new Error('Yelp 回复通道尚未配置，请先设置 YELP_REPLY_WEBHOOK_URL');
  const headers = { 'Content-Type': 'application/json' };
  if (config.webhookToken) headers['X-QUAD-Yelp-Token'] = config.webhookToken;
  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ leadId, businessId, text, requestId, source: 'QUaD' })
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`Yelp 回复转发失败 (${response.status})${responseText ? `：${responseText.slice(0, 240)}` : ''}`);
  return { status: 'accepted', response: responseText.slice(0, 1000) };
}

function normalizeRawPayload(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    const text = value.slice(0, 100000);
    try { return JSON.parse(text); } catch { return text; }
  }
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= 100000) return JSON.parse(serialized);
    return { truncated: true, json: serialized.slice(0, 100000) };
  } catch {
    return String(value).slice(0, 100000);
  }
}

function mergeProspectMessages(existingMessages, incomingMessages) {
  const merged = [];
  const seen = new Set();
  [...normalizeProspectMessages(existingMessages), ...normalizeProspectMessages(incomingMessages)].forEach(message => {
    const key = prospectMessageKey(message);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(message);
  });
  return merged.sort((a, b) => {
    const at = Date.parse(a.timestamp || '');
    const bt = Date.parse(b.timestamp || '');
    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
    return Number(a.order || 0) - Number(b.order || 0);
  });
}

function normalizeProspectIntentLevel(value) {
  const key = prospectTextKey(value);
  if (['高', '高意向', 'hot', 'high', 'high intent'].includes(key)) return '高意向';
  if (['中', '优质', 'qualified', 'good', 'medium'].includes(key)) return '优质';
  if (['低', 'low'].includes(key)) return '低';
  return key ? String(value).trim() : '普通';
}

function inferProspectIntent(base, explicitLevel) {
  const explicit = normalizeProspectIntentLevel(explicitLevel);
  const text = prospectTextKey([
    base.chatContext,
    base.chatTranslation,
    base.need,
    base.vehicle,
    prospectMessagesToText(base.conversationMessages)
  ].join(' '));
  if (base.appointmentDate || base.appointmentTime || /预约|到店|来店|明天|今天|几点|appointment|schedule|drop off|come in|tomorrow|today/.test(text)) return '高意向';
  if (explicit && explicit !== '普通') return explicit;
  if (base.phone || /报价|价格|车型|窗膜|贴膜|ppf|tint|wrap|quote|price|tesla|honda|toyota|bmw|mercedes/.test(text)) return '优质';
  return explicit || '普通';
}

function inferProspectIntentReason(base, messages, level) {
  if (base.appointmentDate || base.appointmentTime) return `自动判断为${level}：客户已有预约时间。`;
  const text = prospectTextKey([base.chatContext, prospectMessagesToText(messages), base.need].join(' '));
  if (/预约|到店|来店|明天|今天|几点|appointment|schedule|drop off|come in|tomorrow|today/.test(text)) return `自动判断为${level}：聊天中出现预约或到店意向。`;
  if (base.phone) return `自动判断为${level}：客户留下了电话，可继续跟进。`;
  if (/报价|价格|车型|窗膜|贴膜|ppf|tint|wrap|quote|price/.test(text)) return `自动判断为${level}：客户明确咨询项目、车型或价格。`;
  return `自动判断为${level}：已导入客户聊天记录。`;
}

function appendUniqueText(existing, value, separator = '\n') {
  const current = String(existing || '').trim();
  const next = String(value || '').trim();
  if (!next) return current;
  if (!current) return next;
  if (prospectTextKey(current).includes(prospectTextKey(next))) return current;
  return `${current}${separator}${next}`;
}

function normalizeProspectInput(input, fallback = {}) {
  const source = cleanImportedText(input.platform || input.source || fallback.source || '');
  const directMessageText = cleanImportedConversationText(input.messageText || input.message || '');
  const directMessages = directMessageText ? [{
    id: input.messageId || input.externalMessageId || input.externalEventId || '',
    externalEventId: input.messageId || input.externalMessageId || input.externalEventId || '',
    speaker: input.messageSpeaker || (String(input.messageDirection || '').toLowerCase() === 'outbound' ? 'shop' : 'customer'),
    speakerName: input.messageSenderName || input.customer || input.customerName || '',
    direction: input.messageDirection || 'inbound',
    channel: input.messageChannel || prospectTextKey(source) || 'unknown',
    text: directMessageText,
    timestamp: input.messageCreatedAt || input.sourceUpdatedAt || input.sourceCreatedAt || '',
    provider: input.messageProvider || source
  }] : [];
  const messageSource = input.conversationMessages || input.messages || input.chatMessages || (directMessages.length ? directMessages : fallback.conversationMessages) || [];
  const conversationMessages = normalizeProspectMessages(messageSource);
  const rawConversation = cleanImportedConversationText(input.rawConversation || input.chatContext || input.conversation || fallback.chatContext || prospectMessagesToText(conversationMessages));
  const noteParts = [
    cleanImportedConversationText(input.note || fallback.note || ''),
    input.importSource ? `导入来源: ${String(input.importSource).trim()}` : '',
    input.sourceDevice ? `采集电脑: ${String(input.sourceDevice).trim()}` : '',
    input.profileUrl ? `客户链接: ${String(input.profileUrl).trim()}` : ''
  ].filter(Boolean);
  const base = {
    date: String(input.date || fallback.date || dateInTimezone('America/Los_Angeles')).slice(0, 10),
    source,
    customer: cleanImportedText(input.customer || input.customerName || fallback.customer || ''),
    phone: String(input.phone || fallback.phone || '').trim(),
    email: cleanImportedText(input.email || input.temporaryEmail || fallback.email || ''),
    vehicle: cleanImportedText(input.vehicle || fallback.vehicle || ''),
    need: cleanImportedConversationText(input.need || input.customerNeed || input.interest || fallback.need || ''),
    service: String(input.service || fallback.service || 'tint').trim(),
    appointmentDate: String(input.appointmentDate || fallback.appointmentDate || '').slice(0, 10),
    appointmentTime: String(input.appointmentTime || fallback.appointmentTime || '').slice(0, 8),
    ownerId: String(input.ownerId || fallback.ownerId || '').trim(),
    ownerName: String(input.ownerName || input.contactOwner || fallback.ownerName || '').trim(),
    status: String(input.status || fallback.status || '').trim(),
    chatContext: rawConversation,
    chatTranslation: cleanImportedConversationText(input.chatTranslation || input.translation || fallback.chatTranslation || ''),
    note: noteParts.join('\n'),
    importSource: String(input.importSource || fallback.importSource || 'codex').trim(),
    sourceDevice: String(input.sourceDevice || fallback.sourceDevice || '').trim(),
    externalId: String(input.externalId || input.yelpLeadId || input.leadId || input.conversationId || fallback.externalId || '').trim(),
    externalEventId: String(input.externalEventId || input.yelpEventId || input.eventId || fallback.externalEventId || '').trim(),
    externalBusinessId: String(input.externalBusinessId || input.yelpBusinessId || input.businessId || fallback.externalBusinessId || '').trim(),
    profileUrl: String(input.profileUrl || fallback.profileUrl || '').trim(),
    importedAt: String(input.importedAt || new Date().toISOString()).trim(),
    sourceCreatedAt: String(input.sourceCreatedAt || input.leadTimeCreated || fallback.sourceCreatedAt || '').trim(),
    sourceUpdatedAt: String(input.sourceUpdatedAt || input.leadTimeUpdated || fallback.sourceUpdatedAt || '').trim(),
    lastSyncedAt: new Date().toISOString(),
    syncStatus: String(input.syncStatus || 'received').trim(),
    rawPayload: normalizeRawPayload(input.rawPayload),
    conversationMessages
  };
  base.processedExternalEventIds = Array.from(new Set([
    ...(Array.isArray(fallback.processedExternalEventIds) ? fallback.processedExternalEventIds : []),
    base.externalEventId
  ].map(value => String(value || '').trim()).filter(Boolean))).slice(-500);
  base.status = base.status || (base.appointmentDate || base.appointmentTime ? '已预约' : '新意向');
  base.intentLevel = inferProspectIntent(base, input.intentLevel || fallback.intentLevel || '');
  base.intentReason = String(input.intentReason || fallback.intentReason || inferProspectIntentReason(base, conversationMessages, base.intentLevel)).trim();
  return base;
}

function findProspectDuplicate(prospects, candidate) {
  const candidateKey = prospectIdentityKey(candidate);
  const exact = candidateKey ? (prospects || []).find(item => prospectIdentityKey(item) === candidateKey) : null;
  if (exact) return exact;
  const safeKey = customerConversationSafeDuplicateKey(candidate);
  return safeKey ? (prospects || []).find(item => customerConversationSafeDuplicateKey(item) === safeKey) || null : null;
}

function customerConversationSafeDuplicateKey(item) {
  const phone = normalizedPhone(item?.phone);
  const source = prospectTextKey(item?.source);
  const customer = prospectTextKey(item?.customer);
  if (phone.length < 7 || !source || !customer) return '';
  return `${source}|${phone}|${customer}`;
}

function mergeProspect(existing, incoming) {
  const next = { ...existing };
  const mergedMessages = mergeProspectMessages(existing.conversationMessages, incoming.conversationMessages);
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || value === null || value === '') continue;
    if (key === 'conversationMessages') continue;
    if (['vehicle', 'need'].includes(key) && ['/','-','—'].includes(String(value).trim()) && String(existing[key] || '').trim() && !['/','-','—'].includes(String(existing[key]).trim())) continue;
    if (key === 'processedExternalEventIds') {
      next.processedExternalEventIds = Array.from(new Set([
        ...(Array.isArray(existing.processedExternalEventIds) ? existing.processedExternalEventIds : []),
        ...(Array.isArray(value) ? value : [])
      ].map(item => String(item || '').trim()).filter(Boolean))).slice(-500);
      continue;
    }
    if (key === 'chatContext') {
      next.chatContext = appendUniqueText(existing.chatContext, value, `\n\n--- ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} 自动导入更新 ---\n`);
      continue;
    }
    if (key === 'note' || key === 'chatTranslation' || key === 'intentReason') {
      next[key] = appendUniqueText(existing[key], value, '\n');
      continue;
    }
    next[key] = value;
  }
  if (mergedMessages.length) {
    next.conversationMessages = mergedMessages;
    if (!next.chatContext) next.chatContext = prospectMessagesToText(mergedMessages);
  }
  next.intentLevel = inferProspectIntent(next, incoming.intentLevel || next.intentLevel);
  next.intentReason = appendUniqueText(next.intentReason, inferProspectIntentReason(next, mergedMessages, next.intentLevel), '\n');
  next.duplicateStatus = 'updated';
  next.updatedAt = new Date().toISOString();
  return next;
}

function applyCustomerConversationDuplicateMerge() {
  const migrationVersion = 'customer-conversation-safe-dedup-2026-07-22-v1';
  const db = readDb();
  if (db.customerConversationSafeDedupVersion === migrationVersion) return;
  createDatabaseBackup(db, 'manual', { id: 'system', name: 'System' });
  const groups = new Map();
  for (const item of (db.customerConversations || [])) {
    const key = customerConversationSafeDuplicateKey(item);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  let mergedRecords = 0;
  let mergedGroups = 0;
  for (const records of groups.values()) {
    if (records.length < 2) continue;
    records.sort((a, b) => {
      const messageDiff = (b.conversationMessages || []).length - (a.conversationMessages || []).length;
      if (messageDiff) return messageDiff;
      return String(a.createdAt || a.importedAt || '').localeCompare(String(b.createdAt || b.importedAt || ''));
    });
    const survivor = records[0];
    const originalCreatedAt = records.map(row => row.createdAt).filter(Boolean).sort()[0] || survivor.createdAt;
    const originalImportedAt = records.map(row => row.importedAt).filter(Boolean).sort()[0] || survivor.importedAt;
    for (const duplicate of records.slice(1)) {
      const next = mergeProspect(survivor, normalizeProspectInput(duplicate, survivor));
      Object.assign(survivor, next);
      survivor.mergedDuplicateIds = [...new Set([...(survivor.mergedDuplicateIds || []), duplicate.id, ...(duplicate.mergedDuplicateIds || [])])];
      mergedRecords += 1;
    }
    survivor.createdAt = originalCreatedAt;
    survivor.importedAt = originalImportedAt;
    survivor.duplicateStatus = 'merged';
    survivor.updatedAt = new Date().toISOString();
    const duplicateIds = new Set(records.slice(1).map(row => row.id));
    db.customerConversations = db.customerConversations.filter(row => !duplicateIds.has(row.id));
    mergedGroups += 1;
  }
  db.customerConversationSafeDedupVersion = migrationVersion;
  db.customerConversationSafeDedupAt = new Date().toISOString();
  audit(db, { id: 'system', name: 'System' }, 'merge-safe-customer-conversation-duplicates', {
    collection: 'customerConversations',
    detail: `按同来源、同电话、同姓名合并 ${mergedGroups} 组、${mergedRecords} 条明确重复客户；聊天历史已合并保留`
  });
  writeDb(db);
  console.log(`Customer conversation duplicates merged: ${mergedRecords} records in ${mergedGroups} groups.`);
}

function prospectImportRows(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.prospects)) return body.prospects;
  if (body && typeof body === 'object') return [body];
  return [];
}

function importCustomerRecords(db, user, body, collection = 'prospects') {
  const customerCenter = collection === 'customerConversations';
  const collectionLabel = customerCenter ? '客户交流' : '高意向客户';
  const rows = prospectImportRows(body).slice(0, 200);
  const fallback = {
    source: body?.source,
    importSource: body?.importSource || 'codex',
    sourceDevice: body?.sourceDevice || body?.deviceName || '',
    ownerId: body?.ownerId || '',
    ownerName: body?.ownerName || ''
  };
  const result = {
    imported: 0,
    updated: 0,
    skipped: 0,
    duplicateCount: 0,
    skippedItems: [],
    items: []
  };
  db[collection] = Array.isArray(db[collection]) ? db[collection] : [];
  rows.forEach((row, index) => {
    const candidate = normalizeProspectInput(row, fallback);
    const hasUsefulIdentity = candidate.customer || candidate.phone || candidate.externalId || candidate.chatContext || candidate.conversationMessages?.length;
    if (!candidate.source || !hasUsefulIdentity) {
      result.skipped += 1;
      result.skippedItems.push({
        index,
        reason: '缺少来源平台，或者缺少客户姓名/电话/外部ID/聊天内容'
      });
      return;
    }
    const duplicate = findProspectDuplicate(db[collection], candidate);
    if (duplicate) {
      const externalEventId = String(candidate.externalEventId || '').trim();
      const processedEventIds = new Set((duplicate.processedExternalEventIds || []).map(value => String(value || '').trim()));
      if (externalEventId && (processedEventIds.has(externalEventId) || String(duplicate.externalEventId || '').trim() === externalEventId)) {
        result.skipped += 1;
        result.duplicateCount += 1;
        result.items.push({ id: duplicate.id, status: 'duplicate-event', customer: duplicate.customer, source: duplicate.source });
        return;
      }
      const before = { ...duplicate };
      const waitingForCustomer = String(duplicate.status || '') === '暂时无需回复';
      const hasNewCustomerMessage = (candidate.conversationMessages || []).some(message =>
        customerServiceMessageRole(message) === 'customer'
      );
      const incoming = waitingForCustomer ? {
        ...candidate,
        status: hasNewCustomerMessage ? '新意向' : '暂时无需回复',
        intentLevel: duplicate.intentLevel || candidate.intentLevel,
        ...(hasNewCustomerMessage ? {
          reactivationHistory: [...(Array.isArray(duplicate.reactivationHistory) ? duplicate.reactivationHistory : []), {
            fromStatus: '暂时无需回复', toStatus: '新意向', channel: String(candidate.source || '').toLowerCase() === 'yelp' ? 'yelp' : 'import', receivedAt: candidate.sourceUpdatedAt || candidate.importedAt
          }],
          reactivatedAt: candidate.sourceUpdatedAt || candidate.importedAt,
          reactivatedBy: '等待中的客户发来新消息'
        } : {})
      } : candidate;
      const next = mergeProspect(duplicate, {
        ...incoming,
        updatedBy: user.name || user.email,
        updatedByUserId: user.id
      });
      if (waitingForCustomer) {
        next.intentLevel = duplicate.intentLevel || candidate.intentLevel;
        next.intentReason = duplicate.intentReason || next.intentReason;
      }
      const idx = db[collection].findIndex(item => item.id === duplicate.id);
      db[collection][idx] = next;
      result.updated += 1;
      result.duplicateCount += 1;
      result.items.push({ id: next.id, status: 'updated', customer: next.customer, source: next.source });
      audit(db, user, customerCenter ? 'import-update-customer-conversation' : 'import-update-prospect', {
        collection,
        recordId: next.id,
        recordLabel: recordLabel(next),
        changedFields: diffRecords(before, next),
        before,
        after: next,
        detail: `自动导入更新${collectionLabel} ${recordLabel(next) || next.id}`
      });
      return;
    }
    const now = new Date().toISOString();
    const item = {
      ...candidate,
      id: id(),
      duplicateStatus: 'new',
      newCustomer: true,
      createdAt: candidate.createdAt || now,
      importedAt: candidate.importedAt || now,
      updatedAt: candidate.updatedAt || candidate.importedAt || now,
      createdBy: user.name || user.email,
      createdByUserId: user.id
    };
    db[collection].push(item);
    result.imported += 1;
    result.items.push({ id: item.id, status: 'new', customer: item.customer, source: item.source });
    audit(db, user, customerCenter ? 'import-create-customer-conversation' : 'import-create-prospect', {
      collection,
      recordId: item.id,
      recordLabel: recordLabel(item),
      after: item,
      detail: `自动导入新增${collectionLabel} ${recordLabel(item) || item.id}`
    });
  });
  return result;
}

function importProspects(db, user, body) {
  return importCustomerRecords(db, user, body, 'prospects');
}

function importCustomerConversations(db, user, body) {
  return importCustomerRecords(db, user, body, 'customerConversations');
}

function sanitizeSalesOrder(order, p) {
  if (p.fullFinanceView) return order;
  return { ...order };
}

function acceptsGzip(req) {
  return /\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''));
}

function send(res, status, body, type = 'application/json; charset=utf-8', req = null) {
  const raw = type.includes('json') ? JSON.stringify(body) : String(body);
  const buffer = Buffer.from(raw);
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-store' };
  if (req && acceptsGzip(req) && buffer.length > 1024 && /json|text|javascript|css|svg/.test(type)) {
    headers['Content-Encoding'] = 'gzip';
    headers.Vary = 'Accept-Encoding';
    const gzipped = zlib.gzipSync(buffer);
    headers['Content-Length'] = gzipped.length;
    res.writeHead(status, headers);
    return res.end(gzipped);
  }
  headers['Content-Length'] = buffer.length;
  res.writeHead(status, headers);
  res.end(buffer);
}

function currentUserFromToken(token, db) {
  const signedUser = verifySessionToken(token, db);
  if (signedUser) return signedUser;
  const session = sessions.get(token);
  if (!session) return null;
  return db.users.find(u => u.id === session.userId && u.active);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 72_000_000) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
    });
  });
}

function readRawBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) return reject(new Error('Body too large'));
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function readBinaryBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', chunk => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) {
        failed = true;
        reject(new Error('Body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

function twilioConfig() {
  return {
    accountSid: String(process.env.TWILIO_ACCOUNT_SID || '').trim(),
    authToken: String(process.env.TWILIO_AUTH_TOKEN || '').trim(),
    messagingServiceSid: String(process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim(),
    fromNumber: String(process.env.TWILIO_FROM_NUMBER || '+17252412586').trim(),
    webhookBaseUrl: String(process.env.TWILIO_WEBHOOK_BASE_URL || '').trim().replace(/\/$/, ''),
    apiBaseUrl: String(process.env.TWILIO_API_BASE_URL || 'https://api.twilio.com').trim().replace(/\/$/, '')
  };
}

function twilioConfigured() {
  const config = twilioConfig();
  return Boolean(config.accountSid && config.authToken && (config.messagingServiceSid || config.fromNumber));
}

function requestPublicBaseUrl(req) {
  const configured = twilioConfig().webhookBaseUrl;
  return configured || `${String(req.headers['x-forwarded-proto'] || 'https').split(',')[0]}://${req.headers.host}`;
}

function requestPublicUrl(req) {
  return `${requestPublicBaseUrl(req)}${new URL(req.url, 'http://local').pathname}`;
}

function validateTwilioSignature(req, params) {
  const { authToken } = twilioConfig();
  const signature = String(req.headers['x-twilio-signature'] || '');
  if (!authToken || !signature) return false;
  let payload = requestPublicUrl(req);
  Object.keys(params).sort().forEach(key => {
    const values = Array.isArray(params[key]) ? [...params[key]].sort() : [params[key]];
    values.forEach(value => { payload += `${key}${value}`; });
  });
  const expected = crypto.createHmac('sha1', authToken).update(payload).digest('base64');
  return secureEqualString(signature, expected);
}

function normalizedPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizeForwardingPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) digits = `1${digits}`;
  if (digits.length < 8 || digits.length > 15) return '';
  return `+${digits}`;
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function findConversationByPhone(db, phone) {
  const target = normalizedPhone(phone);
  if (!target) return null;
  const regularMatches = (db.customerConversations || []).filter(row => normalizedPhone(row.phone) === target);
  for (const regular of regularMatches) {
    if (!regular.promotedProspectId) continue;
    const promoted = (db.prospects || []).find(row => row.id === regular.promotedProspectId);
    if (promoted) return { collection: 'prospects', item: promoted };
  }
  const prospect = (db.prospects || []).find(row => normalizedPhone(row.phone) === target);
  if (prospect) return { collection: 'prospects', item: prospect };
  if (regularMatches[0]) return { collection: 'customerConversations', item: regularMatches[0] };
  return null;
}

function appendSmsMessage(item, message) {
  item.conversationMessages = [...(Array.isArray(item.conversationMessages) ? item.conversationMessages : []), message];
  item.updatedAt = new Date().toISOString();
  item.lastSmsAt = message.timestamp;
  item.lastSmsDirection = message.direction;
}

function isCustomerConversationPromotionEligible(item) {
  return ['已预约', '已到店'].includes(String(item?.status || ''));
}

function promoteEligibleCustomerConversation(db, item, user) {
  if (!item || item.promotedProspectId || !isCustomerConversationPromotionEligible(item)) return null;
  const existing = (db.prospects || []).find(row => row.promotedFromConversationId === item.id);
  if (existing) {
    item.promotedProspectId = existing.id;
    item.promotedAt = item.promotedAt || existing.createdAt || new Date().toISOString();
    return existing;
  }
  const now = new Date().toISOString();
  const promoted = {
    ...item,
    id: id(),
    promotedFromConversationId: item.id,
    createdAt: now,
    importedAt: item.importedAt || item.createdAt || now,
    updatedAt: now,
    createdBy: user.name || user.email,
    createdByUserId: user.id
  };
  delete promoted.promotedProspectId;
  delete promoted.promotedAt;
  db.prospects.push(promoted);
  item.promotedProspectId = promoted.id;
  item.promotedAt = now;
  return promoted;
}

function mergeConversationMessages(target, source) {
  const combined = [...(Array.isArray(target.conversationMessages) ? target.conversationMessages : [])];
  const keys = new Set(combined.map(message => String(message.providerSid || message.id || `${message.timestamp}|${message.direction}|${message.text}`)));
  for (const message of (Array.isArray(source.conversationMessages) ? source.conversationMessages : [])) {
    const key = String(message.providerSid || message.id || `${message.timestamp}|${message.direction}|${message.text}`);
    if (!key || keys.has(key)) continue;
    keys.add(key);
    combined.push(message);
  }
  combined.sort((a, b) => String(a.timestamp || a.createdAt || '').localeCompare(String(b.timestamp || b.createdAt || '')));
  target.conversationMessages = combined;
  const latest = combined[combined.length - 1];
  if (latest) {
    target.lastSmsAt = latest.timestamp || latest.createdAt || target.lastSmsAt;
    target.lastSmsDirection = latest.direction || target.lastSmsDirection;
  }
}

function applyPromotedConversationMerge() {
  const migrationVersion = 'promoted-conversation-merge-2026-07-13-v1';
  const db = readDb();
  if (db.promotedConversationMergeVersion === migrationVersion) return;
  createDatabaseBackup(db, 'manual', { id: 'system', name: 'System' });
  let merged = 0;
  for (const source of (db.customerConversations || [])) {
    if (!source.promotedProspectId) continue;
    const target = (db.prospects || []).find(row => row.id === source.promotedProspectId);
    if (!target) continue;
    const before = (target.conversationMessages || []).length;
    mergeConversationMessages(target, source);
    if ((target.conversationMessages || []).length !== before) {
      target.updatedAt = new Date().toISOString();
      merged += 1;
    }
  }
  db.promotedConversationMergeVersion = migrationVersion;
  db.promotedConversationMergeAt = new Date().toISOString();
  audit(db, { id: 'system', name: 'System' }, 'merge-promoted-conversations', `Merged ${merged} promoted customer conversation records`);
  writeDb(db);
  console.log(`Promoted customer conversations merged: ${merged}.`);
}

function applyCustomerConversationPromotionEligibilityMigration() {
  const migrationVersion = 'customer-conversation-promotion-eligibility-2026-07-14-v1';
  const db = readDb();
  if (db.customerConversationPromotionEligibilityVersion === migrationVersion) return;
  createDatabaseBackup(db, 'manual', { id: 'system', name: 'System' });
  let restored = 0;
  for (const source of (db.customerConversations || [])) {
    if (!source.promotedProspectId || isCustomerConversationPromotionEligible(source)) continue;
    const targetIndex = (db.prospects || []).findIndex(row => row.id === source.promotedProspectId && row.promotedFromConversationId === source.id);
    if (targetIndex < 0) {
      delete source.promotedProspectId;
      delete source.promotedAt;
      continue;
    }
    const target = db.prospects[targetIndex];
    // A customer already converted into a work order must remain traceable.
    if (target.convertedJobId || source.convertedJobId) continue;
    mergeConversationMessages(source, target);
    source.updatedAt = new Date().toISOString();
    delete source.promotedProspectId;
    delete source.promotedAt;
    db.prospects.splice(targetIndex, 1);
    restored += 1;
  }
  db.customerConversationPromotionEligibilityVersion = migrationVersion;
  db.customerConversationPromotionEligibilityAt = new Date().toISOString();
  audit(db, { id: 'system', name: 'System' }, 'fix-customer-conversation-promotion-eligibility', {
    collection: 'customerConversations',
    detail: `恢复 ${restored} 位尚未预约或到店的客户到客户交流中心`
  });
  writeDb(db);
  console.log(`Customer conversation promotion eligibility fixed: ${restored}.`);
}

function applyImportedCustomerEncodingMigration() {
  const migrationVersion = 'imported-customer-encoding-2026-07-14-v1';
  const db = readDb();
  if (db.importedCustomerEncodingVersion === migrationVersion) return;
  createDatabaseBackup(db, 'manual', { id: 'system', name: 'System' });
  let repaired = 0;
  for (const collection of ['customerConversations', 'prospects']) {
    for (const item of (db[collection] || [])) {
      let changed = false;
      for (const field of ['customer', 'vehicle', 'need', 'chatContext', 'chatTranslation', 'note', 'intentReason']) {
        const before = String(item[field] || '');
        const after = ['need', 'chatContext', 'chatTranslation', 'note', 'intentReason'].includes(field)
          ? cleanImportedConversationText(before)
          : cleanImportedText(before);
        if (after !== before) { item[field] = after; changed = true; }
      }
      if (/meta/i.test(String(item.sourceDevice || '')) && String(item.source || '') === 'Yelp') {
        item.source = 'Meta / Facebook';
        changed = true;
      }
      if (Array.isArray(item.conversationMessages)) {
        item.conversationMessages = item.conversationMessages.map(message => {
          const next = { ...message };
          next.text = cleanImportedConversationText(next.text || '');
          next.speakerName = cleanImportedText(next.speakerName || '');
          if (next.text !== message.text || next.speakerName !== String(message.speakerName || '')) changed = true;
          return next;
        }).filter(message => message.text);
      }
      if (changed) { item.updatedAt = new Date().toISOString(); repaired += 1; }
    }
  }
  db.importedCustomerEncodingVersion = migrationVersion;
  db.importedCustomerEncodingAt = new Date().toISOString();
  audit(db, { id: 'system', name: 'System' }, 'repair-imported-customer-encoding', {
    collection: 'customerConversations',
    detail: `修复 ${repaired} 条自动导入客资的错误编码字符`
  });
  writeDb(db);
  console.log(`Imported customer encoding repaired: ${repaired}.`);
}

function applyCustomerNumberRemoval() {
  const migrationVersion = 'remove-permanent-customer-number-2026-07-18-v1';
  const db = readDb();
  if (db.customerNumberRemovalVersion === migrationVersion) return;
  const backupDir = path.join(DATA_DIR, 'backups');
  const backupName = `db-before-customer-number-removal-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, backupName), JSON.stringify(db, null, 2));
  } catch (error) {
    if (error?.code === 'ENOSPC') {
      console.warn('Customer number data cleanup skipped because the data volume has no free space. Numbering remains disabled in the application and no customer data was changed.');
      return;
    }
    throw error;
  }

  let removed = 0;
  for (const collection of ['customerConversations', 'prospects', 'leads', 'jobs', 'portalCustomers', 'salesOrders']) {
    for (const item of (db[collection] || [])) {
      if (!Object.prototype.hasOwnProperty.call(item, 'customerNumber')) continue;
      delete item.customerNumber;
      removed += 1;
    }
  }
  delete db.nextCustomerNumber;
  db.customerNumberRemovalVersion = migrationVersion;
  db.customerNumberRemovedAt = new Date().toISOString();
  db.customerNumberRemovalBackup = backupName;
  audit(db, { id: 'system', name: 'System' }, 'remove-customer-numbers', `Removed permanent customer numbers from ${removed} records; backup ${backupName}`);
  writeDb(db);
  console.log(`Customer number removal cleared ${removed} records. Backup saved as ${backupName}.`);
}

async function reconcileRecentTwilioInboundMessages() {
  if (!twilioConfigured()) return;
  const config = twilioConfig();
  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');
  const response = await fetch(`${config.apiBaseUrl}/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json?PageSize=50`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Twilio message reconciliation failed (${response.status})`);
  const payload = await response.json();
  const db = readDb();
  let added = 0;
  for (const message of (payload.messages || [])) {
    if (message.direction !== 'inbound' || normalizedPhone(message.to) !== normalizedPhone(config.fromNumber)) continue;
    const match = findConversationByPhone(db, message.from);
    if (!match) continue;
    const existingMessage = (match.item.conversationMessages || []).find(row => row.providerSid === message.sid);
    if (existingMessage) {
      if (Number(message.num_media || 0) > 0 && !existingMessage.attachment?.url) {
        const recoveredAttachment = await reconcileTwilioMessageAttachment(message.sid).catch(err => {
          console.warn(err.message);
          return null;
        });
        if (recoveredAttachment) {
          existingMessage.attachment = recoveredAttachment;
          existingMessage.text = existingMessage.text || '客户发来的附件';
          match.item.updatedAt = new Date().toISOString();
          added += 1;
        }
      }
      continue;
    }
    const rawTimestamp = message.date_sent || message.date_created || new Date().toISOString();
    const parsedTimestamp = new Date(rawTimestamp);
    const attachment = Number(message.num_media || 0) > 0 ? await reconcileTwilioMessageAttachment(message.sid).catch(err => {
      console.warn(err.message);
      return null;
    }) : null;
    appendSmsMessage(match.item, {
      id: `twilio-${message.sid}`,
      speaker: 'customer', speakerName: match.item.customer || message.from,
      direction: 'inbound', channel: 'sms', text: String(message.body || '').slice(0, 4000),
      attachment,
      timestamp: Number.isNaN(parsedTimestamp.getTime()) ? String(rawTimestamp) : parsedTimestamp.toISOString(),
      provider: 'twilio', providerSid: String(message.sid || ''), status: String(message.status || 'received')
    });
    reactivateConversationOnInbound(match.item, Number.isNaN(parsedTimestamp.getTime()) ? String(rawTimestamp) : parsedTimestamp.toISOString());
    added += 1;
  }
  if (!added) return;
  audit(db, { id: 'twilio-reconcile', name: 'Twilio' }, 'reconcile-customer-sms', `Recovered ${added} recent inbound SMS messages`);
  writeDb(db);
  notifyDataChanged('reconcile-customer-sms', String(added));
  console.log(`Twilio inbound messages reconciled: ${added}.`);
}

function reactivateConversationOnInbound(item, receivedAt = new Date().toISOString()) {
  const fromStatus = String(item?.status || '');
  if (!['无效', '暂时无需回复'].includes(fromStatus)) return '';
  item.reactivationHistory = [...(Array.isArray(item.reactivationHistory) ? item.reactivationHistory : []), {
    fromStatus, toStatus: '新意向', channel: 'sms', receivedAt
  }];
  item.status = '新意向';
  if (fromStatus === '无效') item.intentLevel = '普通';
  item.reactivatedAt = receivedAt;
  item.reactivatedBy = fromStatus === '暂时无需回复' ? '等待中的客户发来新消息' : '无效客户短信回复';
  item.updatedAt = receivedAt;
  return fromStatus;
}

function startTwilioReconciliationWorker() {
  const run = () => reconcileRecentTwilioInboundMessages().catch(err => console.warn(err.message));
  setTimeout(run, 10 * 1000);
  setInterval(run, 5 * 60 * 1000);
}

async function sendTwilioSms({ to, body, mediaUrl, statusCallback }) {
  const config = twilioConfig();
  if (!twilioConfigured()) throw new Error('Twilio 尚未配置，请先设置 Railway 环境变量');
  const form = new URLSearchParams({ To: to, Body: body });
  if (mediaUrl) form.append('MediaUrl', mediaUrl);
  if (config.messagingServiceSid) form.set('MessagingServiceSid', config.messagingServiceSid);
  else form.set('From', config.fromNumber);
  if (statusCallback) form.set('StatusCallback', statusCallback);
  const response = await fetch(`${config.apiBaseUrl}/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || `Twilio 发送失败 (${response.status})`);
  return result;
}

function safeCustomerMediaExtension(name, contentType) {
  const fromName = path.extname(String(name || '')).toLowerCase();
  const allowed = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.mp4', '.mov', '.webm', '.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.zip']);
  if (allowed.has(fromName)) return fromName;
  const byType = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
    'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm',
    'application/pdf': '.pdf', 'text/plain': '.txt'
  };
  return byType[String(contentType || '').toLowerCase()] || '.bin';
}

async function optimizeCustomerMmsVideo(data, contentType) {
  const token = crypto.randomBytes(8).toString('hex');
  const inputExtension = safeCustomerMediaExtension('upload', contentType);
  const inputPath = path.join(CUSTOMER_MEDIA_DIR, `${token}-source${inputExtension}`);
  const outputPath = path.join(CUSTOMER_MEDIA_DIR, `${token}-mms.mp4`);
  fs.writeFileSync(inputPath, data);
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', inputPath
    ]);
    const duration = Number(String(stdout).trim());
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('无法读取视频，请改用 MP4 短视频');
    if (duration > 15.5) throw new Error('短信短视频最多 15 秒，请先裁剪后再发送');
    const totalKbps = Math.max(190, Math.floor((540 * 8) / duration));
    const audioKbps = duration > 10 ? 40 : 48;
    const videoKbps = Math.max(140, Math.min(520, totalKbps - audioKbps));
    const commonArgs = [
      '-y', '-v', 'error', '-i', inputPath,
      '-map', '0:v:0', '-map_metadata', '-1', '-map_chapters', '-1', '-sn', '-dn',
      '-vf', 'scale=480:-2:force_original_aspect_ratio=decrease:flags=lanczos,pad=ceil(iw/2)*2:ceil(ih/2)*2,fps=20,format=yuv420p',
      '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0', '-tag:v', 'avc1',
      '-b:v', `${videoKbps}k`, '-maxrate', `${videoKbps}k`, '-bufsize', `${videoKbps * 2}k`,
      '-movflags', '+faststart'
    ];
    try {
      await execFileAsync('ffmpeg', [
        ...commonArgs,
        '-map', '0:a:0?', '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-ac', '1', '-ar', '32000',
        outputPath
      ], { maxBuffer: 4 * 1024 * 1024 });
    } catch (firstError) {
      try { fs.unlinkSync(outputPath); } catch {}
      try {
        await execFileAsync('ffmpeg', [...commonArgs, '-an', outputPath], { maxBuffer: 4 * 1024 * 1024 });
      } catch (secondError) {
        console.error('Video conversion failed', {
          contentType,
          bytes: data.length,
          first: String(firstError?.stderr || firstError?.message || '').slice(-2000),
          second: String(secondError?.stderr || secondError?.message || '').slice(-2000)
        });
        throw new Error('这个视频的编码暂时无法转换。请在手机相册中把视频另存或导出为“兼容性最佳”的 MP4 后重试');
      }
    }
    const optimized = fs.readFileSync(outputPath);
    if (!optimized.length || optimized.length > 600 * 1024) {
      throw new Error('视频压缩后仍超过短信运营商的 600KB 限制，请缩短视频后重试');
    }
    return optimized;
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
}

async function cloudVideoDurationSeconds(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', filePath
  ], { maxBuffer: 1024 * 1024 });
  const duration = Number(String(stdout || '').trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('无法读取视频，请改用 MP4、MOV 或 WebM 视频');
  return duration;
}

async function twilioMediaForAttachment(attachment, publicBaseUrl) {
  const url = String(attachment?.url || '');
  const type = String(attachment?.type || '');
  const name = String(attachment?.name || '附件');
  const kind = type.startsWith('video/') ? 'video' : type.startsWith('image/') ? 'image' : 'file';
  const linkText = `${kind === 'video' ? '视频' : kind === 'image' ? '图片' : '文件'}：${name} ${url}`;
  if (!url.startsWith(`${publicBaseUrl}/customer-media/`)) return { mediaUrl: '', linkText };
  if (kind === 'image') {
    return Number(attachment?.size || 0) <= MAX_TWILIO_IMAGE_BYTES
      ? { mediaUrl: url, linkText: '' }
      : { mediaUrl: '', linkText };
  }
  if (kind !== 'video') return { mediaUrl: '', linkText };
  try {
    const fileName = path.basename(new URL(url).pathname);
    const sourcePath = path.join(CUSTOMER_MEDIA_DIR, fileName);
    const source = fs.readFileSync(sourcePath);
    const optimized = await optimizeCustomerMmsVideo(source, type);
    const mmsName = `${crypto.randomBytes(6).toString('hex')}.mp4`;
    fs.writeFileSync(path.join(CUSTOMER_MEDIA_DIR, mmsName), optimized);
    return { mediaUrl: `${publicBaseUrl}/customer-media/${mmsName}`, linkText: '' };
  } catch {
    return { mediaUrl: '', linkText };
  }
}

function serveCustomerMedia(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const fileName = path.basename(decodeURIComponent(url.pathname.replace('/customer-media/', '')));
  if (!/^[a-f0-9]{12,32}\.[a-z0-9]{1,8}$/i.test(fileName)) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  const filePath = path.join(CUSTOMER_MEDIA_DIR, fileName);
  fs.stat(filePath, (err, stat) => {
    if (err) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    const size = stat.size;
    const headers = {
      'Content-Type': mime[path.extname(fileName).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes'
    };
    const match = String(req.headers.range || '').match(/^bytes=(\d*)-(\d*)$/i);
    if (!match) {
      res.writeHead(200, { ...headers, 'Content-Length': size });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(filePath).pipe(res);
    }
    let start;
    let end;
    if (match[1] === '') {
      const suffixLength = Number(match[2]);
      if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` });
        return res.end();
      }
      start = Math.max(0, size - suffixLength);
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, {
      ...headers,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${size}`
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath, { start, end }).pipe(res);
  });
}

async function saveTwilioInboundMedia(mediaUrl, contentType, publicBaseUrl) {
  if (!mediaUrl || !publicBaseUrl) return null;
  const config = twilioConfig();
  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}` }
  });
  if (!response.ok) throw new Error(`Twilio 入站附件下载失败 (${response.status})`);
  const data = Buffer.from(await response.arrayBuffer());
  if (!data.length || data.length > 5 * 1024 * 1024) throw new Error('Twilio 入站附件为空或超过 5MB');
  const type = String(contentType || response.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
  fs.mkdirSync(CUSTOMER_MEDIA_DIR, { recursive: true });
  const fileName = `${crypto.randomBytes(6).toString('hex')}${safeCustomerMediaExtension('', type)}`;
  fs.writeFileSync(path.join(CUSTOMER_MEDIA_DIR, fileName), data);
  return {
    name: `客户发来的${type.startsWith('video/') ? '视频' : type.startsWith('image/') ? '图片' : '附件'}`,
    type,
    size: data.length,
    url: `${publicBaseUrl}/customer-media/${fileName}`,
    kind: type.startsWith('video/') ? 'video' : type.startsWith('image/') ? 'image' : 'file'
  };
}

async function reconcileTwilioMessageAttachment(messageSid) {
  const config = twilioConfig();
  if (!messageSid || !config.webhookBaseUrl) return null;
  const auth = `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`;
  const listResponse = await fetch(`${config.apiBaseUrl}/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages/${encodeURIComponent(messageSid)}/Media.json`, { headers: { Authorization: auth } });
  if (!listResponse.ok) return null;
  const payload = await listResponse.json();
  const media = (payload.media_list || [])[0];
  if (!media?.sid) return null;
  const mediaUrl = `${config.apiBaseUrl}/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages/${encodeURIComponent(messageSid)}/Media/${encodeURIComponent(media.sid)}`;
  return saveTwilioInboundMedia(mediaUrl, media.content_type, config.webhookBaseUrl);
}

function currentUser(req, db) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return currentUserFromToken(token, db);
}

function secureEqualString(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (!left.length || !right.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function prospectImportTokens() {
  return [
    process.env.PROSPECT_IMPORT_TOKEN,
    process.env.PROSPECT_IMPORT_TOKEN_YELP,
    process.env.PROSPECT_IMPORT_TOKEN_META,
    process.env.PROSPECT_IMPORT_TOKEN_MAT,
    process.env.PROSPECT_IMPORT_TOKENS
  ]
    .filter(Boolean)
    .join('\n')
    .split(/[\n,;]+/)
    .map(value => String(value || '').trim())
    .filter(Boolean);
}

function prospectImportUser(req) {
  const configuredTokens = prospectImportTokens();
  if (!configuredTokens.length) return null;
  const providedToken = String(
    req.headers['x-import-token'] ||
    String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  ).trim();
  if (!configuredTokens.some(token => secureEqualString(providedToken, token))) return null;
  return {
    id: 'prospect-import-token',
    name: '高意向客户自动导入',
    email: 'prospect-import@system.local',
    role: 'importer',
    active: true,
    permissions: { prospectsView: true, prospectsEdit: true }
  };
}

function customerConversationImportTokens() {
  return [
    process.env.CUSTOMER_CONVERSATION_IMPORT_TOKEN,
    process.env.CUSTOMER_CONVERSATION_IMPORT_TOKEN_YELP,
    process.env.CUSTOMER_CONVERSATION_IMPORT_TOKEN_META,
    process.env.CUSTOMER_CONVERSATION_IMPORT_TOKENS
  ]
    .filter(Boolean)
    .join('\n')
    .split(/[\n,;]+/)
    .map(value => String(value || '').trim())
    .filter(Boolean);
}

function customerConversationImportUser(req) {
  const configuredTokens = customerConversationImportTokens();
  if (!configuredTokens.length) return null;
  const providedToken = String(
    req.headers['x-import-token'] ||
    String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  ).trim();
  if (!configuredTokens.some(token => secureEqualString(providedToken, token))) return null;
  const importPlatform = secureEqualString(providedToken, process.env.CUSTOMER_CONVERSATION_IMPORT_TOKEN_META)
    ? 'Meta / Facebook'
    : secureEqualString(providedToken, process.env.CUSTOMER_CONVERSATION_IMPORT_TOKEN_YELP)
      ? 'Yelp'
      : '';
  return {
    id: 'customer-conversation-import-token',
    name: '客户交流中心自动导入',
    email: 'customer-import@system.local',
    role: 'importer',
    active: true,
    importOnly: true,
    importPlatform,
    permissions: { prospectsView: true, prospectsEdit: true }
  };
}

function customerServiceAgentTokens() {
  return [process.env.CUSTOMER_SERVICE_AGENT_TOKEN, process.env.CUSTOMER_SERVICE_AGENT_TOKENS]
    .filter(Boolean)
    .join('\n')
    .split(/[\n,;]+/)
    .map(value => String(value || '').trim())
    .filter(Boolean);
}

function customerServiceAgentUser(req) {
  const configuredTokens = customerServiceAgentTokens();
  if (!configuredTokens.length) return null;
  const providedToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!configuredTokens.some(token => secureEqualString(providedToken, token))) return null;
  const requestedName = String(req.headers['x-agent-name'] || 'QUAD 客服助手').trim().slice(0, 80);
  return {
    id: `customer-service-agent-${crypto.createHash('sha256').update(providedToken).digest('hex').slice(0, 12)}`,
    name: requestedName || 'QUAD 客服助手',
    email: 'customer-service-agent@system.local',
    role: 'agent-api',
    active: true,
    restrictedAgent: true,
    permissions: { prospectsView: true, prospectsEdit: true }
  };
}

function customerServiceMessageRole(message) {
  const direction = String(message?.direction || '').toLowerCase();
  if (direction === 'inbound') return 'customer';
  if (direction === 'outbound') return 'shop';
  const speaker = String(message?.speaker || message?.role || message?.senderType || '').toLowerCase();
  return /customer|client|lead|客户/.test(speaker) ? 'customer' : /shop|staff|agent|我们|客服/.test(speaker) ? 'shop' : 'system';
}

function customerServiceConversation(item) {
  return (Array.isArray(item?.conversationMessages) ? item.conversationMessages : [])
    .map((message, index) => ({ message, index, role: customerServiceMessageRole(message), at: new Date(message.timestamp || message.time || message.createdAt || 0).getTime() }))
    .filter(row => row.role === 'customer' || row.role === 'shop')
    .sort((a, b) => (Number.isFinite(a.at) && Number.isFinite(b.at) && a.at !== b.at) ? a.at - b.at : a.index - b.index);
}

function customerServiceTaskType(item, now = new Date()) {
  const messages = customerServiceConversation(item);
  const latest = messages[messages.length - 1];
  if (latest?.role === 'customer') return 'reply';
  const followUpKey = item?.followUpDate ? `${item.followUpDate}T${item.followUpTime || '09:00'}` : '';
  const nowParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(now).map(part => [part.type, part.value]));
  const nowKey = `${nowParts.year}-${nowParts.month}-${nowParts.day}T${nowParts.hour}:${nowParts.minute}`;
  if (followUpKey && followUpKey <= nowKey) return 'followup';
  if (followUpKey) return 'future';
  if (!messages.some(row => row.role === 'shop')) return 'first';
  return '';
}

function customerServiceAgentSends(item) {
  const generic = Array.isArray(item?.agentSends) ? item.agentSends : [];
  const legacySms = (Array.isArray(item?.agentSmsSends) ? item.agentSmsSends : [])
    .filter(row => !generic.some(send => send.requestId === row.requestId))
    .map(row => ({ ...row, channel: 'sms' }));
  return [...generic, ...legacySms].sort((a, b) => String(a.sentAt || '').localeCompare(String(b.sentAt || '')));
}

function customerServiceRequiredReplyChannel(item) {
  const inbound = (Array.isArray(item?.conversationMessages) ? item.conversationMessages : [])
    .map((message, index) => ({ message, index, at: new Date(message.timestamp || message.time || message.createdAt || 0).getTime() }))
    .filter(row => customerServiceMessageRole(row.message) === 'customer' && ['yelp', 'sms'].includes(String(row.message.channel || '').toLowerCase()))
    .sort((a, b) => (Number.isFinite(a.at) && Number.isFinite(b.at) && a.at !== b.at) ? a.at - b.at : a.index - b.index);
  return String(inbound[inbound.length - 1]?.message?.channel || '').toLowerCase();
}

function customerServiceAvailableChannels(item) {
  const channels = [];
  if (prospectTextKey(item?.source) === 'yelp' && String(item?.externalId || '').trim()) channels.push('yelp');
  if (normalizedPhone(item?.phone).length === 10) channels.push('sms');
  const required = customerServiceRequiredReplyChannel(item);
  return required && channels.includes(required) ? [required] : channels;
}

function customerServiceTaskRows(db, filter = 'active') {
  const promotedIds = new Set((db.prospects || []).map(item => item.id));
  const rows = [
    ...(db.customerConversations || []).filter(item => !item.promotedProspectId || !promotedIds.has(item.promotedProspectId)).map(item => ({ item, collection: 'customerConversations' })),
    ...(db.prospects || []).map(item => ({ item, collection: 'prospects' }))
  ];
  const movedStatuses = new Set(['已预约', '已到店', '已转施工单', '无效', '暂时无需回复']);
  const priority = { reply: 0, followup: 1, first: 2, future: 3 };
  if (filter === 'sent') {
    return rows
      .filter(({ item }) => customerServiceAgentSends(item).length)
      .map(row => ({ ...row, taskType: 'sent' }))
      .sort((a, b) => {
        const aSends = customerServiceAgentSends(a.item);
        const bSends = customerServiceAgentSends(b.item);
        const aSent = aSends[aSends.length - 1]?.sentAt || '';
        const bSent = bSends[bSends.length - 1]?.sentAt || '';
        return String(bSent).localeCompare(String(aSent));
      });
  }
  return rows
    .filter(({ item }) => !movedStatuses.has(String(item.status || '')) && !item.convertedJobId)
    .map(row => ({ ...row, taskType: customerServiceTaskType(row.item) }))
    .filter(row => row.taskType && (filter === 'all' || (filter === 'active' && row.taskType !== 'future') || row.taskType === filter))
    .sort((a, b) => {
      const typeDiff = priority[a.taskType] - priority[b.taskType];
      if (typeDiff) return typeDiff;
      const aTime = a.item.followUpDate ? `${a.item.followUpDate}T${a.item.followUpTime || '09:00'}` : String(a.item.updatedAt || a.item.importedAt || a.item.createdAt || a.item.date || '');
      const bTime = b.item.followUpDate ? `${b.item.followUpDate}T${b.item.followUpTime || '09:00'}` : String(b.item.updatedAt || b.item.importedAt || b.item.createdAt || b.item.date || '');
      if (a.taskType === 'first') return bTime.localeCompare(aTime);
      return aTime.localeCompare(bTime);
    });
}

function safeCustomerServiceTask(row) {
  const { item, collection, taskType } = row;
  const messages = customerServiceConversation(item).slice(-40).map(({ message, role }) => ({
    id: String(message.id || ''), role, text: String(message.text || message.message || message.content || '').slice(0, 4000),
    timestamp: String(message.timestamp || message.time || message.createdAt || ''), channel: String(message.channel || ''),
    attachment: message.attachment?.url ? { name: String(message.attachment.name || ''), type: String(message.attachment.type || ''), url: String(message.attachment.url) } : null
  }));
  const availableChannels = customerServiceAvailableChannels(item);
  return {
    id: item.id, collection, taskType, customer: String(item.customer || ''), phone: String(item.phone || ''),
    source: String(item.source || ''), vehicle: String(item.vehicle || ''), need: String(item.need || ''),
    status: String(item.status || ''), intentLevel: String(item.intentLevel || ''), ownerName: String(item.ownerName || ''),
    followUp: item.followUpDate ? { date: String(item.followUpDate), time: String(item.followUpTime || '09:00'), reason: String(item.followUpReason || '') } : null,
    claim: item.taskClaimedByUserId ? { by: String(item.taskClaimedByName || ''), at: String(item.taskClaimedAt || '') } : null,
    draft: item.agentReplyDraft ? { ...item.agentReplyDraft } : null,
    availableChannels,
    preferredChannel: availableChannels.includes('yelp') ? 'yelp' : (availableChannels[0] || ''),
    messages
  };
}

function openEventStream(req, res, user) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  const client = { res, userId: user.id };
  eventClients.add(client);
  res.write(`event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  const heartbeat = setInterval(() => {
    try {
      res.write(`event: ping\ndata: ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeat);
      eventClients.delete(client);
    }
  }, 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    eventClients.delete(client);
  });
}

function notifyDataChanged(action, detail, targetUserIds = []) {
  const payload = JSON.stringify({ action, detail, at: new Date().toISOString() });
  const targets = new Set((targetUserIds || []).map(String).filter(Boolean));
  for (const client of [...eventClients]) {
    if (targets.size && !targets.has(String(client.userId))) continue;
    try {
      client.res.write(`event: data-changed\ndata: ${payload}\n\n`);
    } catch {
      eventClients.delete(client);
    }
  }
}

function dateInTimezone(timezone, addDays = 0) {
  const date = new Date(Date.now() + addDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function scheduleTypeName(type) {
  return {
    work: '上班',
    makeup: '补班',
    off: '休息',
    adjustedRest: '调休'
  }[type] || type || '排班';
}

async function sendReminderEmail(to, subject, text) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REMINDER_FROM_EMAIL || process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { ok: false, configured: false, error: '邮件服务未配置 RESEND_API_KEY / REMINDER_FROM_EMAIL' };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to, subject, text })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, configured: true, error: body.message || `邮件发送失败 ${response.status}` };
  return { ok: true, configured: true, id: body.id || '' };
}

async function sendScheduleReminders(db, targetDate, actor = { id: 'system', name: 'System' }) {
  const schedules = (db.schedules || []).filter(item => item.date === targetDate);
  const byEmail = new Map();
  schedules.forEach(item => {
    const email = String(item.email || '').trim().toLowerCase();
    if (!email) return;
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(item);
  });
  const result = { date: targetDate, sent: 0, skipped: 0, failed: 0, configured: Boolean(process.env.RESEND_API_KEY && (process.env.REMINDER_FROM_EMAIL || process.env.RESEND_FROM_EMAIL)), errors: [] };
  if (!result.configured) {
    result.skipped = byEmail.size;
    return result;
  }
  for (const [email, rows] of byEmail.entries()) {
    const alreadySent = (db.scheduleReminderLogs || []).some(log => log.date === targetDate && log.email === email && log.status === 'sent');
    if (alreadySent) {
      result.skipped += 1;
      continue;
    }
    const name = rows[0].employeeName || email;
    const lines = rows.map(row => `- ${row.date}：${scheduleTypeName(row.type)} ${row.shift || ''}${row.reason ? `，原因：${row.reason}` : ''}${row.note ? `，备注：${row.note}` : ''}`);
    const subject = `QUAD FILM 明日排班提醒 ${targetDate}`;
    const text = `${name}，你好：\n\n这是你明天的排班/调休提醒：\n${lines.join('\n')}\n\n请提前安排好到店时间。如有问题，请联系店长或老板。\n\nQUAD FILM`;
    const sent = await sendReminderEmail(email, subject, text);
    const log = {
      id: id(),
      at: new Date().toISOString(),
      date: targetDate,
      email,
      employeeName: name,
      status: sent.ok ? 'sent' : 'failed',
      providerId: sent.id || '',
      error: sent.error || '',
      scheduleIds: rows.map(row => row.id)
    };
    db.scheduleReminderLogs.unshift(log);
    if (sent.ok) result.sent += 1;
    else {
      result.failed += 1;
      result.errors.push(`${email}: ${sent.error || '发送失败'}`);
    }
  }
  db.scheduleReminderLogs = (db.scheduleReminderLogs || []).slice(0, 500);
  if (result.sent || result.failed) audit(db, actor, 'send-schedule-reminders', `Sent ${result.sent}, failed ${result.failed}, date ${targetDate}`);
  writeDb(db);
  if (result.sent || result.failed) notifyDataChanged('send-schedule-reminders', targetDate);
  return result;
}

function collectionPermission(collection, method) {
  const map = {
    jobs: { GET: 'jobsView', POST: 'jobsCreate', PUT: 'jobsEdit', DELETE: 'jobsDelete' },
    warranties: { GET: 'jobsView', POST: 'jobsCreate', PUT: 'jobsEdit', DELETE: 'jobsDelete' },
    installers: { GET: 'installerView', POST: 'installerEdit', PUT: 'installerEdit', DELETE: 'installerEdit' },
    products: { GET: 'inventoryView', POST: 'inventoryEdit', PUT: 'inventoryEdit', DELETE: 'inventoryEdit' },
    movements: { GET: 'inventoryView', POST: 'inventoryEdit', PUT: 'inventoryEdit', DELETE: 'inventoryEdit' },
    workshopMovements: { GET: 'inventoryView', POST: 'inventoryEdit', PUT: 'inventoryEdit', DELETE: 'inventoryEdit' },
    priceRules: { GET: 'pricingView', POST: 'pricingEdit', PUT: 'pricingEdit', DELETE: 'pricingEdit' },
    salesOrders: { GET: 'ordersView', POST: 'ordersEdit', PUT: 'ordersEdit', DELETE: 'ordersEdit' },
    shipments: { GET: 'shipmentsView', POST: 'shipmentsEdit', PUT: 'shipmentsEdit', DELETE: 'shipmentsEdit' },
    schedules: { GET: 'schedulesView', POST: 'schedulesEdit', PUT: 'schedulesEdit', DELETE: 'schedulesEdit' },
    leads: { GET: 'leadsView', POST: 'leadsEdit', PUT: 'leadsEdit', DELETE: 'leadsEdit' },
    prospects: { GET: 'prospectsView', POST: 'prospectsEdit', PUT: 'prospectsEdit', DELETE: 'prospectsEdit' },
    customerConversations: { GET: 'prospectsView', POST: 'prospectsEdit', PUT: 'prospectsEdit', DELETE: 'prospectsEdit' },
    replyTemplates: { GET: 'prospectsView', POST: 'prospectsEdit', PUT: 'prospectsEdit', DELETE: 'prospectsEdit' },
    customerServiceReps: { GET: 'leadsView', POST: 'commissionEdit', PUT: 'commissionEdit', DELETE: 'commissionEdit' },
    expenses: { GET: 'expensesView', POST: 'expensesEdit', PUT: 'expensesEdit', DELETE: 'expensesEdit' },
    reimbursements: { GET: 'reimbursementsView', POST: 'reimbursementsCreate', PUT: 'reimbursementsCreate', DELETE: 'reimbursementsCreate' },
    users: { GET: 'usersManage', POST: 'usersManage', PUT: 'usersManage', DELETE: 'usersManage' }
  };
  return map[collection]?.[method];
}

function canAccess(user, permission) {
  return Boolean(effectivePermissions(user)[permission]);
}

function audit(db, user, action, detail) {
  const meta = typeof detail === 'object' && detail ? detail : { detail };
  db.auditLogs.unshift({
    id: id(),
    at: new Date().toISOString(),
    userId: user?.id || 'system',
    userName: user?.name || 'System',
    action,
    detail: meta.detail || '',
    collection: meta.collection || '',
    recordId: meta.recordId || '',
    recordLabel: meta.recordLabel || '',
    changedFields: meta.changedFields || [],
    before: meta.before || null,
    after: meta.after || null,
    snapshot: meta.snapshot || null
  });
  db.auditLogs = db.auditLogs.slice(0, 3000);
}

function recordLabel(record) {
  if (!record) return '';
  return String(record.customer || record.name || record.sku || record.items || record.date || record.email || record.id || '').trim();
}

function comparableValue(value) {
  if (Array.isArray(value)) return value.map(comparableValue);
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value ?? '';
}

function auditValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value ?? '';
}

function diffRecords(before, after) {
  const ignored = new Set(['updatedAt', 'updatedBy']);
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter(key => !ignored.has(key)).reduce((changes, key) => {
    const oldValue = comparableValue(before?.[key]);
    const newValue = comparableValue(after?.[key]);
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({ field: key, before: auditValue(before?.[key]), after: auditValue(after?.[key]) });
    }
    return changes;
  }, []);
}

function compactHeader(value) {
  return String(value || '').toLowerCase().replace(/[\s_\/\\\-:：()（）]/g, '');
}

function valueFromRow(row, aliases) {
  const entries = Object.entries(row || {});
  for (const alias of aliases) {
    const target = compactHeader(alias);
    const found = entries.find(([key]) => compactHeader(key) === target || compactHeader(key).includes(target));
    if (found && String(found[1] ?? '').trim()) return String(found[1] ?? '').trim();
  }
  return '';
}

function normalizeShipmentMethod(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text.includes('air') || text.includes('空')) return 'air';
  return 'ocean';
}

function normalizeImportDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.replace(/[年月.]/g, '-').replace(/日/g, '').replace(/\//g, '-');
  const match = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString().slice(0, 10);
}

function shipmentFromImportRow(row) {
  const item = {
    id: id(),
    method: normalizeShipmentMethod(valueFromRow(row, ['运输方式', '方式', 'method', 'shipping method', '运输'])),
    items: valueFromRow(row, ['货物内容', '货物', '商品', '品名', 'items', 'item', 'products', 'description']),
    qty: valueFromRow(row, ['数量', 'qty', 'quantity', '件数', '箱数']),
    supplier: valueFromRow(row, ['卖货方', '供应商', 'supplier', 'vendor', 'seller']),
    contact: valueFromRow(row, ['联系人/电话', '联系人', '电话', 'contact', 'phone']),
    trackingNo: valueFromRow(row, ['柜号/单号', '柜号', '单号', '追踪号', 'tracking', 'tracking no', 'container', 'container no']),
    shipFrom: valueFromRow(row, ['发出地点', '出发地', 'ship from', 'from', 'origin']) || 'China',
    departDate: normalizeImportDate(valueFromRow(row, ['发出时间', '发出日期', '出发时间', 'depart date', 'departure date', 'ship date'])),
    etaPort: normalizeImportDate(valueFromRow(row, ['预计到港/下船', '预计到港', '下船时间', 'eta port', 'port eta', 'arrival port'])),
    etaLasVegas: normalizeImportDate(valueFromRow(row, ['预计到拉斯维加斯', '到拉斯维加斯', 'eta las vegas', 'las vegas eta', 'vegas eta'])),
    arrivedDate: normalizeImportDate(valueFromRow(row, ['到货时间', '到货日期', 'arrived date', 'arrival date'])),
    status: valueFromRow(row, ['状态', 'status']) || '在途',
    note: valueFromRow(row, ['备注', 'note', 'notes', 'remark'])
  };
  if (!item.items && !item.trackingNo && !item.supplier) return null;
  return item;
}

function splitDelimitedLine(line, delimiter) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function parseDelimitedRows(buffer, delimiter) {
  const lines = buffer.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  const headers = splitDelimitedLine(lines.shift() || '', delimiter).map(header => header.trim());
  return lines.map(line => {
    const values = splitDelimitedLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
  });
}

async function parseShipmentImportRows(body) {
  let ExcelJS;
  try {
    ExcelJS = require('exceljs');
  } catch {
    throw new Error('服务器还没有安装 Excel 解析组件，请重新部署后再导入');
  }
  const base64 = String(body.fileBase64 || '').replace(/^data:.*?;base64,/, '');
  if (!base64) throw new Error('没有收到上传文件');
  const buffer = Buffer.from(base64, 'base64');
  const fileName = String(body.fileName || '').toLowerCase();
  if (fileName.endsWith('.csv')) return parseDelimitedRows(buffer, ',');
  if (fileName.endsWith('.tsv')) return parseDelimitedRows(buffer, '\t');
  if (fileName.endsWith('.xls')) throw new Error('暂不支持旧版 .xls，请另存为 .xlsx 或 CSV 后再上传');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('Excel 里没有可读取的工作表');
  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.text || cell.value || '').trim();
  });
  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const item = {};
    headers.forEach((header, index) => {
      item[header || `column${index + 1}`] = String(row.getCell(index + 1).text || row.getCell(index + 1).value || '').trim();
    });
    if (Object.values(item).some(value => String(value || '').trim())) rows.push(item);
  });
  return rows;
}

function normalizedWarrantyName(value) {
  return String(value || '').trim().toLocaleLowerCase().replace(/[\s·._-]+/g, '');
}

function normalizedWarrantyPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length > 10 && digits.startsWith('1') ? digits.slice(-10) : digits;
}

function inferWarrantyCategory(item = {}) {
  const explicit = String(item.productCategory || '').trim();
  if (['ppf', 'automotiveWindowFilm', 'vehicleColorChange', 'architecturalGlassFilm'].includes(explicit)) return explicit;
  const text = `${item.product || ''} ${item.productSeries || ''}`.toLowerCase();
  if (/architect|building|建筑/.test(text)) return 'architecturalGlassFilm';
  if (/window|tint|窗膜/.test(text)) return 'automotiveWindowFilm';
  if (/wrap|color change|改色/.test(text)) return 'vehicleColorChange';
  return 'ppf';
}

function normalizeWarrantyRecord(item) {
  item.customerName = String(item.customerName || '').trim().slice(0, 120);
  item.phone = String(item.phone || '').trim().slice(0, 40);
  item.email = String(item.email || '').trim().slice(0, 160);
  item.licensePlate = String(item.licensePlate || '').trim().toUpperCase().slice(0, 30);
  item.vehicle = String(item.vehicle || '').trim().slice(0, 160);
  item.installDate = String(item.installDate || '').trim().slice(0, 10);
  item.product = String(item.product || '').trim().slice(0, 200);
  item.productCategory = inferWarrantyCategory(item);
  item.colorChangeSubtype = item.productCategory === 'vehicleColorChange' && String(item.colorChangeSubtype || '') === 'colorPpf' ? 'colorPpf' : (item.productCategory === 'vehicleColorChange' ? 'pvc' : '');
  item.productSeries = String(item.productSeries || '').trim().slice(0, 200);
  item.vehicleVin = String(item.vehicleVin || '').trim().toUpperCase().slice(0, 40);
  item.installerName = String(item.installerName || '').trim().slice(0, 200);
  item.installedWindows = String(item.installedWindows || '').trim().slice(0, 1000);
  item.filmVlt = String(item.filmVlt || '').trim().slice(0, 120);
  item.transferPolicy = String(item.transferPolicy || '').trim().slice(0, 200);
  item.colorCode = String(item.colorCode || '').trim().slice(0, 160);
  item.verticalWarrantyTerm = String(item.verticalWarrantyTerm || '').trim().slice(0, 160);
  item.horizontalWarrantyTerm = String(item.horizontalWarrantyTerm || '').trim().slice(0, 160);
  item.installedPanels = String(item.installedPanels || '').trim().slice(0, 1000);
  item.projectName = String(item.projectName || '').trim().slice(0, 200);
  item.projectAddress = String(item.projectAddress || '').trim().slice(0, 500);
  item.propertyType = String(item.propertyType || '').trim().slice(0, 160);
  item.applicationType = String(item.applicationType || '').trim().slice(0, 160);
  item.installationSide = String(item.installationSide || '').trim().slice(0, 160);
  item.installationArea = String(item.installationArea || '').trim().slice(0, 160);
  item.filmWarrantyTerm = String(item.filmWarrantyTerm || '').trim().slice(0, 160);
  item.glassBreakageCoverage = String(item.glassBreakageCoverage || '').trim().slice(0, 80);
  item.sealFailureCoverage = String(item.sealFailureCoverage || '').trim().slice(0, 80);
  item.areas = String(item.areas || '').trim().slice(0, 1000);
  item.warrantyUntil = String(item.warrantyUntil || '').trim().slice(0, 10);
  item.warrantyContent = String(item.warrantyContent || '').trim().slice(0, 5000);
  item.internalNote = String(item.internalNote || '').trim().slice(0, 2000);
  item.photos = (Array.isArray(item.photos) ? item.photos : [])
    .filter(photo => String(photo?.url || '').includes('/customer-media/') && String(photo?.type || '').startsWith('image/'))
    .slice(0, 20)
    .map(photo => ({
      url: String(photo.url),
      name: String(photo.name || '车辆照片').slice(0, 160),
      type: String(photo.type || 'image/jpeg').slice(0, 100),
      size: Math.max(0, Number(photo.size || 0))
    }));
}

function validateWarrantyRecord(item) {
  if (!item.customerName) return '请填写客户姓名';
  if (normalizedWarrantyPhone(item.phone).length < 7) return '请填写有效的客户手机号';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.installDate)) return '请选择施工日期';
  if (item.productCategory === 'architecturalGlassFilm') {
    if (!item.projectName && !item.projectAddress) return '请至少填写项目名称或项目地址';
  } else if (!item.vehicle && !item.licensePlate) return '请至少填写车辆信息或车牌';
  if (!item.product) return '请填写施工产品';
  if (!item.areas) return '请填写贴膜部位';
  if (!item.warrantyContent) return '请填写质保内容';
  if (item.warrantyUntil && !/^\d{4}-\d{2}-\d{2}$/.test(item.warrantyUntil)) return '质保到期日期格式不正确';
  return '';
}

function publicWarrantyRecord(item) {
  const phone = normalizedWarrantyPhone(item.phone);
  return {
    id: item.id,
    customerName: item.customerName,
    phone: phone ? `***-***-${phone.slice(-4)}` : '',
    licensePlate: item.licensePlate,
    vehicle: item.vehicle,
    installDate: item.installDate,
    product: item.product,
    productCategory: inferWarrantyCategory(item),
    colorChangeSubtype: item.colorChangeSubtype || '',
    productSeries: item.productSeries || '',
    vehicleVin: item.vehicleVin || '',
    installerName: item.installerName || '',
    installedWindows: item.installedWindows || '',
    filmVlt: item.filmVlt || '',
    transferPolicy: item.transferPolicy || '',
    colorCode: item.colorCode || '',
    verticalWarrantyTerm: item.verticalWarrantyTerm || '',
    horizontalWarrantyTerm: item.horizontalWarrantyTerm || '',
    installedPanels: item.installedPanels || '',
    projectName: item.projectName || '',
    projectAddress: item.projectAddress || '',
    propertyType: item.propertyType || '',
    applicationType: item.applicationType || '',
    installationSide: item.installationSide || '',
    installationArea: item.installationArea || '',
    filmWarrantyTerm: item.filmWarrantyTerm || '',
    glassBreakageCoverage: item.glassBreakageCoverage || '',
    sealFailureCoverage: item.sealFailureCoverage || '',
    areas: item.areas,
    warrantyUntil: item.warrantyUntil,
    warrantyContent: item.warrantyContent,
    photos: item.photos || []
  };
}

function allowWarrantyLookup(req) {
  const key = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const recent = (warrantyLookupAttempts.get(key) || []).filter(at => now - at < 60 * 1000);
  if (recent.length >= 20) return false;
  recent.push(now);
  warrantyLookupAttempts.set(key, recent);
  if (warrantyLookupAttempts.size > 1000) {
    for (const [ip, attempts] of warrantyLookupAttempts) {
      if (!attempts.some(at => now - at < 60 * 1000)) warrantyLookupAttempts.delete(ip);
    }
  }
  return true;
}

async function api(req, res) {
  const db = readDb();
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST' && url.pathname === '/api/login') {
    const body = await readBody(req);
    const user = db.users.find(u => u.email.toLowerCase() === String(body.email || '').toLowerCase() && u.active);
    if (!user || !verifyPassword(body.password, user.passwordHash)) return send(res, 401, { error: '邮箱或密码不正确' });
    const token = createSessionToken(user);
    sessions.set(token, { userId: user.id, at: Date.now() });
    return send(res, 200, { token, user: safeUser(user) });
  }

  if (url.pathname.startsWith('/api/agent/customer-tasks')) {
    const agent = customerServiceAgentUser(req);
    if (!agent) return send(res, 401, { error: '客服助手令牌无效或尚未配置' });
    if (req.method === 'GET' && url.pathname === '/api/agent/customer-tasks') {
      const filter = ['active', 'all', 'reply', 'first', 'followup', 'future', 'sent'].includes(url.searchParams.get('filter')) ? url.searchParams.get('filter') : 'active';
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50)));
      const allRows = customerServiceTaskRows(db, filter);
      return send(res, 200, {
        apiVersion: 2,
        mode: 'direct-send',
        message: '此接口可以通过 Yelp 或 Twilio 直接发送纯文字回复；发送前必须先领取任务、选择可用渠道并提供唯一请求编号。',
        total: allRows.length,
        tasks: allRows.slice(0, limit).map(safeCustomerServiceTask)
      }, undefined, req);
    }
    const agentTaskMatch = url.pathname.match(/^\/api\/agent\/customer-tasks\/(customerConversations|prospects)\/([^/]+)\/(claim|release|draft|send)$/);
    if (req.method === 'POST' && agentTaskMatch) {
      const [, collection, recordId, action] = agentTaskMatch;
      const item = (db[collection] || []).find(row => row.id === recordId);
      if (!item) return send(res, 404, { error: '找不到客户任务' });
      const now = new Date();
      const claimActive = String(item.taskClaimedByUserId || '').startsWith('customer-service-agent-') && now.getTime() - new Date(item.taskClaimedAt || 0).getTime() < 15 * 60 * 1000;
      if (action === 'claim') {
        if (claimActive && item.taskClaimedByUserId !== agent.id) return send(res, 409, { error: `任务正在由 ${item.taskClaimedByName || '其他人员'} 处理` });
        item.taskClaimedByUserId = agent.id;
        item.taskClaimedByName = agent.name;
        item.taskClaimedAt = now.toISOString();
      } else if (action === 'release') {
        if (claimActive && item.taskClaimedByUserId !== agent.id) return send(res, 409, { error: '不能释放其他人员领取的任务' });
        delete item.taskClaimedByUserId;
        delete item.taskClaimedByName;
        delete item.taskClaimedAt;
      } else if (action === 'draft') {
        const body = await readBody(req);
        const text = String(body.replyText || '').trim();
        const note = String(body.note || '').trim().slice(0, 2000);
        const disposition = ['ready_for_review', 'needs_human', 'no_reply_needed'].includes(body.disposition) ? body.disposition : 'ready_for_review';
        if (disposition === 'ready_for_review' && !text) return send(res, 400, { error: '请填写建议回复内容' });
        if (text.length > 1600) return send(res, 400, { error: '建议回复不能超过 1600 个字符' });
        item.agentReplyDraft = { text, note, disposition, createdAt: now.toISOString(), createdBy: agent.name, apiVersion: 1 };
        if (body.followUpDate) {
          const followUpDate = String(body.followUpDate || '').trim();
          const followUpTime = String(body.followUpTime || '09:00').trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(followUpDate) || !/^\d{2}:\d{2}$/.test(followUpTime)) return send(res, 400, { error: '跟进日期或时间格式不正确' });
          item.followUpDate = followUpDate;
          item.followUpTime = followUpTime;
          item.followUpReason = String(body.followUpReason || note || '客服助手建议跟进').trim().slice(0, 500);
        }
        delete item.taskClaimedByUserId;
        delete item.taskClaimedByName;
        delete item.taskClaimedAt;
      } else {
        const body = await readBody(req);
        const text = String(body.text || '').trim();
        const availableChannels = customerServiceAvailableChannels(item);
        const channel = String(body.channel || availableChannels[0] || '').trim().toLowerCase();
        const requestId = String(body.requestId || req.headers['idempotency-key'] || '').trim().slice(0, 120);
        if (!requestId || !/^[a-zA-Z0-9._:-]{8,120}$/.test(requestId)) return send(res, 400, { error: '请提供至少 8 位的唯一请求编号 requestId' });
        const previousSend = customerServiceAgentSends(item).find(row => row.requestId === requestId);
        if (previousSend) return send(res, 200, { ok: true, duplicate: true, channel: previousSend.channel || 'sms', sid: previousSend.sid, status: previousSend.status, sentAt: previousSend.sentAt });
        if (!claimActive || item.taskClaimedByUserId !== agent.id) return send(res, 409, { error: '发送前必须先由当前客服助手领取任务' });
        if (!availableChannels.includes(channel)) return send(res, 400, { error: `这条客户记录不能使用 ${channel || '所选'} 渠道；可用渠道：${availableChannels.join(', ') || '无'}` });
        if (!text) return send(res, 400, { error: '回复内容不能为空' });
        if (text.length > 1600) return send(res, 400, { error: '回复内容不能超过 1600 个字符' });
        const sentAt = now.toISOString();
        let sendRecord;
        if (channel === 'yelp') {
          const sent = await sendYelpReply({
            leadId: String(item.externalId).trim(),
            businessId: String(item.externalBusinessId || '').trim(),
            text,
            requestId
          });
          item.conversationMessages = [...(Array.isArray(item.conversationMessages) ? item.conversationMessages : []), {
            id: requestId, externalEventId: requestId,
            speaker: 'shop', speakerName: agent.name, direction: 'outbound', channel: 'yelp', text,
            timestamp: sentAt, provider: 'yelp-zapier', status: String(sent.status || 'accepted')
          }];
          item.lastYelpAt = sentAt;
          item.lastYelpDirection = 'outbound';
          sendRecord = { requestId, channel, sid: '', status: String(sent.status || 'accepted'), sentAt, agentName: agent.name };
        } else {
          const phoneDigits = normalizedPhone(item.phone);
          const to = `+1${phoneDigits}`;
          const sent = await sendTwilioSms({
            to,
            body: text,
            statusCallback: `${requestPublicBaseUrl(req)}/api/twilio/status`
          });
          appendSmsMessage(item, {
            id: `twilio-${sent.sid || id()}`,
            speaker: 'shop', speakerName: agent.name, direction: 'outbound', channel: 'sms', text,
            timestamp: sentAt, provider: 'twilio', providerSid: String(sent.sid || ''),
            status: String(sent.status || 'queued'), from: String(sent.from || twilioConfig().fromNumber), to
          });
          sendRecord = { requestId, channel, sid: String(sent.sid || ''), status: String(sent.status || 'queued'), sentAt, agentName: agent.name };
          item.agentSmsSends = [...(item.agentSmsSends || []).slice(-49), sendRecord];
        }
        item.agentSends = [...(item.agentSends || []).slice(-99), sendRecord];
        item.updatedAt = sentAt;
        if (item.followUpDate) {
          item.lastFollowUpCompletedAt = sentAt;
          item.lastFollowUpReason = item.followUpReason || '';
          delete item.followUpDate;
          delete item.followUpTime;
          delete item.followUpReason;
          delete item.followUpCompletedAt;
        }
        delete item.agentReplyDraft;
        delete item.taskClaimedByUserId;
        delete item.taskClaimedByName;
        delete item.taskClaimedAt;
      }
      audit(db, agent, `agent-customer-task-${action}`, {
        collection, recordId: item.id, recordLabel: item.customer || item.phone,
        detail: action === 'draft' ? `客服助手提交处理结果：${item.agentReplyDraft.disposition}` : action === 'send' ? '客服助手直接发送客户回复' : `客服助手${action === 'claim' ? '领取' : '释放'}任务`
      });
      writeDb(db);
      notifyDataChanged(`agent-customer-task-${action}`, item.id);
      return send(res, 200, { ok: true, task: safeCustomerServiceTask({ item, collection, taskType: customerServiceTaskType(item) }) });
    }
    return send(res, 404, { error: '客服助手接口不存在' });
  }

  if (req.method === 'POST' && url.pathname === '/api/warranty/lookup') {
    if (!allowWarrantyLookup(req)) return send(res, 429, { error: 'Too many lookup attempts. Please try again later.' });
    const body = await readBody(req);
    const name = normalizedWarrantyName(body.name);
    const phone = normalizedWarrantyPhone(body.phone);
    if (name.length < 2 || phone.length < 7) return send(res, 400, { error: 'Please enter the full registered name and phone number.' });
    const matches = (db.warranties || [])
      .filter(item => normalizedWarrantyName(item.customerName) === name && normalizedWarrantyPhone(item.phone) === phone)
      .sort((a, b) => String(b.installDate || '').localeCompare(String(a.installDate || '')))
      .map(publicWarrantyRecord);
    return send(res, 200, { warranties: matches });
  }

  if (req.method === 'POST' && url.pathname === '/api/customer/login') {
    const body = await readBody(req);
    const login = String(body.login || '').trim().toLowerCase();
    const customer = (db.portalCustomers || []).find(item => item.active !== false && [item.email, item.phone, item.account].some(value => String(value || '').trim().toLowerCase() === login));
    if (!customer || !verifyPassword(body.password, customer.passwordHash)) return send(res, 401, { error: 'The account or password is incorrect.' });
    const token = createCustomerSessionToken(customer);
    return send(res, 200, { token, customer: safePortalCustomer(customer) });
  }

  if (url.pathname.startsWith('/api/customer/')) {
    const customer = currentPortalCustomer(req, db);
    if (!customer) return send(res, 401, { error: 'Please log in to your customer account.' });
    if (req.method === 'GET' && url.pathname === '/api/customer/bootstrap') return send(res, 200, portalCustomerSnapshot(db, customer), undefined, req);
    if (req.method === 'POST' && url.pathname === '/api/customer/logout') return send(res, 200, { ok: true });
    if (req.method === 'POST' && url.pathname === '/api/customer/media') {
      const body = await readBody(req);
      const name = String(body.name || 'Customer attachment').trim().slice(0, 160);
      const match = String(body.dataUrl || '').match(/^data:([^;,]+);base64,(.+)$/s);
      if (!match) return send(res, 400, { error: 'The attachment format is invalid.' });
      const type = String(match[1] || 'application/octet-stream').slice(0, 120);
      const data = Buffer.from(match[2], 'base64');
      if (!data.length || data.length > 5 * 1024 * 1024) return send(res, 400, { error: 'The attachment must be smaller than 5 MB.' });
      fs.mkdirSync(CUSTOMER_MEDIA_DIR, { recursive: true });
      const fileName = `${crypto.randomBytes(6).toString('hex')}${safeCustomerMediaExtension(name, type)}`;
      fs.writeFileSync(path.join(CUSTOMER_MEDIA_DIR, fileName), data);
      const item = { name, type, size: data.length, url: `${requestPublicBaseUrl(req)}/customer-media/${fileName}` };
      audit(db, { id: `customer-${customer.id}`, name: customer.businessName || customer.contactName }, 'customer-portal-upload', `客户上传附件 ${name}`);
      writeDb(db);
      return send(res, 200, item);
    }
    if (req.method === 'POST' && url.pathname === '/api/customer/orders') {
      const body = await readBody(req);
      const requestId = String(body.requestId || '').slice(0, 120);
      const duplicate = requestId && (db.salesOrders || []).find(order => order.portalCustomerId === customer.id && order.portalRequestId === requestId);
      if (duplicate) return send(res, 200, portalCustomerSnapshot(db, customer));
      const requested = (Array.isArray(body.items) ? body.items : []).slice(0, 50);
      const items = requested.map(line => {
        const product = db.products.find(row => row.sku === String(line.sku || ''));
        const price = product ? portalProductForCustomer(db, product, customer).price : null;
        const qty = Number(line.qty || 0);
        return product && price !== null && Number.isFinite(Number(price)) && qty > 0 ? { item: product.sku, qty, unitPrice: Number(price) } : null;
      }).filter(Boolean);
      const customerDemand = String(body.customerDemand || '').trim().slice(0, 3000);
      if (!items.length && !customerDemand) return send(res, 400, { error: 'Select a product or enter a special request.' });
      if (!items.length) items.push({ item: 'CUSTOM-CUSTOMER-REQUEST', qty: 1, unitPrice: 0 });
      const now = new Date().toISOString();
      const order = { id: id(), date: dateInTimezone(db.settings?.timezone || 'America/Los_Angeles', 0), type: 'wholesale-us', customer: customer.businessName || customer.contactName, salesRep: customer.salesRep || '', preparedBy: '客户客户端', items, item: items[0].item, qty: items[0].qty, unitPrice: items[0].unitPrice, status: '待客服确认', shipping: '', trackingNo: '', paid: 0, paymentMethod: '', note: customerDemand, customerDemand, portalCustomerId: customer.id, portalRequestId: requestId, portalSource: true, portalNew: true, portalAttachments: Array.isArray(body.attachments) ? body.attachments.slice(0, 10) : [], portalMessages: [{ id: id(), sender: 'customer', senderName: customer.contactName || customer.businessName, text: customerDemand || 'The customer submitted a new order.', createdAt: now }], createdAt: now };
      db.salesOrders.push(order);
      audit(db, { id: `customer-${customer.id}`, name: customer.businessName || customer.contactName }, 'create-customer-portal-order', { collection: 'salesOrders', recordId: order.id, recordLabel: order.customer, detail: `客户客户端提交新订单 ${order.customer}` });
      writeDb(db); notifyDataChanged('customer-portal-order', order.id);
      return send(res, 201, portalCustomerSnapshot(db, customer));
    }
    const messageMatch = url.pathname.match(/^\/api\/customer\/orders\/([^/]+)\/messages$/);
    if (req.method === 'POST' && messageMatch) {
      const order = (db.salesOrders || []).find(item => item.id === messageMatch[1] && item.portalCustomerId === customer.id);
      if (!order) return send(res, 404, { error: 'Order not found.' });
      const body = await readBody(req); const text = String(body.text || '').trim().slice(0, 4000); const attachment = body.attachment && String(body.attachment.url || '').includes('/customer-media/') ? body.attachment : null;
      if (!text && !attachment) return send(res, 400, { error: 'Enter a message or upload an attachment.' });
      order.portalMessages = [...(order.portalMessages || []), { id: id(), sender: 'customer', senderName: customer.contactName || customer.businessName, text, attachment, createdAt: new Date().toISOString() }];
      order.portalCustomerUnread = true; order.updatedAt = new Date().toISOString(); writeDb(db); notifyDataChanged('customer-portal-message', order.id);
      return send(res, 200, portalCustomerSnapshot(db, customer));
    }
    return send(res, 404, { error: 'Not found' });
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return send(res, 200, {
      ok: true,
      service: 'film-shop-cloud-app',
      version: version.version,
      build: version.build,
      port: PORT,
      publicUrl: config.publicUrl || null,
      time: new Date().toISOString()
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/twilio/voice') {
    const raw = await readRawBody(req);
    const params = Object.fromEntries(new URLSearchParams(raw));
    if (!validateTwilioSignature(req, params)) return send(res, 403, { error: 'Twilio signature verification failed' });
    const forwardNumber = normalizeForwardingPhone(db.settings?.callForwardNumber);
    const fromNumber = normalizeForwardingPhone(twilioConfig().fromNumber);
    const enabled = Boolean(db.settings?.callForwardEnabled && forwardNumber && forwardNumber !== fromNumber);
    const caller = String(params.From || '').trim();
    audit(db, { id: 'twilio-voice', name: 'Twilio Voice' }, 'receive-customer-call', {
      collection: 'settings',
      recordId: 'call-forwarding',
      recordLabel: caller || '未知来电',
      detail: enabled ? `来电 ${caller || '未知号码'} 已转接` : `来电 ${caller || '未知号码'}，电话转接未启用`
    });
    writeDb(db);
    if (!enabled) {
      return send(res, 200, '<?xml version="1.0" encoding="UTF-8"?><Response><Say language="en-US">Thank you for calling QUAD Film. Phone forwarding is currently unavailable. Please send us a text message.</Say></Response>', 'text/xml; charset=utf-8');
    }
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial timeout="25" answerOnBridge="true"><Number>${escapeXml(forwardNumber)}</Number></Dial><Say language="en-US">The person you are calling is unavailable. Please send us a text message.</Say></Response>`;
    return send(res, 200, twiml, 'text/xml; charset=utf-8');
  }

  if (req.method === 'POST' && url.pathname === '/api/twilio/inbound') {
    const raw = await readRawBody(req);
    const params = Object.fromEntries(new URLSearchParams(raw));
    if (!validateTwilioSignature(req, params)) return send(res, 403, { error: 'Twilio signature verification failed' });
    const from = String(params.From || '').trim();
    const body = String(params.Body || '').trim();
    const mediaCount = Number(params.NumMedia || 0);
    const messageSid = String(params.MessageSid || params.SmsMessageSid || '').trim();
    if (from && (body || mediaCount > 0)) {
      let match = findConversationByPhone(db, from);
      if (!match) {
        const now = new Date().toISOString();
        const item = {
          id: id(),
          date: dateInTimezone(db.settings?.timezone),
          source: 'Twilio SMS',
          customer: `短信客户 ${from}`,
          phone: from,
          status: '新意向',
          intentLevel: '普通',
          createdAt: now,
          importedAt: now,
          updatedAt: now,
          createdBy: 'Twilio 入站短信',
          createdByUserId: 'twilio-webhook',
          conversationMessages: []
        };
        db.customerConversations.unshift(item);
        match = { collection: 'customerConversations', item };
      }
      const attachment = mediaCount > 0 ? await saveTwilioInboundMedia(
        String(params.MediaUrl0 || ''),
        String(params.MediaContentType0 || ''),
        requestPublicBaseUrl(req)
      ).catch(err => {
        console.warn(err.message);
        return null;
      }) : null;
      const duplicate = (match.item.conversationMessages || []).some(message => message.providerSid === messageSid && messageSid);
      let reactivated = false;
      if (!duplicate) {
        const receivedAt = String(params.DateSent || new Date().toISOString());
        appendSmsMessage(match.item, {
          id: `twilio-${messageSid || id()}`,
          speaker: 'customer',
          speakerName: match.item.customer || from,
          direction: 'inbound',
          channel: 'sms',
          text: (body || (mediaCount > 0 && !attachment ? '收到附件，但附件下载失败' : '')).slice(0, 4000),
          attachment,
          timestamp: receivedAt,
          provider: 'twilio',
          providerSid: messageSid,
          status: String(params.SmsStatus || 'received')
        });
        reactivated = reactivateConversationOnInbound(match.item, receivedAt);
      }
      audit(db, { id: 'twilio-webhook', name: 'Twilio' }, 'receive-customer-sms', {
        collection: match.collection,
        recordId: match.item.id,
        recordLabel: match.item.customer || from,
        detail: `收到 ${from} 的${attachment ? '图片/附件' : '短信'}${reactivated ? `；${reactivated}客户已恢复为新意向并进入待回复` : ''}`
      });
      writeDb(db);
      notifyDataChanged('receive-customer-sms', match.item.id);
    }
    return send(res, 200, '<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 'text/xml; charset=utf-8');
  }

  if (req.method === 'POST' && url.pathname === '/api/twilio/status') {
    const raw = await readRawBody(req);
    const params = Object.fromEntries(new URLSearchParams(raw));
    if (!validateTwilioSignature(req, params)) return send(res, 403, { error: 'Twilio signature verification failed' });
    const messageSid = String(params.MessageSid || '').trim();
    const status = String(params.MessageStatus || params.SmsStatus || '').trim();
    let changedItem = null;
    let changedCollection = '';
    let changedMessage = null;
    for (const collection of ['customerConversations', 'prospects']) {
      for (const item of (db[collection] || [])) {
        const message = (item.conversationMessages || []).find(row => row.providerSid === messageSid);
        if (!message) continue;
        message.status = status || message.status;
        message.statusUpdatedAt = new Date().toISOString();
        if (params.ErrorCode) message.errorCode = String(params.ErrorCode);
        changedItem = item;
        changedCollection = collection;
        changedMessage = message;
        break;
      }
      if (changedItem) break;
    }
    if (changedItem) {
      if (['failed', 'undelivered'].includes(status) && changedMessage?.attachment?.kind === 'image' && changedMessage.attachment.url && !changedMessage.fallbackSentAt) {
        try {
          const fallbackText = `图片：${changedMessage.attachment.name || '查看图片'} ${changedMessage.attachment.url}`;
          const fallback = await sendTwilioSms({ to: changedMessage.to || `+1${normalizedPhone(changedItem.phone)}`, body: fallbackText });
          changedMessage.fallbackSentAt = new Date().toISOString();
          changedMessage.fallbackProviderSid = String(fallback.sid || '');
          appendSmsMessage(changedItem, {
            id: `twilio-${fallback.sid || id()}`,
            speaker: 'shop', speakerName: '系统自动补发', direction: 'outbound', channel: 'sms',
            text: fallbackText, timestamp: new Date().toISOString(), provider: 'twilio',
            providerSid: String(fallback.sid || ''), status: String(fallback.status || 'queued'),
            from: String(fallback.from || twilioConfig().fromNumber), to: changedMessage.to || `+1${normalizedPhone(changedItem.phone)}`,
            sourceMessageId: changedMessage.id
          });
          audit(db, { id: 'twilio-fallback', name: 'Twilio' }, 'fallback-customer-image-link', {
            collection: changedCollection, recordId: changedItem.id, recordLabel: changedItem.customer || changedItem.phone,
            detail: `MMS 图片失败，已自动补发链接，错误码 ${params.ErrorCode || ''}`
          });
        } catch (err) {
          changedMessage.fallbackError = err.message;
        }
      }
      writeDb(db);
      notifyDataChanged('customer-sms-status', changedItem.id);
    }
    return send(res, 200, '<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 'text/xml; charset=utf-8');
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    sessions.delete(token);
    return send(res, 200, { ok: true });
  }

  let user = currentUser(req, db);
  if (!user && req.method === 'POST' && url.pathname === '/api/import/prospects') {
    user = prospectImportUser(req);
  }
  if (!user && req.method === 'POST' && url.pathname === '/api/import/customer-conversations') {
    user = customerConversationImportUser(req);
  }
  if (!user && req.method === 'GET' && url.pathname === '/api/events') {
    const eventUser = currentUserFromToken(url.searchParams.get('token'), db);
    if (!eventUser) return send(res, 401, { error: '请先登录' });
    return openEventStream(req, res, eventUser);
  }
  if (!user) return send(res, 401, { error: '请先登录' });

  if (req.method === 'GET' && url.pathname === '/api/events') {
    return openEventStream(req, res, user);
  }

  if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
    return send(res, 200, { user: safeUser(user), data: sanitizeDbForUser(db, user), revision: databaseRevision() }, undefined, req);
  }

  const customerSeenMatch = url.pathname.match(/^\/api\/customer-records\/(customerConversations|prospects)\/([^/]+)\/seen$/);
  if (req.method === 'POST' && customerSeenMatch) {
    if (!canAccess(user, 'prospectsView')) return send(res, 403, { error: '没有查看客户的权限' });
    const [, collection, recordId] = customerSeenMatch;
    const item = (db[collection] || []).find(row => row.id === recordId);
    if (!item) return send(res, 404, { error: '找不到客户' });
    if (item.newCustomer) {
      item.newCustomer = false;
      item.newCustomerSeenAt = new Date().toISOString();
      item.newCustomerSeenBy = user.name || user.email;
      item.newCustomerSeenByUserId = user.id;
      writeDb(db);
      notifyDataChanged('customer-record-seen', { collection, recordId });
    }
    return send(res, 200, sanitizeDbForUser(db, user));
  }

  const customerTaskClaimMatch = url.pathname.match(/^\/api\/customer-tasks\/(customerConversations|prospects)\/([^/]+)\/(claim|release)$/);
  if (req.method === 'POST' && customerTaskClaimMatch) {
    return send(res, 403, { error: 'AI 客服任务只允许 Codex AI 领取；网页登录用户仅可查看' });
  }

  const portalCustomerMatch = url.pathname.match(/^\/api\/portal-customers(?:\/([^/]+))?$/);
  if (portalCustomerMatch) {
    if (!canAccess(user, req.method === 'GET' ? 'ordersView' : 'ordersEdit')) return send(res, 403, { error: '没有客户管理权限' });
    const customerId = portalCustomerMatch[1] || '';
    if (req.method === 'GET') return send(res, 200, (db.portalCustomers || []).map(safePortalCustomer));
    const body = await readBody(req);
    const existingIndex = customerId ? db.portalCustomers.findIndex(item => item.id === customerId) : -1;
    if (customerId && existingIndex < 0) return send(res, 404, { error: '找不到客户' });
    const before = existingIndex >= 0 ? db.portalCustomers[existingIndex] : {};
    const email = String(body.email ?? before.email ?? '').trim().toLowerCase();
    const phone = String(body.phone ?? before.phone ?? '').trim();
    const account = String(body.account ?? before.account ?? email ?? phone).trim();
    if (!String(body.businessName ?? before.businessName ?? '').trim()) return send(res, 400, { error: '请填写客户或公司名称' });
    if (!email && !phone && !account) return send(res, 400, { error: '请填写登录账号、邮箱或电话' });
    if (db.portalCustomers.some(item => item.id !== customerId && [item.email, item.phone, item.account].some(value => [email, phone, account].filter(Boolean).includes(String(value || '').trim().toLowerCase())))) return send(res, 400, { error: '客户登录账号、邮箱或电话已存在' });
    if (existingIndex < 0 && String(body.password || '').length < 8) return send(res, 400, { error: '新客户必须设置至少 8 位密码' });
    const prices = {};
    Object.entries(body.prices && typeof body.prices === 'object' ? body.prices : before.prices || {}).forEach(([sku, value]) => { const price = Number(value); if (Number.isFinite(price) && price >= 0) prices[String(sku)] = price; });
    const item = { ...before, id: customerId || id(), businessName: String(body.businessName ?? before.businessName ?? '').trim().slice(0, 160), contactName: String(body.contactName ?? before.contactName ?? '').trim().slice(0, 120), account: account.toLowerCase(), email, phone, address: String(body.address ?? before.address ?? '').trim().slice(0, 500), salesRep: String(body.salesRep ?? before.salesRep ?? '').trim().slice(0, 120), status: String(body.status ?? before.status ?? '正常').trim().slice(0, 50), note: String(body.note ?? before.note ?? '').trim().slice(0, 2000), active: body.active !== false, prices, createdAt: before.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    item.passwordHash = body.password ? hashPassword(body.password) : before.passwordHash;
    if (existingIndex >= 0) db.portalCustomers[existingIndex] = item; else db.portalCustomers.push(item);
    audit(db, user, existingIndex >= 0 ? 'update-portal-customer' : 'create-portal-customer', { collection: 'portalCustomers', recordId: item.id, recordLabel: item.businessName, detail: `${existingIndex >= 0 ? '修改' : '新增'}客户账号 ${item.businessName}` });
    writeDb(db); notifyDataChanged('portal-customer', item.id);
    return send(res, existingIndex >= 0 ? 200 : 201, { item: safePortalCustomer(item), data: sanitizeDbForUser(db, user) });
  }

  const portalOrderReadMatch = url.pathname.match(/^\/api\/portal-orders\/([^/]+)\/read$/);
  if (req.method === 'POST' && portalOrderReadMatch) {
    if (!canAccess(user, 'ordersView')) return send(res, 403, { error: '没有订单权限' });
    const order = db.salesOrders.find(item => item.id === portalOrderReadMatch[1]); if (!order) return send(res, 404, { error: '找不到订单' });
    order.portalNew = false; order.portalCustomerUnread = false; order.portalReadAt = new Date().toISOString(); order.portalReadBy = user.name || user.email; writeDb(db); notifyDataChanged('portal-order-read', order.id);
    return send(res, 200, sanitizeDbForUser(db, user));
  }

  const portalStaffMessageMatch = url.pathname.match(/^\/api\/portal-orders\/([^/]+)\/messages$/);
  if (req.method === 'POST' && portalStaffMessageMatch) {
    if (!canAccess(user, 'ordersEdit')) return send(res, 403, { error: '没有订单编辑权限' });
    const order = db.salesOrders.find(item => item.id === portalStaffMessageMatch[1]); if (!order?.portalCustomerId) return send(res, 404, { error: '找不到客户订单' });
    const body = await readBody(req); const text = String(body.text || '').trim().slice(0, 4000); if (!text) return send(res, 400, { error: '请输入回复内容' });
    order.portalMessages = [...(order.portalMessages || []), { id: id(), sender: 'staff', senderName: user.name || user.email, text, createdAt: new Date().toISOString() }]; order.updatedAt = new Date().toISOString(); writeDb(db); notifyDataChanged('portal-staff-message', order.id);
    return send(res, 200, sanitizeDbForUser(db, user));
  }

  if (req.method === 'GET' && url.pathname === '/api/sync-status') {
    return send(res, 200, { revision: databaseRevision(), at: new Date().toISOString() }, undefined, req);
  }

  if (req.method === 'POST' && url.pathname === '/api/activity-heartbeat') {
    const body = await readBody(req);
    const now = new Date();
    const bucketAt = new Date(Math.floor(now.getTime() / 300000) * 300000).toISOString();
    const page = String(body.page || '').slice(0, 40);
    const rows = db.employeeActivity || (db.employeeActivity = []);
    const existing = rows.find(row => row.userId === user.id && row.bucketAt === bucketAt);
    if (existing) {
      existing.lastAt = now.toISOString();
      existing.page = page || existing.page;
      existing.signals = Math.min(99, Number(existing.signals || 0) + 1);
    } else {
      rows.push({ id: id(), userId: user.id, userName: user.name, bucketAt, lastAt: now.toISOString(), page, signals: 1 });
    }
    const cutoff = Date.now() - 120 * 24 * 60 * 60 * 1000;
    db.employeeActivity = rows.filter(row => new Date(row.bucketAt).getTime() >= cutoff);
    writeDb(db);
    return send(res, 200, { ok: true, bucketAt });
  }

  if (req.method === 'GET' && url.pathname === '/api/mobile/bootstrap') {
    return send(res, 200, mobileSnapshot(db, user), undefined, req);
  }

  const personalNoteMatch = url.pathname.match(/^\/api\/personal-notes(?:\/([^/]+))?$/);
  if (personalNoteMatch) {
    const noteId = personalNoteMatch[1] || '';
    if (req.method === 'GET') return send(res, 200, (db.personalNotes || []).filter(item => personalNoteVisibleTo(item, user)).map(item => personalNoteForUser(db, item, user)));
    if (req.method === 'POST') {
      const body = await readBody(req);
      const type = body.type === 'task' ? 'task' : 'memo';
      const title = String(body.title || '').trim().slice(0, 200);
      const content = String(body.content || '').trim().slice(0, 20000);
      const remindAt = type === 'task' ? String(body.remindAt || '').trim() : '';
      const requestId = String(body.requestId || '').trim().slice(0, 120);
      if (!title) return send(res, 400, { error: '请填写记事标题' });
      if (type === 'task' && (!remindAt || Number.isNaN(new Date(remindAt).getTime()))) return send(res, 400, { error: '请选择正确的提醒日期和时间' });
      const duplicate = requestId ? (db.personalNotes || []).find(item => item.ownerUserId === user.id && item.requestId === requestId) : null;
      if (duplicate) return send(res, 200, { item: personalNoteForUser(db, duplicate, user), data: sanitizeDbForUser(db, user) });
      const now = new Date().toISOString();
      const sharing = normalizePersonalNoteSharing(db, user, body);
      const item = { id: id(), ownerUserId: user.id, ownerName: user.name || user.email || '员工', requestId, type, title, content, remindAt, snoozedUntil: '', status: 'pending', createdAt: now, updatedAt: now, completedAt: '', ...sharing };
      db.personalNotes.push(item);
      audit(db, user, 'create-personal-note', { collection: 'personalNotes', recordId: item.id, recordLabel: '个人记事', detail: sharing.shareScope === 'private' ? '新增私人记事' : '新增并分享记事' });
      writeDb(db);
      notifyDataChanged('personal-note-created', { ownerUserId: user.id });
      return send(res, 201, { item: personalNoteForUser(db, item, user), data: sanitizeDbForUser(db, user) });
    }
    const index = (db.personalNotes || []).findIndex(item => item.id === noteId && item.ownerUserId === user.id);
    if (index < 0) return send(res, 404, { error: '没有找到这条记事' });
    if (req.method === 'PUT') {
      const body = await readBody(req);
      const existing = db.personalNotes[index];
      const type = body.type === 'task' ? 'task' : 'memo';
      const title = String(body.title || '').trim().slice(0, 200);
      const content = String(body.content || '').trim().slice(0, 20000);
      const remindAt = type === 'task' ? String(body.remindAt || '').trim() : '';
      const snoozedUntil = type === 'task' ? String(body.snoozedUntil || '').trim() : '';
      const status = body.status === 'completed' ? 'completed' : 'pending';
      if (!title) return send(res, 400, { error: '请填写记事标题' });
      if (type === 'task' && (!remindAt || Number.isNaN(new Date(remindAt).getTime()))) return send(res, 400, { error: '请选择正确的提醒日期和时间' });
      if (snoozedUntil && Number.isNaN(new Date(snoozedUntil).getTime())) return send(res, 400, { error: '稍后提醒时间不正确' });
      const sharing = normalizePersonalNoteSharing(db, user, body, existing);
      const item = { ...existing, type, title, content, remindAt, snoozedUntil, status, ...sharing, updatedAt: new Date().toISOString(), completedAt: status === 'completed' ? (existing.completedAt || new Date().toISOString()) : '' };
      db.personalNotes[index] = item;
      audit(db, user, 'update-personal-note', { collection: 'personalNotes', recordId: item.id, recordLabel: '个人记事', detail: status === 'completed' ? '完成个人待办' : '修改个人记事或分享范围' });
      writeDb(db);
      notifyDataChanged('personal-note-updated', { ownerUserId: user.id });
      return send(res, 200, { item: personalNoteForUser(db, item, user), data: sanitizeDbForUser(db, user) });
    }
    if (req.method === 'DELETE') {
      db.personalNotes.splice(index, 1);
      audit(db, user, 'delete-personal-note', { collection: 'personalNotes', recordId: noteId, recordLabel: '私人记事', detail: '删除个人记事（内容保持私密）' });
      writeDb(db);
      notifyDataChanged('personal-note-deleted', { ownerUserId: user.id });
      return send(res, 200, { ok: true, data: sanitizeDbForUser(db, user) });
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (req.method === 'POST' && url.pathname === '/api/mobile/clock') {
    const body = await readBody(req);
    const type = String(body.type || '').trim();
    if (!['in', 'out'].includes(type)) return send(res, 400, { error: '打卡类型不正确' });
    if (body.locationConsent !== true) return send(res, 400, { error: '请先确认同意本次打卡使用手机定位' });
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const accuracy = Number(body.accuracy || 0);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return send(res, 400, { error: '没有获取到手机定位，不能打卡' });
    const address = await reverseGeocode(lat, lng);
    const officeLat = Number(db.settings?.officeLat);
    const officeLng = Number(db.settings?.officeLng);
    const clockRadiusMeters = Number(db.settings?.clockRadiusMeters || 150);
    const officeDistanceMeters = Number.isFinite(officeLat) && Number.isFinite(officeLng)
      ? distanceMeters(lat, lng, officeLat, officeLng)
      : null;
    const officeMatched = Number.isFinite(officeDistanceMeters) && officeDistanceMeters <= clockRadiusMeters;
    const record = {
      id: id(),
      userId: user.id,
      userName: user.name || user.email,
      email: user.email || '',
      type,
      at: new Date().toISOString(),
      date: dateInTimezone(db.settings?.timezone || 'America/Los_Angeles', 0),
      lat,
      lng,
      accuracy: Number.isFinite(accuracy) ? Math.round(accuracy) : 0,
      address,
      mapUrl: mapUrlForLatLng(lat, lng),
      officeAddress: db.settings?.officeAddress || '',
      officeLat: Number.isFinite(officeLat) ? officeLat : null,
      officeLng: Number.isFinite(officeLng) ? officeLng : null,
      officeDistanceMeters,
      clockRadiusMeters,
      officeMatched,
      locationConsent: true,
      note: String(body.note || '').trim().slice(0, 300)
    };
    db.clockRecords.unshift(record);
    db.clockRecords = db.clockRecords.slice(0, 5000);
    audit(db, user, 'mobile-clock', {
      collection: 'clockRecords',
      recordId: record.id,
      recordLabel: `${record.userName} ${record.date} ${type === 'in' ? '上班' : '下班'}`,
      after: record,
      detail: `${record.userName} 手机${type === 'in' ? '上班' : '下班'}打卡`
    });
    writeDb(db);
    notifyDataChanged('mobile-clock', record.id);
    return send(res, 200, mobileSnapshot(db, user));
  }

  if (req.method === 'POST' && url.pathname === '/api/mobile/leave') {
    const body = await readBody(req);
    const startDate = String(body.startDate || '').slice(0, 10);
    const endDate = String(body.endDate || '').slice(0, 10);
    const hours = Number(body.hours || 0);
    const reason = String(body.reason || '').trim();
    if (!startDate || !endDate) return send(res, 400, { error: '请假开始和结束日期不能为空' });
    if (endDate < startDate) return send(res, 400, { error: '结束日期不能早于开始日期' });
    if (!Number.isFinite(hours) || hours <= 0) return send(res, 400, { error: '请假小时数必须大于 0' });
    if (!reason) return send(res, 400, { error: '请填写请假原因' });
    const request = {
      id: id(),
      userId: user.id,
      userName: user.name || user.email,
      email: user.email || '',
      leaveType: String(body.leaveType || '事假').trim().slice(0, 30),
      startDate,
      startTime: String(body.startTime || '').trim().slice(0, 10),
      endDate,
      endTime: String(body.endTime || '').trim().slice(0, 10),
      hours,
      reason: reason.slice(0, 500),
      status: '待审批',
      createdAt: new Date().toISOString()
    };
    db.leaveRequests.unshift(request);
    db.leaveRequests = db.leaveRequests.slice(0, 3000);
    audit(db, user, 'create-leave-request', {
      collection: 'leaveRequests',
      recordId: request.id,
      recordLabel: `${request.userName} ${request.startDate}`,
      after: request,
      detail: `${request.userName} 提交请假 ${request.startDate} 至 ${request.endDate}，${request.hours} 小时`
    });
    writeDb(db);
    notifyDataChanged('create-leave-request', request.id);
    return send(res, 200, mobileSnapshot(db, user));
  }

  const mobileLeaveMatch = url.pathname.match(/^\/api\/mobile\/leave\/([^/]+)$/);
  if (req.method === 'PUT' && mobileLeaveMatch) {
    if (!canApproveLeave(user)) return send(res, 403, { error: '没有审批请假的权限' });
    const body = await readBody(req);
    const leaveId = decodeURIComponent(mobileLeaveMatch[1]);
    const idx = (db.leaveRequests || []).findIndex(item => item.id === leaveId);
    if (idx < 0) return send(res, 404, { error: '找不到请假申请' });
    const status = String(body.status || '').trim();
    if (!['已批准', '已拒绝'].includes(status)) return send(res, 400, { error: '审批状态不正确' });
    const before = db.leaveRequests[idx];
    const next = {
      ...before,
      status,
      reviewNote: String(body.reviewNote || '').trim().slice(0, 300),
      reviewedAt: new Date().toISOString(),
      reviewedBy: user.name || user.email,
      reviewedByUserId: user.id
    };
    db.leaveRequests[idx] = next;
    audit(db, user, 'review-leave-request', {
      collection: 'leaveRequests',
      recordId: next.id,
      recordLabel: `${next.userName} ${next.startDate}`,
      before,
      after: next,
      detail: `${user.name || user.email} 将 ${next.userName} 的请假申请审批为 ${status}`
    });
    writeDb(db);
    notifyDataChanged('review-leave-request', next.id);
    return send(res, 200, mobileSnapshot(db, user));
  }

  if (req.method === 'GET' && url.pathname === '/api/system/info') {
    return send(res, 200, {
      app: version,
      update: {
        channel: config.update?.channel || version.channel,
        checkUrlConfigured: Boolean(config.update?.checkUrl),
        allowRemoteUpgrade: Boolean(config.update?.allowRemoteUpgrade)
      },
      server: {
        host: HOST,
        port: PORT,
        publicUrl: config.publicUrl || null
      }
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/system/check-update') {
    if (!canAccess(user, 'settingsEdit')) return send(res, 403, { error: '没有检查系统升级权限' });
    if (!config.update?.checkUrl) {
      return send(res, 200, {
        currentVersion: version.version,
        currentBuild: version.build,
        updateAvailable: false,
        message: '升级检查地址尚未配置。以后部署云端升级服务后，把地址写入 server-config.json 的 update.checkUrl。'
      });
    }
    return send(res, 200, {
      currentVersion: version.version,
      currentBuild: version.build,
      updateAvailable: false,
      message: '已预留升级检查接口。正式远程升级需要加入 HTTPS、签名校验、备份和回滚后再启用。',
      checkUrl: config.update.checkUrl
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/change-password') {
    const body = await readBody(req);
    const fullUser = db.users.find(u => u.id === user.id);
    if (!verifyPassword(body.oldPassword, fullUser.passwordHash)) return send(res, 400, { error: '旧密码不正确' });
    if (String(body.newPassword || '').length < 8) return send(res, 400, { error: '新密码至少 8 位' });
    fullUser.passwordHash = hashPassword(body.newPassword);
    audit(db, user, 'change-password', '修改自己的登录密码');
    writeDb(db);
    notifyDataChanged('change-password', user.id);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'PUT' && url.pathname === '/api/me') {
    const body = await readBody(req);
    const fullUser = db.users.find(u => u.id === user.id);
    const before = { ...fullUser };
    const nextEmail = String(body.email || '').trim().toLowerCase();
    const nextName = String(body.name || '').trim();
    if (!nextName) return send(res, 400, { error: '姓名不能为空' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) return send(res, 400, { error: '邮箱格式不正确' });
    const duplicate = db.users.find(u => u.id !== user.id && String(u.email || '').toLowerCase() === nextEmail);
    if (duplicate) return send(res, 400, { error: '这个邮箱已经被其他账号使用' });
    if (body.avatarDataUrl !== undefined) {
      const avatarDataUrl = normalizeAvatarDataUrl(body.avatarDataUrl);
      if (avatarDataUrl === null) return send(res, 400, { error: '头像格式不支持或图片太大，请上传 2MB 以内的 JPG/PNG/WebP 图片' });
      fullUser.avatarDataUrl = avatarDataUrl;
    }
    fullUser.name = nextName;
    fullUser.email = nextEmail;
    audit(db, fullUser, 'update-my-profile', {
      collection: 'users',
      recordId: fullUser.id,
      recordLabel: fullUser.name || fullUser.email,
      changedFields: diffRecords(before, fullUser),
      before,
      after: fullUser,
      detail: `修改自己的账号资料 ${nextEmail}`
    });
    writeDb(db);
    notifyDataChanged('update-my-profile', fullUser.id);
    return send(res, 200, { user: safeUser(fullUser), data: sanitizeDbForUser(db, fullUser) });
  }

  if (req.method === 'PUT' && url.pathname === '/api/settings') {
    if (!canAccess(user, 'settingsEdit')) return send(res, 403, { error: '没有修改系统设置权限' });
    const body = await readBody(req);
    if (Object.prototype.hasOwnProperty.call(body, 'callForwardNumber') || Object.prototype.hasOwnProperty.call(body, 'callForwardEnabled')) {
      const forwardNumber = normalizeForwardingPhone(body.callForwardNumber);
      if (body.callForwardEnabled && !forwardNumber) return send(res, 400, { error: '请输入有效的电话转接号码' });
      if (body.callForwardEnabled && forwardNumber === normalizeForwardingPhone(twilioConfig().fromNumber)) {
        return send(res, 400, { error: '转接号码不能填写 QUAD 的 Twilio 发送号码，否则会循环呼叫' });
      }
      body.callForwardEnabled = Boolean(body.callForwardEnabled);
      body.callForwardNumber = forwardNumber;
    }
    const before = { ...db.settings };
    db.settings = { ...db.settings, ...body };
    audit(db, user, 'update-settings', {
      collection: 'settings',
      recordId: 'settings',
      recordLabel: '系统设置',
      changedFields: diffRecords(before, db.settings),
      before,
      after: db.settings,
      detail: '修改系统设置'
    });
    writeDb(db);
    notifyDataChanged('update-settings', 'settings');
    return send(res, 200, sanitizeDbForUser(db, user));
  }

  if (req.method === 'POST' && url.pathname === '/api/schedules/send-reminders') {
    if (!canAccess(user, 'schedulesEdit')) return send(res, 403, { error: '没有发送调休提醒权限' });
    const body = await readBody(req);
    const targetDate = String(body.date || dateInTimezone(db.settings?.timezone, 1)).trim();
    const result = await sendScheduleReminders(db, targetDate, user);
    if (!result.configured) {
      return send(res, 200, {
        ...result,
        message: '邮件服务还没有配置。请在 Railway 环境变量里配置 RESEND_API_KEY 和 REMINDER_FROM_EMAIL 后，系统才能真正自动发邮件。'
      });
    }
    return send(res, 200, result);
  }

  if (req.method === 'GET' && url.pathname === '/api/twilio/config') {
    if (!canAccess(user, 'prospectsView')) return send(res, 403, { error: '没有查看客户交流的权限' });
    const config = twilioConfig();
    return send(res, 200, {
      configured: twilioConfigured(),
      fromNumber: config.fromNumber,
      messagingServiceConfigured: Boolean(config.messagingServiceSid),
      inboundWebhookUrl: `${requestPublicBaseUrl(req)}/api/twilio/inbound`,
      voiceWebhookUrl: `${requestPublicBaseUrl(req)}/api/twilio/voice`,
      callForwardEnabled: Boolean(db.settings?.callForwardEnabled),
      callForwardNumber: String(db.settings?.callForwardNumber || '')
    });
  }

  if (req.method === 'POST' && ['/api/customer-media/upload', '/api/message-media/upload', '/api/job-media/upload', '/api/warranty-media/upload', '/api/reimbursement-media/upload'].includes(url.pathname)) {
    if (url.pathname === '/api/customer-media/upload' && !canAccess(user, 'prospectsEdit')) return send(res, 403, { error: '没有发送客户附件的权限' });
    if (url.pathname === '/api/job-media/upload' && !canAccess(user, 'jobsEdit') && !canAccess(user, 'jobsCreate')) return send(res, 403, { error: '没有修改施工单的权限' });
    if (url.pathname === '/api/warranty-media/upload' && !canAccess(user, 'jobsEdit') && !canAccess(user, 'jobsCreate')) return send(res, 403, { error: '没有修改客户质保的权限' });
    if (url.pathname === '/api/reimbursement-media/upload' && !canAccess(user, 'reimbursementsCreate')) return send(res, 403, { error: '没有提交报销凭证的权限' });
    const requestType = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim().toLowerCase();
    const uploadId = String(req.headers['x-upload-id'] || '').trim();
    if (uploadId) {
      if (!/^[a-zA-Z0-9-]{10,80}$/.test(uploadId)) return send(res, 400, { error: '分片上传编号不正确' });
      const chunkIndex = Number(req.headers['x-chunk-index']);
      const chunkCount = Number(req.headers['x-chunk-count']);
      const declaredSize = Number(req.headers['x-file-size']);
      const maxSize = requestType.startsWith('video/') ? MAX_CUSTOMER_VIDEO_SOURCE_BYTES : requestType.startsWith('image/') ? MAX_CLOUD_IMAGE_BYTES : MAX_CLOUD_FILE_BYTES;
      if (!Number.isInteger(chunkIndex) || !Number.isInteger(chunkCount) || chunkIndex < 0 || chunkIndex >= chunkCount || chunkCount < 2 || chunkCount > 100) return send(res, 400, { error: '分片顺序不正确' });
      if (!Number.isFinite(declaredSize) || declaredSize <= 0 || declaredSize > maxSize) return send(res, 413, { error: requestType.startsWith('video/') ? '视频不能超过 200MB' : '附件不能超过 20MB' });
      let chunk;
      try { chunk = await readBinaryBody(req, MEDIA_UPLOAD_CHUNK_BYTES + 1024); } catch { return send(res, 413, { error: '单个上传分片过大' }); }
      if (!chunk.length || chunk.length > MEDIA_UPLOAD_CHUNK_BYTES) return send(res, 400, { error: '上传分片为空或过大' });
      fs.mkdirSync(MEDIA_UPLOAD_PARTS_DIR, { recursive: true });
      const partPrefix = `${String(user.id).replace(/[^a-zA-Z0-9_-]/g, '')}-${uploadId}`;
      const partPath = path.join(MEDIA_UPLOAD_PARTS_DIR, `${partPrefix}-${chunkIndex}.part`);
      fs.writeFileSync(partPath, chunk);
      if (chunkIndex < chunkCount - 1) return send(res, 200, { ok: true, partial: true, chunkIndex, chunkCount });
      let name = '附件';
      try { name = decodeURIComponent(String(req.headers['x-file-name'] || '附件')).trim().slice(0, 160) || '附件'; } catch {}
      const partPaths = Array.from({ length: chunkCount }, (_, index) => path.join(MEDIA_UPLOAD_PARTS_DIR, `${partPrefix}-${index}.part`));
      if (partPaths.some(item => !fs.existsSync(item))) return send(res, 409, { error: '上传分片不完整，请重新上传' });
      const actualSize = partPaths.reduce((sum, item) => sum + fs.statSync(item).size, 0);
      if (actualSize !== declaredSize || actualSize > maxSize) {
        partPaths.forEach(item => { try { fs.unlinkSync(item); } catch {} });
        return send(res, 400, { error: '上传文件大小校验失败' });
      }
      fs.mkdirSync(CUSTOMER_MEDIA_DIR, { recursive: true });
      const fileName = `${crypto.randomBytes(6).toString('hex')}${safeCustomerMediaExtension(name, requestType)}`;
      const filePath = path.join(CUSTOMER_MEDIA_DIR, fileName);
      const output = fs.openSync(filePath, 'w');
      try {
        for (const item of partPaths) {
          const buffer = fs.readFileSync(item);
          let offset = 0;
          while (offset < buffer.length) offset += fs.writeSync(output, buffer, offset, buffer.length - offset);
        }
      } finally {
        fs.closeSync(output);
        partPaths.forEach(item => { try { fs.unlinkSync(item); } catch {} });
      }
      let durationSeconds = 0;
      if (requestType.startsWith('video/')) {
        try {
          durationSeconds = await cloudVideoDurationSeconds(filePath);
          const maxDuration = url.pathname === '/api/message-media/upload' ? MAX_INTERNAL_MESSAGE_VIDEO_SECONDS : MAX_CLOUD_VIDEO_SECONDS;
          if (durationSeconds > maxDuration) throw new Error(url.pathname === '/api/message-media/upload' ? '站内留言视频最长30秒，请先剪短后重试' : '云端视频最长5分钟，请先剪短后重试');
        } catch (err) {
          try { fs.unlinkSync(filePath); } catch {}
          return send(res, 400, { error: err.message || '视频格式无法读取' });
        }
      }
      const mediaUrl = `${requestPublicBaseUrl(req)}/customer-media/${fileName}`;
      audit(db, user, 'upload-customer-media', `分片上传客户附件 ${name}`);
      writeDb(db);
      return send(res, 200, { ok: true, name, type: requestType, size: actualSize, durationSeconds, url: mediaUrl });
    }
    let name = '附件';
    let contentType = requestType;
    let data;
    if (requestType === 'application/json') {
      const body = await readBody(req);
      name = String(body.name || '附件').trim().slice(0, 160);
      contentType = String(body.type || 'application/octet-stream').trim().slice(0, 120);
      const match = String(body.dataUrl || '').match(/^data:([^;,]+);base64,(.+)$/s);
      if (!match) return send(res, 400, { error: '附件格式不正确' });
      contentType = String(match[1] || contentType).trim().slice(0, 120);
      data = Buffer.from(match[2], 'base64');
    } else {
      try { name = decodeURIComponent(String(req.headers['x-file-name'] || '附件')).trim().slice(0, 160) || '附件'; } catch { name = '附件'; }
      const limit = contentType.startsWith('video/') ? MAX_CUSTOMER_VIDEO_SOURCE_BYTES : contentType.startsWith('image/') ? MAX_CLOUD_IMAGE_BYTES : MAX_CLOUD_FILE_BYTES;
      try { data = await readBinaryBody(req, limit); } catch { return send(res, 413, { error: contentType.startsWith('video/') ? '视频不能超过 200MB' : '附件不能超过 20MB' }); }
    }
    if (!data.length) return send(res, 400, { error: '附件为空' });
    if (contentType.startsWith('video/')) {
      if (data.length > MAX_CUSTOMER_VIDEO_SOURCE_BYTES) return send(res, 400, { error: '视频不能超过 200MB' });
    } else if (contentType.startsWith('image/') ? data.length > MAX_CLOUD_IMAGE_BYTES : data.length > MAX_CLOUD_FILE_BYTES) {
      return send(res, 400, { error: '附件不能超过 20MB' });
    }
    fs.mkdirSync(CUSTOMER_MEDIA_DIR, { recursive: true });
    const fileName = `${crypto.randomBytes(6).toString('hex')}${safeCustomerMediaExtension(name, contentType)}`;
    const filePath = path.join(CUSTOMER_MEDIA_DIR, fileName);
    fs.writeFileSync(filePath, data);
    let durationSeconds = 0;
    if (contentType.startsWith('video/')) {
      try {
        durationSeconds = await cloudVideoDurationSeconds(filePath);
        const maxDuration = url.pathname === '/api/message-media/upload' ? MAX_INTERNAL_MESSAGE_VIDEO_SECONDS : MAX_CLOUD_VIDEO_SECONDS;
        if (durationSeconds > maxDuration) throw new Error(url.pathname === '/api/message-media/upload' ? '站内留言视频最长30秒，请先剪短后重试' : '云端视频最长5分钟，请先剪短后重试');
      } catch (err) {
        try { fs.unlinkSync(filePath); } catch {}
        return send(res, 400, { error: err.message || '视频格式无法读取' });
      }
    }
    const mediaUrl = `${requestPublicBaseUrl(req)}/customer-media/${fileName}`;
    audit(db, user, 'upload-customer-media', `上传客户附件 ${name}`);
    writeDb(db);
    return send(res, 200, { ok: true, name, type: contentType, size: data.length, durationSeconds, url: mediaUrl });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/customer-messages/')) {
    if (!canAccess(user, 'prospectsEdit')) return send(res, 403, { error: '没有删除客户消息的权限' });
    const parts = url.pathname.split('/').slice(3).map(decodeURIComponent);
    const [collection, recordId, messageId] = parts;
    if (!['customerConversations', 'prospects'].includes(collection)) return send(res, 400, { error: '客户类型不正确' });
    const item = (db[collection] || []).find(row => row.id === recordId);
    if (!item) return send(res, 404, { error: '找不到客户记录' });
    const message = (item.conversationMessages || []).find(row => String(row.id) === String(messageId));
    if (!message) return send(res, 404, { error: '找不到这条消息' });
    item.conversationMessages = (item.conversationMessages || []).filter(row => String(row.id) !== String(messageId));
    item.updatedAt = new Date().toISOString();
    const attachmentUrl = String(message.attachment?.url || '');
    if (attachmentUrl.includes('/customer-media/')) {
      const fileName = path.basename(new URL(attachmentUrl).pathname);
      const stillUsed = [...(db.customerConversations || []), ...(db.prospects || [])].some(record =>
        (record.conversationMessages || []).some(row => String(row.attachment?.url || '').endsWith(`/customer-media/${fileName}`))
      );
      if (!stillUsed && /^[a-f0-9]{12,32}\.[a-z0-9]{1,8}$/i.test(fileName)) {
        try { fs.unlinkSync(path.join(CUSTOMER_MEDIA_DIR, fileName)); } catch {}
      }
    }
    audit(db, user, 'delete-customer-message', { collection, recordId: item.id, recordLabel: item.customer || item.phone, detail: `删除客户消息 ${messageId}` });
    writeDb(db);
    notifyDataChanged('delete-customer-message', item.id);
    return send(res, 200, sanitizeDbForUser(db, user));
  }

  if (req.method === 'POST' && url.pathname === '/api/yelp/send') {
    if (!canAccess(user, 'prospectsEdit')) return send(res, 403, { error: '没有发送 Yelp 消息的权限' });
    const body = await readBody(req);
    const collection = String(body.collection || '').trim();
    const recordId = String(body.id || '').trim();
    const text = String(body.text || '').trim();
    if (!['customerConversations', 'prospects'].includes(collection)) return send(res, 400, { error: '客户类型不正确' });
    const item = (db[collection] || []).find(row => row.id === recordId);
    if (!item) return send(res, 404, { error: '找不到客户记录' });
    const requiredChannel = customerServiceRequiredReplyChannel(item);
    if (requiredChannel && requiredChannel !== 'yelp') return send(res, 409, { error: '客户最后通过手机短信联系，请继续使用短信回复，不能同时切换到 Yelp' });
    if (prospectTextKey(item.source) !== 'yelp' || !String(item.externalId || '').trim()) return send(res, 400, { error: '这条客户记录没有可用的 Yelp Lead ID' });
    if (!text) return send(res, 400, { error: 'Yelp 回复内容不能为空' });
    if (text.length > 5000) return send(res, 400, { error: 'Yelp 回复内容不能超过 5000 个字符' });
    const requestId = `quad-yelp-${id()}`;
    await sendYelpReply({
      leadId: String(item.externalId).trim(),
      businessId: String(item.externalBusinessId || '').trim(),
      text,
      requestId
    });
    const now = new Date().toISOString();
    const yelpMessage = {
      id: requestId,
      externalEventId: requestId,
      speaker: 'shop',
      speakerName: user.name || user.email,
      direction: 'outbound',
      channel: 'yelp',
      text,
      timestamp: now,
      provider: 'yelp-zapier',
      status: 'accepted'
    };
    item.conversationMessages = [...(Array.isArray(item.conversationMessages) ? item.conversationMessages : []), yelpMessage];
    item.updatedAt = now;
    item.lastYelpAt = now;
    item.lastYelpDirection = 'outbound';
    audit(db, user, 'send-customer-yelp-message', {
      collection,
      recordId: item.id,
      recordLabel: item.customer || item.externalId,
      detail: `通过 Zapier 向 Yelp Lead ${item.externalId} 发送消息`
    });
    writeDb(db);
    notifyDataChanged('send-customer-yelp-message', item.id);
    return send(res, 200, { ok: true, requestId, data: sanitizeDbForUser(db, user) });
  }

  if (req.method === 'POST' && url.pathname === '/api/twilio/send') {
    if (!canAccess(user, 'prospectsEdit')) return send(res, 403, { error: '没有发送客户短信的权限' });
    const body = await readBody(req);
    const collection = String(body.collection || '').trim();
    const recordId = String(body.id || '').trim();
    let text = String(body.text || '').trim();
    const attachment = body.attachment && typeof body.attachment === 'object' ? body.attachment : null;
    if (!['customerConversations', 'prospects'].includes(collection)) return send(res, 400, { error: '客户类型不正确' });
    const item = (db[collection] || []).find(row => row.id === recordId);
    if (!item) return send(res, 404, { error: '找不到客户记录' });
    const requiredChannel = customerServiceRequiredReplyChannel(item);
    if (requiredChannel && requiredChannel !== 'sms') return send(res, 409, { error: '客户最后通过 Yelp 联系，请继续在 Yelp 回复，不能同时切换到短信' });
    const phoneDigits = normalizedPhone(item.phone);
    if (phoneDigits.length !== 10) return send(res, 400, { error: '客户电话格式不正确，请先填写美国 10 位手机号码' });
    if (!text && !attachment?.url) return send(res, 400, { error: '短信内容或附件不能为空' });
    if (attachment?.url && !String(attachment.url).startsWith(`${requestPublicBaseUrl(req)}/customer-media/`)) {
      return send(res, 400, { error: '附件链接不正确，请重新选择文件' });
    }
    const attachmentType = String(attachment?.type || '');
    const attachmentKind = attachmentType.startsWith('video/') ? 'video' : attachmentType.startsWith('image/') ? 'image' : 'file';
    const twilioMedia = attachment?.url ? await twilioMediaForAttachment(attachment, requestPublicBaseUrl(req)) : { mediaUrl: '', linkText: '' };
    if (twilioMedia.linkText) text = [text, twilioMedia.linkText].filter(Boolean).join('\n');
    if (text.length > 1600) return send(res, 400, { error: '短信内容不能超过 1600 个字符' });
    const to = `+1${phoneDigits}`;
    const sent = await sendTwilioSms({
      to,
      body: text,
      mediaUrl: twilioMedia.mediaUrl,
      statusCallback: `${requestPublicBaseUrl(req)}/api/twilio/status`
    });
    const now = new Date().toISOString();
    appendSmsMessage(item, {
      id: `twilio-${sent.sid || id()}`,
      speaker: 'shop',
      speakerName: user.name || user.email,
      direction: 'outbound',
      channel: 'sms',
      text,
      attachment: attachment?.url ? {
        name: String(attachment.name || '附件').slice(0, 160),
        type: attachmentType.slice(0, 120),
        url: String(attachment.url),
        kind: attachmentKind,
        size: Number(attachment.size || 0)
      } : null,
      timestamp: now,
      provider: 'twilio',
      providerSid: String(sent.sid || ''),
      status: String(sent.status || 'queued'),
      from: String(sent.from || twilioConfig().fromNumber),
      to
    });
    if (item.followUpDate) {
      item.lastFollowUpCompletedAt = now;
      item.lastFollowUpReason = item.followUpReason || '';
      delete item.followUpDate;
      delete item.followUpTime;
      delete item.followUpReason;
      delete item.followUpCompletedAt;
    }
    delete item.agentReplyDraft;
    delete item.taskClaimedByUserId;
    delete item.taskClaimedByName;
    delete item.taskClaimedAt;
    audit(db, user, 'send-customer-sms', {
      collection,
      recordId: item.id,
      recordLabel: item.customer || item.phone,
      detail: `通过 Twilio 向 ${to} 发送短信，状态 ${sent.status || 'queued'}`
    });
    writeDb(db);
    notifyDataChanged('send-customer-sms', item.id);
    return send(res, 200, {
      ok: true,
      sid: String(sent.sid || ''),
      status: String(sent.status || 'queued'),
      to,
      data: sanitizeDbForUser(db, user)
    });
  }

  if (url.pathname === '/api/backups') {
    if (!canAccess(user, 'settingsEdit')) return send(res, 403, { error: '没有备份管理权限' });
    if (req.method === 'GET') return send(res, 200, { backups: listBackups().slice(0, 80) });
    if (req.method === 'POST') {
      const result = createDatabaseBackup(db, 'manual', user);
      notifyDataChanged('create-backup', result.fileName);
      return send(res, 200, { ...result, backups: listBackups().slice(0, 80) });
    }
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/backups/')) {
    if (!canAccess(user, 'settingsEdit')) return send(res, 403, { error: '没有备份下载权限' });
    const fileName = path.basename(decodeURIComponent(url.pathname.replace('/api/backups/', '')));
    const filePath = backupPath(fileName);
    if (!fileName.endsWith('.json') || !fs.existsSync(filePath)) return send(res, 404, { error: '备份文件不存在' });
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store'
    });
    return fs.createReadStream(filePath).pipe(res);
  }

  if (url.pathname === '/api/messages') {
    if (req.method === 'GET') {
      return send(res, 200, {
        users: db.users.filter(item => item.active !== false).map(safeUser),
        messages: messagesForUser(db, user),
        unread: unreadMessageCount(db, user)
      });
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const toUserId = String(body.toUserId || '').trim();
      const groupId = String(body.groupId || '').trim();
      const isGroup = groupId === 'all-staff';
      const text = String(body.text || '').trim();
      const attachment = sanitizeMessageAttachment(body.attachment);
      if (attachment?.error) return send(res, 400, { error: attachment.error });
      const recipient = isGroup ? null : db.users.find(item => item.id === toUserId && item.active !== false);
      if (!isGroup && !recipient) return send(res, 400, { error: '收件人不存在或未启用' });
      if (!text && !attachment) return send(res, 400, { error: '留言内容不能为空' });
      if (text.length > 2000) return send(res, 400, { error: '留言内容不能超过 2000 个字' });
      const createdAt = new Date().toISOString();
      const isSelfMessage = !isGroup && recipient.id === user.id;
      const message = {
        id: id(),
        scope: isGroup ? 'group' : 'direct',
        groupId: isGroup ? 'all-staff' : '',
        fromUserId: user.id,
        fromName: user.name || user.email,
        toUserId: isGroup ? '' : recipient.id,
        toName: isGroup ? '全体员工' : (recipient.name || recipient.email),
        text,
        attachment,
        createdAt,
        readAt: isSelfMessage ? createdAt : '',
        readByUserIds: isGroup ? [user.id] : []
      };
      db.messages.push(message);
      db.messages = db.messages.slice(-5000);
      audit(db, user, 'send-message', {
        collection: 'messages',
        recordId: message.id,
        recordLabel: `${message.fromName} -> ${message.toName}`,
        detail: `发送站内留言给 ${message.toName}`
      });
      writeDb(db);
      notifyDataChanged('send-message', message.id);
      return send(res, 200, sanitizeDbForUser(db, user));
    }
  }

  const voiceCallMatch = url.pathname.match(/^\/api\/voice-calls(?:\/([^/]+))?(?:\/(token|summary))?$/);
  if (voiceCallMatch) {
    const callId = String(voiceCallMatch[1] || '');
    const operation = String(voiceCallMatch[2] || '');
    const configured = Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
    if (req.method === 'GET' && !callId) {
      let expired = false;
      const cutoff = Date.now() - 45_000;
      (db.voiceCalls || []).forEach(call => {
        if (call.status === 'ringing' && Date.parse(call.createdAt || '') < cutoff) {
          call.status = 'missed'; call.endedAt = new Date().toISOString();
          call.participantStatuses = Object.fromEntries(Object.entries(call.participantStatuses || {}).map(([userId, status]) =>
            [userId, ['ringing', 'invited'].includes(status) ? 'missed' : status]));
          expired = true;
        }
      });
      if (expired) { scheduleDbWrite(db); notifyDataChanged('voice-calls-expired', user.id); }
      return send(res, 200, { configured, calls: voiceCallsForUser(db, user) });
    }
    if (req.method === 'POST' && !callId) {
      if (!configured) return send(res, 503, { error: '实时通话云服务尚未配置' });
      const body = await readBody(req);
      const requested = [...new Set((Array.isArray(body.participantUserIds) ? body.participantUserIds : [body.toUserId]).map(String).filter(Boolean))];
      const participantUserIds = requested.filter(userId => userId !== user.id && (db.users || []).some(row => row.id === userId && row.active !== false));
      if (!participantUserIds.length) return send(res, 400, { error: '请选择要呼叫的员工' });
      const now = new Date().toISOString();
      const call = {
        id: id(), roomName: `quad-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        callerUserId: user.id, callerName: user.name || user.email,
        participantUserIds, participantNames: participantUserIds.map(value => db.users.find(row => row.id === value)?.name || '').filter(Boolean),
        participantStatuses: { [user.id]: 'joined', ...Object.fromEntries(participantUserIds.map(userId => [userId, 'ringing'])) },
        status: 'ringing', createdAt: now, answeredAt: '', endedAt: '', endedByUserId: '', recording: false,
        declinedByUserIds: [], durationSeconds: 0, summary: '', summaryProvider: '', taskId: ''
      };
      db.voiceCalls.push(call);
      db.voiceCalls = db.voiceCalls.slice(-1000);
      audit(db, user, 'start-voice-call', { collection: 'voiceCalls', recordId: call.id, recordLabel: call.callerName, detail: `发起实时语音通话给 ${call.participantNames.join('、')}` });
      notifyDataChanged('voice-call-started', { call }, [call.callerUserId, ...call.participantUserIds]);
      scheduleDbWrite(db);
      return send(res, 201, { call });
    }
    const call = (db.voiceCalls || []).find(row => row.id === callId);
    if (!call) return send(res, 404, { error: '通话不存在或已清理' });
    const involved = call.callerUserId === user.id || (call.participantUserIds || []).includes(user.id);
    if (!involved) return send(res, 403, { error: '无权访问这次通话' });
    if (req.method === 'POST' && operation === 'token') {
      if (!configured) return send(res, 503, { error: '实时通话云服务尚未配置' });
      if (['declined', 'ended', 'missed'].includes(call.status)) return send(res, 409, { error: '这次通话已经结束' });
      const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
        identity: user.id, name: user.name || user.email, ttl: '2h',
        metadata: JSON.stringify({ callId: call.id, role: user.role || '' })
      });
      token.addGrant({ roomJoin: true, room: call.roomName, canPublish: true, canSubscribe: true });
      return send(res, 200, { url: process.env.LIVEKIT_URL, token: await token.toJwt(), call });
    }
    if (req.method === 'PUT' && !operation) {
      const body = await readBody(req); const action = String(body.action || ''); const now = new Date().toISOString();
      if (action === 'accept') {
        if (!(call.participantUserIds || []).includes(user.id)) return send(res, 403, { error: '只有被叫员工可以接听' });
        if (!['ringing', 'active'].includes(call.status)) return send(res, 409, { error: '通话已被处理' });
        call.participantStatuses = { ...(call.participantStatuses || {}) };
        if (call.participantStatuses[user.id] === 'declined') return send(res, 409, { error: '你已经拒绝了这次通话' });
        call.participantStatuses[user.id] = 'joined';
        call.status = 'active';
        if (!call.answeredAt) { call.answeredAt = now; call.answeredByUserId = user.id; }
      } else if (action === 'decline') {
        // One decline clears every still-ringing duplicate from the same caller
        // for this recipient. Repeated calls remain in history, but never force
        // the recipient to dismiss several identical popups one by one.
        const repeatedCalls = (db.voiceCalls || []).filter(item =>
          item.status === 'ringing'
          && item.callerUserId === call.callerUserId
          && (item.participantUserIds || []).includes(user.id));
        repeatedCalls.forEach(item => {
          item.participantStatuses = { ...(item.participantStatuses || {}), [user.id]: 'declined' };
          item.declinedByUserIds = [...new Set([...(item.declinedByUserIds || []), user.id])];
          if (item.declinedByUserIds.length >= (item.participantUserIds || []).length) {
            item.status = 'declined'; item.endedAt = now; item.endedByUserId = user.id;
          }
        });
      } else if (action === 'leave' || action === 'end') {
        if (!['ringing', 'active'].includes(call.status)) return send(res, 409, { error: '通话已经结束' });
        call.participantStatuses = { ...(call.participantStatuses || {}), [user.id]: 'left' };
        call.leftAtByUserId = { ...(call.leftAtByUserId || {}), [user.id]: now };
        // If the caller clicked several times, ending the visible call must also
        // cancel the still-ringing duplicates for the same recipients. Otherwise
        // those older rows surface one by one after the caller has hung up.
        if (user.id === call.callerUserId) {
          const participantKey = [...(call.participantUserIds || [])].sort().join('|');
          (db.voiceCalls || []).filter(item =>
            item.id !== call.id
            && item.status === 'ringing'
            && item.callerUserId === call.callerUserId
            && [...(item.participantUserIds || [])].sort().join('|') === participantKey
          ).forEach(item => {
            item.status = 'missed'; item.endedAt = now; item.endedByUserId = user.id;
            item.participantStatuses = Object.fromEntries(Object.entries(item.participantStatuses || {}).map(([userId, status]) =>
              [userId, ['ringing', 'invited'].includes(status) ? 'missed' : status]));
          });
        }
        const allUserIds = [call.callerUserId, ...(call.participantUserIds || [])];
        const remaining = allUserIds.filter(userId => !['left', 'declined'].includes(call.participantStatuses[userId] || (userId === call.callerUserId ? 'joined' : 'ringing')));
        if (call.status === 'ringing' || remaining.length <= 1) {
          call.status = call.status === 'ringing' ? 'missed' : 'ended'; call.endedAt = now; call.endedByUserId = user.id;
          call.participantStatuses = Object.fromEntries(Object.entries(call.participantStatuses || {}).map(([userId, status]) =>
            [userId, ['ringing', 'invited'].includes(status) ? 'missed' : status]));
          call.durationSeconds = call.answeredAt ? Math.max(0, Math.round((Date.parse(now) - Date.parse(call.answeredAt)) / 1000)) : 0;
        }
      } else if (action === 'invite') {
        if (!['ringing', 'active'].includes(call.status)) return send(res, 409, { error: '通话已经结束' });
        const additions = [...new Set((Array.isArray(body.participantUserIds) ? body.participantUserIds : []).map(String))]
          .filter(userId => userId !== call.callerUserId && (db.users || []).some(row => row.id === userId && row.active !== false));
        call.participantUserIds = [...new Set([...(call.participantUserIds || []), ...additions])];
        call.participantNames = call.participantUserIds.map(value => db.users.find(row => row.id === value)?.name || '').filter(Boolean);
        call.participantStatuses = { ...(call.participantStatuses || {}) };
        additions.forEach(userId => { call.participantStatuses[userId] = 'ringing'; });
        call.declinedByUserIds = (call.declinedByUserIds || []).filter(value => !additions.includes(value));
      } else if (action === 'recording') {
        if (call.callerUserId !== user.id) return send(res, 403, { error: '只有发起人可以开启 AI 通话记录' });
        if (call.status !== 'active') return send(res, 409, { error: '通话接通后才能开启 AI 记录' });
        call.recording = Boolean(body.enabled);
        call.recordingStartedAt = call.recording ? now : (call.recordingStartedAt || '');
      } else return send(res, 400, { error: '不支持的通话操作' });
      audit(db, user, `voice-call-${action}`, { collection: 'voiceCalls', recordId: call.id, recordLabel: call.callerName, detail: `实时语音通话 ${action}` });
      notifyDataChanged(`voice-call-${action}`, { call }, [call.callerUserId, ...(call.participantUserIds || [])]);
      scheduleDbWrite(db);
      return send(res, 200, { call });
    }
    if (req.method === 'POST' && operation === 'summary') {
      if (!['ended', 'active'].includes(call.status)) return send(res, 409, { error: '请在通话接通或结束后整理内容' });
      const body = await readBody(req); const notes = String(body.notes || '').trim().slice(0, 8000);
      if (!notes) return send(res, 400, { error: '请先输入本次通话的要点；系统不会在未告知双方的情况下录音' });
      try {
        const result = await createAiBossDraft(db, `这是员工内部通话记录。请整理通话结论，并生成需要督办的任务：\n${notes}`, String(body.provider || ''));
        const draft = result.draft || {};
        call.summary = String(draft.description || notes).slice(0, 4000); call.summaryProvider = result.provider; call.summaryAt = new Date().toISOString();
        let task = null;
        if (body.createTask !== false) {
          const assignee = (db.users || []).find(row => row.id === String(draft.assigneeUserId || body.assigneeUserId || '') && row.active !== false)
            || (db.users || []).find(row => row.id === call.answeredByUserId && row.active !== false)
            || user;
          const now = new Date().toISOString();
          task = { id: id(), title: String(draft.title || '通话后续任务').slice(0, 180), description: call.summary, sourceText: notes,
            createdByUserId: user.id, createdByName: user.name || user.email, assigneeUserId: assignee.id, assigneeName: assignee.name || assignee.email,
            helperUserIds: [], helperNames: [], dueAt: normalizeAiBossDraftDueAt(db, draft.dueAt), priority: ['低','普通','高','紧急'].includes(draft.priority) ? draft.priority : '普通',
            difficulty: Math.min(10, Math.max(1, Number(draft.difficulty || 3))), acceptanceCriteria: String(draft.acceptanceCriteria || '').slice(0, 2000),
            aiReason: String(draft.reason || '').slice(0, 1000), status: 'pending', progressUpdates: [], createdAt: now, updatedAt: now, acceptedAt: '', completedAt: '', verifiedAt: '', callId: call.id };
          db.aiBossTasks.push(task); call.taskId = task.id;
        }
        writeDb(db); notifyDataChanged('voice-call-summary', call.id);
        return send(res, 200, { call, task, data: sanitizeDbForUser(db, user) });
      } catch (error) { return send(res, 502, { error: `AI 整理失败：${String(error.message || error).slice(0, 220)}` }); }
    }
  }

  if (req.method === 'PUT' && url.pathname === '/api/messages/read') {
    const body = await readBody(req);
    const fromUserId = String(body.fromUserId || '').trim();
    const groupId = String(body.groupId || '').trim();
    let changed = 0;
    (db.messages || []).forEach(message => {
      if (groupId === 'all-staff') {
        if (message.scope !== 'group' || message.fromUserId === user.id) return;
        message.readByUserIds = Array.isArray(message.readByUserIds) ? message.readByUserIds : [];
        if (message.readByUserIds.includes(user.id)) return;
        message.readByUserIds.push(user.id);
        changed += 1;
        return;
      }
      if (message.toUserId !== user.id || message.readAt) return;
      if (fromUserId && message.fromUserId !== fromUserId) return;
      message.readAt = new Date().toISOString();
      changed += 1;
    });
    if (changed) {
      writeDb(db);
      notifyDataChanged('read-messages', user.id);
    }
    return send(res, 200, sanitizeDbForUser(db, user));
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/messages/')) {
    const messageId = path.basename(decodeURIComponent(url.pathname.replace('/api/messages/', '')));
    const message = (db.messages || []).find(item => item.id === messageId);
    if (!message) return send(res, 404, { error: '留言不存在' });
    const involved = message.scope === 'group'
      ? message.fromUserId === user.id || user.role === 'owner'
      : message.fromUserId === user.id || message.toUserId === user.id;
    if (!involved) return send(res, 403, { error: '不能删除不属于你的留言' });
    db.messages = (db.messages || []).filter(item => item.id !== messageId);
    audit(db, user, 'delete-message', {
      collection: 'messages',
      recordId: messageId,
      recordLabel: `${message.fromName || ''} -> ${message.toName || ''}`,
      snapshot: { ...message, attachment: message.attachment ? { ...message.attachment, dataUrl: '[removed]' } : null },
      detail: `删除/撤销站内留言 ${message.fromName || ''} -> ${message.toName || ''}`
    });
    writeDb(db);
    notifyDataChanged('delete-message', messageId);
    return send(res, 200, sanitizeDbForUser(db, user));
  }

  if (req.method === 'POST' && url.pathname === '/api/import/prospects') {
    if (!canAccess(user, 'prospectsEdit')) return send(res, 403, { error: '没有导入高意向客户权限' });
    const body = await readBody(req);
    const result = importProspects(db, user, body);
    if (!result.imported && !result.updated && !result.skipped) {
      return send(res, 400, { error: '没有收到可导入的高意向客户数据' });
    }
    writeDb(db);
    notifyDataChanged('import-prospects', {
      imported: result.imported,
      updated: result.updated,
      skipped: result.skipped,
      duplicateCount: result.duplicateCount
    });
    return send(res, 200, {
      ...result,
      data: sanitizeDbForUser(db, user)
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/import/customer-conversations') {
    if (!canAccess(user, 'prospectsEdit')) return send(res, 403, { error: '没有导入客户交流中心权限' });
    let body = await readBody(req);
    if (user.importPlatform) {
      if (Array.isArray(body)) body = body.map(item => ({ ...item, source: user.importPlatform }));
      else if (Array.isArray(body?.items)) body = { ...body, source: user.importPlatform, items: body.items.map(item => ({ ...item, source: user.importPlatform })) };
      else if (body && typeof body === 'object') body = { ...body, source: user.importPlatform };
    }
    const result = importCustomerConversations(db, user, body);
    if (!result.imported && !result.updated && !result.skipped) {
      return send(res, 400, { error: '没有收到可导入的客户交流数据' });
    }
    writeDb(db);
    notifyDataChanged('import-customer-conversations', {
      imported: result.imported,
      updated: result.updated,
      skipped: result.skipped,
      duplicateCount: result.duplicateCount
    });
    return send(res, 200, result);
  }

  if (req.method === 'POST' && url.pathname === '/api/shipments/import') {
    if (!canAccess(user, 'shipmentsEdit')) return send(res, 403, { error: '没有导入在途货物权限' });
    const body = await readBody(req);
    let rows;
    try {
      rows = await parseShipmentImportRows(body);
    } catch (err) {
      return send(res, 400, { error: err.message || '文件解析失败' });
    }
    const shipments = rows.map(shipmentFromImportRow).filter(Boolean);
    if (!shipments.length) return send(res, 400, { error: '没有识别到可导入的在途货物数据。请确认第一行是表头。' });
    db.shipments.push(...shipments);
    audit(db, user, 'import-shipments', {
      collection: 'shipments',
      recordId: 'batch-import',
      recordLabel: String(body.fileName || 'shipment import'),
      after: shipments,
      detail: `导入在途货物 ${shipments.length} 条：${body.fileName || ''}`
    });
    writeDb(db);
    notifyDataChanged('import-shipments', shipments.length);
    return send(res, 200, {
      imported: shipments.length,
      data: sanitizeDbForUser(db, user)
    });
  }

  if (url.pathname === '/api/workshop-movements/batch' && req.method === 'POST') {
    if (!canAccess(user, 'inventoryEdit')) return send(res, 403, { error: '没有此功能权限' });
    const body = await readBody(req);
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length) return send(res, 400, { error: '请至少填写一行贴膜明细' });
    if (rawItems.length > 30) return send(res, 400, { error: '一张贴膜间单最多填写 30 行' });

    const groupedItems = new Map();
    for (const rawItem of rawItems) {
      const sku = String(rawItem?.sku || '').trim();
      const qty = Number(rawItem?.qty || 0);
      if (!sku) return send(res, 400, { error: '每一行都必须选择 SKU' });
      if (!Number.isFinite(qty) || qty <= 0) return send(res, 400, { error: `${sku} 的数量必须大于 0` });
      groupedItems.set(sku, Number(groupedItems.get(sku) || 0) + qty);
    }

    const common = {
      date: String(body.date || '').trim(),
      type: body.type === 'transfer' ? 'transfer' : 'consume',
      operator: String(body.operator || '').trim(),
      jobCustomer: String(body.jobCustomer || '').trim(),
      note: String(body.note || '').trim()
    };
    const batchId = id();
    const createdAt = new Date().toISOString();
    const movements = [...groupedItems].map(([sku, qty]) => ({
      ...common, sku, qty, id: id(), batchId, createdAt,
      createdBy: user.name || '', createdByUserId: user.id
    }));

    for (const movement of movements) {
      const dateError = validateEntryDate(db, movement, 'workshopMovements');
      if (dateError) return send(res, 400, { error: dateError });
      const movementError = validateWorkshopMovement(db, movement);
      if (movementError) return send(res, 400, { error: movementError });
    }

    for (const movement of movements) {
      db.workshopMovements.push(movement);
      applyWorkshopMovement(db, movement);
      audit(db, user, 'create-workshopMovements-batch', {
        collection: 'workshopMovements', recordId: movement.id,
        recordLabel: recordLabel(movement), after: movement,
        detail: `批量新增贴膜间流水 ${movement.sku} ${movement.qty}`
      });
    }
    writeDb(db);
    notifyDataChanged('create-workshopMovements-batch', batchId);
    return send(res, 200, sanitizeDbForUser(db, user));
  }

  if (req.method === 'POST' && url.pathname === '/api/ai-boss/transcribe') {
    try {
      if (!process.env.OPENAI_API_KEY) return send(res, 503, { error: 'OpenAI 语音识别尚未配置' });
      const body = await readBody(req);
      const audio = dataUrlAudio(body.dataUrl);
      if (!audio) return send(res, 400, { error: '录音为空、格式不正确或超过 12MB' });
      const extension = audio.type.includes('mp4') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : 'webm';
      const form = new FormData();
      form.append('file', new Blob([audio.buffer], { type: audio.type }), `supervision-${Date.now()}.${extension}`);
      form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe');
      form.append('language', String(body.language || 'zh').slice(0, 8));
      form.append('prompt', 'QUaD 贴膜店员工交办任务，可能包含员工姓名、仓库、窗膜、PPF、TPU、车型和订单术语。');
      const value = await fetchAiJson('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form
      }, 60_000);
      const text = String(value?.text || '').trim();
      if (!text) return send(res, 422, { error: '没有识别到有效语音，请重新说一次' });
      audit(db, user, 'ai-boss-transcribe', { collection: 'aiBossTasks', detail: `云端识别语音 ${text.length} 字` });
      return send(res, 200, { text, provider: 'openai' });
    } catch (error) {
      return send(res, 502, { error: `语音识别失败：${String(error.message || error).slice(0, 220)}` });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/ai-boss/draft') {
    const body = await readBody(req);
    const sourceText = String(body.text || '').trim().slice(0, 5000);
    if (!sourceText) return send(res, 400, { error: '请先说出或输入要交办的事情' });
    try {
      let result;
      try {
        result = await createAiBossDraft(db, sourceText, String(body.provider || ''));
      } catch (firstError) {
        const requested = String(body.provider || '');
        if (requested || !process.env.OPENAI_API_KEY) throw firstError;
        result = await createAiBossDraft(db, sourceText, 'openai');
        result.fallbackReason = String(firstError.message || firstError).slice(0, 180);
      }
      const activeUserIds = new Set((db.users || []).filter(row => row.active !== false).map(row => row.id));
      const draft = result.draft || {};
      if (!activeUserIds.has(String(draft.assigneeUserId || ''))) draft.assigneeUserId = '';
      draft.title = String(draft.title || sourceText.slice(0, 50)).slice(0, 180);
      draft.description = String(draft.description || sourceText).slice(0, 4000);
      draft.acceptanceCriteria = String(draft.acceptanceCriteria || '').slice(0, 2000);
      draft.priority = ['低', '普通', '高', '紧急'].includes(draft.priority) ? draft.priority : '普通';
      draft.difficulty = Math.min(10, Math.max(1, Number(draft.difficulty || 3)));
      draft.dueAt = normalizeAiBossDraftDueAt(db, draft.dueAt);
      return send(res, 200, { provider: result.provider, fallbackReason: result.fallbackReason || '', sourceText, draft });
    } catch (error) {
      return send(res, 502, { error: `AI 任务分析失败：${String(error.message || error).slice(0, 220)}` });
    }
  }

  const aiBossTaskMatch = url.pathname.match(/^\/api\/ai-boss\/tasks(?:\/([^/]+))?$/);
  if (aiBossTaskMatch) {
    const taskId = aiBossTaskMatch[1] || '';
    if (req.method === 'GET') return send(res, 200, aiBossTasksForUser(db, user));
    const body = await readBody(req);
    const now = new Date().toISOString();
    if (req.method === 'POST' && !taskId) {
      const title = String(body.title || '').trim().slice(0, 180);
      const description = String(body.description || '').trim().slice(0, 4000);
      const dueAt = validFutureAiBossDueAt(db, body.dueAt);
      const assignee = (db.users || []).find(row => row.id === String(body.assigneeUserId || '') && row.active !== false);
      if (!title || !description) return send(res, 400, { error: '请填写任务标题和具体要求' });
      if (!assignee) return send(res, 400, { error: '请选择有效的负责人' });
      if (!dueAt) return send(res, 400, { error: '截止时间必须晚于当前时间，请重新选择' });
      const helperUserIds = [...new Set((Array.isArray(body.helperUserIds) ? body.helperUserIds : []).map(String))]
        .filter(idValue => idValue !== assignee.id && (db.users || []).some(row => row.id === idValue && row.active !== false));
      const task = {
        id: id(), title, description, sourceText: String(body.sourceText || description).trim().slice(0, 5000),
        createdByUserId: user.id, createdByName: user.name || user.email,
        assigneeUserId: assignee.id, assigneeName: assignee.name || assignee.email,
        helperUserIds, helperNames: helperUserIds.map(value => db.users.find(row => row.id === value)?.name || '').filter(Boolean),
        dueAt, priority: ['低', '普通', '高', '紧急'].includes(body.priority) ? body.priority : '普通',
        difficulty: Math.min(10, Math.max(1, Number(body.difficulty || 3))), acceptanceCriteria: String(body.acceptanceCriteria || '').trim().slice(0, 2000),
        status: '待接单', progress: 0, updates: [], reminderHours: Math.min(24, Math.max(1, Number(body.reminderHours || 2))),
        createdAt: now, updatedAt: now
      };
      db.aiBossTasks.push(task);
      audit(db, user, 'create-ai-boss-task', { collection: 'aiBossTasks', recordId: task.id, recordLabel: task.title, detail: `交办任务给 ${task.assigneeName}` });
      writeDb(db); notifyDataChanged('create-ai-boss-task', task.id);
      return send(res, 201, sanitizeDbForUser(db, user));
    }
    if (req.method === 'PUT' && taskId) {
      const task = (db.aiBossTasks || []).find(row => row.id === taskId);
      if (!task) return send(res, 404, { error: '找不到任务' });
      const isManager = user.role === 'owner' || user.role === 'manager';
      const isCreator = task.createdByUserId === user.id;
      const isAssignee = task.assigneeUserId === user.id;
      const isHelper = (task.helperUserIds || []).includes(user.id);
      if (!isManager && !isCreator && !isAssignee && !isHelper) return send(res, 403, { error: '没有操作这个任务的权限' });
      const action = String(body.action || '').trim();
      const note = String(body.note || '').trim().slice(0, 3000);
      if (action === 'accept' && (isAssignee || isManager)) {
        task.status = '进行中'; task.acceptedAt = now; task.progress = Math.max(1, Number(task.progress || 0));
      } else if (action === 'progress' && (isAssignee || isHelper || isManager)) {
        task.status = '进行中'; task.progress = Math.min(99, Math.max(1, Number(body.progress || task.progress || 1)));
      } else if (action === 'help' && (isAssignee || isHelper || isManager)) {
        task.status = '需要协助'; task.helpRequestedAt = now;
      } else if (action === 'result' && (isAssignee || isHelper || isManager)) {
        if (!note) return send(res, 400, { error: '请填写完成结果' });
        task.status = '待验收'; task.progress = 100; task.result = note; task.submittedAt = now;
      } else if (action === 'approve' && (isCreator || isManager)) {
        task.status = '已完成'; task.progress = 100; task.completedAt = now; task.approvedAt = now; task.approvedByName = user.name || user.email;
        task.qualityScore = Math.min(100, Math.max(0, Number(body.qualityScore || 90)));
      } else if (action === 'reject' && (isCreator || isManager)) {
        if (!note) return send(res, 400, { error: '请填写退回原因' });
        task.status = '已退回'; task.progress = Math.min(95, Number(task.progress || 0)); task.reworkCount = Number(task.reworkCount || 0) + 1;
      } else if (action === 'cancel' && (isCreator || isManager)) {
        task.status = '已取消'; task.cancelledAt = now;
      } else return send(res, 400, { error: '当前身份不能执行这个操作' });
      if (note) task.updates = [...(task.updates || []), { id: id(), action, note, progress: Number(task.progress || 0), byUserId: user.id, byName: user.name || user.email, at: now }];
      task.updatedAt = now;
      audit(db, user, `ai-boss-task-${action}`, { collection: 'aiBossTasks', recordId: task.id, recordLabel: task.title, detail: `${action}${note ? `：${note.slice(0, 120)}` : ''}` });
      writeDb(db); notifyDataChanged(`ai-boss-task-${action}`, task.id);
      return send(res, 200, sanitizeDbForUser(db, user));
    }
    return send(res, 405, { error: '不支持的任务操作' });
  }

  const aiBossProfileMatch = url.pathname.match(/^\/api\/ai-boss\/profiles\/([^/]+)$/);
  if (aiBossProfileMatch && req.method === 'PUT') {
    if (!['owner', 'manager'].includes(user.role)) return send(res, 403, { error: '只有老板或店长可以维护员工能力档案' });
    const targetUser = (db.users || []).find(row => row.id === aiBossProfileMatch[1] && row.active !== false);
    if (!targetUser) return send(res, 404, { error: '找不到员工' });
    const body = await readBody(req); const now = new Date().toISOString();
    const existing = (db.aiBossProfiles || []).find(row => row.userId === targetUser.id) || { id: id(), userId: targetUser.id };
    const profile = { ...existing, userName: targetUser.name || targetUser.email, department: String(body.department || '').trim().slice(0, 120), duties: String(body.duties || '').trim().slice(0, 2000), skills: String(body.skills || '').trim().slice(0, 2000), resources: String(body.resources || '').trim().slice(0, 2000), authorizedActions: String(body.authorizedActions || '').trim().slice(0, 2000), backupUserId: String(body.backupUserId || '').trim(), updatedAt: now, updatedByName: user.name || user.email };
    const index = db.aiBossProfiles.findIndex(row => row.userId === targetUser.id);
    if (index >= 0) db.aiBossProfiles[index] = profile; else db.aiBossProfiles.push(profile);
    audit(db, user, 'update-ai-boss-profile', { collection: 'aiBossProfiles', recordId: profile.id, recordLabel: profile.userName, detail: '更新员工能力档案' });
    writeDb(db); notifyDataChanged('update-ai-boss-profile', profile.id);
    return send(res, 200, sanitizeDbForUser(db, user));
  }

  const match = url.pathname.match(/^\/api\/([a-zA-Z]+)(?:\/([^/]+))?$/);
  if (!match) return send(res, 404, { error: 'Not found' });
  const [, collection, recordId] = match;
  const allowed = ['jobs', 'warranties', 'installers', 'products', 'priceRules', 'salesOrders', 'shipments', 'schedules', 'movements', 'workshopMovements', 'expenses', 'reimbursements', 'leads', 'prospects', 'customerConversations', 'replyTemplates', 'customerServiceReps', 'users'];
  if (!allowed.includes(collection)) return send(res, 404, { error: 'Unknown collection' });

  const permission = collectionPermission(collection, req.method);
  if (!permission || !canAccess(user, permission)) return send(res, 403, { error: '没有此功能权限' });

  if (req.method === 'GET') return send(res, 200, sanitizeDbForUser(db, user)[collection]);

  if (req.method === 'POST') {
    const body = await readBody(req);
    const item = { ...body, id: id() };
    const canSeeCosts = user.role === 'owner';
    const dateError = validateEntryDate(db, item, collection);
    if (dateError) return send(res, 400, { error: dateError });
    if (collection === 'users') {
      if (item.role === 'owner') return send(res, 400, { error: '不能在员工账号里新增老板账号' });
      const error = validateUserInput(db, item, null, true);
      if (error) return send(res, 400, { error });
      item.name = String(item.name || '').trim();
      item.email = String(item.email || '').trim().toLowerCase();
      const avatarDataUrl = normalizeAvatarDataUrl(item.avatarDataUrl);
      if (avatarDataUrl === null) return send(res, 400, { error: '头像格式不支持或图片太大，请上传 2MB 以内的 JPG/PNG/WebP 图片' });
      item.avatarDataUrl = avatarDataUrl;
      item.passwordHash = hashPassword(body.password);
      delete item.password;
      item.active = item.active !== false;
      item.permissions = { ...defaultPermissions(item.role), ...(body.permissions || {}) };
    }
    if (collection === 'movements') {
      const error = validateMovement(db, item);
      if (error) return send(res, 400, { error });
    }
    if (collection === 'workshopMovements') {
      const error = validateWorkshopMovement(db, item);
      if (error) return send(res, 400, { error });
      item.operator = String(item.operator || '').trim();
      item.jobCustomer = String(item.jobCustomer || '').trim();
      item.note = String(item.note || '').trim();
      item.createdAt = new Date().toISOString();
      item.createdBy = user.name || '';
      item.createdByUserId = user.id;
    }
    if (collection === 'jobs') {
      if (item.sourceProspectId && db.jobs.some(job => job.sourceProspectId === item.sourceProspectId)) {
        return send(res, 400, { error: '这位高意向客户已经有施工单，请直接编辑现有施工单' });
      }
      normalizeJobServices(item);
      item.preparedBy = user.name || '';
      item.preparedByUserId = user.id;
      item.createdAt = new Date().toISOString();
      if (String(item.status || '').trim() === '已交车') item.deliveredAt = item.deliveredAt || item.createdAt;
      if (!canSeeCosts) item.materialCost = 0;
    }
    if (collection === 'warranties') {
      normalizeWarrantyRecord(item);
      const error = validateWarrantyRecord(item);
      if (error) return send(res, 400, { error });
      const now = new Date().toISOString();
      item.createdAt = now;
      item.updatedAt = now;
      item.createdBy = user.name || user.email;
      item.createdByUserId = user.id;
    }
    if (collection === 'products' && !canSeeCosts) {
      item.cost = 0;
    }
    if (collection === 'priceRules' && !canSeeCosts) {
      item.materialCost = 0;
    }
    if (collection === 'expenses') {
      normalizeExpense(item);
    }
    if (collection === 'reimbursements') {
      normalizeReimbursement(item);
      const duplicate = item.requestId && db.reimbursements.find(row => row.requestId === item.requestId && row.employeeUserId === user.id);
      if (duplicate) return send(res, 200, sanitizeDbForUser(db, user));
      const error = validateReimbursement(item);
      if (error) return send(res, 400, { error });
      const now = new Date().toISOString();
      item.reimbursementNo = reimbursementNumber();
      item.employeeUserId = user.id;
      item.employeeName = user.name || user.email;
      item.employeeEmail = user.email || '';
      item.status = '待审批';
      item.submittedAt = now;
      item.createdAt = now;
      item.updatedAt = now;
    }
    if (collection === 'salesOrders') {
      item.salesRep = String(item.salesRep || '').trim();
      item.customerAddress = String(item.customerAddress || '').trim().slice(0, 500);
      item.customerContact = String(item.customerContact || '').trim().slice(0, 500);
      const error = validateSalesOrder(db, item);
      if (error) return send(res, 400, { error });
      item.preparedBy = String(item.preparedBy || user.name || '').trim();
      item.preparedByUserId = user.id;
      item.createdAt = new Date().toISOString();
      if (String(item.status || '').trim() === '已出库') item.shippedAt = item.shippedAt || item.createdAt;
    }
    if (collection === 'prospects' || collection === 'customerConversations') {
      const now = new Date().toISOString();
      item.createdAt = item.createdAt || now;
      item.importedAt = item.importedAt || now;
      item.updatedAt = now;
      item.createdBy = user.name || user.email;
      item.createdByUserId = user.id;
    }
    if (collection === 'replyTemplates') {
      const type = ['text', 'image', 'video'].includes(String(item.type)) ? String(item.type) : '';
      const allowedCategories = new Set(['uncategorized', 'auto-window-film', 'color-wrap', 'ppf', 'architectural-film', 'shop-display', 'brand-display']);
      if (!type) return send(res, 400, { error: '回复素材类型不正确' });
      item.type = type;
      item.category = allowedCategories.has(String(item.category || '')) ? String(item.category) : 'uncategorized';
      item.title = String(item.title || '').trim().slice(0, 80);
      item.content = String(item.content || '').trim().slice(0, 4000);
      item.attachment = type === 'text' ? null : item.attachment;
      if (type === 'text' && !item.content) return send(res, 400, { error: '请填写回复文字' });
      if (type !== 'text' && !String(item.attachment?.url || '').includes('/customer-media/')) return send(res, 400, { error: '请先上传素材文件' });
      item.title = item.title || (type === 'text' ? item.content.slice(0, 30) : String(item.attachment?.name || '回复素材'));
      item.createdAt = new Date().toISOString();
      item.updatedAt = item.createdAt;
      item.createdBy = user.name || user.email;
      item.createdByUserId = user.id;
    }
    if (collection === 'customerConversations') {
      const duplicate = findProspectDuplicate(db.customerConversations, item);
      if (duplicate) {
        const before = { ...duplicate };
        const next = mergeProspect(duplicate, {
          ...normalizeProspectInput(item, duplicate),
          id: duplicate.id,
          createdAt: duplicate.createdAt,
          importedAt: duplicate.importedAt,
          updatedBy: user.name || user.email,
          updatedByUserId: user.id
        });
        const idx = db.customerConversations.findIndex(row => row.id === duplicate.id);
        db.customerConversations[idx] = next;
        const promoted = promoteEligibleCustomerConversation(db, next, user);
        audit(db, user, 'prevent-duplicate-customer-conversation', {
          collection, recordId: next.id, recordLabel: recordLabel(next), changedFields: diffRecords(before, next), before, after: next,
          detail: `拦截重复新增并合并到现有客户 ${recordLabel(next) || next.id}`
        });
        if (promoted) audit(db, user, 'auto-promote-customer-conversation', {
          collection: 'prospects', recordId: promoted.id, recordLabel: recordLabel(promoted),
          detail: `客户状态为 ${next.status}，自动转入高意向客户`
        });
        writeDb(db);
        notifyDataChanged('prevent-duplicate-customer-conversation', next.id);
        return send(res, 200, sanitizeDbForUser(db, user));
      }
    }
    const autoPromoted = collection === 'customerConversations' ? promoteEligibleCustomerConversation(db, item, user) : null;
    if (collection === 'schedules') {
      const error = prepareScheduleItem(db, item);
      if (error) return send(res, 400, { error });
    }
    db[collection].push(item);
    if (collection === 'jobs' && item.sourceProspectId) {
      const prospect = (db.prospects || []).find(row => row.id === item.sourceProspectId);
      if (prospect) {
        prospect.convertedJobId = item.id;
        prospect.convertedJobAt = new Date().toISOString();
        prospect.status = '已转施工单';
        prospect.updatedAt = new Date().toISOString();
        const conversation = (db.customerConversations || []).find(row => row.id === prospect.promotedFromConversationId);
        if (conversation) {
          conversation.status = '已转施工单';
          conversation.convertedJobId = item.id;
          conversation.updatedAt = prospect.updatedAt;
        }
      }
    }
    if (collection === 'movements') applyMovement(db, item);
    if (collection === 'workshopMovements') applyWorkshopMovement(db, item);
    const syncedSalesOrderCustomer = collection === 'salesOrders' ? syncSalesOrderCustomer(db, item) : null;
    audit(db, user, `create-${collection}`, {
      collection,
      recordId: item.id,
      recordLabel: recordLabel(item),
      after: item,
      detail: `新增 ${collection} ${recordLabel(item) || item.id}`
    });
    if (syncedSalesOrderCustomer) audit(db, user, 'sync-sales-order-customer', {
      collection: 'portalCustomers', recordId: syncedSalesOrderCustomer.id, recordLabel: syncedSalesOrderCustomer.businessName,
      detail: `零售/批发订单自动同步客户 ${syncedSalesOrderCustomer.businessName}`
    });
    if (autoPromoted) audit(db, user, 'auto-promote-customer-conversation', {
      collection: 'prospects', recordId: autoPromoted.id, recordLabel: recordLabel(autoPromoted),
      detail: `客户状态为 ${item.status}，自动转入高意向客户`
    });
    writeDb(db);
    notifyDataChanged(`create-${collection}`, item.id);
    return send(res, 200, sanitizeDbForUser(db, user));
  }

  if (req.method === 'PUT' && recordId) {
    if (collection === 'workshopMovements') {
      return send(res, 400, { error: '贴膜间库存流水不能直接修改。录错时请新增一条反向领料/消耗流水修正，避免库存对不上。' });
    }
    const body = await readBody(req);
    const idx = db[collection].findIndex(x => x.id === recordId);
    const canSeeCosts = user.role === 'owner';
    if (idx < 0) return send(res, 404, { error: 'Record not found' });
    if (collection === 'users' && db[collection][idx].role === 'owner') {
      return send(res, 400, { error: '老板账号受保护，不能在员工权限里修改。请到设置里修改老板自己的邮箱和密码。' });
    }
    const next = { ...db[collection][idx], ...body, id: recordId };
    if (collection === 'users') {
      const error = validateUserInput(db, next, recordId, false, body);
      if (error) return send(res, 400, { error });
      next.name = String(next.name || '').trim();
      next.email = String(next.email || '').trim().toLowerCase();
      const avatarDataUrl = normalizeAvatarDataUrl(next.avatarDataUrl);
      if (avatarDataUrl === null) return send(res, 400, { error: '头像格式不支持或图片太大，请上传 2MB 以内的 JPG/PNG/WebP 图片' });
      next.avatarDataUrl = avatarDataUrl;
      if (body.password) next.passwordHash = hashPassword(body.password);
      delete next.password;
      next.permissions = { ...defaultPermissions(next.role), ...(body.permissions || {}) };
    }
    if (collection === 'schedules') {
      const error = prepareScheduleItem(db, next);
      if (error) return send(res, 400, { error });
    }
    if (collection === 'jobs') {
      const previousStatus = String(db[collection][idx].status || '').trim();
      normalizeJobServices(next);
      next.preparedBy = db[collection][idx].preparedBy || user.name || '';
      next.preparedByUserId = db[collection][idx].preparedByUserId || user.id;
      next.updatedBy = user.name || '';
      next.updatedAt = new Date().toISOString();
      if (String(next.status || '').trim() === '已交车' && previousStatus !== '已交车') next.deliveredAt = next.updatedAt;
      if (!canSeeCosts) next.materialCost = db[collection][idx].materialCost || 0;
    }
    if (collection === 'warranties') {
      normalizeWarrantyRecord(next);
      const error = validateWarrantyRecord(next);
      if (error) return send(res, 400, { error });
      next.createdAt = db[collection][idx].createdAt || new Date().toISOString();
      next.createdBy = db[collection][idx].createdBy || user.name || user.email;
      next.createdByUserId = db[collection][idx].createdByUserId || user.id;
      next.updatedAt = new Date().toISOString();
      next.updatedBy = user.name || user.email;
      next.updatedByUserId = user.id;
    }
    if (collection === 'products' && !canSeeCosts) {
      next.cost = db[collection][idx].cost || 0;
    }
    if (collection === 'priceRules' && !canSeeCosts) {
      next.materialCost = db[collection][idx].materialCost || 0;
    }
    if (collection === 'expenses') {
      normalizeExpense(next);
    }
    if (collection === 'reimbursements') {
      const beforeReimbursement = db[collection][idx];
      const canApprove = canAccess(user, 'reimbursementsApprove');
      const isOwner = beforeReimbursement.employeeUserId === user.id;
      if (!canApprove && !isOwner) return send(res, 403, { error: '只能修改自己的报销申请' });
      if (!canApprove && beforeReimbursement.status !== '待审批') return send(res, 400, { error: '已审批的报销不能再修改，请联系财务' });
      next.reimbursementNo = beforeReimbursement.reimbursementNo;
      next.employeeUserId = beforeReimbursement.employeeUserId;
      next.employeeName = beforeReimbursement.employeeName;
      next.employeeEmail = beforeReimbursement.employeeEmail;
      next.createdAt = beforeReimbursement.createdAt;
      next.submittedAt = beforeReimbursement.submittedAt;
      if (!canApprove) next.status = beforeReimbursement.status;
      const statuses = new Set(['待审批', '已批准', '已驳回', '已报销']);
      if (!statuses.has(String(next.status || ''))) return send(res, 400, { error: '报销状态不正确' });
      normalizeReimbursement(next);
      const error = validateReimbursement(next);
      if (error) return send(res, 400, { error });
      const now = new Date().toISOString();
      next.updatedAt = now;
      next.updatedBy = user.name || user.email;
      if (canApprove && next.status !== beforeReimbursement.status) {
        if (next.status === '已批准') {
          next.approvedAt = now;
          next.approvedBy = user.name || user.email;
          next.approvedByUserId = user.id;
        }
        if (next.status === '已驳回') {
          next.rejectedAt = now;
          next.rejectedBy = user.name || user.email;
          next.rejectedByUserId = user.id;
        }
        if (next.status === '已报销') {
          next.reimbursedAt = now;
          next.reimbursedBy = user.name || user.email;
          next.reimbursedByUserId = user.id;
        }
      }
    }
    if (collection === 'salesOrders') {
      const previousStatus = String(db[collection][idx].status || '').trim();
      next.salesRep = String(next.salesRep || '').trim();
      next.customerAddress = String(next.customerAddress || '').trim().slice(0, 500);
      next.customerContact = String(next.customerContact || '').trim().slice(0, 500);
      const error = validateSalesOrder(db, next);
      if (error) return send(res, 400, { error });
      next.preparedBy = String(next.preparedBy || db[collection][idx].preparedBy || user.name || '').trim();
      next.preparedByUserId = db[collection][idx].preparedByUserId || user.id;
      next.updatedBy = user.name || '';
      next.updatedAt = new Date().toISOString();
      if (String(next.status || '').trim() === '已出库' && previousStatus !== '已出库') next.shippedAt = next.updatedAt;
    }
    if (collection === 'prospects' || collection === 'customerConversations') {
      const now = new Date().toISOString();
      next.createdAt = db[collection][idx].createdAt || next.createdAt || now;
      next.importedAt = db[collection][idx].importedAt || next.importedAt || next.createdAt;
      next.updatedBy = user.name || user.email;
      next.updatedByUserId = user.id;
      next.updatedAt = now;
    }
    if (collection === 'replyTemplates') {
      const type = ['text', 'image', 'video'].includes(String(next.type)) ? String(next.type) : '';
      const allowedCategories = new Set(['uncategorized', 'auto-window-film', 'color-wrap', 'ppf', 'architectural-film', 'shop-display', 'brand-display']);
      if (!type) return send(res, 400, { error: '回复素材类型不正确' });
      next.type = type;
      next.category = allowedCategories.has(String(next.category || '')) ? String(next.category) : 'uncategorized';
      next.title = String(next.title || '').trim().slice(0, 80);
      next.content = String(next.content || '').trim().slice(0, 4000);
      next.attachment = type === 'text' ? null : next.attachment;
      if (type === 'text' && !next.content) return send(res, 400, { error: '请填写回复文字' });
      if (type !== 'text' && !String(next.attachment?.url || '').includes('/customer-media/')) return send(res, 400, { error: '请先上传素材文件' });
      next.title = next.title || (type === 'text' ? next.content.slice(0, 30) : String(next.attachment?.name || '回复素材'));
      next.updatedAt = new Date().toISOString();
      next.updatedBy = user.name || user.email;
    }
    const autoPromoted = collection === 'customerConversations' ? promoteEligibleCustomerConversation(db, next, user) : null;
    const before = db[collection][idx];
    const changedFields = diffRecords(before, next);
    db[collection][idx] = next;
    const syncedSalesOrderCustomer = collection === 'salesOrders' ? syncSalesOrderCustomer(db, next) : null;
    audit(db, user, `update-${collection}`, {
      collection,
      recordId,
      recordLabel: recordLabel(next) || recordLabel(before),
      changedFields,
      before,
      after: next,
      detail: `修改 ${collection} ${recordLabel(next) || recordId}：${changedFields.map(change => change.field).join(', ') || '无字段变化'}`
    });
    if (syncedSalesOrderCustomer) audit(db, user, 'sync-sales-order-customer', {
      collection: 'portalCustomers', recordId: syncedSalesOrderCustomer.id, recordLabel: syncedSalesOrderCustomer.businessName,
      detail: `零售/批发订单自动同步客户 ${syncedSalesOrderCustomer.businessName}`
    });
    if (autoPromoted && !before.promotedProspectId) audit(db, user, 'auto-promote-customer-conversation', {
      collection: 'prospects', recordId: autoPromoted.id, recordLabel: recordLabel(autoPromoted),
      detail: `客户状态为 ${next.status}，自动转入高意向客户`
    });
    writeDb(db);
    notifyDataChanged(`update-${collection}`, recordId);
    return send(res, 200, sanitizeDbForUser(db, user));
  }

  if (req.method === 'DELETE' && recordId) {
    if (collection === 'workshopMovements') {
      return send(res, 400, { error: '贴膜间库存流水不能删除。请用反向流水修正，保证库存台账完整。' });
    }
    if (collection === 'users') {
      const existing = db.users.find(x => x.id === recordId);
      if (existing?.role === 'owner') return send(res, 400, { error: '老板账号不能删除' });
      if (!existing) return send(res, 404, { error: 'Record not found' });
      existing.active = false;
      existing.deactivatedAt = new Date().toISOString();
      existing.deactivatedBy = user.name || user.email || '';
      audit(db, user, 'deactivate-user', {
        collection: 'users',
        recordId,
        recordLabel: recordLabel(existing),
        snapshot: { ...existing },
        detail: `停用员工账号 ${recordLabel(existing) || recordId}；历史记事和业务记录保留`
      });
      writeDb(db);
      notifyDataChanged('deactivate-user', recordId);
      return send(res, 200, sanitizeDbForUser(db, user));
    }
    if (collection === 'jobs') {
      const existingJob = db.jobs.find(x => x.id === recordId);
      if (!existingJob) return send(res, 404, { error: 'Record not found' });
      if (!existingJob.deletedAt) {
        existingJob.deletedAt = new Date().toISOString();
        existingJob.deletedBy = user.name || user.email || '';
      }
      audit(db, user, 'archive-job', {
        collection: 'jobs',
        recordId,
        recordLabel: recordLabel(existingJob),
        snapshot: { ...existingJob },
        detail: `施工单移到已删除列表 ${recordLabel(existingJob) || recordId}`
      });
      writeDb(db);
      notifyDataChanged('archive-job', recordId);
      return send(res, 200, sanitizeDbForUser(db, user));
    }
    if (collection === 'reimbursements') {
      const existingReimbursement = db.reimbursements.find(x => x.id === recordId);
      if (!existingReimbursement) return send(res, 404, { error: 'Record not found' });
      const canApprove = canAccess(user, 'reimbursementsApprove');
      if (!canApprove && existingReimbursement.employeeUserId !== user.id) return send(res, 403, { error: '只能删除自己的报销申请' });
      if (existingReimbursement.status !== '待审批') return send(res, 400, { error: '已审批的报销记录需要保留，不能删除' });
    }
    const existing = db[collection].find(x => x.id === recordId);
    db[collection] = db[collection].filter(x => x.id !== recordId);
    audit(db, user, `delete-${collection}`, {
      collection,
      recordId,
      recordLabel: recordLabel(existing),
      snapshot: existing || null,
      detail: `删除 ${collection} ${recordLabel(existing) || recordId}`
    });
    writeDb(db);
    notifyDataChanged(`delete-${collection}`, recordId);
    return send(res, 200, sanitizeDbForUser(db, user));
  }

  send(res, 405, { error: 'Method not allowed' });
}

function validateUserInput(db, user, existingId = null, requirePassword = false, body = user) {
  const name = String(user.name || '').trim();
  const email = String(user.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  if (!name) return '员工姓名不能为空';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '员工邮箱格式不正确';
  const duplicate = db.users.find(u => u.id !== existingId && String(u.email || '').toLowerCase() === email);
  if (duplicate) return `这个员工邮箱已经存在：${duplicate.name || duplicate.email}。如果要改权限，请编辑现有员工，不要重复新增`;
  if (requirePassword && password.length < 8) return '新增员工必须设置至少 8 位临时密码';
  if (!requirePassword && password && password.length < 8) return '新密码至少 8 位';
  return '';
}

function prepareScheduleItem(db, item) {
  const employee = db.users.find(user => user.id === item.employeeId);
  if (employee) {
    item.employeeName = employee.name || '';
    item.email = employee.email || '';
  }
  item.date = String(item.date || '').trim();
  item.type = String(item.type || 'work').trim();
  item.shift = String(item.shift || '').trim();
  item.reason = String(item.reason || '').trim();
  item.note = String(item.note || '').trim();
  if (!item.date) return '排班日期不能为空';
  if (!item.employeeId) return '员工不能为空';
  if (!['work', 'makeup', 'off', 'adjustedRest'].includes(item.type)) return '排班类型不正确';
  return '';
}

function validateMovement(db, movement) {
  if (isCustomPrintedFilmSku(movement.sku)) return '定制喷绘膜不走库存出库，请按喷绘底膜领料出库';
  const product = db.products.find(p => p.sku === movement.sku);
  if (!product) return '找不到这个 SKU，不能出入库';
  const qty = Number(movement.qty || 0);
  if (!Number.isFinite(qty) || qty <= 0) return '数量必须大于 0';
  if (movement.type !== 'in' && movement.type !== 'out') return '请选择入库或出库';
  if (movement.type === 'out' && !movement.salesOrderId) return '出库必须关联零售/批发订单。没有订单不允许出货';
  if (movement.salesOrderId) {
    if (movement.type !== 'out') return '只有出库流水可以关联零售批发订单';
    const order = db.salesOrders.find(o => o.id === movement.salesOrderId);
    if (!order) return '找不到关联的零售批发订单';
    if (order.status !== '待出库') return '只有待出库订单可以通过库存出库自动改为已出库';
    const orderLine = salesOrderItems(order).find(line => String(line.item) === String(movement.sku || ''));
    if (!orderLine) return '出库SKU必须和关联订单的某一行商品一致';
    if (Number(orderLine.qty || 0) !== qty) return `出库数量必须和订单该商品数量一致。订单数量 ${Number(orderLine.qty || 0)}，本次出库 ${qty}`;
    const alreadyShipped = (db.movements || []).some(row => row.type === 'out' && row.salesOrderId === order.id && String(row.sku) === String(movement.sku));
    if (alreadyShipped) return '这个订单中的该 SKU 已经出库，不能重复出库';
  }
  const currentQty = Number(product.qty || 0);
  if (movement.type === 'out' && qty > currentQty) {
    return `出库数量不能超过当前库存。${product.sku} 当前库存 ${currentQty}，本次出库 ${qty}`;
  }
  return '';
}

function applyMovement(db, movement) {
  const product = db.products.find(p => p.sku === movement.sku);
  if (!product) return;
  const qty = Number(movement.qty || 0);
  product.qty = Number(product.qty || 0) + (movement.type === 'in' ? qty : -qty);
  if (movement.type === 'out' && movement.salesOrderId) {
    const order = db.salesOrders.find(o => o.id === movement.salesOrderId);
    if (order && order.status === '待出库') {
      const physicalLines = salesOrderItems(order).filter(line => !isCustomPrintedFilmSku(line.item));
      const shippedSkus = new Set((db.movements || [])
        .filter(row => row.type === 'out' && row.salesOrderId === order.id)
        .map(row => String(row.sku || '')));
      if (physicalLines.every(line => shippedSkus.has(String(line.item)))) {
        order.status = '已出库';
        order.shippedAt = movement.date || new Date().toISOString().slice(0, 10);
        order.shippedMovementId = movement.id;
      }
    }
  }
}

function workshopStockQty(db, sku) {
  return (db.workshopMovements || [])
    .filter(movement => String(movement.sku || '') === String(sku || ''))
    .reduce((sum, movement) => {
      const qty = Number(movement.qty || 0);
      if (movement.type === 'transfer') return sum + qty;
      if (movement.type === 'consume') return sum - qty;
      return sum;
    }, 0);
}

function validateWorkshopMovement(db, movement) {
  if (isCustomPrintedFilmSku(movement.sku)) return '定制喷绘膜不走贴膜间库存，请按喷绘底膜领料出库';
  const product = db.products.find(p => p.sku === movement.sku);
  if (!product) return '找不到这个 SKU，不能登记贴膜间库存';
  const qty = Number(movement.qty || 0);
  if (!Number.isFinite(qty) || qty <= 0) return '数量必须大于 0';
  if (movement.type !== 'transfer' && movement.type !== 'consume') return '请选择领料到贴膜间或贴膜间消耗';
  if (movement.type === 'transfer') {
    const mainQty = Number(product.qty || 0);
    if (qty > mainQty) return `大仓库存不足。${product.sku} 大仓当前库存 ${mainQty}，本次领料 ${qty}`;
  }
  if (movement.type === 'consume') {
    const currentQty = workshopStockQty(db, movement.sku);
    if (qty > currentQty) return `贴膜间库存不足。${product.sku} 贴膜间当前库存 ${currentQty}，本次消耗 ${qty}`;
  }
  return '';
}

function applyWorkshopMovement(db, movement) {
  if (movement.type !== 'transfer') return;
  const product = db.products.find(p => p.sku === movement.sku);
  if (!product) return;
  product.qty = Number(product.qty || 0) - Number(movement.qty || 0);
}

function staticFile(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = path.join(PUBLIC, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!filePath.startsWith(PUBLIC)) return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    const ext = path.extname(filePath);
    const type = mime[ext] || 'application/octet-stream';
    const fileName = path.basename(filePath);
    const textAsset = /html|json|javascript|css|svg|manifest/.test(type);
    const headers = {
      'Content-Type': type,
      'Cache-Control': fileName === 'index.html' || fileName === 'mobile.html' || fileName === 'customer.html' || fileName === 'warranty.html'
        ? 'no-cache'
        : (textAsset || ['.png', '.icns'].includes(ext) ? 'public, max-age=300' : 'no-store')
    };
    if (textAsset && acceptsGzip(req) && data.length > 1024) {
      const gzipped = zlib.gzipSync(data);
      headers['Content-Encoding'] = 'gzip';
      headers.Vary = 'Accept-Encoding';
      headers['Content-Length'] = gzipped.length;
      res.writeHead(200, headers);
      return res.end(gzipped);
    }
    headers['Content-Length'] = data.length;
    res.writeHead(200, headers);
    res.end(data);
  });
}

function startScheduleReminderWorker() {
  if (!process.env.RESEND_API_KEY || !(process.env.REMINDER_FROM_EMAIL || process.env.RESEND_FROM_EMAIL)) {
    console.log('Schedule email reminders are disabled until RESEND_API_KEY and REMINDER_FROM_EMAIL are configured.');
    return;
  }
  const run = async () => {
    try {
      const db = readDb();
      const targetDate = dateInTimezone(db.settings?.timezone, 1);
      const result = await sendScheduleReminders(db, targetDate);
      if (result.sent || result.failed) console.log(`Schedule reminders for ${targetDate}: sent ${result.sent}, failed ${result.failed}.`);
    } catch (err) {
      console.warn(`Schedule reminder worker failed: ${err.message}`);
    }
  };
  setTimeout(run, 30 * 1000);
  setInterval(run, 6 * 60 * 60 * 1000);
}

function startDailyBackupWorker() {
  const run = () => {
    try {
      const db = readDb();
      const result = createDatabaseBackup(db, 'daily');
      if (result.created) console.log(`Daily database backup created: ${result.fileName}`);
    } catch (err) {
      console.warn(`Daily backup worker failed: ${err.message}`);
    }
  };
  setTimeout(run, 20 * 1000);
  setInterval(run, 6 * 60 * 60 * 1000);
}

ensureDb();
applyStartupPasswordReset();
applyProvisionedManager();
applyFormalDataReset();
applyStaffContactsImport();
applyStaffUserAccounts();
applyShippingCoordinatorAccount();
applyCommissionPlansImport();
applySabrinaCustomerServiceRep();
applyInventoryImport();
applyJobLedgerImport();
applyJobSalesRepMigration();
applyJobCommissionPeopleMigration();
applySalesOrderSalesRepMigration();
applyCustomPrintedFilmSalesOrderMigration();
applyPromotedConversationMerge();
applyCustomerConversationPromotionEligibilityMigration();
applyImportedCustomerEncodingMigration();
applyCustomerConversationDuplicateMerge();
applyCustomerNumberRemoval();
expireInternalMessageVideos();
cleanupStaleMediaUploadParts();
http.createServer((req, res) => {
  if (req.url.startsWith('/customer-media/')) {
    serveCustomerMedia(req, res);
  } else if (req.url.startsWith('/api/')) {
    api(req, res).catch(err => send(res, 500, { error: err.message }));
  } else {
    staticFile(req, res);
  }
}).listen(PORT, HOST, () => {
  console.log(`Film shop cloud app running: http://localhost:${PORT}`);
  if (config.publicUrl) console.log(`Public URL: ${config.publicUrl}`);
  console.log(`Listen host: ${HOST}, port: ${PORT}`);
  console.log('Default login: admin@filmshop.local / admin123');
  startDailyBackupWorker();
  startScheduleReminderWorker();
  startTwilioReconciliationWorker();
  setInterval(expireInternalMessageVideos, 6 * 60 * 60 * 1000);
  setInterval(cleanupStaleMediaUploadParts, 6 * 60 * 60 * 1000);
});
