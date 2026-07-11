import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.FILM_SHOP_URL || 'https://film-shop-management-production.up.railway.app';
const IMPORT_TOKEN = process.env.PROSPECT_IMPORT_TOKEN || '';
const EMAIL = process.env.FILM_SHOP_EMAIL || '';
const PASSWORD = process.env.FILM_SHOP_PASSWORD || '';
const OUTBOX_FILE = process.env.PROSPECT_OUTBOX_FILE || path.resolve('imports/prospect-outbox.json');
const DEVICE_NAME = process.env.SOURCE_DEVICE || process.env.COMPUTERNAME || process.env.HOSTNAME || 'codex-import-computer';
const INTERVAL_MS = Number(process.env.IMPORT_INTERVAL_MS || 6 * 60 * 1000);
const RUN_ONCE = process.argv.includes('--once');

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.items)) return parsed.items;
  if (Array.isArray(parsed.prospects)) return parsed.prospects;
  return [parsed];
}

async function login() {
  if (IMPORT_TOKEN) return IMPORT_TOKEN;
  if (!EMAIL || !PASSWORD) throw new Error('请先设置 FILM_SHOP_EMAIL 和 FILM_SHOP_PASSWORD');
  const response = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.token) throw new Error(body.error || `登录失败 ${response.status}`);
  return body.token;
}

async function importRows(token, rows) {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (IMPORT_TOKEN) headers['X-Import-Token'] = token;
  else headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE_URL}/api/import/prospects`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      importSource: 'codex',
      sourceDevice: DEVICE_NAME,
      items: rows
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `导入失败 ${response.status}`);
  return body;
}

function archiveOutbox(filePath) {
  if (!fs.existsSync(filePath)) return;
  const dir = path.dirname(filePath);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveDir = path.join(dir, 'processed');
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.renameSync(filePath, path.join(archiveDir, `prospect-outbox-${stamp}.json`));
}

async function runOnce() {
  const rows = readJsonFile(OUTBOX_FILE);
  if (!rows.length) {
    console.log(`[${new Date().toLocaleString()}] 没有待导入客资：${OUTBOX_FILE}`);
    return;
  }
  const token = await login();
  const result = await importRows(token, rows);
  console.log(`[${new Date().toLocaleString()}] 导入完成：新增 ${result.imported}，更新 ${result.updated}，跳过 ${result.skipped}`);
  archiveOutbox(OUTBOX_FILE);
}

async function loop() {
  for (;;) {
    try {
      await runOnce();
    } catch (err) {
      console.error(`[${new Date().toLocaleString()}] ${err.message}`);
    }
    if (RUN_ONCE) break;
    await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
  }
}

loop();
