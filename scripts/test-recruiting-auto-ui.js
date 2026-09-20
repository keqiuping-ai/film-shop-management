'use strict';

// Real automatic-capture module, synthetic VM DOM/media/HTTP adapters only.
// There is no browser, network, microphone permission, provider or real person.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/recruiting-interview-auto.js'), 'utf8');
const NOTICE = '2026-09-20-auto-v1';
const clone = value => JSON.parse(JSON.stringify(value));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function flushMicrotasks() { for (let i = 0; i < 60; i++) await Promise.resolve(); }

function harness(options = {}) {
  const nodes = new Map(), calls = [], events = [], recorders = [], timers = new Map();
  let now = Date.parse('2026-09-20T18:00:00Z'), sequence = 0, timerSequence = 0, segmentCount = 0, statusCount = 0;
  const $ = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden:false, disabled:false, textContent:'', value:'', dataset:{}, listeners:{}, classList:{ toggle() {} }, addEventListener(name, callback) { this.listeners[name] = callback; }, setAttribute() {} });
    return nodes.get(id);
  };
  const originalTrack = { id:'synthetic-local-microphone', kind:'audio', readyState:'live', enabled:true,
    clone() { events.push('local-mic-cloned'); return { kind:'audio', readyState:'live', enabled:true, stop() { events.push('clone-stopped'); } }; },
    stop() { events.push('FORBIDDEN-ORIGINAL-STOP'); } };
  const publication = { source:'microphone', isMuted:false, track:{ kind:'audio', isMuted:false, mediaStreamTrack:originalTrack } };
  const candidate = { identity:'candidate-auto-ui-invite', metadata:JSON.stringify({ role:'candidate' }), getTrackPublication() { events.push('FORBIDDEN-REMOTE-MIC-LOOKUP'); throw new Error('Do not record another participant'); } };
  const remoteInterviewer = { identity:'recruiter-other-interviewer', metadata:JSON.stringify({ role:'interviewer' }), getTrackPublication() { events.push('FORBIDDEN-REMOTE-MIC-LOOKUP'); throw new Error('Do not record another participant'); } };
  const room = { localParticipant:{ identity:options.candidate ? candidate.identity : 'recruiter-auto-ui-session',
    getTrackPublication(source) { if (source !== 'microphone') { events.push('FORBIDDEN-NONMIC-LOOKUP'); return null; } return publication; },
    trackPublications:new Map([['microphone', publication], ['ai-track', { source:'unknown', track:{ mediaStreamTrack:{ kind:'audio', clone() { events.push('FORBIDDEN-AI-CLONE'); throw new Error('AI track is not local microphone'); } } } }]]),
    async publishData(bytes) { events.push(`room-data:${new TextDecoder().decode(bytes)}`); }
  }, remoteParticipants:new Map(options.candidate ? [[remoteInterviewer.identity, remoteInterviewer]] : [[candidate.identity, candidate]]) };
  const context = { recruiter:!options.candidate, connected:true, room,
    info:{ interviewId:'auto-ui-interview', canWriteTranscript:true }, sessionSecret:'synthetic-auto-ui-secret', participantSessionId:'synthetic-auto-ui-session', language:'en' };
  const state = { noticeVersion:NOTICE, ownConsent:options.consent !== false, ownPaused:false, allowed:options.consent !== false, epoch:1,
    configured:true, identity:room.localParticipant.identity, speaker:options.candidate ? 'candidate' : 'interviewer', candidateIdentity:candidate.identity,
    participants:[], flushRequestId:'', flushComplete:true, pendingSegments:0, flushPendingIdentities:[] };
  state.participants = [{ identity:state.identity, speaker:state.speaker, consent:state.ownConsent, paused:false }, { identity:options.candidate ? remoteInterviewer.identity : candidate.identity, speaker:options.candidate ? 'interviewer' : 'candidate', consent:true, paused:false }];
  const rows = [];
  class FakeDate extends Date { constructor(value) { super(value === undefined ? now : value); } static now() { return now; } }
  class MediaStream { constructor(tracks) { this.tracks = tracks; } getTracks() { return this.tracks; } getAudioTracks() { return this.tracks; } }
  class AudioContext {
    constructor() { this.state = 'running'; this.destination = {}; events.push('audio-context'); }
    async resume() { this.state = 'running'; events.push('audio-resume'); }
    createMediaStreamSource(stream) { events.push('meter-local-stream'); return { stream, connect() {}, disconnect() {} }; }
    createAnalyser() { return { fftSize:1024, frequencyBinCount:512, connect() {}, disconnect() {},
      getFloatTimeDomainData(values) { for (let i = 0; i < values.length; i++) values[i] = options.silent ? 0 : Math.sin(i / 4) * .08; },
      getByteTimeDomainData(values) { for (let i = 0; i < values.length; i++) values[i] = options.silent ? 128 : 128 + Math.round(Math.sin(i / 4) * 20); } }; }
    createGain() { return { gain:{ value:0 }, connect() {}, disconnect() {} }; }
    async close() { this.state = 'closed'; events.push('audio-close'); }
  }
  class MediaRecorder {
    static isTypeSupported(type) { return type === 'audio/webm;codecs=opus'; }
    constructor(stream, settings = {}) { if (options.recorderConstructorError) throw new Error('Synthetic recorder constructor failure'); this.stream = stream; this.mimeType = settings.mimeType || 'audio/webm'; this.state = 'inactive'; recorders.push(this); }
    start() { if (options.recorderStartError) throw new Error('Synthetic recorder start failure'); this.state = 'recording'; events.push('recorder-start'); }
    stop() { if (this.state === 'inactive') return; this.state = 'inactive'; events.push('recorder-stop'); this.ondataavailable?.({ data:new Blob(['SYNTHETIC_LOCAL_SEGMENT'.repeat(100)], { type:this.mimeType }) }); this.onstop?.(); }
    requestData() { this.ondataavailable?.({ data:new Blob(['SYNTHETIC_LOCAL_PARTIAL'.repeat(100)], { type:this.mimeType }) }); }
  }
  const request = async (url, requestOptions) => {
    const body = JSON.parse(requestOptions.body); calls.push({ url, body, signal:requestOptions.signal });
    if (!url.endsWith('/video-auto') && !url.endsWith('/recruiting-video/auto')) throw new Error(`Unexpected URL ${url}`);
    if (body.operation === 'status' && options.status) { const response = await options.status(body, ++statusCount); if (response) return response; }
    if (body.operation === 'consent') { state.ownConsent = body.consent; state.allowed = body.consent; state.ownPaused = false; state.epoch++; }
    if (body.operation === 'pause') { state.ownPaused = true; state.allowed = false; }
    if (body.operation === 'resume') { state.ownPaused = false; state.allowed = state.ownConsent; }
    if (body.operation === 'flush') { state.flushRequestId = `flush-${++sequence}`; state.flushPendingIdentities = [...body.participantIdentities]; state.flushComplete = false; state.allowed = false; }
    if (body.operation === 'flush-ack') { state.flushPendingIdentities = state.flushPendingIdentities.filter(identity => identity !== state.identity); state.flushComplete = state.flushPendingIdentities.length === 0; state.ownPaused = true; state.allowed = false; }
    if (body.operation === 'segment') {
      segmentCount++;
      if (options.segment) { const override = await options.segment(body, segmentCount, requestOptions); if (override) return override; }
      if (body.epoch !== state.epoch || !state.ownConsent) throw Object.assign(new Error('Consent or epoch changed'), { code:'INTERVIEW_AUTO_CONSENT_REQUIRED' });
      const row = { id:body.requestId, speaker:state.speaker, participantIdentity:state.identity, text:'Synthetic source answer 原话。', translationZh:'合成的中文对照。', source:'openai_auto_audio' };
      if (!rows.some(item => item.id === row.id)) rows.push(row);
      return { autoState:clone(state), aiState:{ transcript:clone(rows) }, requestStatus:'complete', row:clone(row) };
    }
    return { autoState:clone(state), aiState:{ transcript:clone(rows) } };
  };
  const setTimer = (callback, ms, interval) => { const id = ++timerSequence; timers.set(id, { callback, at:now + (ms || 0), ms:ms || 0, interval }); return id; };
  const LivekitClient = { Track:{ Source:{ Microphone:'microphone', Unknown:'unknown' }, Kind:{ Audio:'audio' } } };
  const sandbox = { window:{ AudioContext, MediaRecorder, MediaStream, LivekitClient }, LivekitClient, MediaRecorder, MediaStream,
    Date:FakeDate, Math, Promise, Uint8Array, Float32Array, Blob, AbortController, TextEncoder, TextDecoder,
    crypto:{ randomUUID:() => `synthetic-auto-request-${++sequence}` },
    atob:text => Buffer.from(text, 'base64').toString('binary'), btoa:text => Buffer.from(text, 'binary').toString('base64'),
    setTimeout:(callback, ms) => setTimer(callback, ms, false), clearTimeout:id => timers.delete(id),
    setInterval:(callback, ms) => setTimer(callback, ms, true), clearInterval:id => timers.delete(id) };
  vm.runInNewContext(source, sandbox, { filename:'recruiting-interview-auto.js' });
  const ui = sandbox.window.QuadInterviewAuto.create({ $, request, getContext:() => context, getSelectedQuestion:() => ({ kitId:'wholesale_quick_6', questionId:'pipeline', text:'Synthetic question' }), onState() {} });
  const env = { ui, $, calls, events, recorders, timers, context, state, room, candidate, publication, originalTrack, rows,
    async advance(ms) {
      const end = now + ms; let count = 0;
      while (true) {
        const item = Array.from(timers).filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!item) break; assert.ok(++count < 5000, 'Timers must remain bounded'); now = item[1].at;
        if (item[1].interval) item[1].at += Math.max(1, item[1].ms); else timers.delete(item[0]);
        item[1].callback(); await flushMicrotasks();
      }
      now = end; await flushMicrotasks();
    },
    async connect() { await ui.primeAudio(); await ui.connect(); await flushMicrotasks(); await this.advance(500); },
    segments() { return calls.filter(call => call.body.operation === 'segment'); }
  };
  return env;
}

test('a consenting candidate automatically captures their own microphone without a manual start or controller', async () => {
  const env = harness({ candidate:true }); await env.connect();
  assert.ok(env.recorders.length > 0); assert.ok(env.events.includes('local-mic-cloned'));
  await env.advance(16000); assert.ok(env.segments().length > 0);
  assert.ok(env.segments().every(call => call.url.endsWith('/recruiting-video/auto')));
  assert.equal(env.rows[0].speaker, 'candidate');
  assert.ok(!env.events.some(value => value.startsWith('FORBIDDEN-')));
  await env.ui.disconnect();
});

test('an explicitly consenting interviewer captures local speech with admin session attribution and no AI track', async () => {
  const env = harness(); await env.connect(); await env.advance(16000);
  assert.ok(env.segments().length > 0);
  assert.ok(env.segments().every(call => call.body.participantSessionId === 'synthetic-auto-ui-session' && call.url.endsWith('/video-auto')));
  assert.equal(env.rows[0].speaker, 'interviewer');
  assert.ok(!env.events.some(value => value.startsWith('FORBIDDEN-')));
  await env.ui.disconnect();
});

test('video-only choice, unconfigured service or missing microphone cannot start automatic recording', async () => {
  for (const change of [env => { env.state.ownConsent = false; env.state.allowed = false; }, env => { env.state.noticeVersion = '2026-09-19-voice-v1'; }, env => { env.state.configured = false; env.state.allowed = false; }, env => { env.publication.track = null; }]) {
    const env = harness(); change(env); await env.connect(); await env.advance(16000);
    assert.equal(env.recorders.length, 0); assert.equal(env.segments().length, 0); await env.ui.disconnect();
  }
});

test('silence does not generate provider work or fabricated transcript segments', async () => {
  const env = harness({ silent:true }); await env.connect(); await env.advance(31000);
  assert.equal(env.segments().length, 0); assert.equal(env.rows.length, 0); await env.ui.disconnect();
});

test('manual pause stops capture and resume is explicit rather than timer-driven', async () => {
  const env = harness(); await env.connect(); await env.ui.pause(); const count = env.recorders.length;
  await env.advance(31000); assert.equal(env.recorders.length, count);
  assert.equal(env.state.ownPaused, true); await env.ui.resume(); await env.advance(500);
  assert.ok(env.recorders.length > count); await env.ui.disconnect();
});

test('mute stops local capture and unmute can continue only while consent remains valid', async () => {
  const env = harness(); await env.connect(); env.publication.isMuted = true; env.ui.sync(); await flushMicrotasks();
  assert.ok(env.recorders.every(recorder => recorder.state === 'inactive'));
  const count = env.recorders.length; await env.advance(16000); assert.equal(env.recorders.length, count);
  env.publication.isMuted = false; env.ui.sync(); await env.advance(500); assert.ok(env.recorders.length > count);
  assert.ok(!env.events.includes('FORBIDDEN-ORIGINAL-STOP')); await env.ui.disconnect();
});

test('revocation discards current local capture and disconnect never automatically reconnects or captures', async () => {
  const env = harness({ candidate:true }); await env.connect(); await env.ui.setConsent(false);
  const count = env.recorders.length; await env.advance(16000); assert.equal(env.recorders.length, count);
  assert.equal(env.segments().length, 0); assert.ok(env.recorders.every(recorder => recorder.state === 'inactive'));
  await env.ui.disconnect(); env.context.connected = false; await env.advance(31000);
  assert.equal(env.recorders.length, count); assert.ok(!env.events.includes('FORBIDDEN-ORIGINAL-STOP'));
});

test('flush stops and saves a short final speech segment before reporting completion', async () => {
  const env = harness(); await env.connect(); await env.advance(1800);
  assert.equal(env.segments().length, 0); await env.ui.flush(); await flushMicrotasks();
  assert.equal(env.segments().length, 1); assert.ok(env.segments()[0].body.durationMs < 15000);
  assert.equal(env.rows.length, 1); await env.ui.disconnect();
});

test('leaving during a pending segment never submits new chunks after disconnect', async () => {
  const gate = deferred(); const env = harness({ segment:async () => gate.promise });
  await env.connect(); await env.advance(16000); assert.equal(env.segments().length, 1);
  await env.ui.disconnect({ discard:true }); env.context.connected = false;
  gate.resolve({ autoState:clone(env.state), requestStatus:'complete', row:{ id:'synthetic-late-row' }, aiState:{ transcript:[] } }); await flushMicrotasks();
  const count = env.segments().length; await env.advance(31000); assert.equal(env.segments().length, count);
  assert.ok(env.recorders.every(recorder => recorder.state === 'inactive'));
});

test('a pending segment pauses automatic capture and explicit retry checks the same idempotent request', async () => {
  let env;
  env = harness({ segment:async (_body, count) => count === 1 ? { autoState:clone(env.state), aiState:{ transcript:[] }, requestStatus:'pending' } : undefined });
  await env.connect(); await env.advance(16000);
  assert.equal(env.segments().length, 1); assert.ok(env.$('autoError').textContent);
  await env.advance(32000); assert.equal(env.segments().length, 1, 'A pending/failed request cannot spin an automatic provider retry loop');
  const firstId = env.segments()[0].body.requestId; await env.ui.retry(); await flushMicrotasks();
  assert.equal(env.segments()[1].body.requestId, firstId); assert.ok(env.rows.length >= 1);
  await env.ui.disconnect();
});

test('network stalls time out into a bounded unsaved queue without silently dropping or repeatedly uploading audio', async () => {
  const gate = deferred(); const env = harness({ segment:async () => gate.promise });
  await env.connect(); await env.advance(110000);
  assert.equal(env.segments().length, 1);
  assert.ok(env.$('autoError').textContent); assert.match(env.$('autoQueueStatus').textContent, /Unsaved segments: [1-8]/);
  const count = env.recorders.length; await env.advance(45000); assert.equal(env.recorders.length, count, 'Capture must stop while the upload is failed or the queue is full');
  gate.resolve({ autoState:clone(env.state), requestStatus:'complete', row:{ id:'late-response' }, aiState:{ transcript:[] } }); await flushMicrotasks();
  assert.ok(env.$('autoError').textContent, 'An already timed-out result cannot silently clear the unsaved queue');
  await env.ui.disconnect({ discard:true });
});

test('waiting alone or losing the opposing participant does not record private waiting-room conversation', async () => {
  const env = harness(); env.room.remoteParticipants.clear(); await env.connect(); await env.advance(16000);
  assert.equal(env.recorders.length, 0);
  env.room.remoteParticipants.set(env.candidate.identity, env.candidate); await env.ui.sync(); await env.advance(500);
  assert.ok(env.recorders.length > 0);
  env.room.remoteParticipants.clear(); await env.ui.sync(); await flushMicrotasks();
  const count = env.recorders.length; await env.advance(16000); assert.equal(env.recorders.length, count);
  assert.ok(env.recorders.every(recorder => recorder.state === 'inactive')); await env.ui.disconnect();
});

test('candidate accepts a server flush request only after saving the final local segment', async () => {
  const env = harness({ candidate:true }); await env.connect(); await env.advance(2000);
  env.state.flushRequestId = 'synthetic-server-flush'; env.state.flushPendingIdentities = [env.state.identity]; env.state.flushComplete = false; env.state.allowed = false;
  await env.advance(3000);
  const segmentIndex = env.calls.findIndex(call => call.body.operation === 'segment');
  const ackIndex = env.calls.findIndex(call => call.body.operation === 'flush-ack');
  assert.ok(segmentIndex >= 0 && ackIndex > segmentIndex, 'The final original must be saved before acknowledging the server flush');
  assert.equal(env.calls[ackIndex].body.flushRequestId, 'synthetic-server-flush');
  assert.equal(env.rows.length, 1); assert.equal(env.state.flushComplete, true);
  const count = env.recorders.length; await env.advance(16000); assert.equal(env.recorders.length, count);
  assert.ok(env.recorders.every(recorder => recorder.state === 'inactive'));
  await env.ui.disconnect(); assert.ok(!env.events.some(value => value.startsWith('FORBIDDEN-')));
});

test('room-wide flush includes the candidate and waits for their acknowledgement before analysis', async () => {
  const env = harness(); await env.connect(); await env.advance(1000);
  let complete = false; const work = env.ui.beforeAnalyze().then(() => { complete = true; }); await flushMicrotasks();
  const sent = env.calls.find(call => call.body.operation === 'flush');
  assert.deepEqual(sent.body.participantIdentities.sort(), [env.state.identity, env.candidate.identity].sort());
  assert.equal(complete, false); assert.equal(env.rows.length, 1);
  assert.deepEqual(env.state.flushPendingIdentities, [env.candidate.identity]);
  await env.advance(1000); assert.equal(complete, false, 'Local final audio alone is not room completion');
  env.state.flushPendingIdentities = []; env.state.flushComplete = true;
  await env.advance(1000); await work; assert.equal(complete, true);
  assert.ok(env.recorders.every(recorder => recorder.state === 'inactive'));
  await env.ui.disconnect(); assert.ok(!env.events.some(value => value.startsWith('FORBIDDEN-')));
});

test('suspending a connection preserves the short unsaved segment and restores it on same-epoch reconnect', async () => {
  const env = harness(); await env.connect(); await env.advance(1500);
  await env.ui.suspend(); env.context.connected = false; const count = env.recorders.length;
  assert.match(env.$('autoQueueStatus').textContent, /Unsaved segments: 1/);
  await env.advance(16000); assert.equal(env.segments().length, 0); assert.equal(env.recorders.length, count);
  env.context.connected = true; await env.ui.connect(); await flushMicrotasks();
  assert.equal(env.segments().length, 1); assert.equal(env.segments()[0].body.epoch, 1);
  assert.ok(env.segments()[0].body.durationMs < 15000); assert.equal(env.rows.length, 1);
  await env.ui.disconnect(); assert.ok(!env.events.some(value => value.startsWith('FORBIDDEN-')));
});

test('a late transcription result cannot undo revocation or restart a microphone recorder', async () => {
  const gate = deferred(); const env = harness({ candidate:true, segment:async () => gate.promise });
  await env.connect(); await env.advance(16000); const stale = clone(env.state);
  await env.ui.setConsent(false); const count = env.recorders.length;
  gate.resolve({ autoState:stale, requestStatus:'complete', row:{ id:'synthetic-before-revocation' }, aiState:{ transcript:[] } }); await flushMicrotasks();
  await env.advance(31000); assert.equal(env.state.ownConsent, false); assert.equal(env.recorders.length, count);
  assert.equal(env.segments().length, 1); assert.equal(env.$('autoConsentEnable').hidden, false);
  env.ui.dispose(); await flushMicrotasks();
  assert.ok(env.recorders.every(recorder => recorder.state === 'inactive'));
  assert.ok(!env.events.some(value => value.startsWith('FORBIDDEN-')));
});

test('a room flush that targets another participant never causes a forged local acknowledgement', async () => {
  const env = harness({ candidate:true }); await env.connect();
  env.state.flushRequestId = 'synthetic-other-only-flush'; env.state.flushPendingIdentities = ['recruiter-other-interviewer']; env.state.flushComplete = false;
  await env.advance(3500);
  assert.equal(env.calls.filter(call => call.body.operation === 'flush-ack').length, 0);
  assert.ok(env.recorders.some(recorder => recorder.state === 'recording'), 'An unrelated flush cannot interrupt this participant');
  await env.ui.disconnect();
});

test('next-question assistance does not stop recording, whereas final analysis drains both pipelines first', async () => {
  const main = fs.readFileSync(require.resolve('../public/recruiting-interview.js'), 'utf8');
  const analyze = main.slice(main.indexOf('async function analyze(mode)'), main.indexOf('function stopLocalTracks('));
  for (const mode of ['next','final']) {
    const events = [], nodes = new Map();
    const context = vm.createContext({
      analysisBusy:false, connected:true, recruiter:true, info:{ interviewId:'fixture', canWriteTranscript:true }, room:{},
      updatePermissions() {}, $:id => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); }, t:value => value,
      voiceUi:{ beforeAnalyze:async () => { events.push('voice-flush'); } }, autoUi:{ beforeAnalyze:async () => { events.push('room-flush'); } },
      request:async (_url, options) => { events.push(`analyze-${JSON.parse(options.body).mode}`); return { aiState:{ analysis:{ summary:'synthetic' } } }; },
      renderAnalysis() { events.push('render-analysis'); }
    });
    vm.runInContext(analyze, context); await context.analyze(mode);
    assert.deepEqual(events, mode === 'next' ? ['analyze-next','render-analysis'] : ['voice-flush','room-flush','analyze-final','render-analysis']);
    assert.equal(context.analysisBusy, false);
  }
});

test('ordinary leave saves and pauses recording before disconnecting and never leaves silently on an unsaved error', async () => {
  const main = fs.readFileSync(require.resolve('../public/recruiting-interview.js'), 'utf8');
  const leave = main.slice(main.indexOf('async function leaveInterview()'), main.indexOf('async function endInterviewForEveryone()'));
  for (const fail of [false,true]) {
    const events = [], errorNode = {};
    const context = vm.createContext({ leaving:false, ending:false, updatePermissions() {}, $:() => errorNode,
      autoUi:{ pause:async () => { events.push('save-and-server-pause'); if (fail) throw new Error('Synthetic unsaved segment'); } },
      disconnectLocal:async () => { events.push('disconnect'); }, showDisconnected() { events.push('disconnected'); }
    });
    vm.runInContext(leave, context); await context.leaveInterview();
    assert.deepEqual(events, fail ? ['save-and-server-pause'] : ['save-and-server-pause','disconnect','disconnected']);
    if (fail) assert.match(errorNode.textContent, /unsaved/);
    assert.equal(context.leaving, false);
  }
});

test('a stale status response cannot restore recording after a video-only reconnect into a new room', async () => {
  const gate = deferred(); const env = harness({ status:async (_body, count) => count === 1 ? gate.promise : undefined });
  await env.ui.primeAudio(); const firstJoin = env.ui.connect(); await flushMicrotasks(); const stale = clone(env.state);
  await env.ui.suspend(); env.context.connected = false;
  env.state.ownConsent = false; env.state.allowed = false; env.state.epoch++;
  env.context.room = { ...env.room }; env.context.connected = true; await env.ui.connect(); await flushMicrotasks();
  gate.resolve({ autoState:stale, aiState:{ transcript:[] } }); await firstJoin; await flushMicrotasks();
  await env.advance(16000); assert.equal(env.recorders.length, 0); assert.equal(env.segments().length, 0);
  assert.equal(env.$('autoConsentEnable').hidden, false); assert.match(env.$('autoStatus').textContent, /Video only/);
  await env.ui.disconnect();
});

test('a stale failed status request cannot pause a newly authorized room connection', async () => {
  const gate = deferred(); const env = harness({ status:async (_body, count) => count === 1 ? gate.promise : undefined });
  await env.ui.primeAudio(); const firstJoin = env.ui.connect(); await flushMicrotasks();
  await env.ui.suspend(); env.context.room = { ...env.room }; await env.ui.connect(); await env.advance(500);
  gate.reject(new Error('Stale room network failure')); await firstJoin; await flushMicrotasks();
  assert.equal(env.$('autoError').textContent, ''); assert.ok(env.recorders.some(recorder => recorder.state === 'recording'));
  await env.ui.disconnect(); assert.ok(!env.events.some(value => value.startsWith('FORBIDDEN-')));
});

test('MediaRecorder construction or start failures do not strand a capture or block pause and revocation', async () => {
  for (const option of ['recorderConstructorError','recorderStartError']) {
    const env = harness({ [option]:true }); await env.connect();
    assert.match(env.$('autoError').textContent, /Synthetic recorder/); assert.equal(env.segments().length, 0);
    let paused = false; void env.ui.pause().then(() => { paused = true; }); await flushMicrotasks();
    assert.equal(paused, true, 'A recorder that never started must not leave an unresolved capture.done promise');
    await env.ui.setConsent(false); await env.ui.disconnect();
    assert.ok(!env.events.some(value => value.startsWith('FORBIDDEN-')));
    assert.equal(env.events.filter(value => value === 'clone-stopped').length, env.events.filter(value => value === 'local-mic-cloned').length, 'Every private microphone clone is released');
  }
});
