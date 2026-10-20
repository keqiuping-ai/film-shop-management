const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appPath = path.join(__dirname, '..', 'public', 'app.js');
const cssPath = path.join(__dirname, '..', 'public', 'styles.css');
const app = fs.readFileSync(appPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

test('customer chat images open in the in-app preview instead of a new tab', () => {
  const attachmentFunction = app.match(/function prospectAttachmentHtml\(attachment\) \{[\s\S]*?\n\}/)?.[0] || '';
  const imageBranch = attachmentFunction.match(/if \(attachment\.kind === 'image'[\s\S]*?\n  \}/)?.[0] || '';

  assert.match(imageBranch, /openProspectImagePreview\(this\)/);
  assert.match(imageBranch, /prospect-chat-image-button/);
  assert.doesNotMatch(imageBranch, /target="_blank"/);
});

test('image preview provides close, Escape, and browser-back exits', () => {
  assert.match(app, /✕ 关闭图片/);
  assert.match(app, /event\.key === 'Escape'/);
  assert.match(app, /history\.pushState\([^\n]*quadImagePreview: true/);
  assert.match(app, /window\.addEventListener\('popstate'/);
  assert.match(app, /document\.body\.classList\.remove\('image-preview-active'\)/);
  assert.match(css, /\.image-preview-open \.zoom-dialog > header \.btn/);
});
