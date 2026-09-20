'use strict';

// The actual browser closure runs against synthetic DOM/API and a virtual clock.
// No credentials, server, candidate records, SMS, AI, browser or network are used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const frontendPath = path.join(__dirname, '..', 'public', 'recruiting.js');
const source = fs.readFileSync(frontendPath, 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'recruiting.css'), 'utf8');
const marker = '  window.Recruiting = Object.freeze(';
assert.equal(source.split(marker).length, 2);
const hooks = `
  window.__translationTest = {
    init() { checkIdentity(); data = { translation:{ configured:true } }; },
    configure(value) { data.translation.configured = value; },
    bilingualBlock, translateReading, changeReadingLanguage, readingChunks, readingSnapshot,
    requestTranslation, checkIdentity, translationKey,
    cache:() => [...translationCache.entries()], pending:() => translationPending.size
  };
`;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const node = fields => ({ textContent:'', hidden:false, disabled:false, dataset:{}, ...fields });
async function flush() { for (let index = 0; index < 24; index++) await Promise.resolve(); }
function harness(language = 'zh') {
  let now = 100000, edit = true, view = true, modalOpen = true;
  const calls = [], timers = [], blocks = [];
  let reply = async body => ({ text:body.targetLanguage === 'zh' ? '合成译文' : 'Synthetic translation', targetLanguage:body.targetLanguage });
  class Clock extends Date { static now() { return now; } }
  const sandbox = {
    window:{}, lang:language, user:{ id:'test-owner' }, token:'test-only-token', current:'', state:null,
    Date:Clock, Intl, URL, escapeHtml,
    hasPerm:permission => permission === 'recruitingEdit' ? edit : view,
    api:async (url, options) => {
      assert.equal(url, '/api/recruiting/translate', 'Only a mocked translation route is allowed');
      assert.equal(options.method, 'POST');
      const body = JSON.parse(options.body), call = { body, at:now, user:sandbox.user.id };
      calls.push(call); return reply(body, calls.length, call);
    },
    fetch:() => { throw new Error('No network allowed'); }, render() {},
    closeModal() { modalOpen = false; blocks.forEach(block => { block.isConnected = false; }); },
    requestAnimationFrame() {}, setInterval() {},
    setTimeout(callback, delay) { const timer = { callback, due:now + delay }; timers.push(timer); return timer; },
    MutationObserver:class { observe() {} },
    document:{ hidden:false, addEventListener() {}, querySelector:() => null,
      getElementById:id => id === 'modal' ? { classList:{ contains:() => modalOpen } } : null }
  };
  vm.runInNewContext(source.replace(marker, hooks + marker), sandbox, { filename:frontendPath });
  const ui = sandbox.window.__translationTest; ui.init();
  return {
    ui, calls, sandbox, timers,
    reply:callback => { reply = callback; }, edit:value => { edit = value; }, view:value => { view = value; },
    advance() { timers.sort((a, b) => a.due - b.due); const timer = timers.shift(); assert.ok(timer, 'A virtual delay is pending'); now = timer.due; timer.callback(); },
    async finish(promise) {
      let finished = false, failure;
      promise.then(() => { finished = true; }, error => { failure = error; finished = true; });
      for (let count = 0; count < 100 && !finished; count++) { await flush(); if (!finished && timers.length) this.advance(); }
      assert.equal(finished, true, 'Synthetic work must complete without real sleeps');
      if (failure) throw failure;
    },
    block(text, id = 'synthetic-candidate', targetLanguage = 'zh') {
      modalOpen = true;
      const elements = {
        '.rec-original-text':node({ textContent:text }), '.rec-translated-text':node({ hidden:true }),
        '.rec-translation-pane':node({ hidden:true }), '.rec-bilingual-grid':node({ dataset:{ recHasTranslation:'false' } }),
        '.rec-translation-status':node(), '.rec-translation-title':node()
      };
      const block = { dataset:{ recId:id, recLanguage:targetLanguage }, isConnected:true, querySelector:selector => elements[selector] || null };
      const button = node({ closest:() => block }), select = { value:targetLanguage, closest:() => block };
      elements['[data-rec-action="translate-reading"]'] = button;
      blocks.push(block);
      return { block, button, select, elements, output:elements['.rec-translated-text'], note:elements['.rec-translation-status'], pane:elements['.rec-translation-pane'], grid:elements['.rec-bilingual-grid'] };
    }
  };
}
const longOriginal = ['Alpha', 'Bravo', 'Charlie'].map(name => `${name} ${'x'.repeat(1800)}`).join('\n\n');

test('initial bilingual sections contain no empty translation message or visible result box', () => {
  for (const language of ['zh', 'en']) {
    const env = harness(language), html = env.ui.bilingualBlock('test', 'Synthetic resume', 'An original resume.');
    assert.doesNotMatch(html, /尚未翻译|Not translated yet|点击下方按钮|This language has not/);
    assert.match(html, /rec-translation-toolbar/);
    assert.match(html, /data-rec-has-translation="false"/);
    assert.match(html, /class="rec-translation-pane" hidden/);
    assert.match(html, /class="rec-readable-text rec-translated-text"[^>]* hidden><\/div>/);
    assert.equal(env.calls.length, 0, 'Opening a profile does not invoke AI');
  }
  assert.doesNotMatch(css, /\.rec-resume-pair \.rec-readable-text\s*\{[^}]*min-height/);
  assert.match(css, /\.rec-translation-pane\[hidden\][^{]*\{\s*display:none!important/);
});

test('chunks preserve every source character and stay within 2400 without splitting surrogate pairs', () => {
  const env = harness();
  for (const text of [longOriginal, `${'a'.repeat(2399)}😀${'b'.repeat(2500)}`, '\n'.repeat(10000), 'x'.repeat(60000), `  Start\n\n${'word '.repeat(800)}\n\tEnd  `]) {
    const chunks = [...env.ui.readingChunks(text)];
    assert.equal(chunks.join(''), text);
    assert.ok(chunks.every(chunk => chunk.length > 0 && chunk.length <= 2400));
    assert.ok(chunks.every(chunk => !/[\uD800-\uDBFF]$/.test(chunk)));
  }
});

test('long documents expose completed parts immediately and pace starts at least 5100ms apart', async () => {
  const env = harness(), view = env.block(longOriginal);
  env.reply(async (body, index) => ({ text:`合成段落 ${index}`, targetLanguage:body.targetLanguage }));
  const run = env.ui.translateReading(view.button); await flush();
  assert.equal(env.calls.length, 1);
  assert.equal(view.output.textContent, '合成段落 1');
  assert.equal(view.pane.hidden, false); assert.equal(view.grid.dataset.recHasTranslation, 'true');
  assert.match(view.note.textContent, /部分译文/); assert.equal(view.button.disabled, true);
  await env.finish(run);
  assert.equal(env.calls.length, 3);
  assert.equal(env.calls.map(call => call.body.text).join(''), longOriginal);
  for (let index = 1; index < env.calls.length; index++) assert.ok(env.calls[index].at - env.calls[index - 1].at >= 5100);
  assert.equal(view.output.textContent, '合成段落 1\n\n合成段落 2\n\n合成段落 3');
  assert.match(view.note.textContent, /已完成/); assert.equal(view.button.disabled, false);
  await env.ui.translateReading(view.button);
  assert.equal(env.calls.length, 3, 'Showing a completed document is free and cached');
});

test('failed later part keeps completed text and retry requests only missing chunks', async () => {
  const env = harness(), view = env.block(longOriginal);
  env.reply(async (body, index) => { if (index === 2) throw new Error('Synthetic timeout'); return { text:`译文 ${body.text.slice(0, 5)}`, targetLanguage:body.targetLanguage }; });
  await env.finish(env.ui.translateReading(view.button));
  assert.match(view.output.textContent, /Alpha/); assert.doesNotMatch(view.output.textContent, /Bravo/);
  assert.match(view.note.textContent, /Synthetic timeout.*已保留 1\/3 段/);
  assert.equal(view.button.textContent, '继续翻译');
  const saved = env.ui.bilingualBlock('synthetic-candidate', 'Original', longOriginal);
  assert.match(saved, /部分译文.*1\/3/); assert.match(saved, /译文 Alpha/);
  await env.finish(env.ui.translateReading(view.button));
  assert.equal(env.calls.length, 4);
  assert.equal(env.calls.filter(call => call.body.text.startsWith('Alpha')).length, 1);
  assert.match(view.output.textContent, /Alpha[\s\S]*Bravo[\s\S]*Charl/);
});

test('a first-part failure shows only concise retry status and no empty result box', async () => {
  const env = harness(), view = env.block('Synthetic original');
  env.reply(async () => { throw new Error('Synthetic unavailable'); });
  await env.ui.translateReading(view.button);
  assert.equal(view.output.textContent, ''); assert.equal(view.output.hidden, true); assert.equal(view.pane.hidden, true);
  assert.match(view.note.textContent, /可点击重试/); assert.equal(view.button.textContent, '重试翻译');
});

test('closing a profile stops remaining chunks while reopening resumes its successful cache', async () => {
  const env = harness(), old = env.block(longOriginal);
  const run = env.ui.translateReading(old.button); await flush(); old.block.isConnected = false;
  await env.finish(run); assert.equal(env.calls.length, 1);
  const next = env.block(longOriginal);
  await env.finish(env.ui.translateReading(next.button));
  assert.equal(env.calls.length, 3); assert.match(next.note.textContent, /已完成/);
});

test('reopened profiles subscribe to the same pending source without stale owner cancellation', async () => {
  const env = harness(), pending = deferred(), old = env.block('Same synthetic source');
  env.reply(() => pending.promise);
  const first = env.ui.translateReading(old.button); await flush(); old.block.isConnected = false;
  const next = env.block('Same synthetic source'), second = env.ui.translateReading(next.button); await flush();
  assert.equal(env.calls.length, 1);
  pending.resolve({ text:'已完成译文', targetLanguage:'zh' });
  await Promise.all([first, second]);
  assert.equal(old.output.textContent, ''); assert.equal(next.output.textContent, '已完成译文');
});

test('queued cancelled subscribers cause no API call and different profiles never share displayed results', async () => {
  const env = harness(), pending = deferred(), one = env.block('Source A', 'candidate-a'), two = env.block('Source B', 'candidate-b');
  env.reply(() => pending.promise);
  const first = env.ui.translateReading(one.button), second = env.ui.translateReading(two.button); await flush();
  assert.equal(env.calls.length, 1); assert.match(two.note.textContent, /等待前一项/);
  two.block.isConnected = false;
  pending.resolve({ text:'仅甲资料', targetLanguage:'zh' }); await env.finish(Promise.all([first, second]));
  assert.equal(env.calls.length, 1); assert.equal(two.output.textContent, '');
});

test('switching target languages hides absent translations without calling AI or reviving stale rendering', async () => {
  const env = harness(), pending = deferred(), view = env.block('Mixed source 资料'); env.reply(() => pending.promise);
  const run = env.ui.translateReading(view.button); await flush();
  view.select.value = 'en'; env.ui.changeReadingLanguage(view.select);
  assert.equal(view.output.textContent, ''); assert.equal(view.output.hidden, true); assert.equal(view.note.textContent, '');
  pending.resolve({ text:'原中文结果', targetLanguage:'zh' }); await run;
  assert.equal(view.output.textContent, ''); assert.equal(env.calls.length, 1);
  view.select.value = 'zh'; env.ui.changeReadingLanguage(view.select);
  assert.equal(view.output.textContent, '原中文结果'); assert.equal(view.output.hidden, false);
  assert.equal(env.calls.length, 1, 'Switching languages reads cache only');
});

test('language away-and-back cannot let an obsolete request resume the rest of a document', async () => {
  const env = harness(), pending = deferred(), view = env.block(longOriginal); env.reply(() => pending.promise);
  const run = env.ui.translateReading(view.button); await flush();
  view.select.value = 'en'; env.ui.changeReadingLanguage(view.select);
  view.select.value = 'zh'; env.ui.changeReadingLanguage(view.select);
  pending.resolve({ text:'过期段落', targetLanguage:'zh' }); await run;
  assert.equal(view.output.textContent, ''); assert.equal(env.calls.length, 1);
});

test('identity changes clear private cache and old queues without delaying a new signed-in account', async () => {
  const env = harness(), pending = deferred(), old = env.block('Private original');
  env.reply((body, index) => index === 1 ? pending.promise : Promise.resolve({ text:'新账号译文', targetLanguage:'zh' }));
  const previous = env.ui.translateReading(old.button); await flush();
  env.sandbox.user = { id:'other-owner' }; env.sandbox.token = 'other-test-token'; env.ui.init();
  const next = env.block('Private original'); await env.ui.translateReading(next.button);
  assert.equal(env.calls.length, 2, 'New identity does not wait for another account’s old request');
  assert.equal(next.output.textContent, '新账号译文');
  pending.resolve({ text:'旧账号私有译文', targetLanguage:'zh' }); await previous;
  assert.equal(old.output.textContent, ''); assert.ok(env.ui.cache().every(([, translated]) => !translated.includes('旧账号')));
});

test('cache is isolated by candidate, exact source and target language', async () => {
  const env = harness();
  for (const [id, text, language] of [['a','Source','zh'], ['b','Source','zh'], ['a','Changed source','zh'], ['a','Source','en']]) {
    const view = env.block(text, id, language); await env.finish(env.ui.translateReading(view.button));
  }
  assert.equal(env.calls.length, 4);
  assert.equal(env.ui.readingSnapshot('a', 'Source', 'zh').complete, true);
  assert.equal(env.ui.readingSnapshot('other', 'Source', 'zh').text, '');
});

test('view/edit/configuration loss rejects new provider calls and excessive source is not split to bypass limits', async () => {
  for (const setup of [env => env.edit(false), env => env.view(false), env => env.ui.configure(false)]) {
    const env = harness(), view = env.block('Source'); setup(env); await env.ui.translateReading(view.button);
    assert.equal(env.calls.length, 0); assert.equal(view.output.textContent, '');
  }
  const env = harness(), view = env.block('x'.repeat(60001)); await env.ui.translateReading(view.button);
  assert.equal(env.calls.length, 0); assert.match(view.note.textContent, /60000/);
});

test('invalid or non-English provider results are never displayed or cached', async () => {
  for (const response of [{ text:'中文', targetLanguage:'en' }, { text:'', targetLanguage:'en' }, { text:'Wrong target', targetLanguage:'zh' }]) {
    const env = harness(), view = env.block('原始资料', 'test', 'en'); env.reply(async () => response);
    await env.ui.translateReading(view.button);
    assert.equal(view.output.textContent, ''); assert.equal(env.ui.cache().length, 0); assert.equal(view.pane.hidden, true);
  }
});

test('translated markup stays text-only while original data is never changed', async () => {
  const env = harness(), original = '<script>synthetic</script> Contact 555-0101', view = env.block(original);
  env.reply(async () => ({ text:'<img src=x onerror=alert(1)>合成译文', targetLanguage:'zh' }));
  await env.ui.translateReading(view.button);
  assert.equal(view.output.textContent, '<img src=x onerror=alert(1)>合成译文');
  assert.equal(view.elements['.rec-original-text'].textContent, original);
  assert.match(env.ui.bilingualBlock('synthetic-candidate', 'Title', original), /&lt;img src=x/);
  assert.ok(env.calls.every(call => Object.keys(call.body).sort().join(',') === 'targetLanguage,text'));
});
