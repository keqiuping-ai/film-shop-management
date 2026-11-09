const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const [inputPath, outputPath, sourceWorkbookPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/build-rfid-catalog-import.js <mapping-data.json> <output.json> [source-workbook]');
  process.exit(1);
}

const mapping = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
if (!Array.isArray(mapping.details) || !mapping.details.length) throw new Error('Mapping data has no details');
const sourceSha256 = sourceWorkbookPath
  ? crypto.createHash('sha256').update(fs.readFileSync(path.resolve(sourceWorkbookPath))).digest('hex')
  : '';
const payload = {
  requestId: 'los-angeles-rfid-catalog-2026-11-08-v1',
  source: '洛杉矶299个RFID标签与美国SKU对应预览表（133个旧未匹配项已逐一确认）',
  sourceSha256,
  branchId: 'los-angeles',
  items: mapping.details.map(row => ({
    epc: String(row.epc || '').trim().toUpperCase(),
    sku: String(row.sku || '').trim(),
    branchId: 'los-angeles',
    labelName: String(row.assetName || '').trim()
  }))
};
const epcs = new Set(payload.items.map(row => row.epc));
if (payload.items.length !== 299 || epcs.size !== 299) throw new Error('Expected 299 unique Los Angeles EPC rows');
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${payload.items.length} RFID mappings to ${path.resolve(outputPath)}`);
