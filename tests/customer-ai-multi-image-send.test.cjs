const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync('public/app.js', 'utf8');

function selectionFixture() {
  const item = {
    agentReplyDraft: {
      createdAt: '2026-10-17T12:00:00.000Z',
      attachments: [
        { id: 'one', title: 'Blue', attachment: { url: 'https://example.test/one.jpg', type: 'image/jpeg' } },
        { id: 'two', title: 'Red', attachment: { url: 'https://example.test/two.jpg', type: 'image/jpeg' } }
      ]
    }
  };
  let renders = 0;
  const context = vm.createContext({
    Map,
    Set,
    activeProspectWorkspaceId: 'customerConversations:customer-1',
    customerAiMediaSelections: new Map(),
    activeCustomerWorkspaceItem: () => ({ item }),
    renderProspectWorkspace: () => { renders += 1; },
    alert: message => { throw new Error(message); },
    lang: 'zh'
  });
  const start = app.indexOf('function customerAiMediaSelectionKey(');
  const end = app.indexOf('function customerAiCustomerFacingText(', start);
  vm.runInContext(app.slice(start, end), context);
  return { context, item, renders: () => renders };
}

test('AI suggested images are all selected by default and can be independently toggled', () => {
  const fixture = selectionFixture();
  assert.deepEqual(
    Array.from(fixture.context.customerAiSelectedMedia(fixture.item), row => row.id),
    ['one', 'two']
  );
  fixture.context.toggleCustomerAiSuggestedAttachment(1);
  assert.deepEqual(
    Array.from(fixture.context.customerAiSelectedMedia(fixture.item), row => row.id),
    ['one']
  );
  assert.equal(fixture.renders(), 1);
});

test('customer reply send uses a batch request id and attachments array', () => {
  const sendStart = app.indexOf('async function sendProspectMessageCore()');
  const sendEnd = app.indexOf('async function sendProspectSms()', sendStart);
  const source = app.slice(sendStart, sendEnd);
  assert.match(source, /clientRequestId/);
  assert.match(source, /attachments:\s*channel === 'sms'/);
  assert.match(source, /selectedAiMedia\.map/);
  assert.match(source, /failedIndexes/);
});
