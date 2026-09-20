(() => {
  'use strict';
  const NOTICE_VERSION = '2026-09-20-auto-v1';
  const SEGMENT_MS = 15000, MAX_QUEUE = 8, MAX_QUEUE_BYTES = 8 * 1024 * 1024, MAX_SEGMENT_BYTES = 1024 * 1024;
  const copy = {
    en:{ title:'Choose how to join', notice:'If you agree, your own microphone will be recorded automatically in short segments while the consenting interview participants are present. Candidate and interviewer speech is kept separate and sent to OpenAI for speech-to-text, Chinese translation and job-related AI assistance. Chinese and English speech are supported. AI-generated male voice may ask English questions. Transcripts are saved in the recruiting record; this app does not store raw audio. OpenAI processes audio under its service data policies. You can pause or withdraw consent at any time, or join video only without recording. A person makes the hiring decision.', join:'Agree to automatic recording & join', videoOnly:'Join video only — no recording', enable:'Agree to automatic recording', revoke:'Withdraw consent', active:'Your automatic recording choice is saved. Recording resumes after reconnect when the required participants and consent are present.', inactive:'Your video-only choice is saved. Reconnecting does not grant recording consent.' },
    zh:{ title:'选择加入方式', notice:'同意后，在面试参与者到齐且同意时，系统自动分段录制你自己的麦克风。候选人与面试官的发言分开归属，发送给 OpenAI 转写、翻译为中文并辅助整理岗位相关证据，支持中文和英文发言。AI 男声可用英语提问。文字保存至招聘档案，本应用不保存原始音频；OpenAI 按其服务数据政策处理音频。你可随时暂停或撤回同意，也可仅视频通话、不录音。招聘决定由人工作出。', join:'同意自动记录并加入面试', videoOnly:'仅视频通话，不录音', enable:'同意启用自动记录', revoke:'撤回同意', active:'已保留自动记录的选择；重连后，参与者及同意条件满足时会自动继续。', inactive:'已保留仅视频通话的选择；重连不会自动授予录音同意。' },
    es:{ title:'Elija cómo entrar', notice:'Si acepta, su propio micrófono se grabará automáticamente en segmentos cortos mientras estén presentes los participantes que consienten. Las intervenciones del candidato y los entrevistadores se atribuyen por separado y se envían a OpenAI para transcripción, traducción al chino y asistencia laboral de IA. Se admite chino e inglés. Una voz masculina de IA puede hacer preguntas en inglés. Los textos se guardan en el expediente; esta aplicación no almacena audio original. OpenAI procesa audio según sus políticas de datos. Puede pausar, retirar el consentimiento o entrar solo por video sin grabación. Una persona decide la contratación.', join:'Aceptar grabación automática y entrar', videoOnly:'Entrar solo por video, sin grabación', enable:'Aceptar grabación automática', revoke:'Retirar consentimiento', active:'Su elección se guardó. La grabación se reanuda tras reconectar cuando estén los participantes y consentimientos necesarios.', inactive:'Su elección de solo video se guardó. Reconectar no autoriza grabaciones.' },
    pt:{ title:'Escolha como entrar', notice:'Se concordar, seu próprio microfone será gravado automaticamente em pequenos segmentos enquanto os participantes que consentiram estiverem presentes. As falas do candidato e entrevistadores são atribuídas separadamente e enviadas à OpenAI para transcrição, tradução para chinês e assistência profissional de IA. Chinês e inglês são aceitos. Uma voz masculina de IA pode fazer perguntas em inglês. Os textos ficam no registro; este aplicativo não armazena áudio bruto. A OpenAI processa áudio conforme suas políticas de dados. Você pode pausar, retirar o consentimento ou entrar apenas por vídeo sem gravação. A contratação é decidida por uma pessoa.', join:'Concordar com gravação automática e entrar', videoOnly:'Entrar apenas por vídeo, sem gravação', enable:'Concordar com gravação automática', revoke:'Retirar consentimento', active:'Sua escolha foi salva. A gravação retoma após reconectar com os participantes e consentimentos necessários.', inactive:'Sua escolha de apenas vídeo foi salva. Reconectar não autoriza gravações.' }
  };
  const consentText = (language, key) => (copy[language] || copy.en)[key] || '';
  const newId = () => `auto-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  const abortError = () => Object.assign(new Error('Operation cancelled'), { name:'AbortError' });

  function create(bridge) {
    const $ = bridge.$, ctx = () => bridge.getContext();
    const text = (en, zh, es, pt) => ({ zh, es:es || en, pt:pt || en })[ctx().language] || en;
    let activeRoom = null, state = null, healthy = false, polling = false, pollTimer = null, generation = 0;
    let audioContext = null, analyser = null, audioSource = null, silentGain = null, microphoneStream = null, originalTrack = null, levelTimer = null;
    let capture = null, starting = false, sequence = 0, localPaused = false, held = false, disposed = false;
    let queue = [], queueBytes = 0, upload = null, draining = null, failure = '', lastSavedAt = '', silentSegments = 0, level = 0;
    let stateRequestSequence = 0, lastStateSequence = 0, pollSequence = 0, revoking = false, permissionFailure = false, flushWork = null, acknowledgedFlush = '';
    const requests = new Set();
    const autoState = data => data?.autoState || data?.automatic || null;
    function ownConsent() { return state?.ownConsent === true && state?.noticeVersion === NOTICE_VERSION; }
    function hasParticipants() {
      const c = ctx(), room = activeRoom;
      if (!room || !state?.candidateIdentity) return false;
      if (c.recruiter) return room.remoteParticipants.has(state.candidateIdentity);
      return [...room.remoteParticipants.values()].some(participant => { try { return JSON.parse(participant.metadata || '{}').role === 'interviewer'; } catch { return false; } });
    }
    function roomReady() { return Boolean(activeRoom && activeRoom === ctx().room && ctx().connected && !disposed); }
    function canRecord() { return roomReady() && healthy && ownConsent() && state?.allowed === true && state?.ownPaused !== true && hasParticipants() && !localPaused && !held && !revoking && !failure && queue.length < MAX_QUEUE && queueBytes < MAX_QUEUE_BYTES; }
    function localMicrophone() {
      if (!roomReady()) return null;
      const publication = activeRoom.localParticipant.getTrackPublication?.(LivekitClient.Track.Source.Microphone);
      const track = publication?.track;
      if (publication?.source !== LivekitClient.Track.Source.Microphone || publication.isMuted || track?.isMuted || track?.kind !== LivekitClient.Track.Kind.Audio || track.mediaStreamTrack?.readyState !== 'live') return null;
      return track.mediaStreamTrack;
    }
    function setFailure(message) { failure = message || ''; render(); }
    function applyState(data, requestSequence = ++stateRequestSequence) {
      if (!data || requestSequence < lastStateSequence) return;
      lastStateSequence = requestSequence;
      const previous = state, next = autoState(data);
      if (next) { state = next; healthy = true; }
      bridge.onState?.(data);
      if (previous && (previous.ownConsent === true && !ownConsent() || state?.epoch !== undefined && previous.epoch !== undefined && state.epoch !== previous.epoch)) {
        stopCapture({ discard:true }); clearQueue();
        if (upload) upload.controller?.abort();
      }
      render();
    }
    async function request(kind, body = {}, options = {}) {
      const c = ctx(), interviewId = c.info?.interviewId, capturedRoom = activeRoom, version = generation, requestSequence = ++stateRequestSequence;
      if (!interviewId || !roomReady()) throw abortError();
      const controller = options.controller || new AbortController(); requests.add(controller);
      const timeoutMs = kind === 'segment' ? 75000 : 12000;
      let timeout;
      const deadline = new Promise((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error(text('Transcription request timed out. Unsaved audio remains on this page.', '转写请求超时，未保存音频仍保留在本页面。'))); }, timeoutMs); });
      const url = c.recruiter ? `/api/recruiting/interviews/${encodeURIComponent(interviewId)}/video-auto` : '/api/public/recruiting-video/auto';
      const identity = c.recruiter ? { participantSessionId:c.participantSessionId } : { interviewId, sessionSecret:c.sessionSecret };
      try {
        const data = await Promise.race([bridge.request(url, { method:'POST', auth:c.recruiter, body:JSON.stringify({ ...identity, operation:kind, ...body }), signal:controller.signal }), deadline]);
        if (version !== generation || capturedRoom !== activeRoom || capturedRoom !== ctx().room || !roomReady()) throw abortError();
        applyState(data, requestSequence); return data;
      } finally { clearTimeout(timeout); requests.delete(controller); }
    }
    function render() {
      const c = ctx(), recording = Boolean(capture), consent = ownConsent();
      $('autoTitle').textContent = text('Automatic interview notes', '自动面试记录', 'Registro automático de entrevista', 'Registro automático da entrevista');
      $('autoNoticeTitle').textContent = text('Recording and AI information', '录音与 AI 说明', 'Información de grabación e IA', 'Informações de gravação e IA');
      $('autoNotice').textContent = consentText(c.language, 'notice');
      $('autoRecordingBadge').textContent = recording ? text('Recording your microphone', '正在录制你的麦克风', 'Grabando su micrófono', 'Gravando seu microfone') : text('Not recording', '未录音', 'Sin grabación', 'Sem gravação');
      $('autoRecordingBadge').classList.toggle('recording', recording);
      let status;
      if (!roomReady()) status = text('Not connected. No microphone is being recorded.', '尚未连接，不会录制麦克风。');
      else if (!healthy) status = text('Checking automatic recording permissions…', '正在核实自动记录权限…');
      else if (!consent) status = text('Video only. You have not agreed to automatic recording.', '仅视频通话，你尚未同意自动记录。');
      else if (revoking) status = text('Stopping recording and withdrawing consent…', '正在停止录音并撤回同意…');
      else if (failure) status = text('Recording paused because a segment could not be saved. Review the error below.', '有片段未保存，自动记录已暂停，请查看下方原因。');
      else if (localPaused || state?.ownPaused) status = text('You paused recording. Resume when ready.', '你已暂停录音，可随时继续。');
      else if (held) status = text('Finishing saved notes / analysis. Recording is paused.', '正在完成记录／分析，录音已暂停。');
      else if (!hasParticipants()) status = text('Waiting for candidate and interviewer. Private waiting-room conversation is not recorded.', '等待候选人与面试官到齐；候场私聊不录音。');
      else if (!state?.allowed) status = state?.reason || text('Waiting for everyone’s recording consent.', '等待参与者的录音同意。');
      else if (queue.length >= MAX_QUEUE || queueBytes >= MAX_QUEUE_BYTES) status = text('Transcription queue is full. Recording paused until saved; no queued audio was discarded.', '待转写队列已满，保存后再继续录音；排队音频没有被丢弃。');
      else if (!localMicrophone()) status = text('Microphone is muted or unavailable. Turn it on to resume automatically.', '麦克风静音或不可用，打开后会自动继续。');
      else if (audioContext?.state === 'suspended') status = text('The browser paused audio processing. Click Enable microphone processing.', '浏览器暂停了音频处理，请点“启用麦克风处理”。');
      else status = text('Recording automatically in 15-second segments; Chinese and English are supported. No per-question clicks needed.', '自动每 15 秒分段记录，支持中文和英文，无需逐题点击。');
      $('autoStatus').textContent = status;
      $('autoLevelLabel').textContent = text('Your microphone', '你的麦克风', 'Su micrófono', 'Seu microfone');
      $('autoLevel').value = Math.min(1, level * 8);
      $('autoLevelText').textContent = recording ? level >= .008 ? text('Input detected', '检测到声音') : text('No voice input', '暂无声音输入') : '—';
      $('autoQueueStatus').textContent = `${text('Unsaved segments', '待保存片段')}: ${queue.length}${upload ? text(' · transcribing…', ' · 正在转写…') : ''}${lastSavedAt ? text(' · latest segment saved', ' · 最近片段已保存') : ''}${silentSegments ? ` · ${text('silent segments skipped', '已跳过静音片段')}: ${silentSegments}` : ''}`;
      $('autoError').textContent = failure; $('autoError').hidden = !failure;
      $('autoConsentEnable').hidden = consent; $('autoConsentEnable').disabled = !roomReady() || revoking; $('autoConsentEnable').textContent = consentText(c.language, 'enable');
      $('autoPause').hidden = !consent; $('autoPause').disabled = !roomReady() || revoking;
      $('autoPause').textContent = localPaused || held || state?.ownPaused ? text('Resume automatic recording', '继续自动记录', 'Reanudar grabación automática', 'Retomar gravação automática') : text('Pause recording', '暂停录音', 'Pausar grabación', 'Pausar gravação');
      $('autoRevoke').hidden = !consent; $('autoRevoke').disabled = !roomReady() || revoking; $('autoRevoke').textContent = consentText(c.language, 'revoke');
      $('autoRetry').hidden = !failure; $('autoRetry').disabled = Boolean(upload) || !roomReady() || !consent; $('autoRetry').textContent = text('Retry automatic recording / unsaved segments', '重试自动记录／未保存片段');
      $('autoDiscard').hidden = !failure || !queue.length; $('autoDiscard').disabled = Boolean(upload); $('autoDiscard').textContent = text('Discard unsaved audio', '丢弃未保存音频');
      $('autoEnableAudio').hidden = !roomReady() || !consent || audioContext?.state !== 'suspended'; $('autoEnableAudio').textContent = text('Enable microphone processing', '启用麦克风处理');
    }
    async function primeAudio() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      try { if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContext(); await audioContext.resume(); } catch {}
    }
    function destroyMeter() {
      clearInterval(levelTimer); levelTimer = null; level = 0;
      try { audioSource?.disconnect(); } catch {} try { analyser?.disconnect(); } catch {} try { silentGain?.disconnect(); } catch {}
      for (const track of microphoneStream?.getTracks() || []) { try { track.stop(); } catch {} }
      audioSource = analyser = silentGain = microphoneStream = originalTrack = null;
    }
    async function ensureMeter(track) {
      if (originalTrack === track && microphoneStream && analyser) return;
      destroyMeter(); await primeAudio();
      if (!canRecord() || !audioContext || audioContext.state !== 'running') return;
      originalTrack = track; microphoneStream = new MediaStream([track.clone()]);
      audioSource = audioContext.createMediaStreamSource(microphoneStream); analyser = audioContext.createAnalyser(); analyser.fftSize = 1024;
      silentGain = audioContext.createGain(); silentGain.gain.value = 0;
      audioSource.connect(analyser); analyser.connect(silentGain); silentGain.connect(audioContext.destination);
      const values = new Float32Array(analyser.fftSize);
      levelTimer = setInterval(() => {
        if (!analyser) return;
        analyser.getFloatTimeDomainData(values); let sum = 0; for (const value of values) sum += value * value;
        level = Math.sqrt(sum / values.length);
        if (capture && level >= .008) capture.voiceSamples++;
        render();
      }, 100);
    }
    async function beginSegment() {
      if (starting || capture || !canRecord()) return;
      const track = localMicrophone(); if (!track) return;
      if (!window.MediaRecorder || !window.MediaStream) return setFailure(text('This browser cannot record audio. Use a supported browser; no other microphone is substituted.', '此浏览器无法录制音频，请使用支持录音的浏览器；不会替换成其他人的麦克风。'));
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(value => MediaRecorder.isTypeSupported?.(value));
      if (!mimeType) return setFailure(text('No supported recording format is available.', '浏览器没有可用的录音格式。'));
      const version = generation; let segmentStream = null; starting = true;
      try {
        await ensureMeter(track);
        if (version !== generation || !canRecord() || localMicrophone() !== track || audioContext?.state !== 'running') return;
        segmentStream = new MediaStream([track.clone()]);
        const recorder = new MediaRecorder(segmentStream, { mimeType, audioBitsPerSecond:32000 });
        const item = { recorder, stream:segmentStream, started:false, chunks:[], bytes:0, voiceSamples:0, startedAt:Date.now(), epoch:state.epoch, sequence:++sequence, requestId:newId(), discarded:false, stoppedAt:null, timer:null, finish:null, version };
        item.done = new Promise(resolve => { item.finish = resolve; }); capture = item;
        recorder.ondataavailable = event => {
          if (item.discarded || !event.data?.size) return;
          item.bytes += event.data.size;
          if (item.bytes > MAX_SEGMENT_BYTES) { item.discarded = true; setFailure(text('Audio segment exceeded the upload limit; this segment was discarded. Recording is paused.', '录音片段超过上传上限，本片段已丢弃，自动记录已暂停。')); stopCapture({ discard:true }); return; }
          item.chunks.push(event.data);
        };
        recorder.onerror = () => { setFailure(text('Microphone recording failed. The incomplete segment was discarded; previous queued audio is retained.', '麦克风录音失败，不完整片段已丢弃；之前排队的音频仍保留。')); stopCapture({ discard:true }); };
        recorder.onstop = () => {
          clearTimeout(item.timer); item.stream.getTracks().forEach(track => track.stop()); if (capture === item) capture = null;
          const durationMs = Math.max(1, (item.stoppedAt || Date.now()) - item.startedAt);
          if (!item.discarded && version === generation && ownConsent() && item.chunks.length) {
            if (item.voiceSamples >= 2) {
              const blob = new Blob(item.chunks, { type:recorder.mimeType || mimeType });
              queue.push({ blob, requestId:item.requestId, sequence:item.sequence, epoch:item.epoch, startedAt:new Date(item.startedAt).toISOString(), endedAt:new Date(item.stoppedAt || Date.now()).toISOString(), durationMs, mimeType:blob.type }); queueBytes += blob.size;
              if (queue.length > MAX_QUEUE || queueBytes > MAX_QUEUE_BYTES) setFailure(text('The audio queue reached its safety limit. Recording is paused; queued audio is retained.', '音频队列达到安全上限，录音已暂停；排队音频仍保留。'));
            } else silentSegments++;
          }
          item.chunks.length = 0; item.finish(); render(); void drain(); void beginSegment();
        };
        recorder.start(); item.started = true; item.timer = setTimeout(() => { void stopCapture(); }, SEGMENT_MS); render();
      } catch (cause) {
        setFailure(`${text('Unable to start automatic recording: ', '无法启动自动录音：')}${cause.message}`);
        if (capture?.stream === segmentStream) await stopCapture({ discard:true });
        else for (const clonedTrack of segmentStream?.getTracks() || []) { try { clonedTrack.stop(); } catch {} }
      }
      finally { starting = false; render(); }
    }
    function stopCapture({ discard = false } = {}) {
      const item = capture; if (!item) return Promise.resolve();
      clearTimeout(item.timer); item.stoppedAt ||= Date.now(); item.discarded ||= discard;
      try {
        if (item.recorder.state !== 'inactive') item.recorder.stop();
        else if (!item.started) { item.discarded = true; if (capture === item) capture = null; item.stream.getTracks().forEach(track => track.stop()); item.finish(); }
      } catch { item.discarded = true; capture = null; item.stream.getTracks().forEach(track => track.stop()); item.finish(); }
      return item.done;
    }
    function clearQueue() { queue = []; queueBytes = 0; }
    async function drain() {
      if (draining) return draining;
      if (!queue.length || !roomReady() || !healthy || !ownConsent() || failure || revoking) return;
      draining = (async () => {
        while (queue.length && roomReady() && healthy && ownConsent() && !failure && !revoking) {
          const item = queue[0], version = generation, controller = new AbortController(); upload = { item, controller }; render();
          try {
            const bytes = new Uint8Array(await item.blob.arrayBuffer()); let binary = '';
            for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
            if (version !== generation || !ownConsent() || queue[0] !== item || revoking) throw abortError();
            const data = await request('segment', { requestId:item.requestId, epoch:item.epoch, audioBase64:btoa(binary), mimeType:item.mimeType, durationMs:item.durationMs, startedAt:item.startedAt, endedAt:item.endedAt }, { controller });
            if (data.requestStatus === 'pending') throw new Error(text('This segment is still processing. Retry checks the same request without duplicating it.', '本片段仍在处理中，重试会查询同一请求，不会重复新增。'));
            if (!data.row?.id && !data.skipped && data.requestStatus !== 'skipped') throw new Error(data.error || text('No saved transcript was confirmed for this segment.', '尚未确认本片段已保存转写。'));
            if (queue[0] === item) { queue.shift(); queueBytes -= item.blob.size; lastSavedAt = new Date().toISOString(); }
          } catch (cause) {
            if (version === generation && queue.includes(item) && !revoking && roomReady()) { setFailure(`${text('Transcription not saved; audio remains only on this page. ', '转写尚未保存，音频仅保留在本页面。')}${cause.message}`); await stopCapture(); }
            break;
          } finally { upload = null; render(); }
        }
      })();
      try { await draining; } finally { draining = null; render(); if (canRecord()) void beginSegment(); }
    }
    async function sync() {
      if (!roomReady()) return;
      if (!canRecord() || localMicrophone() !== originalTrack) { await stopCapture({ discard:!ownConsent() || revoking }); if (!localMicrophone() || !hasParticipants()) destroyMeter(); }
      if (canRecord()) void beginSegment();
      if (!failure) void drain(); render();
    }
    async function poll() {
      if (polling || !roomReady()) return;
      polling = true; const currentPoll = ++pollSequence;
      try { await request('status'); if (permissionFailure) { permissionFailure = false; failure = ''; } await processFlush(); await sync(); }
      catch (cause) { if (currentPoll === pollSequence && cause.name !== 'AbortError') { healthy = false; await stopCapture(); if (!failure || permissionFailure) { permissionFailure = true; setFailure(`${text('Cannot verify automatic recording permissions. Recording paused. ', '无法核实自动录音权限，已暂停。')}${cause.message}`); } } }
      finally { if (currentPoll === pollSequence) polling = false; }
    }
    async function connect() {
      if (activeRoom && activeRoom !== ctx().room) await suspend();
      activeRoom = ctx().room; if (!roomReady()) return;
      healthy = false; held = false;
      await poll(); clearInterval(pollTimer); pollTimer = setInterval(poll, 3000); render();
    }
    async function setConsent(consent) {
      if (!roomReady()) return;
      if (!consent) { revoking = true; localPaused = true; await stopCapture({ discard:true }); clearQueue(); upload?.controller?.abort(); destroyMeter(); }
      try { await request('consent', { consent:Boolean(consent), noticeVersion:NOTICE_VERSION }); if (consent) { localPaused = false; held = false; failure = ''; await primeAudio(); } await signal({ type:'auto-state-changed' }); }
      catch (cause) { setFailure(`${text('Consent update failed: ', '同意状态更新失败：')}${cause.message}`); }
      finally { revoking = false; await sync(); }
    }
    async function pause() { localPaused = true; await flush({ hold:true }); if (ownConsent()) { await request('pause', { epoch:state.epoch }); await signal({ type:'auto-state-changed' }); } render(); }
    async function resume() { if (!ownConsent()) return setConsent(true); await primeAudio(); await request('resume', { epoch:state.epoch }); localPaused = false; held = false; await poll(); }
    async function retry() { failure = ''; await poll(); await drain(); await sync(); }
    async function flush({ hold = false } = {}) {
      const previousHeld = held; held = true; await stopCapture(); await drain();
      if (queue.length) throw new Error(text('Some audio is not saved. Retry or explicitly discard before leaving or analyzing.', '仍有音频未保存，请重试或明确丢弃后再退出／分析。'));
      held = hold || previousHeld; if (!held) void sync(); render();
    }
    async function signal(data) { if (roomReady()) try { await activeRoom.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(data)), { reliable:true }); } catch {} }
    async function processFlush() {
      const id = state?.flushRequestId;
      if (!id || id === acknowledgedFlush || state.flushComplete || !ownConsent() || !state.flushPendingIdentities?.includes(state.identity)) return;
      if (flushWork) return flushWork;
      flushWork = (async () => {
        await flush({ hold:true });
        await request('flush-ack', { flushRequestId:id, epoch:state.epoch });
        acknowledgedFlush = id;
      })();
      try { await flushWork; } finally { flushWork = null; }
    }
    async function requestRoomFlush() {
      if (!ctx().recruiter) return flush({ hold:true });
      const participantIdentities = [activeRoom?.localParticipant.identity, ...activeRoom.remoteParticipants.keys()].filter(Boolean);
      const data = await request('flush', { participantIdentities });
      const id = data.flushRequestId || state?.flushRequestId;
      if (!id) throw new Error(text('The room could not prepare final transcripts.', '房间未能准备最后的转写片段。'));
      await signal({ type:'auto-state-changed' });
      await processFlush();
      const start = Date.now();
      while (roomReady() && Date.now() - start < 90000) {
        await request('status'); await processFlush();
        if (state?.flushRequestId === id && state.flushComplete) return;
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      throw new Error(text('Other participants have not confirmed their final segments are saved. Keep the room open and retry.', '其他参与者尚未确认最后片段已保存，请保持房间打开后重试。'));
    }
    async function receiveSignal(payload, participant) {
      if (!roomReady() || !participant?.identity || !activeRoom.remoteParticipants.has(participant.identity)) return;
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        if (data.type === 'auto-state-changed') return void poll();
      } catch (cause) { if (cause.name !== 'SyntaxError') setFailure(cause.message); }
    }
    async function suspend() {
      healthy = false; held = true; clearInterval(pollTimer); pollTimer = null;
      await stopCapture();
      generation++; pollSequence++; polling = false;
      for (const controller of requests) controller.abort();
      destroyMeter(); render();
    }
    async function disconnect({ discard = false } = {}) {
      clearInterval(pollTimer); pollTimer = null; held = true;
      if (discard) { generation++; for (const controller of requests) controller.abort(); await stopCapture({ discard:true }); if (queue.length) failure = `${text('Unsaved audio segments discarded: ', '已丢弃未保存音频片段：')}${queue.length}`; clearQueue(); }
      else if (activeRoom && ctx().connected) await flush({ hold:true });
      destroyMeter(); activeRoom = null; healthy = false; if (discard) state = null; polling = false; render();
    }
    function dispose() { disposed = true; void disconnect({ discard:true }); try { void audioContext?.close(); } catch {} }
    const bind = (id, fn) => $(id).addEventListener('click', () => { Promise.resolve(fn()).catch(cause => setFailure(cause.message)); });
    bind('autoConsentEnable', () => setConsent(true)); bind('autoRevoke', () => setConsent(false));
    bind('autoPause', () => localPaused || held || state?.ownPaused ? resume() : pause()); bind('autoRetry', retry);
    bind('autoEnableAudio', async () => { await primeAudio(); await sync(); });
    bind('autoDiscard', async () => { if (!window.confirm(text('Discard all unsaved audio segments? This cannot be undone.', '确定丢弃所有尚未保存的音频片段吗？此操作无法恢复。'))) return; clearQueue(); failure = ''; await sync(); });
    render();
    return Object.freeze({ primeAudio, connect, disconnect, suspend, sync, render, setConsent, pause, resume, retry, flush, beforeAnalyze:requestRoomFlush, requestRoomFlush, receiveSignal, dispose });
  }
  window.QuadInterviewAuto = Object.freeze({ create, NOTICE_VERSION, consentText });
})();
