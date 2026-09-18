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

const context = {};
vm.runInNewContext(`${sourceFunction('customerReplyContainsChinese')}\n${sourceFunction('customerFacingBranchName')}\nthis.customerFacingBranchName = customerFacingBranchName;`, context);

assert.equal(context.customerFacingBranchName({ id: 'los-angeles', name: '洛杉矶分店', city: 'Los Angeles' }), 'Los Angeles Shop');
assert.equal(context.customerFacingBranchName({ id: 'las-vegas', name: '拉斯维加斯分店', city: 'Las Vegas' }), 'Las Vegas Shop');
assert.equal(context.customerFacingBranchName({ id: 'other', name: 'Phoenix Shop', city: 'Phoenix' }), 'Phoenix Shop');
assert.equal(context.customerFacingBranchName({ id: 'other', name: '凤凰城分店', city: 'Phoenix' }), 'Phoenix Shop');
assert.equal(context.customerFacingBranchName({ id: 'other', name: '其他分店', city: '' }), 'QUAD Film Shop');
assert.match(sourceFunction('insertProspectAddress'), /customerFacingBranchName\(branch\)/, 'Customer address replies must use an English-facing branch name');
assert.doesNotMatch(sourceFunction('insertProspectAddress'), /branch\.name\s*\?/, 'Customer address replies must not send the internal branch name directly');

console.log('Customer address reply language tests passed.');
