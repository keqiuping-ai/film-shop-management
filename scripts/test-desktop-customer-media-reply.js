const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');

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
assert.match(source, /let customerReplyAiBusy = false;/, 'Desktop must guard against concurrent customer AI requests');
assert.match(source, /\/api\/customer-ai\/translate-reply[\s\S]{0,220}timeoutMs: 80_000/, 'Translation must have a browser timeout');
assert.match(source, /\/api\/customer-ai\/reply-draft[\s\S]{0,220}timeoutMs: 150_000/, 'Draft generation must have a browser timeout');
assert.match(source, /async function generateCustomerAiReplyDraft\([\s\S]*?finally \{\s*setCustomerReplyAiBusy\(false\);/, 'Draft button state must always reset');
assert.match(styles, /\.prospect-composer-options \{[^}]*flex:0 1 auto;[^}]*max-height:132px;/, 'Composer tools must stay compact instead of consuming blank vertical space');
assert.match(styles, /\.prospect-workspace-composer \.prospect-compose-row \{[^}]*flex:1 1 140px;[^}]*min-height:120px;/, 'The customer reply editor must receive the remaining composer height');
assert.match(styles, /\.prospect-workspace-composer \.prospect-compose-row textarea \{[^}]*height:100%;[^}]*max-height:none;/, 'The reply textarea must expand with its row');

console.log('Desktop customer photo reply regression tests passed.');
