(() => {
  'use strict';
  const NOTICE_VERSION = '2026-09-19-voice-v1';
  const MAX_RECORDING_MS = 120_000;
  const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
  const english = text => Boolean(String(text || '').trim()) && !/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(String(text));
  const newId = () => `voice-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  const cancelled = () => Object.assign(new Error('Operation cancelled.'), { name:'AbortError' });

  function create(bridge) {
    const $ = bridge.$;
    const ctx = () => bridge.getContext();
    const zh = () => ctx().language === 'zh';
    const text = (en, cn) => zh() ? cn : en;
    let voice = null, activeRoom = null, generation = 0, requestSequence = 0, appliedSequence = 0;
    let healthy = false, polling = false, timer = null, leaseTimer = null, busy = false;
    let playback = null, capture = null, captureStarting = false, pendingAnswer = null, uploadPromise = null;
    let lastQuestion = null, previewSource = '', previewQuestion = '', previewRevision = 0, followupBusy = false;
    const requests = new Set();
    let statusMessage = '', statusError = false;

    function ownsControl() {
      const c = ctx();
      return Boolean(healthy && activeRoom && c.connected && c.room === activeRoom && voice?.controllerIdentity
        && voice.controllerIdentity === activeRoom.localParticipant.identity && Date.parse(voice.leaseExpiresAt) > Date.now());
    }
    function writable() { const c = ctx(); return Boolean(c.recruiter && c.info?.canWriteTranscript === true); }
    function allowed() { return writable() && ownsControl() && voice?.consent === true && voice?.configured === true && activeRoom.remoteParticipants.has(voice.candidateIdentity); }
    function currentTurn() { return voice?.currentTurn || null; }
    function orphanedTurn() { return ownsControl() && ['preparing', 'ready', 'speaking', 'recording', 'captured', 'transcribing'].includes(currentTurn()?.phase) && !playback && !capture && !captureStarting && !pendingAnswer && !uploadPromise; }
    function isCurrent(capturedRoom, version) { return activeRoom === capturedRoom && ctx().room === capturedRoom && ctx().connected && generation === version; }
    function message(value, failed = false) { statusMessage = value; statusError = failed; render(); }
    function applyState(data, capturedRoom, sequence) {
      if (capturedRoom !== activeRoom || capturedRoom !== ctx().room || !ctx().connected || sequence < appliedSequence) return;
      appliedSequence = sequence;
      const wasOwned = voice?.controllerIdentity === capturedRoom.localParticipant.identity;
      const wasConsented = voice?.consent === true;
      voice = data.voice || voice; healthy = true;
      if ((wasConsented && voice?.consent !== true) || (wasOwned && !ownsControl())) {
        suspend(text('AI activity stopped: consent or control changed. Unsaved audio was discarded.', '同意状态或控制权已变化，AI 活动已停止，未保存录音已丢弃。'), true);
      }
      bridge.onState?.(data);
      render();
    }
    async function api(suffix, body, { publicRoute = false, ignoreGeneration = false } = {}) {
      const c = ctx(), capturedRoom = activeRoom, version = generation, sequence = ++requestSequence;
      if (!capturedRoom || !c.connected || capturedRoom !== c.room) throw cancelled();
      const controller = new AbortController(); requests.add(controller);
      const timeout = setTimeout(() => controller.abort(), suffix === 'video-answer' ? 100_000 : 45_000);
      try {
        const url = publicRoute ? `/api/public/recruiting-video/${suffix}` : `/api/recruiting/interviews/${encodeURIComponent(c.info.interviewId)}/${suffix}`;
        const payload = publicRoute ? { interviewId:c.info.interviewId, sessionSecret:c.sessionSecret, ...body } : { participantSessionId:c.participantSessionId, ...body };
        const data = await bridge.request(url, { method:'POST', auth:!publicRoute, body:JSON.stringify(payload), signal:controller.signal });
        if ((!ignoreGeneration && !isCurrent(capturedRoom, version)) || capturedRoom !== activeRoom || capturedRoom !== ctx().room) throw cancelled();
        applyState(data, capturedRoom, sequence);
        return data;
      } finally { clearTimeout(timeout); requests.delete(controller); }
    }
    function operation(name, extras = {}, options) { return api('video-voice', { operation:name, ...extras }, options); }
    function render() {
      const c = ctx(), host = Boolean(c.recruiter), owner = ownsControl(), ready = allowed();
      $('voiceHostControls').hidden = !host;
      $('voiceCandidateConsent').hidden = host;
      $('voiceDisclosure').textContent = text('AI-generated English voice may be played into this call. Recording is optional and starts only after the candidate agrees and an interviewer clicks Start.', '本通话可播放 AI 生成的英文语音。录音是可选的，只有候选人明确同意且面试官点击开始后才启动。');
      $('voiceTitle').textContent = text('Controlled AI voice', '受控 AI 语音');
      $('voiceConsentNotice').textContent = text('Optional: I agree to hear clearly identified AI-generated English questions and to let the interviewer record my microphone answers (up to 120 seconds each), send that audio to OpenAI for transcription, Chinese translation and job-related evidence analysis, and save the resulting text in my recruiting record. This app does not store raw audio. OpenAI processes audio under its service data policies. I can revoke consent without leaving the call; unsaved recordings are then discarded. A person makes the hiring decision.', '可选：我同意听取明确标识的 AI 英文问题，并允许面试官录制我的麦克风回答（每段最多 120 秒），将音频发送给 OpenAI 转写、翻译为中文及整理岗位相关证据，并将生成的文字保存至招聘档案。本应用不存储原始音频；OpenAI 按其服务数据政策处理音频。我可以不退出通话而撤回同意，届时未保存录音会被丢弃。招聘决定由人工作出。');
      $('voiceConsentSave').textContent = text('Agree to optional AI voice & answer recording', '同意可选 AI 语音与回答录音');
      $('voiceConsentRevoke').textContent = text('Revoke consent', '撤回同意');
      $('voiceConsentSave').disabled = !c.connected || !$('voiceConsentCheck').checked || busy || voice?.consent === true;
      $('voiceConsentRevoke').disabled = !c.connected || busy || voice?.consent !== true;
      $('voiceConsentCheck').disabled = voice?.consent === true || busy;
      $('voiceClaim').textContent = text('Take AI control', '取得 AI 控制权');
      $('voiceRelease').textContent = text('Release control', '释放控制权');
      $('voiceSpeak').textContent = text('Speak selected question in English', '英文播报当前题目');
      $('voiceRepeat').textContent = text('Repeat last question', '重读上一题');
      $('voiceStop').textContent = orphanedTurn() ? text('Reset interrupted AI turn', '清除已中断的 AI 操作') : text('Stop AI voice', '停止 AI 播音');
      $('voiceClaim').disabled = !writable() || !c.connected || !healthy || !voice?.configured || owner || Boolean(voice?.controllerIdentity && Date.parse(voice.leaseExpiresAt) > Date.now()) || busy;
      $('voiceRelease').disabled = !owner || busy;
      const blocked = busy || Boolean(playback || capture || captureStarting || pendingAnswer || uploadPromise);
      $('voiceSpeak').disabled = !ready || blocked || !english(bridge.getSelectedQuestion()?.text);
      if ($('voiceQuestionSpeak')) { $('voiceQuestionSpeak').disabled = $('voiceSpeak').disabled; $('voiceQuestionSpeak').textContent = text('Ask this question aloud in English (AI)', '让 AI 用英语提问'); }
      $('voiceRepeat').disabled = !ready || blocked || !lastQuestion;
      $('voiceStop').disabled = !owner || (!playback && !busy && !orphanedTurn());
      $('voiceFollowupLabel').textContent = text('Draft a follow-up (Chinese or English)', '追问草稿（中文或英文）');
      $('voiceFollowupPreviewLabel').textContent = text('Review / edit English preview before speaking', '先核对或编辑英文预览，再确认播报');
      $('voiceTranslateFollowup').textContent = text('Generate English preview', '生成英文预览');
      $('voiceConfirmFollowup').textContent = text('Confirm & speak this English preview', '确认并播报此英文预览');
      $('voiceTranslateFollowup').disabled = !ready || blocked || followupBusy || !$('voiceFollowupDraft').value.trim();
      $('voiceConfirmFollowup').disabled = !ready || blocked || followupBusy || !previewSource || previewSource !== $('voiceFollowupDraft').value || previewQuestion !== questionKey() || !english($('voiceFollowupPreview').value);
      $('voiceRecordStart').textContent = text('Start candidate answer recording', '开始录制候选人回答');
      $('voiceRecordStop').textContent = text('Stop & transcribe answer', '停止并转写回答');
      $('voiceRetryAnswer').textContent = text('Retry saving this answer', '重试保存本段回答');
      $('voiceDiscardAnswer').textContent = text('Discard unsaved audio', '丢弃未保存录音');
      $('voiceRecordStart').disabled = !ready || blocked || currentTurn()?.phase !== 'waiting' || !candidateMicrophone();
      $('voiceRecordStop').disabled = !capture || Boolean(uploadPromise);
      $('voiceRetryAnswer').hidden = !pendingAnswer || Boolean(uploadPromise) || Boolean(pendingAnswer?.terminalError);
      $('voiceRetryAnswer').disabled = !ready || Boolean(uploadPromise);
      $('voiceDiscardAnswer').hidden = !pendingAnswer;
      $('voiceDiscardAnswer').disabled = Boolean(uploadPromise);
      $('voiceRecordNotice').textContent = text('Manual recording: candidate microphone only, at most 120 seconds. Stop sends the segment for transcription and Chinese translation; it is not a live word-by-word transcript. Do not change questions until this answer is saved or discarded.', '手动录音：仅采集候选人麦克风，每段最多 120 秒。停止后提交转写并生成中文译文，并非实时逐字转写；保存或丢弃本段回答前不要切换问题。');
      const consent = voice?.consent === true ? text('Candidate consent is active.', '候选人已明确同意。') : text('Candidate consent is not active.', '候选人尚未同意或已撤回。');
      const controller = voice?.controllerIdentity ? `${text('Controller', '控制人')}: ${voice.controllerName || voice.controllerIdentity}${owner ? text(' (you)', '（你）') : ''}` : text('No AI controller.', '尚无 AI 控制人。');
      const phaseLabels = { preparing:'正在生成语音', ready:'语音已就绪', speaking:'AI 正在播报', waiting:'等待候选人回答', recording:'正在录音', captured:'录音已停止，待转写', transcribing:'正在转写与翻译', answered:'回答已保存', interrupted:'已停止', error:'处理失败' };
      const phase = capture ? text('RECORDING CANDIDATE ANSWER', '正在录制候选人回答') : playback?.started ? text('AI SPEAKING', 'AI 正在播报') : voice?.recording ? text('CANDIDATE ANSWER RECORDING ACTIVE', '候选人回答录音已启动') : (zh() ? phaseLabels[currentTurn()?.phase] : currentTurn()?.phase) || text('idle', '空闲');
      $('voiceState').textContent = `${!voice?.configured ? text('AI voice unavailable. ', 'AI 语音未配置。') : ''}${consent} ${controller} · ${phase}`;
      $('voiceState').classList.toggle('recording', Boolean(capture || voice?.recording));
      $('voiceCurrentQuestion').textContent = currentTurn()?.questionText ? `${text('Current spoken question', '本次已播问题')}: ${currentTurn().questionText}` : '';
      $('voiceStatus').textContent = statusMessage;
      $('voiceStatus').classList.toggle('error', statusError);
    }
    function questionKey() { const q = bridge.getSelectedQuestion() || {}; return `${q.kitId || ''}:${q.questionId || ''}`; }
    async function poll() {
      if (polling || !activeRoom || !ctx().connected) return;
      polling = true;
      try {
        if (ctx().recruiter) await operation(ownsControl() ? 'heartbeat' : 'status');
        else await api('voice-state', {}, { publicRoute:true });
        sync();
      } catch (cause) {
        if (cause.name !== 'AbortError') suspend(text('AI paused: cannot verify room consent or control. Recheck the connection before continuing.', 'AI 已暂停：无法核实同意状态或控制权。请检查连接后再手动继续。'), false);
      } finally { polling = false; }
    }
    async function connect() {
      await disconnect({ release:false });
      activeRoom = ctx().room; if (!activeRoom || !ctx().connected) return;
      const connectingRoom = activeRoom;
      healthy = false; voice = null; appliedSequence = 0; statusMessage = '';
      await poll();
      if (activeRoom !== connectingRoom || ctx().room !== connectingRoom || !ctx().connected) return;
      timer = setInterval(poll, 5000);
      leaseTimer = setInterval(() => {
        if (voice?.controllerIdentity === activeRoom?.localParticipant.identity && Date.parse(voice.leaseExpiresAt) <= Date.now()) suspend(text('AI control expired. Take control again to continue.', 'AI 控制权已过期，请重新取得控制权后继续。'), true);
        sync();
      }, 1000);
      render();
    }
    async function claim() {
      if (!writable() || !ctx().connected || busy) return;
      busy = true; render();
      try { await operation('claim'); message(text('You control AI voice. Every question and recording still needs a manual click.', '已取得 AI 控制权；每次播题和录音仍需手动点击。')); }
      catch (cause) { message(cause.message, true); }
      finally { busy = false; render(); }
    }
    async function cleanupPlayback(item) {
      if (!item) return;
      item.cancelled = true;
      if (item.source) { item.source.onended = null; try { item.source.stop(); } catch {} try { item.source.disconnect(); } catch {} }
      try { item.monitor?.disconnect(); } catch {}
      try { item.track?.stop(); } catch {}
      for (const track of item.destination?.stream.getTracks() || []) { try { track.stop(); } catch {} }
      if (item.published) { item.published = false; try { await item.room.localParticipant.unpublishTrack(item.track); } catch {} }
      try { await item.context?.close(); } catch {}
    }
    function abortRequests() { for (const controller of requests) controller.abort(); requests.clear(); }
    function discardCapture() {
      const previous = capture; capture = null; captureStarting = false;
      if (!previous) return;
      previous.discarded = true; clearTimeout(previous.timeout);
      try { if (previous.recorder.state !== 'inactive') previous.recorder.stop(); } catch {}
      previous.stream.getTracks().forEach(track => track.stop()); previous.chunks.length = 0;
      previous.finish?.(null);
    }
    function suspend(reason, discardPending = true) {
      generation += 1; healthy = false; busy = false; followupBusy = false; abortRequests();
      const previous = playback; playback = null; void cleanupPlayback(previous);
      discardCapture(); if (discardPending) pendingAnswer = null;
      statusMessage = reason || text('AI activity stopped. Nothing resumes automatically.', 'AI 活动已停止，不会自动恢复。'); statusError = true;
      render();
    }
    async function stop() {
      const hadActivity = Boolean(playback || busy || orphanedTurn());
      const canNotify = ownsControl();
      generation += 1; busy = false; abortRequests();
      const previous = playback; playback = null; await cleanupPlayback(previous);
      if (hadActivity && canNotify && activeRoom === ctx().room && ctx().connected) {
        try { await operation('interrupted', previous?.turnId ? { turnId:previous.turnId } : {}); } catch (cause) { if (cause.name !== 'AbortError') healthy = false; }
      }
      message(text('AI voice stopped. Click a question or Repeat to speak again.', 'AI 播音已停止。需手动点击题目播报或重读后才会继续。'));
    }
    async function release() {
      const canRelease = ownsControl();
      suspend(text('AI control released; unsaved audio discarded.', '已释放 AI 控制权，未保存录音已丢弃。'), true);
      if (canRelease) { try { await operation('release'); } catch (cause) { message(cause.message, true); } }
    }
    async function speak(question) {
      if (!allowed() || busy || playback || capture || captureStarting || pendingAnswer || uploadPromise || !english(question?.text)) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext || !window.LivekitClient?.LocalAudioTrack) return message(text('This browser cannot publish AI audio. No local-only fallback is used.', '此浏览器无法把 AI 音频发布到通话，系统不会退回仅本机播放。'), true);
      const capturedRoom = activeRoom, version = generation;
      const item = { room:capturedRoom, context:null, destination:null, source:null, track:null, published:false, cancelled:false, started:false };
      playback = item; busy = true;
      try {
        // Resume during the user gesture, before waiting for synthesis or publish.
        item.context = new AudioContext(); await item.context.resume();
        if (!isCurrent(capturedRoom, version) || item.cancelled) throw cancelled();
        message(text('Generating English AI audio…', '正在生成英文 AI 语音…'));
        const data = await api('video-speech', { requestId:newId(), text:String(question.text).trim(), questionId:question.questionId || '', kitId:question.kitId || '' });
        if (data.duplicate || !data.audioBase64) throw new Error(text('This request was already processed or produced no audio. Use Repeat for a new playback.', '此请求已处理或未返回音频。如需重新播报，请点击重读。'));
        await operation('status');
        if (!isCurrent(capturedRoom, version) || item.cancelled || !allowed() || currentTurn()?.id !== data.turnId || currentTurn()?.phase !== 'ready') throw cancelled();
        const bytes = Uint8Array.from(atob(data.audioBase64), char => char.charCodeAt(0));
        const audio = await item.context.decodeAudioData(bytes.buffer);
        if (!isCurrent(capturedRoom, version) || item.cancelled || !allowed()) throw cancelled();
        item.destination = item.context.createMediaStreamDestination();
        item.track = new LivekitClient.LocalAudioTrack(item.destination.stream.getAudioTracks()[0], undefined, true, item.context);
        item.source = item.context.createBufferSource(); item.source.buffer = audio;
        item.source.connect(item.destination);
        item.monitor = item.context.createGain(); item.monitor.gain.value = 1; item.source.connect(item.monitor); item.monitor.connect(item.context.destination);
        // Publication must complete before either remote or local playback starts.
        await capturedRoom.localParticipant.publishTrack(item.track, { name:'quad-ai-question', source:LivekitClient.Track.Source.Unknown });
        item.published = true;
        if (!isCurrent(capturedRoom, version) || item.cancelled || !allowed()) throw cancelled();
        await operation('speaking', { turnId:data.turnId });
        if (!isCurrent(capturedRoom, version) || item.cancelled || !allowed()) throw cancelled();
        lastQuestion = { ...question }; item.turnId = data.turnId;
        item.source.onended = () => {
          if (playback !== item || item.cancelled || !isCurrent(capturedRoom, version)) return;
          playback = null; busy = false;
          void cleanupPlayback(item).then(async () => {
            if (!isCurrent(capturedRoom, version) || !allowed()) return;
            try { await operation('waiting', { turnId:data.turnId }); message(text('Question finished. You may start recording the candidate answer.', '题目播报完毕。可手动开始录制候选人回答。')); }
            catch (cause) { message(cause.message, true); }
          });
        };
        item.started = true; busy = false; item.source.start();
        message(text('AI-generated English question is playing in the call.', 'AI 生成的英文问题正在通话中播报。'));
      } catch (cause) {
        const stillCurrent = playback === item && isCurrent(capturedRoom, version);
        if (playback === item) playback = null;
        await cleanupPlayback(item);
        if (stillCurrent) {
          busy = false;
          try { if (ownsControl()) await operation('interrupted', item.turnId ? { turnId:item.turnId } : {}); } catch {}
          if (cause.name !== 'AbortError') message(cause.message, true);
        }
      } finally { render(); }
    }
    function speakSelected() { return speak(bridge.getSelectedQuestion()); }
    function repeat() { return lastQuestion ? speak({ ...lastQuestion }) : Promise.resolve(); }
    function invalidatePreview() {
      previewRevision += 1; previewSource = ''; previewQuestion = ''; $('voiceFollowupPreview').value = ''; render();
    }
    function selectedQuestionChanged() { invalidatePreview(); render(); }
    async function translateFollowup() {
      if (!allowed() || followupBusy || playback || capture || pendingAnswer || uploadPromise) return;
      const draft = $('voiceFollowupDraft').value, key = questionKey(), revision = ++previewRevision;
      if (!draft.trim()) return;
      followupBusy = true; previewSource = ''; $('voiceFollowupPreview').value = ''; render();
      try {
        const data = await api('video-followup', { text:draft });
        if (revision !== previewRevision || draft !== $('voiceFollowupDraft').value || key !== questionKey()) return;
        if (!english(data.text)) throw new Error(text('The English preview is empty or invalid. Nothing was spoken.', '英文预览为空或不符合要求，未播报任何内容。'));
        previewSource = draft; previewQuestion = key; $('voiceFollowupPreview').value = data.text;
        message(text('Review the English text, edit if needed, then confirm to speak.', '请核对英文内容，必要时修改，然后明确确认播报。'));
      } catch (cause) { if (cause.name !== 'AbortError') message(cause.message, true); }
      finally { followupBusy = false; render(); }
    }
    function confirmFollowup() {
      if (previewSource !== $('voiceFollowupDraft').value || previewQuestion !== questionKey() || !previewSource || !english($('voiceFollowupPreview').value)) return;
      return speak({ ...bridge.getSelectedQuestion(), text:$('voiceFollowupPreview').value.trim() });
    }
    function candidateMicrophone() {
      if (!activeRoom || !voice?.candidateIdentity) return null;
      const participant = activeRoom.remoteParticipants.get(voice.candidateIdentity);
      if (!participant) return null;
      let role = ''; try { role = JSON.parse(participant.metadata || '{}').role; } catch {}
      if (role !== 'candidate') return null;
      const publication = participant.getTrackPublication?.(LivekitClient.Track.Source.Microphone);
      const track = publication?.track;
      if (publication?.source !== LivekitClient.Track.Source.Microphone || publication.isMuted || publication.isSubscribed === false || track?.isMuted || track?.kind !== LivekitClient.Track.Kind.Audio || track.mediaStreamTrack?.readyState !== 'live') return null;
      return { participant, publication, track };
    }
    async function startRecording() {
      if (!allowed() || busy || playback || capture || captureStarting || pendingAnswer || uploadPromise || currentTurn()?.phase !== 'waiting') return;
      const candidate = candidateMicrophone();
      if (!candidate) return message(text('The consenting candidate microphone is not available.', '已同意的候选人麦克风尚不可用。'), true);
      if (!window.MediaRecorder || !window.MediaStream) return message(text('Recording is unavailable in this browser. Use manual notes; no microphone fallback is started.', '此浏览器不支持录音，请使用人工笔记；不会改为录制其他麦克风。'), true);
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(value => MediaRecorder.isTypeSupported?.(value));
      if (!mimeType) return message(text('No supported audio recording format is available.', '此浏览器没有可用的音频录制格式。'), true);
      const version = generation, capturedRoom = activeRoom, turn = { ...currentTurn() };
      let createdStream = null;
      captureStarting = true; render();
      try {
        await operation('recording', { turnId:turn.id, candidateIdentity:candidate.participant.identity });
        if (!isCurrent(capturedRoom, version) || !allowed() || candidateMicrophone()?.track !== candidate.track) throw cancelled();
        const clonedTrack = candidate.track.mediaStreamTrack.clone();
        const stream = new MediaStream([clonedTrack]); createdStream = stream;
        const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond:32000 });
        const item = { room:capturedRoom, version, recorder, stream, originalTrack:candidate.track, candidateIdentity:candidate.participant.identity, turnId:turn.id, requestId:newId(), chunks:[], bytes:0, startedAt:Date.now(), mimeType, discarded:false, finish:null, timeout:null };
        item.done = new Promise(resolve => { item.finish = resolve; });
        recorder.ondataavailable = event => {
          if (item.discarded || !event.data?.size) return;
          item.bytes += event.data.size;
          if (item.bytes > MAX_AUDIO_BYTES) { suspend(text('Audio exceeded the safe upload size; the unsaved segment was discarded.', '音频超过安全上传大小，未保存片段已丢弃。'), true); return; }
          item.chunks.push(event.data);
        };
        recorder.onerror = () => suspend(text('Recording failed; the incomplete segment was discarded. Start a new recording explicitly.', '录音失败，不完整片段已丢弃；需要手动开始新的录音。'), true);
        recorder.onstop = () => {
          clearTimeout(item.timeout); stream.getTracks().forEach(track => track.stop());
          if (capture === item) capture = null;
          const blob = !item.discarded && item.chunks.length ? new Blob(item.chunks, { type:recorder.mimeType || mimeType }) : null;
          item.chunks.length = 0;
          if (blob && isCurrent(capturedRoom, version) && allowed()) pendingAnswer = { blob, turnId:item.turnId, candidateIdentity:item.candidateIdentity, requestId:item.requestId, durationMs:Math.min(MAX_RECORDING_MS, Math.max(1, Date.now() - item.startedAt)), mimeType:blob.type, room:capturedRoom };
          item.finish(pendingAnswer); render();
        };
        capture = item; captureStarting = false;
        recorder.start(500);
        item.timeout = setTimeout(() => { void stopRecording().catch(cause => message(cause.message, true)); }, MAX_RECORDING_MS);
        message(text('Recording only the remote candidate microphone. Stop to transcribe; maximum 120 seconds.', '正在录制远端候选人的麦克风。点击停止后转写，最多 120 秒。'));
      } catch (cause) {
        captureStarting = false;
        createdStream?.getTracks().forEach(track => { try { track.stop(); } catch {} });
        if (isCurrent(capturedRoom, version)) {
          discardCapture();
          try { if (ownsControl()) await operation('interrupted', { turnId:turn.id }); } catch {}
          if (cause.name !== 'AbortError') message(cause.message, true);
        }
      } finally { render(); }
    }
    async function stopRecording() {
      const item = capture;
      if (item) {
        if (item.recorder.state !== 'inactive') item.recorder.stop();
        await item.done;
        if (!pendingAnswer && !item.discarded && ownsControl()) {
          try { await operation('interrupted', { turnId:item.turnId }); } catch {}
          message(text('No answer audio was captured. Nothing was saved; repeat the question and start a new recording.', '没有采集到回答音频，未保存任何内容。请重读问题后重新录音。'), true);
        }
      }
      if (!pendingAnswer) return;
      return retryAnswer();
    }
    async function retryAnswer() {
      if (uploadPromise) return uploadPromise;
      if (!pendingAnswer || !allowed()) throw new Error(text('Answer is not saved. Consent and AI control are required to retry.', '回答尚未保存；重试前需要有效同意和 AI 控制权。'));
      const item = pendingAnswer;
      if (item.terminalError) throw new Error(text('This request cannot be retried. Discard the unsaved audio, repeat the question, then record a fresh answer.', '此请求不能重试。请丢弃未保存音频、重新播题，再录制新的回答。'));
      uploadPromise = (async () => {
        try {
          await operation('status');
          if (pendingAnswer !== item || item.room !== activeRoom || !allowed() || currentTurn()?.id !== item.turnId) throw cancelled();
          if (currentTurn()?.phase === 'recording') await operation('stop-recording', { turnId:item.turnId, candidateIdentity:item.candidateIdentity });
          if (pendingAnswer !== item || !allowed()) throw cancelled();
          message(text('Transcribing and translating this answer… not saved yet.', '正在转写并翻译本段回答…目前尚未保存。'));
          const bytes = new Uint8Array(await item.blob.arrayBuffer());
          let binary = ''; for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
          if (pendingAnswer !== item || !allowed()) throw cancelled();
          const data = await api('video-answer', { turnId:item.turnId, requestId:item.requestId, candidateIdentity:item.candidateIdentity, mimeType:item.mimeType, durationMs:item.durationMs, audioBase64:btoa(binary) });
          if (data.requestStatus === 'pending') throw new Error(data.row?.id ? text('The English original is saved, but Chinese processing is still pending. Check status with an explicit retry; do not record this answer again.', '英文原文已保存，但中文处理尚未完成。请手动重试查询状态，不要重复录制该回答。') : text('The answer is still processing. Keep this page open and explicitly retry to check the same request.', '回答仍在处理中，请保持页面打开并手动重试查询同一请求。'));
          if (!data.row?.id && ['failed', 'cancelled'].includes(data.requestStatus)) {
            item.terminalError = true;
            throw new Error(text('Processing ended without a saved answer. Discard this audio, repeat the question and record again; no provider retry will occur.', '处理已终止且没有保存回答。请丢弃这段音频、重新播题并录音；不会重复调用提供方。'));
          }
          if (!data.row?.id) throw new Error(text('No saved answer was confirmed. Keep this page open and explicitly retry; the same request is not duplicated.', '尚未确认回答已保存。请保持页面打开并手动重试，同一请求不会重复处理。'));
          if (pendingAnswer === item) pendingAnswer = null;
          message(data.row.translationZh && !data.row.translationError ? text('Answer transcript and Chinese translation saved. Raw audio was not stored by this app.', '回答原文与中文译文已保存，本应用未存储原始音频。') : text('The English answer was saved, but Chinese translation failed or is still unavailable. Check the original; no translation is claimed complete.', '英文回答已保存，但中文翻译失败或尚不可用。请核对原文；译文尚未完成。'), Boolean(data.row.translationError || !data.row.translationZh));
        } catch (cause) {
          if (pendingAnswer === item) message(`${item.terminalError ? '' : text('Answer processing is not confirmed complete. Audio remains only in this page memory. ', '回答处理尚未确认完成。音频仅留在本页面内存中。')}${cause.message}`, true);
          throw cause;
        } finally { uploadPromise = null; render(); }
      })();
      render(); return uploadPromise;
    }
    async function discardAnswer() {
      if (!pendingAnswer || uploadPromise) return;
      const turnId = pendingAnswer.turnId; pendingAnswer = null;
      try { if (ownsControl()) await operation('interrupted', { turnId }); } catch {}
      message(text('In-memory audio discarded. Any text already saved remains in the record.', '内存中的音频已丢弃；此前已保存的文字仍保留在档案中。'));
    }
    async function setConsent(consent) {
      if (ctx().recruiter || !ctx().connected || busy || (consent && !$('voiceConsentCheck').checked)) return;
      busy = true; render();
      try {
        const data = await api('voice-consent', { consent:Boolean(consent), noticeVersion:NOTICE_VERSION }, { publicRoute:true });
        if (!consent) $('voiceConsentCheck').checked = false;
        // This is only a wake-up hint. Peers always refetch authoritative consent.
        try { await activeRoom?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ type:'voice-state-changed' })), { reliable:true }); } catch {}
        message(consent ? text('Optional consent saved. An interviewer must still start each recording.', '已保存可选同意；每段录音仍须面试官手动开始。') : text('Consent revoked. You remain in the call; no new answer recording is allowed.', '已撤回同意，你仍在通话中，不能再开始新的回答录音。'));
        return data;
      } catch (cause) { message(cause.message, true); }
      finally { busy = false; render(); }
    }
    function sync() {
      if (playback && !activeRoom?.remoteParticipants.has(voice?.candidateIdentity)) suspend(text('The candidate disconnected. AI playback stopped and will not resume automatically.', '候选人已断开，AI 播音已停止，不会自动恢复。'), true);
      if (capture && (!allowed() || candidateMicrophone()?.track !== capture.originalTrack)) suspend(text('Candidate microphone, consent or control changed. Recording stopped and unsaved audio was discarded.', '候选人麦克风、同意状态或控制权已变化。录音已停止，未保存音频已丢弃。'), true);
      render();
    }
    function receiveSignal(payload, participant) {
      if (!participant?.identity || !activeRoom?.remoteParticipants.has(participant.identity)) return;
      try {
        const signal = JSON.parse(new TextDecoder().decode(payload));
        if (signal.type === 'voice-state-changed') void poll();
      } catch {}
    }
    async function beforeAnalyze() {
      if ((voice?.recording && !capture) || (['preparing', 'speaking', 'transcribing'].includes(currentTurn()?.phase) && !playback && !uploadPromise && !pendingAnswer)) throw new Error(text('Another AI question or answer is still active. Its controller must finish or stop it before analysis.', '另一段 AI 提问或回答仍在进行中，请由控制人先完成或停止，再分析。'));
      if (playback || busy) await stop();
      if (capture) await stopRecording();
      else if (uploadPromise) await uploadPromise;
      else if (pendingAnswer) await retryAnswer();
      if (capture || captureStarting || pendingAnswer || uploadPromise) throw new Error(text('Finish saving or discard the current answer before analysis.', '请先保存或丢弃当前回答，再进行分析。'));
    }
    async function disconnect({ release:releaseLease = true } = {}) {
      const previous = activeRoom, c = ctx(), canRelease = previous && voice?.controllerIdentity === previous.localParticipant.identity;
      clearInterval(timer); clearInterval(leaseTimer); timer = null; leaseTimer = null;
      generation += 1; abortRequests(); healthy = false; busy = false; followupBusy = false;
      const oldPlayback = playback; playback = null; discardCapture(); pendingAnswer = null; lastQuestion = null; invalidatePreview();
      activeRoom = null; voice = null; polling = false;
      await cleanupPlayback(oldPlayback);
      if (releaseLease && canRelease && c.info?.interviewId && c.recruiter) {
        const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 1500);
        try { await bridge.request(`/api/recruiting/interviews/${encodeURIComponent(c.info.interviewId)}/video-voice`, { method:'POST', auth:true, body:JSON.stringify({ participantSessionId:c.participantSessionId, operation:'release' }), signal:controller.signal }); } catch {} finally { clearTimeout(timeout); }
      }
      render();
    }
    const bind = (id, handler) => $(id).addEventListener('click', () => { Promise.resolve(handler()).catch(cause => { if (cause.name !== 'AbortError') message(cause.message, true); }); });
    bind('voiceClaim', claim); bind('voiceRelease', release); bind('voiceSpeak', speakSelected); bind('voiceRepeat', repeat); bind('voiceStop', stop);
    bind('voiceTranslateFollowup', translateFollowup); bind('voiceConfirmFollowup', confirmFollowup);
    bind('voiceRecordStart', startRecording); bind('voiceRecordStop', stopRecording); bind('voiceRetryAnswer', retryAnswer); bind('voiceDiscardAnswer', discardAnswer);
    bind('voiceConsentSave', () => setConsent(true)); bind('voiceConsentRevoke', () => setConsent(false));
    $('voiceConsentCheck').addEventListener('change', render);
    $('voiceFollowupDraft').addEventListener('input', invalidatePreview); $('voiceFollowupPreview').addEventListener('input', render);
    render();
    return Object.freeze({ connect, disconnect, suspend, sync, render, selectedQuestionChanged, receiveSignal, beforeAnalyze, claim, release, speakSelected, repeat, stop, translateFollowup, confirmFollowup, startRecording, stopRecording, retryAnswer, discardAnswer, setConsent });
  }
  window.QuadInterviewVoice = Object.freeze({ create });
})();
