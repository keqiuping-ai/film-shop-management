const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

const start = server.indexOf('async function createFieldSalesAnalysis');
const end = server.indexOf('function fieldSalesScreenshotDataUrl', start);
assert.ok(start > 0 && end > start, 'field-sales AI functions must exist');
const fieldSalesAi = server.slice(start, end);

assert.match(fieldSalesAi, /createFieldSalesAnalysis\(db, visit/,
  'visit analysis must receive the database so it can reuse the saved key');
assert.match(fieldSalesAi, /createFieldSalesDailyAnalysis\(db, report/,
  'daily analysis must receive the database so it can reuse the saved key');
assert.ok((fieldSalesAi.match(/openAiCustomerReplyKey\(db\)/g) || []).length >= 2,
  'visit and daily analysis must both use the existing encrypted OpenAI key');
assert.doesNotMatch(fieldSalesAi, /Bearer \$\{process\.env\.OPENAI_API_KEY\}/,
  'field-sales AI must not bypass the existing encrypted key');
assert.match(server, /aiStatus: \(openAiCustomerReplyKey\(db\) \|\| process\.env\.DEEPSEEK_API_KEY\)/,
  'completed visits must queue AI when the saved system key is configured');
assert.match(server, /report\.aiStatus = \(openAiCustomerReplyKey\(db\) \|\| process\.env\.DEEPSEEK_API_KEY\)/,
  'daily reports must queue AI when the saved system key is configured');

console.log('Field-sales existing AI key regression tests passed.');
