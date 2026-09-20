'use strict';

// Run the real browser module with synthetic DOM, media and HTTP adapters.
// No network, camera, microphone, LiveKit connection or provider is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/recruiting-interview-voice.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const turnText = 'Describe a verifiable installation result.';
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }

function harness(options = {}) {
  const nodes = new Map(), calls = [], events = [], sources = [], recorders = [], timerCallbacks = new Map(), timerDelays = new Map();
  let timerId = 0, serial = 0, answerCount = 0, publishGate = null, speechGate = null;
  const $ = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden:false, disabled:false, checked:false, textContent:'', value:'', listeners:{}, classList:{ toggle() {} }, addEventListener(name, callback) { this.listeners[name] = callback; } });
    return nodes.get(id);
  };
  const candidateTrack = { kind:'audio', readyState:'live', clone() { events.push('candidate-track-cloned'); return { kind:'audio', readyState:'live', stop() { events.push('candidate-clone-stopped'); } }; }, stop() { events.push('ORIGINAL-CANDIDATE-TRACK-STOPPED'); } };
  const candidatePublication = { source:'microphone', isMuted:false, isSubscribed:true, track:{ kind:'audio', isMuted:false, mediaStreamTrack:candidateTrack } };
  const candidate = { identity:'candidate-ui-invite', metadata:JSON.stringify({ role:'candidate' }), getTrackPublication:() => candidatePublication };
  const room = {
    localParticipant:{ identity:'recruiter-ui-controller', async publishTrack() { events.push('publish-start'); if (publishGate) await publishGate.promise; events.push('publish-complete'); }, async unpublishTrack() { events.push('unpublish'); }, async publishData() {} },
    remoteParticipants:new Map([[candidate.identity, candidate]])
  };
  const context = { recruiter:true, room, connected:true, info:{ interviewId:'ui-interview', canWriteTranscript:true }, sessionSecret:'synthetic-candidate-secret', participantSessionId:'synthetic-ui-session', language:'en' };
  const state = { configured:true, consent:options.consent !== false, candidateIdentity:candidate.identity, controllerIdentity:'', controllerName:'', leaseExpiresAt:'', currentTurn:null, recording:false };
  let question = { text:turnText, questionId:'question-one', kitId:'synthetic-kit' };
  let kitQuestions = options.questions || [question];
  const audioKeyFor = body => `${Buffer.from(body.kitId + ':' + body.questionId).toString('hex').padEnd(64, '0').slice(0, 64)}:${'b'.repeat(64)}`;
  class AudioContext {
    constructor() { this.destination = {}; events.push('audio-context-created'); }
    async resume() { events.push('audio-context-resumed'); }
    async decodeAudioData() { return {}; }
    createMediaStreamDestination() { const track = { stop() { events.push('ai-stream-stopped'); } }; return { stream:{ getAudioTracks:() => [track], getTracks:() => [track] } }; }
    createBufferSource() { const result = { onended:null, connect() {}, disconnect() {}, start() { events.push('source-start'); }, stop() { events.push('source-stop'); } }; sources.push(result); return result; }
    createGain() { return { gain:{ value:0 }, connect() {}, disconnect() {} }; }
    async close() { events.push('audio-context-closed'); }
  }
  class MediaStream { constructor(tracks) { this.tracks = tracks; } getTracks() { return this.tracks; } }
  class MediaRecorder {
    static isTypeSupported(type) { return type === 'audio/webm;codecs=opus'; }
    constructor(stream, settings) { this.stream = stream; this.mimeType = settings.mimeType; this.state = 'inactive'; recorders.push(this); }
    start() { this.state = 'recording'; events.push('recording-start'); }
    stop() { this.state = 'inactive'; events.push('recording-stop'); this.ondataavailable?.({ data:new Blob(['SYNTHETIC-CANDIDATE-AUDIO']) }); this.onstop?.(); }
  }
  const LivekitClient = { Track:{ Source:{ Unknown:'unknown', Microphone:'microphone' }, Kind:{ Audio:'audio' } }, LocalAudioTrack:class { constructor(track) { this.track = track; } stop() { events.push('ai-track-stopped'); } } };
  const request = async (url, requestOptions) => {
    const body = JSON.parse(requestOptions.body); calls.push({ url, body });
    if (url.endsWith('/video-voice')) {
      if (body.operation === 'claim') { state.controllerIdentity = room.localParticipant.identity; state.controllerName = 'Synthetic UI Controller'; state.leaseExpiresAt = new Date(Date.now() + 30000).toISOString(); }
      else if (body.operation === 'release') { state.controllerIdentity = ''; state.leaseExpiresAt = ''; state.recording = false; }
      else if (!['status', 'heartbeat'].includes(body.operation)) {
        if ((!body.turnId && body.operation !== 'interrupted') || (body.turnId && body.turnId !== state.currentTurn?.id)) throw Object.assign(new Error('Missing or stale turn ID'), { code:'INTERVIEW_VOICE_TURN_INVALID' });
        const phase = { speaking:'speaking', waiting:'waiting', interrupted:'interrupted', recording:'recording', 'stop-recording':'captured' }[body.operation];
        state.currentTurn.phase = phase; state.recording = phase === 'recording';
      }
    } else if (url.endsWith('/video-speech-prepare')) {
      if (options.prepare) return options.prepare(body, requestOptions);
      return { mimeType:'audio/mpeg', audioBase64:Buffer.from('SYNTHETIC-AI-AUDIO').toString('base64'), audioKey:audioKeyFor(body), voiceName:'onyx' };
    } else if (url.endsWith('/video-speech')) {
      if (speechGate) await speechGate.promise;
      state.currentTurn = { id:`turn-${++serial}`, phase:'ready', questionText:body.text, questionId:body.questionId, kitId:body.kitId };
      if (body.preparedAudioKey) return { voice:clone(state), turnId:state.currentTurn.id, mimeType:'audio/mpeg', audioPrepared:true, audioKey:options.wrongPreparedKey ? `${'c'.repeat(64)}:${'d'.repeat(64)}` : body.preparedAudioKey };
      return { voice:clone(state), turnId:state.currentTurn.id, mimeType:'audio/mpeg', audioBase64:Buffer.from('SYNTHETIC-AI-AUDIO').toString('base64') };
    } else if (url.endsWith('/video-followup')) return { text:'What evidence supports that result?' };
    else if (url.endsWith('/video-answer')) {
      if (options.answerFailure) throw new Error('Synthetic answer provider failed');
      const requestStatus = options.answerStatuses?.[answerCount++] || 'complete';
      state.currentTurn.phase = requestStatus === 'pending' ? 'transcribing' : requestStatus === 'failed' ? 'error' : 'answered'; state.recording = false;
      return { voice:clone(state), requestStatus, ...(requestStatus === 'failed' ? { requestErrorCode:'INTERVIEW_VOICE_PROVIDER_FAILED' } : { row:{ id:'saved-answer-one', text:'Synthetic saved English answer.', translationZh:options.translationFailure || requestStatus === 'pending' ? '' : '合成中文译文。', ...(options.translationFailure ? { translationError:'INTERVIEW_VOICE_TRANSLATION_FAILED' } : {}) } }) };
    } else if (url.endsWith('/voice-consent')) state.consent = body.consent;
    else if (!url.endsWith('/voice-state')) throw new Error(`Unexpected synthetic URL: ${url}`);
    return { voice:clone(state), aiState:{ transcript:[] } };
  };
  const sandbox = {
    window:{ AudioContext, MediaRecorder, MediaStream, LivekitClient }, LivekitClient, MediaRecorder, MediaStream,
    crypto:{ randomUUID:() => `synthetic-request-${++serial}` }, Date, Math, Promise, Uint8Array, Blob, AbortController,
    TextEncoder, TextDecoder, atob:value => Buffer.from(value, 'base64').toString('binary'), btoa:value => Buffer.from(value, 'binary').toString('base64'),
    setTimeout(callback, ms) { const id = ++timerId; timerCallbacks.set(id, callback); timerDelays.set(id, ms); return id; }, clearTimeout:id => { timerCallbacks.delete(id); timerDelays.delete(id); },
    setInterval(callback) { const id = ++timerId; timerCallbacks.set(id, callback); return id; }, clearInterval:id => timerCallbacks.delete(id)
  };
  vm.runInNewContext(source, sandbox, { filename:'recruiting-interview-voice.js' });
  const ui = sandbox.window.QuadInterviewVoice.create({ $, request, getContext:() => context, getSelectedQuestion:() => question, getSelectedKitQuestions:() => kitQuestions, onState() {} });
  return { ui, $, calls, events, sources, recorders, state, context, room, candidatePublication, candidate, timerCallbacks, timerDelays,
    setPublishGate(value) { publishGate = value; }, setSpeechGate(value) { speechGate = value; },
    question(value) { question = value; ui.selectedQuestionChanged(); },
    questions(value) { kitQuestions = value; },
    async ready() { await ui.connect(); await ui.claim(); },
    async waiting() { await this.ready(); await ui.speakSelected(); sources.at(-1).onended(); await flush(); assert.equal(state.currentTurn.phase, 'waiting'); }
  };
}

test('joining, claiming control and consent refresh do not automatically speak or record', async () => {
  const env = harness(); await env.ready(); env.ui.sync();
  assert.equal(env.sources.length, 0); assert.equal(env.recorders.length, 0);
  assert.equal(env.calls.filter(call => /\/(?:video-speech|video-answer)$/.test(call.url)).length, 0);
  env.context.info.canWriteTranscript = false; env.ui.render(); await env.ui.speakSelected(); await env.ui.startRecording();
  assert.equal(env.sources.length, 0); assert.equal(env.recorders.length, 0);
});

test('AI audio starts only after publication succeeds and stop interrupts the same authoritative turn', async () => {
  const env = harness(); await env.ready(); const gate = deferred(); env.setPublishGate(gate);
  const work = env.ui.speakSelected(); await flush();
  assert.ok(env.events.includes('publish-start')); assert.ok(!env.events.includes('source-start'));
  gate.resolve(); await work;
  assert.ok(env.events.indexOf('publish-complete') < env.events.indexOf('source-start'));
  const turnId = env.state.currentTurn.id; await env.ui.stop();
  const interrupted = env.calls.findLast(call => call.body.operation === 'interrupted');
  assert.ok(interrupted, 'Stop must also clear the server-side busy turn');
  if (interrupted.body.turnId) assert.equal(interrupted.body.turnId, turnId);
  assert.equal(env.state.currentTurn.phase, 'interrupted');
  assert.ok(env.events.includes('unpublish')); assert.ok(env.events.includes('source-stop'));
});

test('disconnect during pending synthesis cannot publish or start late audio', async () => {
  const env = harness(); await env.ready(); const gate = deferred(); env.setSpeechGate(gate);
  const work = env.ui.speakSelected(); await flush();
  await env.ui.disconnect(); env.context.connected = false; gate.resolve(); await work;
  assert.ok(!env.events.includes('publish-start')); assert.ok(!env.events.includes('source-start'));
  assert.equal(env.timerCallbacks.size, 0);
});

test('recording manually clones only the consenting candidate microphone and never stops the original remote track', async () => {
  const env = harness(); await env.waiting();
  assert.equal(env.recorders.length, 0);
  await env.ui.startRecording(); assert.equal(env.recorders.length, 1); assert.ok(env.events.includes('candidate-track-cloned'));
  await env.ui.stopRecording();
  assert.ok(env.events.includes('candidate-clone-stopped')); assert.ok(!env.events.includes('ORIGINAL-CANDIDATE-TRACK-STOPPED'));
  const upload = env.calls.find(call => call.url.endsWith('/video-answer'));
  assert.equal(upload.body.candidateIdentity, env.candidate.identity); assert.equal(upload.body.turnId, env.state.currentTurn.id);
  assert.equal(env.$('voiceRetryAnswer').hidden, true);
});

test('noncandidate, muted and missing candidate microphones cannot trigger local capture or answer upload', async () => {
  for (const change of [env => { env.candidate.metadata = JSON.stringify({ role:'interviewer' }); }, env => { env.candidatePublication.isMuted = true; }, env => { env.room.remoteParticipants.clear(); }]) {
    const env = harness(); await env.waiting(); change(env); await env.ui.startRecording();
    assert.equal(env.recorders.length, 0);
    assert.ok(!env.calls.some(call => call.body.operation === 'recording' || call.url.endsWith('/video-answer')));
  }
});

test('consent loss observed while recording discards the segment and never submits it', async () => {
  const env = harness(); await env.waiting(); await env.ui.startRecording();
  env.state.consent = false;
  env.ui.receiveSignal(new TextEncoder().encode(JSON.stringify({ type:'voice-state-changed' })), env.candidate);
  await flush();
  assert.equal(env.recorders[0].state, 'inactive');
  assert.ok(!env.calls.some(call => call.url.endsWith('/video-answer')));
  assert.equal(env.$('voiceRetryAnswer').hidden, true);
  assert.ok(env.events.includes('candidate-clone-stopped'));
});

test('follow-up preview never speaks automatically and changing its source invalidates confirmation', async () => {
  const env = harness(); await env.ready(); env.$('voiceFollowupDraft').value = '请说明证据。';
  await env.ui.translateFollowup();
  assert.equal(env.$('voiceFollowupPreview').value, 'What evidence supports that result?');
  assert.ok(!env.calls.some(call => call.url.endsWith('/video-speech')));
  env.$('voiceFollowupDraft').value = '不同的追问'; env.$('voiceFollowupDraft').listeners.input();
  await env.ui.confirmFollowup();
  assert.ok(!env.calls.some(call => call.url.endsWith('/video-speech')));
});

test('a saved English answer with failed Chinese translation is not reported as fully translated', async () => {
  const env = harness({ translationFailure:true }); await env.waiting(); await env.ui.startRecording(); await env.ui.stopRecording();
  const status = env.$('voiceStatus').textContent;
  assert.doesNotMatch(status, /transcript and Chinese translation saved|原文与中文译文已保存/);
  assert.match(status, /translation.*(?:failed|unavailable|not)|(?:failed|unavailable|not).*translation|中文.*(?:失败|未)/i);
  assert.equal(env.$('voiceRetryAnswer').hidden, true, 'Saved original text must not be uploaded again just because translation failed');
});

test('a pending duplicate containing saved English text cannot claim completion or permit analysis yet', async () => {
  const env = harness({ answerStatuses:['pending', 'pending', 'complete'] }); await env.waiting(); await env.ui.startRecording();
  await assert.rejects(env.ui.stopRecording(), /pending/i);
  assert.equal(env.$('voiceRetryAnswer').hidden, false);
  assert.doesNotMatch(env.$('voiceStatus').textContent, /transcript and Chinese translation saved/);
  await assert.rejects(env.ui.beforeAnalyze(), /pending/i);
  await env.ui.retryAnswer();
  assert.equal(env.$('voiceRetryAnswer').hidden, true);
  const uploads = env.calls.filter(call => call.url.endsWith('/video-answer'));
  assert.equal(new Set(uploads.map(call => call.body.requestId)).size, 1, 'Status retries bind the same request rather than creating duplicate provider work');
});

test('terminal failed requests disable repeated retries and require discard before new capture', async () => {
  const env = harness({ answerStatuses:['failed'] }); await env.waiting(); await env.ui.startRecording();
  await assert.rejects(env.ui.stopRecording(), /ended without a saved answer|cannot be retried/i);
  assert.ok(env.$('voiceRetryAnswer').hidden || env.$('voiceRetryAnswer').disabled, 'Terminal requests cannot offer an actionable retry');
  const count = env.calls.filter(call => call.url.endsWith('/video-answer')).length;
  await assert.rejects(env.ui.retryAnswer(), /cannot be retried/i);
  assert.equal(env.calls.filter(call => call.url.endsWith('/video-answer')).length, count);
  assert.equal(env.$('voiceDiscardAnswer').hidden, false);
  await env.ui.discardAnswer();
  assert.equal(env.$('voiceRetryAnswer').hidden, true); assert.equal(env.state.currentTurn.phase, 'interrupted');
});

test('discarding memory audio after English text was saved does not claim that no record was added', async () => {
  const env = harness({ answerStatuses:['pending'] }); await env.waiting(); await env.ui.startRecording();
  await assert.rejects(env.ui.stopRecording(), /pending/i); await env.ui.discardAnswer();
  assert.doesNotMatch(env.$('voiceStatus').textContent, /Nothing was added|没有新增档案记录/i);
  assert.equal(env.$('voiceRetryAnswer').hidden, true);
});

test('question audio prepares before connection or consent without publishing, speaking or recording', async () => {
  const env = harness({ consent:false }); env.context.connected = false;
  await env.ui.prepareQuestions();
  const calls = env.calls.filter(call => call.url.endsWith('/video-speech-prepare'));
  assert.equal(calls.length, 1); assert.deepEqual(calls[0].body, { kitId:'synthetic-kit', questionId:'question-one' });
  assert.equal(env.events.length, 0); assert.equal(env.sources.length, 0); assert.equal(env.recorders.length, 0);
  assert.match(env.$('welcomeVoicePrepareStatus').textContent, /1\/1/);
  env.context.connected = true; await env.ready(); await env.ui.speakSelected(); await env.ui.startRecording();
  assert.ok(!env.calls.some(call => call.url.endsWith('/video-speech') || call.url.endsWith('/video-answer')));
  assert.equal(env.sources.length, 0); assert.equal(env.recorders.length, 0);
  await env.ui.disconnect();
  const candidate = harness(); candidate.context.recruiter = false; await candidate.ui.prepareQuestions();
  assert.equal(candidate.calls.length, 0, 'Candidate/public page never warms provider audio');
});

test('kit preloading keeps at most two requests in flight, prioritizes selected question and does not autoplay', async () => {
  const questions = Array.from({ length:6 }, (_, i) => ({ kitId:'synthetic-kit', questionId:i === 5 ? 'question-one' : `question-${i + 2}`, text:i === 5 ? turnText : `Synthetic question ${i + 2}?` }));
  const gates = new Map(); let active = 0, peak = 0;
  const env = harness({ questions, prepare:async body => {
    active++; peak = Math.max(peak, active); const gate = deferred(); gates.set(body.questionId, gate);
    await gate.promise; active--;
    return { mimeType:'audio/mpeg', audioKey:`${'a'.repeat(64)}:${'b'.repeat(64)}`, voiceName:'onyx', audioBase64:Buffer.from('SYNTHETIC_PRELOAD_AUDIO').toString('base64') };
  } });
  const work = env.ui.prepareQuestions(); await flush();
  assert.equal(gates.size, 2); assert.equal(env.calls[0].body.questionId, 'question-one');
  for (let round = 0; round < 6; round++) { for (const gate of gates.values()) gate.resolve(); await flush(); }
  await work; assert.equal(gates.size, 6); assert.equal(peak, 2); assert.equal(active, 0);
  assert.equal(env.sources.length + env.recorders.length, 0); assert.ok(!env.events.includes('publish-start'));
  const count = env.calls.length; await env.ui.prepareQuestions(); assert.equal(env.calls.length, count, 'Switching back to the same warmed kit does not repeat network preparation');
  assert.match(env.$('voicePrepareStatus').textContent, /6\/6/);
});

test('clicking a warmed question uses cached bytes but still authorizes a new turn before room playback', async () => {
  const env = harness(); await env.ui.prepareQuestions(); await env.ready();
  assert.equal(env.sources.length, 0); await env.ui.speakSelected();
  const prepareCall = env.calls.find(call => call.url.endsWith('/video-speech-prepare'));
  const speechCall = env.calls.find(call => call.url.endsWith('/video-speech'));
  assert.ok(prepareCall); assert.match(speechCall.body.preparedAudioKey, /^[a-f0-9]{64}:[a-f0-9]{64}$/);
  assert.equal(env.sources.length, 1); assert.ok(env.events.indexOf('publish-complete') < env.events.indexOf('source-start'));
  assert.ok(env.calls.some(call => call.body.operation === 'speaking'));
  assert.equal(env.calls.filter(call => call.url.endsWith('/video-speech-prepare')).length, 1);
  await env.ui.stop();
  env.state.consent = false; env.ui.receiveSignal(new TextEncoder().encode(JSON.stringify({ type:'voice-state-changed' })), env.candidate); await flush();
  const count = env.calls.filter(call => call.url.endsWith('/video-speech')).length; await env.ui.speakSelected();
  assert.equal(env.calls.filter(call => call.url.endsWith('/video-speech')).length, count, 'A warmed local file cannot override withdrawn consent');
  await env.ui.disconnect();
});

test('a mismatched prepared audio acknowledgement cannot play the wrong cached voice', async () => {
  const env = harness({ wrongPreparedKey:true }); await env.ui.prepareQuestions(); await env.ready(); await env.ui.speakSelected();
  assert.equal(env.sources.length, 0); assert.ok(!env.events.includes('publish-start'));
  assert.match(env.$('voiceStatus').textContent, /matching audio|匹配音频/i);
  assert.equal(env.state.currentTurn.phase, 'interrupted'); await env.ui.disconnect();
});

test('preparation failure is visible and only an explicit retry restarts failed fixed questions', async () => {
  let fail = true;
  const env = harness({ prepare:async () => {
    if (fail) throw new Error('Synthetic preparation failed');
    return { mimeType:'audio/mpeg', audioKey:`${'a'.repeat(64)}:${'b'.repeat(64)}`, voiceName:'onyx', audioBase64:Buffer.from('RETRIED_FIXED_AUDIO').toString('base64') };
  } });
  await env.ui.prepareQuestions();
  assert.equal(env.$('voicePrepareRetry').hidden, false); assert.match(env.$('voicePrepareStatus').textContent, /retry|失败/i);
  await env.ui.prepareQuestions(); assert.equal(env.calls.length, 1, 'Routine render or kit refresh cannot retry a failed provider request indefinitely');
  fail = false; await env.ui.retryPreparation(); assert.equal(env.calls.length, 2);
  assert.equal(env.$('voicePrepareRetry').hidden, true); assert.match(env.$('voicePrepareStatus').textContent, /1\/1/);
  assert.equal(env.events.length, 0);
});

test('a stalled preload has a finite deadline, rejects late results and can be retried without automatic audio', async () => {
  const gate = deferred(); let signal;
  const env = harness({ prepare:async (body, options) => { signal = options.signal; return gate.promise; } });
  const work = env.ui.prepareQuestions(); await flush();
  const deadline = Array.from(env.timerDelays).find(([, ms]) => ms === 40000);
  assert.ok(deadline, 'Preparation has an explicit bounded timeout');
  env.timerCallbacks.get(deadline[0])(); await flush(); await work;
  assert.equal(signal.aborted, true); assert.equal(env.$('voicePrepareRetry').hidden, false);
  gate.resolve({ mimeType:'audio/mpeg', audioKey:`${'a'.repeat(64)}:${'b'.repeat(64)}`, voiceName:'onyx', audioBase64:Buffer.from('LATE_AUDIO_MUST_NOT_PLAY').toString('base64') }); await flush();
  assert.match(env.$('voicePrepareStatus').textContent, /0\/1/); assert.equal(env.events.length, 0);
});

test('closing or losing write permission during preload cannot cache late audio or start media', async () => {
  for (const change of [env => env.ui.dispose(), env => { env.context.info.canWriteTranscript = false; }]) {
    const gate = deferred(); const env = harness({ prepare:async () => gate.promise });
    const work = env.ui.prepareQuestions(); await flush(); change(env);
    gate.resolve({ mimeType:'audio/mpeg', audioKey:`${'a'.repeat(64)}:${'b'.repeat(64)}`, voiceName:'onyx', audioBase64:Buffer.from('STALE_AUDIO').toString('base64') });
    await work; await flush();
    assert.equal(env.sources.length + env.recorders.length, 0); assert.ok(!env.events.includes('publish-start'));
    assert.doesNotMatch(env.$('voicePrepareStatus').textContent, /1\/1/);
  }
});

test('existing video-only candidate can opt in with one explicit button, without checkbox or automatic capture', async () => {
  const env = harness({ consent:false }); env.context.recruiter = false;
  await env.ui.connect();
  assert.equal(env.$('voiceConsentSave').disabled, false);
  await env.ui.setConsent(true);
  const saved = env.calls.find(call => call.url.endsWith('/voice-consent'));
  assert.equal(saved.body.consent, true); assert.equal(saved.body.noticeVersion, '2026-09-19-voice-v1');
  assert.equal(env.state.consent, true); assert.equal(env.$('voiceConsentSave').hidden, true);
  assert.equal(env.sources.length + env.recorders.length, 0);
  await env.ui.setConsent(false); assert.equal(env.state.consent, false);
  assert.doesNotMatch(source, /voiceConsentCheck/);
  const html = fs.readFileSync(require.resolve('../public/recruiting-interview.html'), 'utf8');
  assert.doesNotMatch(html, /id="(?:voiceConsentCheck|consent)"/);
  assert.match(html, /id="joinVideoOnly"/); assert.match(html, /id="joinConsentNotice"/);
  await env.ui.disconnect();
});

test('reviewed follow-ups and repeats stay explicit, linked to their question, and outside the fixed question cache', async () => {
  const env = harness(); await env.ui.prepareQuestions(); await env.ready();
  env.$('voiceFollowupDraft').value = '请具体说明证据。'; await env.ui.translateFollowup();
  assert.equal(env.sources.length, 0); await env.ui.confirmFollowup();
  let spoken = env.calls.filter(call => call.url.endsWith('/video-speech'));
  assert.equal(spoken.length, 1); assert.equal(spoken[0].body.followup, true);
  assert.equal(spoken[0].body.questionId, 'question-one'); assert.equal(spoken[0].body.kitId, 'synthetic-kit');
  assert.equal(spoken[0].body.text, 'What evidence supports that result?');
  assert.equal(Object.hasOwn(spoken[0].body, 'preparedAudioKey'), false);
  env.sources.at(-1).onended(); await flush(); await env.ui.repeat();
  spoken = env.calls.filter(call => call.url.endsWith('/video-speech'));
  assert.equal(spoken.length, 2); assert.equal(spoken[1].body.followup, true);
  assert.equal(Object.hasOwn(spoken[1].body, 'preparedAudioKey'), false);
  assert.equal(env.calls.filter(call => call.url.endsWith('/video-speech-prepare')).length, 1);
  await env.ui.disconnect();
});
