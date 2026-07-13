const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const CUSTOMER_MEDIA_DIR = path.join(DATA_DIR, 'customer-media');
const SESSION_SECRET_FILE = path.join(DATA_DIR, 'session-secret');
const CONFIG_FILE = path.join(ROOT, 'server-config.json');
const VERSION_FILE = path.join(ROOT, 'version.json');
const MAX_MESSAGE_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_AVATAR_DATA_URL_BYTES = 2 * 1024 * 1024;
const CUSTOM_PRINTED_FILM_SKU = 'CUSTOM-PRINTED-FILM';
const sessions = new Map();
const eventClients = new Set();

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
      clockRadiusMeters: 150
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
    customerServiceReps: [
      { id: id(), name: '前台客服', role: '前台', invitePay: 20, closePay: 50, active: true }
    ],
    leads: [
      { id: id(), date: new Date().toISOString().slice(0, 10), source: 'Yelp', customer: 'Internet Lead', phone: '(702) 000-0001', service: 'tint', repId: '', status: '已邀约', quote: 399, soldAmount: 0, note: '互联网客资示例' }
    ],
    prospects: [],
    customerConversations: [],
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
    auditLogs: []
  };
}

function ensureDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) writeDb(seedDb());
}

function readDb() {
  ensureDb();
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (!db.settings) db.settings = {};
  if (!db.settings.timezone) db.settings.timezone = 'America/Los_Angeles';
  if (!db.settings.entryTimezone || db.settings.entryTimezone === 'Asia/Shanghai') db.settings.entryTimezone = 'America/Los_Angeles';
  if (!db.settings.officeAddress) db.settings.officeAddress = '3359 W Oquendo Rd, Las Vegas, NV 89118';
  if (!Number.isFinite(Number(db.settings.officeLat))) db.settings.officeLat = 36.0824712;
  if (!Number.isFinite(Number(db.settings.officeLng))) db.settings.officeLng = -115.1850945;
  if (!Number.isFinite(Number(db.settings.clockRadiusMeters))) db.settings.clockRadiusMeters = 150;
  if (!Array.isArray(db.expenses)) db.expenses = [];
  if (!Array.isArray(db.customerServiceReps)) db.customerServiceReps = [];
  if (!Array.isArray(db.leads)) db.leads = [];
  if (!Array.isArray(db.prospects)) db.prospects = [];
  if (!Array.isArray(db.customerConversations)) db.customerConversations = [];
  if (!Array.isArray(db.shipments)) db.shipments = [];
  if (!Array.isArray(db.schedules)) db.schedules = [];
  if (!Array.isArray(db.scheduleReminderLogs)) db.scheduleReminderLogs = [];
  if (!Array.isArray(db.messages)) db.messages = [];
  if (!Array.isArray(db.clockRecords)) db.clockRecords = [];
  if (!Array.isArray(db.leaveRequests)) db.leaveRequests = [];
  if (!Array.isArray(db.workshopMovements)) db.workshopMovements = [];
  return db;
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
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
    reportsView: false,
    fullFinanceView: false,
    usersManage: false,
    settingsEdit: false
  };
  const all = Object.fromEntries(Object.keys(none).map(k => [k, true]));
  const byRole = {
    owner: all,
    manager: all,
    frontdesk: { ...none, jobsView: true, jobsCreate: true, pricingView: true, ordersView: true, ordersEdit: true, shipmentsView: true, schedulesView: true, leadsView: true, leadsEdit: true, prospectsView: true, prospectsEdit: true },
    sales: { ...none, jobsView: true, jobsCreate: true, pricingView: true, ordersView: true, ordersEdit: true, shipmentsView: true, schedulesView: true, leadsView: true, leadsEdit: true, prospectsView: true, prospectsEdit: true },
    clerk: { ...none, jobsView: true, jobsCreate: true, jobsEdit: true, pricingView: true, inventoryView: true, ordersView: true, ordersEdit: true, shipmentsView: true, shipmentsEdit: true, schedulesView: true, schedulesEdit: true, leadsView: true, leadsEdit: true, prospectsView: true, prospectsEdit: true, expensesView: true, expensesEdit: true },
    warehouse: { ...none, inventoryView: true, inventoryEdit: true, ordersView: true, shipmentsView: true, shipmentsEdit: true, schedulesView: true },
    installer: { ...none, jobsView: true },
    finance: { ...none, jobsView: true, ordersView: true, shipmentsView: true, schedulesView: true, leadsView: true, prospectsView: true, commissionView: true, reportsView: true, fullFinanceView: true, expensesView: true, expensesEdit: true, inventoryView: true, settingsEdit: true }
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

function sanitizeDbForUser(db, user) {
  const p = effectivePermissions(user);
  const canSeeCosts = user?.role === 'owner';
  return {
    settings: db.settings,
    users: p.usersManage || p.schedulesView ? db.users.map(safeUser) : [safeUser(user)],
    messageUsers: db.users.filter(item => item.active !== false).map(safeUser),
    messages: messagesForUser(db, user),
    installers: p.installerView || p.jobsView ? db.installers.map(installer => sanitizeInstaller(installer, p)) : [],
    products: p.inventoryView ? sanitizeProducts(db.products, canSeeCosts) : [],
    priceRules: p.pricingView ? db.priceRules.map(rule => canSeeCosts ? rule : { ...rule, materialCost: 0 }) : [],
    jobs: p.jobsView || p.jobsEdit || p.jobsDelete ? db.jobs.map(job => sanitizeJob(job, p, canSeeCosts)) : [],
    salesOrders: p.ordersView ? db.salesOrders.map(order => sanitizeSalesOrder(order, p)) : [],
    shipments: p.shipmentsView ? db.shipments : [],
    schedules: p.schedulesView ? (db.schedules || []) : [],
    scheduleReminderLogs: p.schedulesView ? (db.scheduleReminderLogs || []).slice(0, 200) : [],
    customerServiceReps: p.leadsView ? sanitizeCustomerServiceReps(db.customerServiceReps || [], p) : [],
    leads: p.leadsView ? sanitizeLeads(db.leads || [], p) : [],
    prospects: p.prospectsView ? (db.prospects || []) : [],
    customerConversations: p.prospectsView ? (db.customerConversations || []) : [],
    expenses: p.expensesView || p.fullFinanceView ? (db.expenses || []) : [],
    movements: p.inventoryView ? db.movements : [],
    workshopMovements: p.inventoryView ? (db.workshopMovements || []) : [],
    auditLogs: p.usersManage || p.reportsView ? db.auditLogs : [],
    permissions: p
  };
}

function messagesForUser(db, user) {
  const userId = user?.id || '';
  return (db.messages || [])
    .filter(message => message.fromUserId === userId || message.toUserId === userId)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .slice(-500);
}

function unreadMessageCount(db, user) {
  const userId = user?.id || '';
  return (db.messages || []).filter(message => message.toUserId === userId && !message.readAt).length;
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
  return {
    user: safeUser(user),
    users: db.users.filter(item => item.active !== false).map(safeUser),
    messages: messagesForUser(db, user),
    unread: unreadMessageCount(db, user),
    canApproveLeave: approver,
    clockRecords: (db.clockRecords || [])
      .filter(item => approver || item.userId === userId)
      .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
      .slice(0, 200),
    leaveRequests: (db.leaveRequests || [])
      .filter(item => approver || item.userId === userId)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 200)
  };
}

function sanitizeMessageAttachment(input) {
  if (!input || typeof input !== 'object') return null;
  const kind = String(input.kind || '').trim();
  const allowedKinds = new Set(['image', 'file', 'audio']);
  if (!allowedKinds.has(kind)) return { error: '附件类型不正确' };
  const name = String(input.name || (kind === 'audio' ? 'voice-message.webm' : 'attachment')).trim().slice(0, 160);
  const type = String(input.type || 'application/octet-stream').trim().slice(0, 120);
  const dataUrl = String(input.dataUrl || '').trim();
  const size = Number(input.size || 0);
  if (!dataUrl.startsWith('data:')) return { error: '附件内容格式不正确' };
  if (!Number.isFinite(size) || size <= 0) return { error: '附件大小不正确' };
  if (size > MAX_MESSAGE_ATTACHMENT_BYTES) return { error: '附件不能超过 8MB' };
  if (dataUrl.length > 12_000_000) return { error: '附件内容太大' };
  if (kind === 'image' && !type.startsWith('image/')) return { error: '请选择图片文件' };
  if (kind === 'audio' && !type.startsWith('audio/')) return { error: '语音文件格式不正确' };
  return { kind, name, type, size, dataUrl };
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

function minimumSalePrice(product) {
  return Number(product?.minPrice || product?.wholesale || 0);
}

function isCustomPrintedFilmSku(sku) {
  return String(sku || '') === CUSTOM_PRINTED_FILM_SKU;
}

function validateSalesOrder(db, order) {
  const product = db.products.find(product => product.sku === order.item);
  if (!product && !isCustomPrintedFilmSku(order.item)) return '找不到这个商品 SKU，不能新增订单';
  const qty = Number(order.qty || 0);
  const unitPrice = Number(order.unitPrice || 0);
  if (!Number.isFinite(qty) || qty <= 0) return '订单数量必须大于 0';
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return '订单单价不正确';
  const minPrice = minimumSalePrice(product);
  if (minPrice > 0 && unitPrice < minPrice) {
    return `${product.sku} 最低售价是 $${minPrice}，当前单价 $${unitPrice} 低于最低售价，不能保存订单`;
  }
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

function normalizeProspectMessages(value) {
  return parseMaybeJsonArray(value).map((item, index) => {
    const speakerName = String(item.speakerName || item.name || item.sender || '').trim();
    const speaker = normalizeProspectSpeaker(
      item.speaker || item.role || item.type || item.side || item.from || item.senderType,
      speakerName
    );
    const text = String(item.text || item.message || item.content || item.body || '').trim();
    if (!text) return null;
    return {
      speaker,
      speakerName,
      timestamp: String(item.timestamp || item.time || item.createdAt || '').trim(),
      text,
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index
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
  return [
    normalizeProspectSpeaker(message.speaker, message.speakerName),
    prospectTextKey(message.speakerName),
    prospectTextKey(message.timestamp),
    prospectTextKey(message.text)
  ].join('|');
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
  const source = String(input.platform || input.source || fallback.source || '').trim();
  const conversationMessages = normalizeProspectMessages(input.conversationMessages || input.messages || input.chatMessages || fallback.conversationMessages || []);
  const rawConversation = String(input.rawConversation || input.chatContext || input.conversation || fallback.chatContext || prospectMessagesToText(conversationMessages)).trim();
  const noteParts = [
    String(input.note || fallback.note || '').trim(),
    input.importSource ? `导入来源: ${String(input.importSource).trim()}` : '',
    input.sourceDevice ? `采集电脑: ${String(input.sourceDevice).trim()}` : '',
    input.profileUrl ? `客户链接: ${String(input.profileUrl).trim()}` : ''
  ].filter(Boolean);
  const base = {
    date: String(input.date || fallback.date || dateInTimezone('America/Los_Angeles')).slice(0, 10),
    source,
    customer: String(input.customer || input.customerName || fallback.customer || '').trim(),
    phone: String(input.phone || fallback.phone || '').trim(),
    vehicle: String(input.vehicle || fallback.vehicle || '').trim(),
    need: String(input.need || input.customerNeed || input.interest || fallback.need || '').trim(),
    service: String(input.service || fallback.service || 'tint').trim(),
    appointmentDate: String(input.appointmentDate || fallback.appointmentDate || '').slice(0, 10),
    appointmentTime: String(input.appointmentTime || fallback.appointmentTime || '').slice(0, 8),
    ownerId: String(input.ownerId || fallback.ownerId || '').trim(),
    ownerName: String(input.ownerName || input.contactOwner || fallback.ownerName || '').trim(),
    status: String(input.status || fallback.status || '').trim(),
    chatContext: rawConversation,
    chatTranslation: String(input.chatTranslation || input.translation || fallback.chatTranslation || '').trim(),
    note: noteParts.join('\n'),
    importSource: String(input.importSource || fallback.importSource || 'codex').trim(),
    sourceDevice: String(input.sourceDevice || fallback.sourceDevice || '').trim(),
    externalId: String(input.externalId || input.conversationId || fallback.externalId || '').trim(),
    profileUrl: String(input.profileUrl || fallback.profileUrl || '').trim(),
    importedAt: String(input.importedAt || new Date().toISOString()).trim(),
    conversationMessages
  };
  base.status = base.status || (base.appointmentDate || base.appointmentTime ? '已预约' : '新意向');
  base.intentLevel = inferProspectIntent(base, input.intentLevel || fallback.intentLevel || '');
  base.intentReason = String(input.intentReason || fallback.intentReason || inferProspectIntentReason(base, conversationMessages, base.intentLevel)).trim();
  return base;
}

function findProspectDuplicate(prospects, candidate) {
  const candidateKey = prospectIdentityKey(candidate);
  if (!candidateKey) return null;
  return (prospects || []).find(item => prospectIdentityKey(item) === candidateKey) || null;
}

function mergeProspect(existing, incoming) {
  const next = { ...existing };
  const mergedMessages = mergeProspectMessages(existing.conversationMessages, incoming.conversationMessages);
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || value === null || value === '') continue;
    if (key === 'conversationMessages') continue;
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

function prospectImportRows(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.prospects)) return body.prospects;
  if (body && typeof body === 'object') return [body];
  return [];
}

function importProspects(db, user, body) {
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
  db.prospects = Array.isArray(db.prospects) ? db.prospects : [];
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
    const duplicate = findProspectDuplicate(db.prospects, candidate);
    if (duplicate) {
      const before = { ...duplicate };
      const next = mergeProspect(duplicate, {
        ...candidate,
        updatedBy: user.name || user.email,
        updatedByUserId: user.id
      });
      const idx = db.prospects.findIndex(item => item.id === duplicate.id);
      db.prospects[idx] = next;
      result.updated += 1;
      result.duplicateCount += 1;
      result.items.push({ id: next.id, status: 'updated', customer: next.customer, source: next.source });
      audit(db, user, 'import-update-prospect', {
        collection: 'prospects',
        recordId: next.id,
        recordLabel: recordLabel(next),
        changedFields: diffRecords(before, next),
        before,
        after: next,
        detail: `自动导入更新高意向客户 ${recordLabel(next) || next.id}`
      });
      return;
    }
    const now = new Date().toISOString();
    const item = {
      ...candidate,
      id: id(),
      duplicateStatus: 'new',
      createdAt: candidate.createdAt || now,
      importedAt: candidate.importedAt || now,
      updatedAt: candidate.updatedAt || candidate.importedAt || now,
      createdBy: user.name || user.email,
      createdByUserId: user.id
    };
    db.prospects.push(item);
    result.imported += 1;
    result.items.push({ id: item.id, status: 'new', customer: item.customer, source: item.source });
    audit(db, user, 'import-create-prospect', {
      collection: 'prospects',
      recordId: item.id,
      recordLabel: recordLabel(item),
      after: item,
      detail: `自动导入新增高意向客户 ${recordLabel(item) || item.id}`
    });
  });
  return result;
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
      if (data.length > 16_000_000) reject(new Error('Body too large'));
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

function promoteEligibleCustomerConversation(db, item, user) {
  if (!item || item.promotedProspectId || !['已邀约', '已预约'].includes(String(item.status || ''))) return null;
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
    added += 1;
  }
  if (!added) return;
  audit(db, { id: 'twilio-reconcile', name: 'Twilio' }, 'reconcile-customer-sms', `Recovered ${added} recent inbound SMS messages`);
  writeDb(db);
  notifyDataChanged('reconcile-customer-sms', String(added));
  console.log(`Twilio inbound messages reconciled: ${added}.`);
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
    await execFileAsync('ffmpeg', [
      '-y', '-i', inputPath,
      '-vf', 'scale=480:-2:force_original_aspect_ratio=decrease,fps=20',
      '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0', '-pix_fmt', 'yuv420p',
      '-b:v', `${videoKbps}k`, '-maxrate', `${videoKbps}k`, '-bufsize', `${videoKbps * 2}k`,
      '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-ac', '1', '-ar', '32000',
      '-movflags', '+faststart', outputPath
    ], { maxBuffer: 1024 * 1024 });
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

function serveCustomerMedia(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const fileName = path.basename(decodeURIComponent(url.pathname.replace('/customer-media/', '')));
  if (!/^[a-f0-9]{12,32}\.[a-z0-9]{1,8}$/i.test(fileName)) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  const filePath = path.join(CUSTOMER_MEDIA_DIR, fileName);
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    res.writeHead(200, {
      'Content-Type': mime[path.extname(fileName).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(data);
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

function notifyDataChanged(action, detail) {
  const payload = JSON.stringify({ action, detail, at: new Date().toISOString() });
  for (const client of [...eventClients]) {
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
    customerServiceReps: { GET: 'leadsView', POST: 'commissionEdit', PUT: 'commissionEdit', DELETE: 'commissionEdit' },
    expenses: { GET: 'expensesView', POST: 'expensesEdit', PUT: 'expensesEdit', DELETE: 'expensesEdit' },
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
      if (!duplicate) appendSmsMessage(match.item, {
        id: `twilio-${messageSid || id()}`,
        speaker: 'customer',
        speakerName: match.item.customer || from,
        direction: 'inbound',
        channel: 'sms',
        text: (body || (mediaCount > 0 && !attachment ? '收到附件，但附件下载失败' : '')).slice(0, 4000),
        attachment,
        timestamp: String(params.DateSent || new Date().toISOString()),
        provider: 'twilio',
        providerSid: messageSid,
        status: String(params.SmsStatus || 'received')
      });
      audit(db, { id: 'twilio-webhook', name: 'Twilio' }, 'receive-customer-sms', {
        collection: match.collection,
        recordId: match.item.id,
        recordLabel: match.item.customer || from,
        detail: `收到 ${from} 的${attachment ? '图片/附件' : '短信'}`
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
    return send(res, 200, { user: safeUser(user), data: sanitizeDbForUser(db, user) }, undefined, req);
  }

  if (req.method === 'GET' && url.pathname === '/api/mobile/bootstrap') {
    return send(res, 200, mobileSnapshot(db, user), undefined, req);
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
      inboundWebhookUrl: `${requestPublicBaseUrl(req)}/api/twilio/inbound`
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/customer-media/upload') {
    if (!canAccess(user, 'prospectsEdit')) return send(res, 403, { error: '没有发送客户附件的权限' });
    const body = await readBody(req);
    const name = String(body.name || '附件').trim().slice(0, 160);
    let contentType = String(body.type || 'application/octet-stream').trim().slice(0, 120);
    const match = String(body.dataUrl || '').match(/^data:([^;,]+);base64,(.+)$/s);
    if (!match) return send(res, 400, { error: '附件格式不正确' });
    contentType = String(match[1] || contentType).trim().slice(0, 120);
    let data = Buffer.from(match[2], 'base64');
    if (!data.length) return send(res, 400, { error: '附件为空' });
    if (data.length > 5 * 1024 * 1024) return send(res, 400, { error: '附件不能超过 5MB，短信附件太大会发送失败' });
    if (contentType.startsWith('image/') && data.length > 900 * 1024) return send(res, 400, { error: '图片压缩后仍超过 900KB，请换一张图片重试' });
    fs.mkdirSync(CUSTOMER_MEDIA_DIR, { recursive: true });
    if (contentType.startsWith('video/')) {
      data = await optimizeCustomerMmsVideo(data, contentType);
      contentType = 'video/mp4';
    }
    const storedName = contentType === 'video/mp4' ? 'video.mp4' : name;
    const fileName = `${crypto.randomBytes(6).toString('hex')}${safeCustomerMediaExtension(storedName, contentType)}`;
    fs.writeFileSync(path.join(CUSTOMER_MEDIA_DIR, fileName), data);
    const mediaUrl = `${requestPublicBaseUrl(req)}/customer-media/${fileName}`;
    audit(db, user, 'upload-customer-media', `上传客户附件 ${name}`);
    writeDb(db);
    return send(res, 200, { ok: true, name, type: contentType, size: data.length, url: mediaUrl });
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
    const phoneDigits = normalizedPhone(item.phone);
    if (phoneDigits.length !== 10) return send(res, 400, { error: '客户电话格式不正确，请先填写美国 10 位手机号码' });
    if (!text && !attachment?.url) return send(res, 400, { error: '短信内容或附件不能为空' });
    if (attachment?.url && !String(attachment.url).startsWith(`${requestPublicBaseUrl(req)}/customer-media/`)) {
      return send(res, 400, { error: '附件链接不正确，请重新选择文件' });
    }
    const attachmentType = String(attachment?.type || '');
    const canSendAsMms = /^(image\/|video\/mp4$)/i.test(attachmentType);
    const attachmentKind = attachmentType.startsWith('video/') ? 'video' : attachmentType.startsWith('image/') ? 'image' : 'file';
    if (attachment?.url && !canSendAsMms) {
      const label = attachmentKind === 'video' ? '视频' : attachmentKind === 'image' ? '图片' : '文件';
      text = [text, `${label}：${attachment.name || '查看附件'} ${attachment.url}`].filter(Boolean).join('\n');
    }
    if (text.length > 1600) return send(res, 400, { error: '短信内容不能超过 1600 个字符' });
    const to = `+1${phoneDigits}`;
    const sent = await sendTwilioSms({
      to,
      body: text,
      mediaUrl: canSendAsMms ? String(attachment.url || '') : '',
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
      const text = String(body.text || '').trim();
      const attachment = sanitizeMessageAttachment(body.attachment);
      if (attachment?.error) return send(res, 400, { error: attachment.error });
      const recipient = db.users.find(item => item.id === toUserId && item.active !== false);
      if (!recipient) return send(res, 400, { error: '收件人不存在或未启用' });
      if (recipient.id === user.id) return send(res, 400, { error: '不能给自己留言' });
      if (!text && !attachment) return send(res, 400, { error: '留言内容不能为空' });
      if (text.length > 2000) return send(res, 400, { error: '留言内容不能超过 2000 个字' });
      const message = {
        id: id(),
        fromUserId: user.id,
        fromName: user.name || user.email,
        toUserId: recipient.id,
        toName: recipient.name || recipient.email,
        text,
        attachment,
        createdAt: new Date().toISOString(),
        readAt: ''
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

  if (req.method === 'PUT' && url.pathname === '/api/messages/read') {
    const body = await readBody(req);
    const fromUserId = String(body.fromUserId || '').trim();
    let changed = 0;
    (db.messages || []).forEach(message => {
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
    const involved = message.fromUserId === user.id || message.toUserId === user.id;
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

  const match = url.pathname.match(/^\/api\/([a-zA-Z]+)(?:\/([^/]+))?$/);
  if (!match) return send(res, 404, { error: 'Not found' });
  const [, collection, recordId] = match;
  const allowed = ['jobs', 'installers', 'products', 'priceRules', 'salesOrders', 'shipments', 'schedules', 'movements', 'workshopMovements', 'expenses', 'leads', 'prospects', 'customerConversations', 'customerServiceReps', 'users'];
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
      if (!canSeeCosts) item.materialCost = 0;
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
    if (collection === 'salesOrders') {
      item.salesRep = String(item.salesRep || '').trim();
      const error = validateSalesOrder(db, item);
      if (error) return send(res, 400, { error });
      item.preparedBy = String(item.preparedBy || user.name || '').trim();
      item.preparedByUserId = user.id;
      item.createdAt = new Date().toISOString();
    }
    if (collection === 'prospects' || collection === 'customerConversations') {
      const now = new Date().toISOString();
      item.createdAt = item.createdAt || now;
      item.importedAt = item.importedAt || now;
      item.updatedAt = now;
      item.createdBy = user.name || user.email;
      item.createdByUserId = user.id;
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
    audit(db, user, `create-${collection}`, {
      collection,
      recordId: item.id,
      recordLabel: recordLabel(item),
      after: item,
      detail: `新增 ${collection} ${recordLabel(item) || item.id}`
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
      normalizeJobServices(next);
      next.preparedBy = db[collection][idx].preparedBy || user.name || '';
      next.preparedByUserId = db[collection][idx].preparedByUserId || user.id;
      next.updatedBy = user.name || '';
      next.updatedAt = new Date().toISOString();
      if (!canSeeCosts) next.materialCost = db[collection][idx].materialCost || 0;
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
    if (collection === 'salesOrders') {
      next.salesRep = String(next.salesRep || '').trim();
      const error = validateSalesOrder(db, next);
      if (error) return send(res, 400, { error });
      next.preparedBy = String(next.preparedBy || db[collection][idx].preparedBy || user.name || '').trim();
      next.preparedByUserId = db[collection][idx].preparedByUserId || user.id;
      next.updatedBy = user.name || '';
      next.updatedAt = new Date().toISOString();
    }
    if (collection === 'prospects' || collection === 'customerConversations') {
      const now = new Date().toISOString();
      next.createdAt = db[collection][idx].createdAt || next.createdAt || now;
      next.importedAt = db[collection][idx].importedAt || next.importedAt || next.createdAt;
      next.updatedBy = user.name || user.email;
      next.updatedByUserId = user.id;
      next.updatedAt = now;
    }
    const autoPromoted = collection === 'customerConversations' ? promoteEligibleCustomerConversation(db, next, user) : null;
    const before = db[collection][idx];
    const changedFields = diffRecords(before, next);
    db[collection][idx] = next;
    audit(db, user, `update-${collection}`, {
      collection,
      recordId,
      recordLabel: recordLabel(next) || recordLabel(before),
      changedFields,
      before,
      after: next,
      detail: `修改 ${collection} ${recordLabel(next) || recordId}：${changedFields.map(change => change.field).join(', ') || '无字段变化'}`
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
    if (String(order.item || '') !== String(movement.sku || '')) return '出库SKU必须和关联订单商品一致';
    if (Number(order.qty || 0) !== qty) return `出库数量必须和订单数量一致。订单数量 ${Number(order.qty || 0)}，本次出库 ${qty}`;
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
      order.status = '已出库';
      order.shippedAt = movement.date || new Date().toISOString().slice(0, 10);
      order.shippedMovementId = movement.id;
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
      'Cache-Control': fileName === 'index.html' || fileName === 'mobile.html'
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
});
