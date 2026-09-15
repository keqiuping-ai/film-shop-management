const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

function sourceFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} must exist`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}`);
}

const chooseProspectReplyChannel = vm.runInNewContext(`(${sourceFunction('chooseProspectReplyChannel')})`);

assert.equal(chooseProspectReplyChannel('sms', 'meta', false, true, true), 'sms', 'Selecting a library image must not move an explicit SMS reply back to Meta');
assert.equal(chooseProspectReplyChannel('meta', 'meta', false, true, true), 'meta', 'Meta remains the default when no SMS override was chosen');
assert.equal(chooseProspectReplyChannel('sms', 'meta', false, false, true), 'meta', 'SMS cannot remain selected without a valid phone number');
assert.match(sourceFunction('useReplyTemplate'), /rememberProspectReplyChannel\(selectedChannel\)[\s\S]*renderProspectWorkspace\(\)/, 'Library selection must save the active channel before re-rendering');
assert.match(source, /已选择，尚未发送/, 'The composer must clearly distinguish selection from delivery');

console.log('Desktop customer photo reply regression tests passed.');
