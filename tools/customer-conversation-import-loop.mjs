import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.FILM_SHOP_URL || 'https://film-shop-management-production.up.railway.app';
const OUTBOX_FILE = process.env.CUSTOMER_IMPORT_OUTBOX_FILE || path.resolve('imports/customer-conversation-outbox.json');
const KEYCHAIN_SERVICE = process.env.QUAD_IMPORT_KEYCHAIN_SERVICE || 'QUAD_CUSTOMER_IMPORT_TOKEN';
const WINDOWS_CREDENTIAL_FILE = process.env.QUAD_IMPORT_CREDENTIAL_FILE || path.join(process.env.APPDATA || os.homedir(), 'QUAD', 'customer-import-token.dat');
const DEVICE_NAME = process.env.SOURCE_DEVICE || os.hostname() || 'quad-import-computer';
const INTERVAL_MS = Math.max(10_000, Number(process.env.IMPORT_INTERVAL_MS || 30_000));
const RUN_ONCE = process.argv.includes('--once');

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  for (const key of ['items', 'customers', 'customerConversations']) {
    if (Array.isArray(parsed[key])) return parsed[key];
  }
  return [parsed];
}

function readImportToken() {
  // Environment input is retained for isolated tests/managed runners. Real
  // Macs use Keychain; Windows uses a current-user DPAPI encrypted file.
  if (process.env.CUSTOMER_CONVERSATION_IMPORT_TOKEN) {
    return process.env.CUSTOMER_CONVERSATION_IMPORT_TOKEN.trim();
  }
  if (process.platform === 'win32') {
    const reader = path.join(path.dirname(fileURLToPath(import.meta.url)), 'windows-read-quad-import-token.ps1');
    try {
      return execFileSync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', reader, '-CredentialFile', WINDOWS_CREDENTIAL_FILE
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
    } catch {
      throw new Error(`Windows 加密凭据不可用：${WINDOWS_CREDENTIAL_FILE}，请先由店主运行安装脚本`);
    }
  }
  try {
    return execFileSync('/usr/bin/security', [
      'find-generic-password', '-w', '-s', KEYCHAIN_SERVICE
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new Error(`钥匙串中没有 ${KEYCHAIN_SERVICE}，请先由店主完成一次密钥安装`);
  }
}

async function importRows(rows) {
  const response = await fetch(`${BASE_URL}/api/import/customer-conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Import-Token': readImportToken()
    },
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
  fs.renameSync(filePath, path.join(archiveDir, `customer-conversation-outbox-${stamp}.json`));
}

async function runOnce() {
  const rows = readJsonFile(OUTBOX_FILE);
  if (!rows.length) return;
  const result = await importRows(rows);
  console.log(`[${new Date().toLocaleString()}] 客户交流中心同步完成：新增 ${result.imported}，更新 ${result.updated}，跳过 ${result.skipped}`);
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
