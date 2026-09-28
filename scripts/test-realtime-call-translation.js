const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'realtime-calls.js'), 'utf8');

function createClient(userId, language = 'zh') {
  const elements = new Map();
  const storage = new Map();
  const pcs = [];

  class Element {
    constructor(id = '') {
      this.id = id; this.textContent = ''; this.dataset = {}; this.hidden = false; this.muted = false;
      this.srcObject = null; this.isConnected = true; this.style = {}; this.children = [];
      this.classList = { add() {}, remove() {}, toggle() {} };
    }
    appendChild(child) { this.children.push(child); child.isConnected = true; return child; }
    remove() { this.isConnected = false; }
    play() { return Promise.resolve(); }
    pause() {}
  }
  const remoteAudio = new Element('remote-audio');

  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id);
  };

  class FakeTrack {
    constructor(id) { this.id = id; this.kind = 'audio'; this.readyState = 'live'; }
    clone() { return new FakeTrack(`${this.id}-clone`); }
    stop() { this.readyState = 'ended'; }
    attach() { const audio = new Element(); audio.dataset.participantIdentity = ''; return audio; }
    detach() { return []; }
  }

  class FakeMediaStream {
    constructor(tracks = []) { this.tracks = tracks; }
    getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio'); }
    getTracks() { return this.tracks; }
  }

  class FakeAudioContext {
    constructor() { this.state = 'running'; this.destination = {}; this.closed = false; }
    createMediaStreamSource(stream) { return { stream, connect() {}, disconnect() {} }; }
    createMediaStreamDestination() { return { stream:new FakeMediaStream([new FakeTrack(`bridge-${userId}-${Math.random()}`)]), disconnect() {} }; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.closed = true; return Promise.resolve(); }
  }

  class FakeDataChannel {
    constructor() { this.readyState = 'connecting'; this.sent = []; }
    send(value) { this.sent.push(value); }
    close() { this.readyState = 'closed'; this.onclose?.(); }
    emit(type, delta = '') { this.onmessage?.({ data:JSON.stringify({ type, delta }) }); }
  }

  class FakePeerConnection {
    constructor() { this.connectionState = 'new'; this.channel = null; this.closed = false; pcs.push(this); }
    addTrack(track, stream) { this.addedTrack = track; this.addedStream = stream; }
    createDataChannel() { this.channel = new FakeDataChannel(); return this.channel; }
    createOffer() { return Promise.resolve({ type:'offer', sdp:'fake-offer' }); }
    setLocalDescription(value) { this.localDescription = value; return Promise.resolve(); }
    setRemoteDescription(value) {
      this.remoteDescription = value; this.connectionState = 'connected';
      this.channel.readyState = 'open'; this.channel.onopen?.();
      this.ontrack?.({ streams:[new FakeMediaStream([new FakeTrack(`translated-${userId}`)])] });
      return Promise.resolve();
    }
    close() { this.closed = true; this.connectionState = 'closed'; }
  }

  const document = {
    documentElement:{ lang:language }, body:new Element('body'),
    getElementById:id => element(id),
    querySelector:() => element('active-call'),
    querySelectorAll:selector => selector.includes('language-option') ? [] : selector.includes('audio[data-participant-identity]') ? [remoteAudio] : [],
    addEventListener() {}
  };
  const state = { users:[], messageUsers:[], voiceCalls:[] };
  const window = {
    __QUAD_CALL_TEST_MODE__:true,
    AudioContext:FakeAudioContext,
    getQuadCallContext:() => ({ user:{ id:userId, name:userId }, state }),
    setQuadCallState() {},
    api:async url => url === '/api/realtime-translation/session' ? { value:`secret-${userId}` } : { calls:[] },
    addEventListener() {}, focus() {}
  };
  const context = {
    window, document, localStorage:{ getItem:key => storage.get(key) || null, setItem:(key, value) => storage.set(key, String(value)) },
    navigator:{ serviceWorker:{ addEventListener() {} } }, MutationObserver:class { observe() {} },
    MediaStream:FakeMediaStream, Audio:class extends Element {}, RTCPeerConnection:FakePeerConnection,
    CSS:{ escape:value => String(value) }, Notification:class {}, performance, AbortController,
    fetch:async () => ({ ok:true, text:async () => 'fake-answer' }),
    setTimeout, clearTimeout, setInterval:() => 0, clearInterval() {}, alert() {}
  };
  vm.runInNewContext(source, context, { filename:'realtime-calls.js' });
  return {
    calls:window.QuadCalls, pcs, elements, remoteAudio,
    setRemoteTrack(identity) {
      const track = new FakeTrack(`remote-${identity}`);
      remoteAudio.dataset.participantIdentity = identity;
      const publication = { track:{ mediaStreamTrack:track } };
      const participant = { identity, audioTrackPublications:new Map([['audio', publication]]) };
      window.QuadCalls.__test.setRoom({ remoteParticipants:new Map([[identity, participant]]) });
      return track;
    }
  };
}

async function runTranslationRound(client, targetLanguage, input, output) {
  await client.calls.setTranslationMode('translate');
  await client.calls.setTranslationLanguage(targetLanguage);
  const pc = client.pcs.at(-1);
  assert(pc, 'A translation peer connection must be created');
  assert.match(pc.addedTrack.id, /^remote-.*-clone$/, 'The proven first-version path must clone the remote track exactly once');
  assert.equal(client.remoteAudio.muted, true, 'Translation mode must switch directly from original audio to translated audio');
  pc.channel.emit('session.input_transcript.delta', input);
  pc.channel.emit('session.output_transcript.delta', output);
  assert.equal(client.elements.get('quadCallSourceTranscript').textContent, input);
  assert.equal(client.elements.get('quadCallTranslatedTranscript').textContent, output);
  assert.match(client.elements.get('quadCallTranslationStatus').textContent, /实时翻译已开启|live translation/i);
}

test('two independent accounts can translate in opposite directions for repeated rounds', async () => {
  const owner = createClient('owner');
  const employee = createClient('employee', 'en');
  owner.setRemoteTrack('employee');
  employee.setRemoteTrack('owner');

  await Promise.all([
    runTranslationRound(owner, 'zh', 'How are you?', '你好吗？'),
    runTranslationRound(employee, 'en', '今天可以施工。', 'We can do the installation today.')
  ]);
  assert.equal(owner.calls.__test.translationState().sidecars.length, 1);
  assert.equal(employee.calls.__test.translationState().sidecars.length, 1);

  await Promise.all([owner.calls.setTranslationMode('direct'), employee.calls.setTranslationMode('direct')]);
  assert.equal(owner.calls.__test.translationState().sidecars.length, 0);
  assert.equal(employee.calls.__test.translationState().sidecars.length, 0);
  await new Promise(resolve => setTimeout(resolve, 320));
  assert(owner.pcs.every(pc => pc.closed), 'Owner translation peer connections must be released after direct mode');
  assert(employee.pcs.every(pc => pc.closed), 'Employee translation peer connections must be released after direct mode');

  await Promise.all([
    runTranslationRound(owner, 'zh', 'Good morning.', '早上好。'),
    runTranslationRound(employee, 'en', '谢谢。', 'Thank you.')
  ]);
  assert.equal(owner.calls.__test.translationState().sidecars.length, 1);
  assert.equal(employee.calls.__test.translationState().sidecars.length, 1);
  assert.equal(owner.pcs.length, 2, 'Owner must establish a fresh second translation session');
  assert.equal(employee.pcs.length, 2, 'Employee must establish a fresh second translation session');

  await Promise.all([owner.calls.setTranslationMode('direct'), employee.calls.setTranslationMode('direct')]);
});

test('a stopped translation session cannot overwrite the direct-call state with a stale callback', async () => {
  const client = createClient('owner');
  client.setRemoteTrack('employee');

  await runTranslationRound(client, 'en', 'Hello.', '你好。');
  const stalePc = client.pcs.at(-1);
  await client.calls.setTranslationMode('direct');
  const status = client.elements.get('quadCallTranslationStatus');
  assert.match(status.textContent, /直接通话|direct call/i);

  stalePc.channel.readyState = 'open';
  stalePc.channel.onopen?.();
  stalePc.ontrack?.({ streams:[] });

  assert.match(status.textContent, /直接通话|direct call/i, 'A stale OpenAI callback must not show translation as ready');
  assert.equal(client.calls.__test.translationState().sidecars.length, 0);
});

test('an unexpected translation channel close restores direct audio and reports the disconnect', async () => {
  const client = createClient('owner');
  client.setRemoteTrack('employee');

  await runTranslationRound(client, 'en', 'Hello.', '你好。');
  const pc = client.pcs.at(-1);
  pc.channel.close();

  assert.equal(client.remoteAudio.muted, false);
  assert.equal(client.calls.__test.translationState().sidecars.length, 0);
  assert.match(client.elements.get('quadCallTranslationStatus').textContent, /已断开|disconnected/i);
});
