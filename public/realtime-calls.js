(function () {
  'use strict';
  let room = null;
  let activeCall = null;
  let incomingCallId = '';
  let callStartedAt = 0;
  let timer = null;
  let ringTimer = null;
  let ringContext = null;
  let incomingNotification = null;
  let titleTimer = null;
  let titleBeforeIncoming = '';
  let ringTimeout = null;
  let polling = false;
  let pollTimer = null;
  let pollWakeTimer = null;
  let lastPollAt = 0;
  let actionBusy = false;
  let translationEnabled = false;
  let translationSelectionOpen = false;
  let translationGeneration = 0;
  let translationRefreshTimer = null;
  let groupTranslationMixer = null;
  const translationSidecars = new Map();
  let localSpeechRecognition = null;
  let localSpeechRestartTimer = null;
  let localSpeechFinalText = '';
  let localSpeechShouldRun = false;
  let cameraEnabled = false;
  let cameraBusy = false;
  let weakVideoTimer = null;
  const declinedCallerUntil = new Map();
  const CALL_SPEECH_TERMS = {
    zh: ['磁控溅射膜', '漆面保护膜', '隐形车衣', '改色膜', '窗膜', '陶瓷膜', '纳米陶瓷膜', '金属膜', '前挡', '侧后挡', '透光率', '红外线阻隔率', '紫外线阻隔率', '色卡', '包边', '收边', '热风枪', '刮板', 'PPF', 'TPU', 'QUAD FILM'],
    en: ['magnetron sputtering film', 'paint protection film', 'color change film', 'window film', 'ceramic film', 'nano ceramic film', 'metalized film', 'windshield', 'visible light transmission', 'infrared rejection', 'ultraviolet rejection', 'color swatch', 'PPF', 'TPU', 'QUAD FILM']
  };
  const CALL_TRANSCRIPT_CORRECTIONS = [
    [/(?:磁|词)控(?:建设|建射|箭射|键射|贱射)(?:膜|模)?/g, '磁控溅射膜'],
    [/磁控溅射模/g, '磁控溅射膜'],
    [/漆面保护模/g, '漆面保护膜'],
    [/隐形车一/g, '隐形车衣'],
    [/改色模/g, '改色膜'],
    [/纳米陶瓷模/g, '纳米陶瓷膜']
  ];

  const context = () => window.getQuadCallContext?.() || {};
  const me = () => context().user || null;
  const store = () => context().state || {};
  const replaceStore = value => window.setQuadCallState?.(value);
  const request = (...args) => window.api(...args);
  const interfaceLanguage = () => String(document.documentElement.lang || 'zh').toLowerCase();
  const zh = () => !interfaceLanguage().startsWith('en');
  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const callUsers = () => store().messageUsers || store().users || [];
  const calls = () => store().voiceCalls || [];
  const activeForMe = () => calls().find(call => ['ringing', 'active'].includes(call.status) && call.participantStatuses?.[me()?.id] !== 'left' && (call.callerUserId === me()?.id || (call.participantUserIds || []).includes(me()?.id)));
  const waitingForMe = call => {
    if (!call || call.callerUserId === me()?.id || !(call.participantUserIds || []).includes(me()?.id)) return false;
    // A participant can still have a stale `ringing` value after the call as a
    // whole has ended. Never let a terminal call ring again on a later poll.
    if (!['ringing', 'active'].includes(call.status)) return false;
    if ((declinedCallerUntil.get(call.callerUserId) || 0) > Date.now()) return false;
    const status = call.participantStatuses?.[me()?.id];
    return status ? ['ringing', 'invited'].includes(status) : call.status === 'ringing';
  };
  const translationLanguageKey = () => `filmShopCloud.callTranslationLanguage.${me()?.id || 'device'}`;
  const preferredTranslationLanguage = () => {
    try {
      const value = String(localStorage.getItem(translationLanguageKey()) || (zh() ? 'zh' : 'en'));
      return ['zh', 'en'].includes(value) ? value : (zh() ? 'zh' : 'en');
    } catch { return zh() ? 'zh' : 'en'; }
  };
  const translationLanguageName = value => ({ zh:'中文', en:'English' }[value] || (zh() ? '关闭' : 'Off'));

  function normalizeCallTranscript(value, language = 'zh') {
    let text = String(value || '');
    if (language === 'zh') CALL_TRANSCRIPT_CORRECTIONS.forEach(([pattern, replacement]) => { text = text.replace(pattern, replacement); });
    return text;
  }

  function recognitionCandidate(result, language) {
    const choices = Array.from(result || []).map(candidate => {
      const raw = String(candidate?.transcript || '');
      const normalized = normalizeCallTranscript(raw, language);
      const termHits = (CALL_SPEECH_TERMS[language] || []).filter(term => normalized.toLowerCase().includes(term.toLowerCase())).length;
      return { text:normalized, score:(Number(candidate?.confidence) || 0) + (termHits * 2) };
    });
    choices.sort((left, right) => right.score - left.score);
    return choices[0]?.text || '';
  }

  function updateTranslationStatus(message, tone = '') {
    const status = document.getElementById('quadCallTranslationStatus');
    if (!status) return;
    status.textContent = message || '';
    status.dataset.tone = tone;
  }

  function translationBrowserLabel() {
    const agent = String(navigator.userAgent || '');
    const safari = agent.match(/Version\/(\d+(?:\.\d+)?).*Safari\//);
    if (safari && !/Chrome|Chromium|CriOS|Edg\//.test(agent)) return `Safari ${safari[1]}`;
    const chrome = agent.match(/(?:Chrome|CriOS)\/(\d+(?:\.\d+)?)/);
    if (chrome) return `Chrome ${chrome[1]}`;
    return 'WebRTC browser';
  }

  function translationConnectionDetails(sidecar) {
    const pc = sidecar?.pc;
    const state = pc ? `${pc.connectionState || 'unknown'}/${pc.iceConnectionState || 'unknown'}` : 'not-created';
    const iceError = sidecar?.iceError ? `, ICE ${sidecar.iceError}` : '';
    return `${translationBrowserLabel()}, ${state}${iceError}`;
  }

  function updateTranslationTranscript(kind, delta, participantIdentity = '') {
    const target = document.getElementById(kind === 'local' ? 'quadCallSourceTranscript' : 'quadCallTranslatedTranscript');
    if (!target || !delta) return;
    const currentSpeaker = target.dataset.participant || '';
    if (currentSpeaker && currentSpeaker !== participantIdentity) target.textContent = '';
    target.dataset.participant = participantIdentity;
    target.textContent = `${target.textContent || ''}${delta}`.slice(-800);
    const transcriptRow = target.closest?.('div');
    if (transcriptRow) transcriptRow.scrollTop = transcriptRow.scrollHeight;
    const transcript = document.getElementById('quadCallTranslationTranscript');
    if (transcript) transcript.hidden = false;
  }

  function setLocalSpeechTranscript(text) {
    const target = document.getElementById('quadCallSourceTranscript');
    if (!target) return;
    target.textContent = String(text || '').slice(-800);
    const transcriptRow = target.closest?.('div');
    if (transcriptRow) transcriptRow.scrollTop = transcriptRow.scrollHeight;
    const transcript = document.getElementById('quadCallTranslationTranscript');
    if (transcript) transcript.hidden = false;
  }

  function stopLocalSpeechRecognition(clear = false) {
    localSpeechShouldRun = false;
    clearTimeout(localSpeechRestartTimer);
    localSpeechRestartTimer = null;
    const recognition = localSpeechRecognition;
    localSpeechRecognition = null;
    try { recognition?.abort?.(); } catch {}
    if (clear) {
      localSpeechFinalText = '';
      setLocalSpeechTranscript('');
    }
  }

  function startLocalSpeechRecognition(language) {
    stopLocalSpeechRecognition(true);
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setLocalSpeechTranscript(zh() ? '当前浏览器不支持本机语音文字识别' : 'Local speech captions are not supported by this browser');
      return;
    }
    const recognition = new Recognition();
    localSpeechRecognition = recognition;
    localSpeechShouldRun = true;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.lang = language === 'zh' ? 'zh-CN' : 'en-US';
    // Safari normally uses its online recognition service. Explicitly prefer
    // that path when the experimental switch exists; offline recognition is
    // noticeably weaker for automotive-film terminology.
    try { if ('processLocally' in recognition) recognition.processLocally = false; } catch {}
    // Chromium exposes contextual phrase biasing on some versions. Keep this
    // progressive: Safari still gets the deterministic correction fallback.
    try {
      const Phrase = window.SpeechRecognitionPhrase;
      if (Phrase && 'phrases' in recognition) recognition.phrases = (CALL_SPEECH_TERMS[language] || []).map(term => new Phrase(term, 8));
    } catch {}
    recognition.onresult = event => {
      if (!localSpeechShouldRun || recognition !== localSpeechRecognition) return;
      let interim = '';
      for (let index = event.resultIndex || 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = recognitionCandidate(result, language);
        if (result?.isFinal) localSpeechFinalText += `${text} `;
        else interim += text;
      }
      setLocalSpeechTranscript(normalizeCallTranscript(`${localSpeechFinalText}${interim}`.trim(), language));
    };
    recognition.onerror = event => {
      if (!['not-allowed', 'service-not-allowed'].includes(String(event?.error || ''))) return;
      localSpeechShouldRun = false;
      setLocalSpeechTranscript(zh() ? '本机语音识别没有麦克风权限' : 'Microphone permission is required for local captions');
    };
    recognition.onend = () => {
      if (!localSpeechShouldRun || recognition !== localSpeechRecognition || !translationEnabled || !activeCall) return;
      localSpeechRestartTimer = setTimeout(() => {
        if (!localSpeechShouldRun || recognition !== localSpeechRecognition) return;
        try { recognition.start(); } catch {}
      }, 400);
    };
    try { recognition.start(); }
    catch {
      localSpeechShouldRun = false;
      setLocalSpeechTranscript(zh() ? '本机语音文字识别启动失败' : 'Local speech captions could not start');
    }
  }

  function setOriginalAudioMuted(muted, participantIdentity = '') {
    document.querySelectorAll('#quadCallRemoteAudio audio[data-participant-identity]').forEach(element => {
      if (!participantIdentity || element.dataset.participantIdentity === participantIdentity) element.muted = muted;
    });
  }

  function videoCallAllowed() {
    const identities = new Set([activeCall?.callerUserId, ...(activeCall?.participantUserIds || [])].filter(Boolean));
    return identities.size ? identities.size <= 2 : (room?.remoteParticipants?.size || 0) <= 1;
  }

  function attachVideoTrack(track, participantIdentity = '', local = false) {
    if (!track) return;
    const host = document.getElementById('quadCallVideoStage');
    if (!host || host.querySelector?.(`video[data-participant-identity="${CSS.escape(participantIdentity)}"]`)) return;
    const element = track.attach();
    element.autoplay = true;
    element.playsInline = true;
    element.muted = local;
    element.dataset.participantIdentity = participantIdentity;
    element.dataset.localVideo = local ? 'true' : 'false';
    host.appendChild(element);
    host.hidden = false;
    document.querySelector('.quad-call-card.active')?.classList.add('video-on');
  }

  function removeVideoElements(participantIdentity = '') {
    const selector = participantIdentity
      ? `#quadCallVideoStage video[data-participant-identity="${CSS.escape(participantIdentity)}"]`
      : '#quadCallVideoStage video';
    document.querySelectorAll(selector).forEach(element => element.remove());
    const host = document.getElementById('quadCallVideoStage');
    if (host && !host.querySelector?.('video')) {
      host.hidden = true;
      document.querySelector('.quad-call-card.active')?.classList.remove('video-on');
    }
  }

  function updateCameraButton(note = '') {
    const button = document.getElementById('quadCamera');
    if (!button) return;
    const allowed = videoCallAllowed();
    button.disabled = cameraBusy || !allowed;
    button.innerHTML = !allowed
      ? `🎥<br>${zh() ? '多人纯语音' : 'Group audio only'}`
      : `${cameraEnabled ? '📷' : '🎥'}<br>${cameraEnabled ? (zh() ? '关闭视频' : 'Stop video') : (zh() ? '开启摄像头' : 'Start video')}`;
    button.title = note;
  }

  async function toggleCamera(forceOff = false, reason = '') {
    if (!room || cameraBusy) return;
    if (!videoCallAllowed() && !forceOff) {
      updateCameraButton(zh() ? '多人通话继续使用纯语音' : 'Group calls remain audio-only');
      return;
    }
    cameraBusy = true;
    updateCameraButton();
    try {
      const nextEnabled = forceOff ? false : !cameraEnabled;
      const publication = await room.localParticipant.setCameraEnabled(nextEnabled, nextEnabled ? {
        resolution:{ width:640, height:360 }, frameRate:15, facingMode:'user'
      } : undefined, nextEnabled ? {
        videoEncoding:{ maxBitrate:400_000, maxFramerate:15 },
        simulcast:true,
        videoSimulcastLayers:LivekitClient.VideoPresets?.h180 ? [LivekitClient.VideoPresets.h180] : undefined,
        degradationPreference:'balanced'
      } : undefined);
      cameraEnabled = nextEnabled;
      if (cameraEnabled && publication?.track) attachVideoTrack(publication.track, me()?.id || 'local', true);
      if (!cameraEnabled) {
        removeVideoElements(me()?.id || 'local');
      }
      updateCameraButton(reason);
      if (reason) updateTranslationStatus(reason, 'warning');
    } catch (error) {
      cameraEnabled = false;
      updateCameraButton();
      alert(zh() ? `无法开启摄像头：${error.message || error}` : `Could not start the camera: ${error.message || error}`);
    } finally {
      cameraBusy = false;
      updateCameraButton(reason);
    }
  }

  function protectAudioOnWeakNetwork(quality) {
    clearTimeout(weakVideoTimer);
    weakVideoTimer = null;
    if (quality !== 'poor' || !cameraEnabled) return;
    weakVideoTimer = setTimeout(() => {
      if (!cameraEnabled) return;
      toggleCamera(true, zh() ? '网络较弱，已自动关闭视频以保护语音和翻译' : 'Video was turned off to protect voice and translation').catch(() => {});
    }, 8_000);
  }

  function stopTranslationSidecar(key, expectedSidecar = null) {
    const currentSidecar = translationSidecars.get(key);
    const sidecar = expectedSidecar || currentSidecar;
    if (!sidecar) return;
    sidecar.stopping = true;
    clearTimeout(sidecar.connectTimer);
    try {
      if (sidecar.events?.readyState === 'open') sidecar.events.send(JSON.stringify({ type:'session.close' }));
    } catch {}
    setTimeout(() => {
      try { sidecar.events?.close(); } catch {}
      try { sidecar.pc?.close(); } catch {}
      try { if (sidecar.ownsTrack) sidecar.track?.stop(); } catch {}
      try { sidecar.audio?.pause(); sidecar.audio.srcObject = null; sidecar.audio.remove(); } catch {}
    }, 250);
    if (currentSidecar === sidecar) translationSidecars.delete(key);
  }

  function stopGroupTranslationMixer() {
    const mixer = groupTranslationMixer;
    groupTranslationMixer = null;
    if (!mixer) return;
    mixer.sources?.forEach(source => { try { source.disconnect(); } catch {} });
    try { mixer.destination?.disconnect?.(); } catch {}
    try { mixer.destination?.stream?.getTracks?.().forEach(track => track.stop()); } catch {}
    try { mixer.context?.close?.(); } catch {}
  }

  function stopAllTranslationSidecars() {
    clearTimeout(translationRefreshTimer);
    translationRefreshTimer = null;
    translationGeneration += 1;
    [...translationSidecars.keys()].forEach(key => stopTranslationSidecar(key));
    stopGroupTranslationMixer();
    setOriginalAudioMuted(false);
  }

  function remoteTranslationTracks() {
    const tracks = [];
    room?.remoteParticipants?.forEach(participant => participant.audioTrackPublications.forEach(publication => {
      if (publication.track?.mediaStreamTrack) tracks.push([publication.track.mediaStreamTrack, participant.identity]);
    }));
    return tracks;
  }

  async function refreshTranslationTracks() {
    if (!translationEnabled) return;
    const tracks = remoteTranslationTracks();
    stopAllTranslationSidecars();
    if (!translationEnabled) return;
    if (!tracks.length) {
      updateTranslationStatus(zh() ? '实时翻译已准备，等待对方说话' : 'Translation ready; waiting for the other speaker');
      return;
    }
    if (tracks.length === 1) {
      await startTranslationTrack(tracks[0][0], tracks[0][1]);
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      updateTranslationStatus(zh() ? '当前浏览器不支持多人语音混合，请改用最新版 Safari 或 Chrome' : 'This browser cannot mix group audio. Use the latest Safari or Chrome.', 'error');
      return;
    }
    try {
      const audioContext = new AudioContextClass();
      if (audioContext.state === 'suspended') await audioContext.resume();
      const destination = audioContext.createMediaStreamDestination();
      const sources = tracks.map(([track]) => {
        const source = audioContext.createMediaStreamSource(new MediaStream([track]));
        source.connect(destination);
        return source;
      });
      groupTranslationMixer = { context:audioContext, destination, sources };
      updateTranslationStatus(zh() ? `正在连接多人实时翻译（${tracks.length}位对方成员）…` : `Connecting group translation (${tracks.length} remote participants)…`);
      await startTranslationTrack(destination.stream.getAudioTracks()[0], 'group');
    } catch (error) {
      stopGroupTranslationMixer();
      updateTranslationStatus(zh() ? `多人翻译启动失败：${error.message || error}` : `Group translation failed: ${error.message || error}`, 'error');
    }
  }

  function scheduleTranslationRefresh() {
    if (!translationEnabled) return;
    clearTimeout(translationRefreshTimer);
    translationRefreshTimer = setTimeout(() => {
      translationRefreshTimer = null;
      refreshTranslationTracks().catch(() => {});
    }, 180);
  }

  function translationSidecarIsCurrent(key, sidecar, generation) {
    return translationEnabled
      && preferredTranslationLanguage() === sidecar.selectedLanguage
      && generation === translationGeneration
      && translationSidecars.get(key) === sidecar
      && !sidecar.stopping;
  }

  async function translationWithTimeout(promise, milliseconds, message) {
    let timeout;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(message)), milliseconds); })
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  function resumeTranslationAudio() {
    translationSidecars.forEach(sidecar => {
      if (sidecar.audio?.srcObject) sidecar.audio.play?.().catch(() => {});
    });
  }

  async function startTranslationTrack(mediaStreamTrack, participantIdentity = '') {
    const selectedLanguage = preferredTranslationLanguage();
    const targetLanguage = selectedLanguage;
    if (!mediaStreamTrack || !translationEnabled) return;
    const generation = translationGeneration;
    const key = `remote:${participantIdentity || 'remote'}:${mediaStreamTrack.id}`;
    if (translationSidecars.has(key)) return;
    const sidecar = { pc:null, events:null, track:null, ownsTrack:false, audio:null, connectTimer:null, iceError:'', selectedLanguage, participantIdentity, sourceTrackId:mediaStreamTrack.id, stopping:false };
    const originalAudioIdentity = participantIdentity === 'group' ? '' : participantIdentity;
    translationSidecars.set(key, sidecar);
    try {
      updateTranslationStatus(zh() ? `翻译连接 1/4：正在获取安全凭证…` : `Translation 1/4: requesting a secure session…`);
      const secret = await translationWithTimeout(request('/api/realtime-translation/session', {
        method:'POST', body:JSON.stringify({ targetLanguage })
      }), 22_000, zh() ? 'OpenAI 翻译凭证请求超时' : 'OpenAI translation credential request timed out');
      if (!translationSidecarIsCurrent(key, sidecar, generation)) return stopTranslationSidecar(key, sidecar);
      const pc = new RTCPeerConnection();
      sidecar.pc = pc;
      try {
        sidecar.track = mediaStreamTrack.clone();
        sidecar.ownsTrack = true;
      } catch {
        // Older Safari builds can reject cloning a remote WebRTC track. The
        // same live track may safely be added to the translation peer.
        sidecar.track = mediaStreamTrack;
        sidecar.ownsTrack = false;
      }
      const sourceStream = new MediaStream([sidecar.track]);
      pc.addTrack(sidecar.track, sourceStream);
      const translatedAudio = new Audio();
      translatedAudio.autoplay = true;
      translatedAudio.playsInline = true;
      translatedAudio.dataset.translationParticipant = participantIdentity;
      sidecar.audio = translatedAudio;
      document.getElementById('quadCallRemoteAudio')?.appendChild(translatedAudio);
      pc.ontrack = event => {
        if (!translationSidecarIsCurrent(key, sidecar, generation)) return;
        // Some Safari releases omit event.streams even though event.track is
        // valid. Build a stream explicitly so translated audio still plays.
        translatedAudio.srcObject = event.streams?.[0] || new MediaStream([event.track]);
        translatedAudio.play().catch(() => updateTranslationStatus(zh() ? '请点一下通话画面以播放翻译语音' : 'Tap the call screen to play translated audio', 'warning'));
      };
      const events = pc.createDataChannel('oai-events');
      sidecar.events = events;
      events.onopen = () => {
        if (!translationSidecarIsCurrent(key, sidecar, generation)) return;
        clearTimeout(sidecar.connectTimer);
        updateTranslationStatus(zh() ? `实时翻译已开启：${translationLanguageName(selectedLanguage)}` : `Live translation: ${translationLanguageName(selectedLanguage)}`, 'ready');
      };
      events.onmessage = ({ data }) => {
        if (!translationSidecarIsCurrent(key, sidecar, generation)) return;
        try {
          const event = JSON.parse(data);
          if (event.type === 'session.output_transcript.delta') updateTranslationTranscript('translated', event.delta, participantIdentity);
          if (event.type === 'error') {
            setOriginalAudioMuted(false, originalAudioIdentity);
            updateTranslationStatus(zh() ? `实时翻译暂时不可用：${event.error?.message || '未知错误'}` : `Translation unavailable: ${event.error?.message || 'Unknown error'}`, 'error');
          }
        } catch {}
      };
      events.onclose = () => {
        if (!translationSidecarIsCurrent(key, sidecar, generation)) return;
        stopTranslationSidecar(key, sidecar);
        setOriginalAudioMuted(false, originalAudioIdentity);
        updateTranslationStatus(zh() ? '实时翻译已断开，请重新点选语言' : 'Live translation disconnected. Select the language again.', 'error');
      };
      pc.onconnectionstatechange = () => {
        if (!['failed', 'closed'].includes(pc.connectionState) || !translationSidecarIsCurrent(key, sidecar, generation)) return;
        stopTranslationSidecar(key, sidecar);
        setOriginalAudioMuted(false, originalAudioIdentity);
        updateTranslationStatus(zh() ? `实时翻译已断开（${translationConnectionDetails(sidecar)}），请重新点选语言` : `Live translation disconnected (${translationConnectionDetails(sidecar)}). Select the language again.`, 'error');
      };
      pc.onicecandidateerror = event => {
        sidecar.iceError = [event.errorCode, event.errorText].filter(Boolean).join(' ');
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      updateTranslationStatus(zh() ? `翻译连接 2/4：正在连接 OpenAI…` : `Translation 2/4: connecting to OpenAI…`);
      const answer = await translationWithTimeout(fetch('https://api.openai.com/v1/realtime/translations/calls', {
        method:'POST',
        headers:{ Authorization:`Bearer ${secret.value}`, 'Content-Type':'application/sdp' },
        body:offer.sdp
      }), 20_000, zh() ? 'OpenAI WebRTC 连接超时' : 'OpenAI WebRTC connection timed out');
      if (!answer.ok) throw new Error((await answer.text()).slice(0, 220) || `OpenAI ${answer.status}`);
      updateTranslationStatus(zh() ? `翻译连接 3/4：正在建立音频通道…` : `Translation 3/4: establishing the audio channel…`);
      await translationWithTimeout(pc.setRemoteDescription({ type:'answer', sdp:await answer.text() }), 10_000, zh() ? 'WebRTC 音频通道建立超时' : 'WebRTC audio channel setup timed out');
      if (!translationSidecarIsCurrent(key, sidecar, generation)) return stopTranslationSidecar(key, sidecar);
      setOriginalAudioMuted(true, originalAudioIdentity);
      if (events.readyState !== 'open') {
        updateTranslationStatus(zh() ? `翻译连接 4/4：正在等待实时通道…` : `Translation 4/4: waiting for the realtime channel…`);
        sidecar.connectTimer = setTimeout(() => {
          if (!translationSidecarIsCurrent(key, sidecar, generation) || events.readyState === 'open') return;
          stopTranslationSidecar(key, sidecar);
          setOriginalAudioMuted(false, originalAudioIdentity);
          updateTranslationStatus(zh() ? `翻译连接超时（${translationConnectionDetails(sidecar)}）：请检查这台设备的 Safari、VPN 或防火墙后重试` : `Translation timed out (${translationConnectionDetails(sidecar)}). Check this device's Safari, VPN, or firewall and try again.`, 'error');
        }, 12_000);
      }
    } catch (error) {
      if (sidecar.stopping) return;
      stopTranslationSidecar(key, sidecar);
      setOriginalAudioMuted(false, originalAudioIdentity);
      const reason = String(error.message || error);
      const timeoutHint = /超时|timed out/i.test(reason) ? (zh() ? '；请检查这台设备的网络、VPN 或防火墙' : '; check this device\'s network, VPN, or firewall') : '';
      const diagnostic = translationConnectionDetails(sidecar);
      updateTranslationStatus(zh() ? `实时翻译连接失败：${reason}${timeoutHint}（${diagnostic}）` : `Live translation failed: ${reason}${timeoutHint} (${diagnostic})`, 'error');
    }
  }

  async function setTranslationLanguage(value) {
    const targetLanguage = ['zh', 'en'].includes(String(value)) ? String(value) : (zh() ? 'zh' : 'en');
    try { localStorage.setItem(translationLanguageKey(), targetLanguage); } catch {}
    translationSelectionOpen = true;
    translationEnabled = true;
    document.getElementById('quadCallDirectMode')?.classList.remove('active');
    document.getElementById('quadCallTranslateMode')?.classList.add('active');
    document.querySelectorAll('.quad-call-language-option').forEach(button => button.classList.toggle('active', button.dataset.language === targetLanguage));
    stopAllTranslationSidecars();
    const source = document.getElementById('quadCallSourceTranscript');
    const translated = document.getElementById('quadCallTranslatedTranscript');
    if (source) source.textContent = '';
    if (translated) translated.textContent = '';
    const transcript = document.getElementById('quadCallTranslationTranscript');
    if (transcript) transcript.hidden = false;
    startLocalSpeechRecognition(targetLanguage);
    updateTranslationStatus(zh() ? `正在连接 ${translationLanguageName(targetLanguage)} 实时翻译…` : `Connecting ${translationLanguageName(targetLanguage)} translation…`);
    await refreshTranslationTracks();
  }

  async function setTranslationMode(mode) {
    const wantsTranslation = mode === 'translate';
    translationSelectionOpen = wantsTranslation;
    translationEnabled = false;
    document.getElementById('quadCallDirectMode')?.classList.toggle('active', !wantsTranslation);
    document.getElementById('quadCallTranslateMode')?.classList.remove('active');
    const details = document.getElementById('quadCallTranslationDetails');
    if (details) details.hidden = !wantsTranslation;
    if (!wantsTranslation) {
      stopLocalSpeechRecognition(true);
      stopAllTranslationSidecars();
      updateTranslationStatus(zh() ? '直接通话中，不经过翻译' : 'Direct call; translation is off');
      return;
    }
    stopLocalSpeechRecognition(true);
    stopAllTranslationSidecars();
    updateTranslationStatus(zh() ? '请选择你需要听到的语言；点选后开始翻译' : 'Choose the language you want to hear. Translation starts after selection.');
  }

  function ensureLayer() {
    let layer = document.getElementById('quadCallLayer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'quadCallLayer';
      document.body.appendChild(layer);
    }
    return layer;
  }

  function ensurePickerLayer() {
    let layer = document.getElementById('quadCallPickerLayer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'quadCallPickerLayer';
      document.body.appendChild(layer);
    }
    return layer;
  }

  function nameFor(call) {
    const names = [];
    if (call.callerUserId !== me()?.id && call.participantStatuses?.[call.callerUserId] !== 'left') names.push(call.callerName);
    (call.participantUserIds || []).forEach((userId, index) => {
      if (userId !== me()?.id && !['left','declined'].includes(call.participantStatuses?.[userId])) names.push((call.participantNames || [])[index]);
    });
    return names.filter(Boolean).join('、') || (zh() ? '员工' : 'Staff');
  }

  function renderIncoming(call) {
    if (room || activeCall?.id === call.id || incomingCallId === call.id) return;
    incomingCallId = call.id;
    const currentCallTime = Date.parse(call.createdAt || '') || Date.now();
    const repeatedCallIds = new Set(calls()
      .filter(item => waitingForMe(item)
        && item.callerUserId === call.callerUserId
        && Math.abs(currentCallTime - (Date.parse(item.createdAt || '') || currentCallTime)) <= 45_000)
      .map(item => item.id));
    const repeatCount = Math.max(1, repeatedCallIds.size);
    const layer = ensureLayer();
    layer.innerHTML = `<div class="quad-call-backdrop"><section class="quad-call-card incoming">
      <div class="quad-call-pulse">📞</div><small>${zh() ? '实时语音来电' : 'Incoming voice call'}</small>
      <h2>${esc(call.callerName)}</h2><p>${repeatCount > 1
        ? (zh() ? `连续呼叫 ${repeatCount} 次，处理一次即可` : `called ${repeatCount} times; dismiss once`)
        : (zh() ? '正在呼叫你…' : 'is calling you…')}</p>
      <footer><button class="quad-call-decline" onclick="QuadCalls.decline('${call.id}')">拒绝</button><button class="quad-call-accept" onclick="QuadCalls.accept('${call.id}')">接听</button></footer>
    </section></div>`;
    try { navigator.vibrate?.([300, 200, 300, 200, 500]); } catch {}
    startRinging();
    startTitleAlert(call.callerName);
    showIncomingNotification(call);
  }

  function ringOnce() {
    try {
      ringContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const play = () => {
        const oscillator = ringContext.createOscillator(); const gain = ringContext.createGain();
        oscillator.frequency.value = 720; gain.gain.setValueAtTime(.0001, ringContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(.16, ringContext.currentTime + .02); gain.gain.exponentialRampToValueAtTime(.0001, ringContext.currentTime + .5);
        oscillator.connect(gain); gain.connect(ringContext.destination); oscillator.start(); oscillator.stop(ringContext.currentTime + .55);
      };
      if (ringContext.state === 'suspended') ringContext.resume().then(play).catch(() => {});
      else play();
    } catch {}
  }

  function startRinging() { stopRinging(); ringOnce(); ringTimer = setInterval(ringOnce, 1500); }
  function stopRinging() { clearInterval(ringTimer); ringTimer = null; }

  function startTitleAlert(callerName) {
    stopTitleAlert();
    titleBeforeIncoming = document.title;
    let highlighted = false;
    titleTimer = setInterval(() => {
      highlighted = !highlighted;
      document.title = highlighted
        ? `📞 ${callerName || (zh() ? '来电' : 'Incoming call')}`
        : titleBeforeIncoming;
    }, 700);
  }

  function stopTitleAlert() {
    clearInterval(titleTimer);
    titleTimer = null;
    if (titleBeforeIncoming) document.title = titleBeforeIncoming;
    titleBeforeIncoming = '';
  }

  async function showIncomingNotification(call) {
    if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
    const tag = `call-${call.id}`;
    const options = {
      body: `${call.callerName || ''} ${zh() ? '正在呼叫你，点击返回接听' : 'is calling. Tap to answer'}`,
      icon: '/quad-film-icon-192.png',
      badge: '/quad-film-icon-192.png',
      tag,
      renotify: true,
      requireInteraction: true,
      data: { callId: call.id, url: `/?incoming-call=${encodeURIComponent(call.id)}` }
    };
    try {
      const registration = await navigator.serviceWorker?.ready;
      if (registration?.showNotification) {
        await registration.showNotification(zh() ? 'QUaD 语音来电' : 'QUaD voice call', options);
        return;
      }
    } catch {}
    try {
      incomingNotification?.close?.();
      incomingNotification = new Notification(zh() ? 'QUaD 语音来电' : 'QUaD voice call', options);
      incomingNotification.onclick = () => {
        incomingNotification?.close?.();
        window.focus();
      };
    } catch {}
  }

  function closeIncomingNotification(callId = '') {
    incomingNotification?.close?.();
    incomingNotification = null;
    if (!callId) return;
    navigator.serviceWorker?.getRegistration?.().then(registration => {
      registration?.getNotifications?.({ tag:`call-${callId}` }).then(items => items.forEach(item => item.close())).catch(() => {});
    }).catch(() => {});
  }

  function stopIncomingAlerts(callId = incomingCallId) {
    stopRinging();
    stopTitleAlert();
    closeIncomingNotification(callId);
  }

  function unlockIncomingAlerts() {
    try {
      ringContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (ringContext.state === 'suspended') ringContext.resume().catch(() => {});
    } catch {}
    enableNotifications().catch(() => {});
  }

  function renderCall(call, statusText) {
    const layer = ensureLayer();
    const translationLanguage = preferredTranslationLanguage();
    const translationDetailsVisible = translationSelectionOpen || translationEnabled;
    layer.innerHTML = `<div class="quad-call-backdrop" onpointerdown="QuadCalls.resumeTranslationAudio()"><section class="quad-call-card active">
      <button class="quad-call-minimize" onclick="QuadCalls.toggleMinimize()">—</button>
      <div class="quad-call-quality" id="quadCallQuality">● ${esc(statusText || (zh() ? '正在连接…' : 'Connecting…'))}</div>
      <div class="quad-call-avatar">🎧</div><div class="quad-call-video-stage" id="quadCallVideoStage" hidden></div><h2 id="quadCallName">${esc(nameFor(call))}</h2><time id="quadCallTime">00:00</time>
      <div class="quad-call-translation-controls"><div class="quad-call-mode-switch"><button id="quadCallDirectMode" class="${translationDetailsVisible ? '' : 'active'}" type="button" onclick="QuadCalls.setTranslationMode('direct')">📞 ${zh() ? '直接通话' : 'Direct call'}</button><button id="quadCallTranslateMode" class="${translationEnabled ? 'active' : ''}" type="button" onclick="QuadCalls.setTranslationMode('translate')">🌐 ${zh() ? '开启翻译' : 'Start translation'}</button></div><div id="quadCallTranslationDetails" ${translationDetailsVisible ? '' : 'hidden'}><strong>${zh() ? '请选择你需要听到的语言' : 'Choose the language you want to hear'}</strong><div class="quad-call-language-options">
        ${[['zh','中文'],['en','English']].map(([value, label]) => `<button type="button" class="quad-call-language-option ${translationEnabled && translationLanguage === value ? 'active' : ''}" data-language="${value}" onclick="QuadCalls.setTranslationLanguage('${value}')">${label}</button>`).join('')}
      </div><small id="quadCallTranslationStatus">${translationEnabled ? (zh() ? `实时翻译已选择：${translationLanguageName(translationLanguage)}` : `Live translation selected: ${translationLanguageName(translationLanguage)}`) : (zh() ? '点选语言后开始翻译' : 'Tap a language to start translation')}</small><div class="quad-call-translation-transcript" id="quadCallTranslationTranscript"><div><b>${zh() ? '我说的话' : 'My speech'}</b><span id="quadCallSourceTranscript"></span></div><div><b>${zh() ? '对方译文' : 'Their translation'}</b><span id="quadCallTranslatedTranscript"></span></div></div></div></div>
      <div id="quadCallRemoteAudio"></div>
      <footer><button id="quadMute" onclick="QuadCalls.toggleMute()">🎙️<br>${zh() ? '静音' : 'Mute'}</button><button id="quadCamera" onclick="QuadCalls.toggleCamera()">${cameraEnabled ? '📷' : '🎥'}<br>${cameraEnabled ? (zh() ? '关闭视频' : 'Stop video') : (zh() ? '开启摄像头' : 'Start video')}</button><button onclick="QuadCalls.pickParticipants(true)">➕<br>${zh() ? '添加成员' : 'Add'}</button><button class="quad-call-end" onclick="QuadCalls.end()">📞<br>${zh() ? '挂断' : 'End'}</button></footer>
    </section></div>`;
    const audioHost = document.getElementById('quadCallRemoteAudio');
    room?.remoteParticipants?.forEach(participant => participant.audioTrackPublications.forEach(publication => {
      const track = publication.track;
      if (!track || document.querySelector(`#quadCallRemoteAudio audio[data-participant-identity="${CSS.escape(participant.identity)}"]`)) return;
      const element = track.attach(); element.autoplay = true; element.dataset.participantIdentity = participant.identity;
      element.muted = translationEnabled;
      audioHost?.appendChild(element);
    }));
    translationSidecars.forEach(sidecar => { if (sidecar.audio && audioHost && !sidecar.audio.isConnected) audioHost.appendChild(sidecar.audio); });
    room?.remoteParticipants?.forEach(participant => participant.videoTrackPublications?.forEach(publication => {
      if (publication.track && !publication.isMuted) attachVideoTrack(publication.track, participant.identity, false);
    }));
    const cameraSource = window.LivekitClient?.Track?.Source?.Camera || 'camera';
    const localCamera = room?.localParticipant?.getTrackPublication?.(cameraSource);
    if (cameraEnabled && localCamera?.track) attachVideoTrack(localCamera.track, me()?.id || 'local', true);
    updateCameraButton();
  }

  async function join(call) {
    if (!window.LivekitClient) throw new Error(zh() ? '实时通话组件加载失败' : 'Call component did not load');
    translationEnabled = false;
    translationSelectionOpen = false;
    cameraEnabled = false;
    cameraBusy = false;
    clearTimeout(weakVideoTimer); weakVideoTimer = null;
    stopAllTranslationSidecars();
    activeCall = call; incomingCallId = ''; renderCall(call);
    const credentials = await request(`/api/voice-calls/${encodeURIComponent(call.id)}/token`, { method: 'POST', body: '{}' });
    room = new LivekitClient.Room({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true });
    room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === LivekitClient.Track.Kind.Video) {
        attachVideoTrack(track, participant.identity, false);
        return;
      }
      if (track.kind !== LivekitClient.Track.Kind.Audio) return;
      const element = track.attach(); element.autoplay = true; element.dataset.participantIdentity = participant.identity; document.getElementById('quadCallRemoteAudio')?.appendChild(element);
      if (translationEnabled) scheduleTranslationRefresh();
    });
    room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      track.detach().forEach(element => element.remove());
      if (track.kind === LivekitClient.Track.Kind.Video) removeVideoElements(participant?.identity || '');
      [...translationSidecars.entries()].filter(([, sidecar]) => sidecar.sourceTrackId === track.mediaStreamTrack?.id).forEach(([key]) => stopTranslationSidecar(key));
      if (track.kind === LivekitClient.Track.Kind.Audio && translationEnabled) scheduleTranslationRefresh();
    });
    room.on(LivekitClient.RoomEvent.TrackMuted, (publication, participant) => {
      if (publication.kind === LivekitClient.Track.Kind.Video) removeVideoElements(participant?.identity || '');
    });
    room.on(LivekitClient.RoomEvent.TrackUnmuted, (publication, participant) => {
      if (publication.kind === LivekitClient.Track.Kind.Video && publication.track) attachVideoTrack(publication.track, participant?.identity || '', false);
    });
    room.on(LivekitClient.RoomEvent.ParticipantConnected, () => {
      markAnswered();
      if (cameraEnabled && room.remoteParticipants.size > 1) {
        toggleCamera(true, zh() ? '加入第三位成员后已自动关闭视频，继续使用纯语音' : 'Video was turned off when a third participant joined; continuing with audio').catch(() => {});
      }
      updateCameraButton();
      if (translationEnabled) scheduleTranslationRefresh();
    });
    room.on(LivekitClient.RoomEvent.ParticipantDisconnected, participant => {
      participant.audioTrackPublications.forEach(publication => publication.track?.detach().forEach(element => element.remove()));
      document.querySelectorAll(`#quadCallRemoteAudio audio[data-participant-identity="${CSS.escape(participant.identity)}"]`).forEach(element => element.remove());
      removeVideoElements(participant.identity);
      updateCameraButton();
      if (translationEnabled) scheduleTranslationRefresh();
    });
    room.on(LivekitClient.RoomEvent.ConnectionQualityChanged, quality => {
      const label = document.getElementById('quadCallQuality');
      if (label) label.textContent = quality === 'excellent' ? (zh() ? '● 网络优秀' : '● Excellent network') : quality === 'good' ? (zh() ? '● 网络良好' : '● Good network') : quality === 'poor' ? (zh() ? '● 网络较弱' : '● Weak network') : (zh() ? '● 通话中' : '● In call');
      protectAudioOnWeakNetwork(quality);
    });
    room.on(LivekitClient.RoomEvent.Disconnected, () => { if (activeCall) finishLocal(false); });
    await room.connect(credentials.url, credentials.token, { autoSubscribe: true });
    await room.localParticipant.setMicrophoneEnabled(true, { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 });
    if (call.callerUserId !== me()?.id || room.remoteParticipants.size > 0) markAnswered();
    else {
      const label = document.getElementById('quadCallQuality'); if (label) label.textContent = zh() ? '● 正在呼叫，等待对方接听…' : '● Calling…';
      clearTimeout(ringTimeout); ringTimeout = setTimeout(() => { if (activeCall && !callStartedAt) end(); }, 45_000);
    }
  }

  function markAnswered() {
    if (callStartedAt) return; stopIncomingAlerts(activeCall?.id); clearTimeout(ringTimeout); ringTimeout = null;
    callStartedAt = activeCall?.answeredAt ? Date.parse(activeCall.answeredAt) : Date.now();
    if (!Number.isFinite(callStartedAt)) callStartedAt = Date.now();
    startTimer(); const label = document.getElementById('quadCallQuality'); if (label) label.textContent = zh() ? '● 通话中' : '● In call';
  }

  function startTimer() {
    clearInterval(timer); timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - callStartedAt) / 1000); const el = document.getElementById('quadCallTime');
      if (el) el.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }, 1000);
  }

  async function start(userIds) {
    try {
      if (!window.LivekitClient?.isBrowserSupported?.()) {
        alert(zh()
          ? '当前浏览器已限制 WebRTC，无法建立实时通话。\n\nSafari 用户：请打开“Safari 浏览器 > 此网站的设置”，关闭本网站的“启用锁定模式”，并将麦克风设为“允许”。也可使用最新版 Chrome。'
          : 'This browser is blocking WebRTC. In Safari, open Settings for This Website, disable Lockdown Mode for this site, and allow Microphone. You can also use the latest Chrome.');
        return;
      }
      const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(id => id && id !== me()?.id))];
      if (!ids.length) return alert(zh() ? '没有可呼叫的员工' : 'No staff to call');
      if (actionBusy) return;
      actionBusy = true;
      const people = callUsers();
      const preview = { id:'', callerUserId:me()?.id, callerName:me()?.name || me()?.email || '', participantUserIds:ids,
        participantNames:ids.map(id => people.find(person => person.id === id)?.name || '').filter(Boolean), status:'preparing' };
      activeCall = preview;
      renderCall(preview, zh() ? '正在发起通话…' : 'Starting call…');
      const result = await request('/api/voice-calls', { method:'POST', body:JSON.stringify({ participantUserIds: ids }) });
      if (result.data) replaceStore(result.data); activeCall = result.call; renderCall(result.call, zh() ? '正在呼叫…' : 'Calling…'); await join(result.call);
    } catch (error) {
      const failedCall = activeCall;
      finishLocal();
      if (failedCall?.id) {
        try { await request(`/api/voice-calls/${encodeURIComponent(failedCall.id)}`, { method:'PUT', body:JSON.stringify({ action:'end' }) }); } catch {}
      }
      const unsupported = /not supported|webrtc/i.test(String(error?.message || error));
      alert(unsupported && zh()
        ? '当前浏览器禁用了 WebRTC。请关闭该网站的 Safari 锁定模式，允许麦克风后重试，或改用最新版 Chrome。'
        : (error.message || error));
    } finally {
      actionBusy = false;
    }
  }

  function pickParticipants(addToCall = false) {
    const unavailable = new Set(addToCall ? [activeCall?.callerUserId, ...(activeCall?.participantUserIds || [])] : [me()?.id]);
    const people = callUsers().filter(item => item.id !== me()?.id && item.active !== false && !unavailable.has(item.id));
    if (!people.length) return alert(zh() ? '没有其他可选员工' : 'No other staff available');
    const layer = addToCall ? ensurePickerLayer() : ensureLayer();
    layer.innerHTML = `<div class="quad-call-backdrop"><section class="quad-call-card picker">
      <button class="quad-call-close" onclick="QuadCalls.${addToCall ? 'closePicker' : 'close'}()">×</button>
      <h2>${addToCall ? (zh() ? '添加通话成员' : 'Add participants') : (zh() ? '选择通话员工' : 'Choose participants')}</h2>
      <p>${zh() ? '只有勾选的员工会收到来电' : 'Only selected staff will be called'}</p>
      <div class="quad-call-people">${people.map(person => `<label><input type="checkbox" value="${esc(person.id)}"><span>${esc(person.name || person.email)}</span></label>`).join('')}</div>
      <footer><button onclick="QuadCalls.${addToCall ? 'closePicker' : 'close'}()">${zh() ? '取消' : 'Cancel'}</button><button class="quad-call-accept" onclick="QuadCalls.confirmParticipants(${addToCall ? 'true' : 'false'})">${addToCall ? (zh() ? '邀请加入' : 'Invite') : (zh() ? '发起通话' : 'Call')}</button></footer>
    </section></div>`;
  }

  async function confirmParticipants(addToCall) {
    const pickerRoot = addToCall ? ensurePickerLayer() : ensureLayer();
    const selected = [...pickerRoot.querySelectorAll('.quad-call-people input:checked')].map(input => input.value);
    if (!selected.length) return alert(zh() ? '请至少选择一位员工' : 'Select at least one person');
    if (!addToCall) return start(selected);
    try {
      const result = await request(`/api/voice-calls/${encodeURIComponent(activeCall.id)}`, { method:'PUT', body:JSON.stringify({ action:'invite', participantUserIds:selected }) });
      if (result.data) replaceStore(result.data);
      activeCall = result.call;
      closePicker();
      const name = document.getElementById('quadCallName'); if (name) name.textContent = nameFor(activeCall);
      const quality = document.getElementById('quadCallQuality'); if (quality) quality.textContent = zh() ? '● 已邀请新成员，原通话保持连接' : '● Participants invited; call remains connected';
    } catch (error) { alert(error.message || error); closePicker(); }
  }

  function restoreCall() { if (activeCall) renderCall(activeCall, zh() ? '通话中' : 'In call'); else close(); }
  function refreshCallLanguage() {
    if (!activeCall || !document.querySelector('.quad-call-card.active')) return;
    const sourceText = document.getElementById('quadCallSourceTranscript')?.textContent || '';
    const translatedText = document.getElementById('quadCallTranslatedTranscript')?.textContent || '';
    renderCall(activeCall, zh() ? '通话中' : 'In call');
    const source = document.getElementById('quadCallSourceTranscript');
    const translated = document.getElementById('quadCallTranslatedTranscript');
    if (source) source.textContent = sourceText;
    if (translated) translated.textContent = translatedText;
    if (sourceText || translatedText) document.getElementById('quadCallTranslationTranscript').hidden = false;
  }
  function closePicker() { const layer = document.getElementById('quadCallPickerLayer'); if (layer) layer.innerHTML = ''; }

  async function accept(callId) {
    if (actionBusy) return;
    actionBusy = true;
    try {
      stopIncomingAlerts(callId);
      const call = calls().find(item => item.id === callId);
      if (call) { activeCall = call; renderCall(call, zh() ? '正在接听…' : 'Answering…'); }
      const result = await request(`/api/voice-calls/${encodeURIComponent(callId)}`, { method:'PUT', body:JSON.stringify({ action:'accept' }) });
      if (result.data) replaceStore(result.data); await join(result.call);
    } catch (error) { incomingCallId = ''; activeCall = null; ensureLayer().innerHTML = ''; alert(error.message || error); }
    finally { actionBusy = false; }
  }

  async function decline(callId) {
    stopIncomingAlerts(callId);
    const declinedCall = calls().find(item => item.id === callId);
    if (declinedCall) {
      calls().filter(item => waitingForMe(item) && item.callerUserId === declinedCall.callerUserId).forEach(item => {
        item.participantStatuses = { ...(item.participantStatuses || {}), [me()?.id]: 'declined' };
      });
      declinedCallerUntil.set(declinedCall.callerUserId, Date.now() + 15_000);
    }
    incomingCallId = '';
    ensureLayer().innerHTML = '';
    try { const result = await request(`/api/voice-calls/${encodeURIComponent(callId)}`, { method:'PUT', body:JSON.stringify({ action:'decline' }) }); if (result.data) replaceStore(result.data); }
    catch (error) { alert(error.message || error); }
  }

  async function end() {
    const call = activeCall; finishLocal(false); if (!call) return;
    try {
      const result = await request(`/api/voice-calls/${encodeURIComponent(call.id)}`, { method:'PUT', body:JSON.stringify({ action:'leave' }) });
      if (result.data) replaceStore(result.data);
      activeCall = null;
      ensureLayer().innerHTML = '';
    }
    catch (error) { alert(error.message || error); }
  }

  function finishLocal(clear = true) {
    clearInterval(timer); timer = null; stopIncomingAlerts(activeCall?.id); clearTimeout(ringTimeout); ringTimeout = null; clearTimeout(weakVideoTimer); weakVideoTimer = null; callStartedAt = 0; translationEnabled = false; translationSelectionOpen = false; cameraEnabled = false; cameraBusy = false; stopLocalSpeechRecognition(true); stopAllTranslationSidecars(); if (room) { const old = room; room = null; old.disconnect().catch?.(() => {}); }
    if (clear) activeCall = null; closePicker(); ensureLayer().innerHTML = '';
  }

  async function toggleMute() {
    if (!room) return; const enabled = room.localParticipant.isMicrophoneEnabled; await room.localParticipant.setMicrophoneEnabled(!enabled);
    const button = document.getElementById('quadMute'); if (button) button.innerHTML = `${enabled ? '🔇' : '🎙️'}<br>${enabled ? (zh() ? '恢复' : 'Unmute') : (zh() ? '静音' : 'Mute')}`;
  }

  function toggleMinimize() {
    const layer = ensureLayer(); const minimized = layer.classList.toggle('minimized');
    const button = layer.querySelector('.quad-call-minimize'); if (button) button.textContent = minimized ? (zh() ? '展开' : 'Open') : '—';
    if (minimized && document.getElementById('modal')?.classList.contains('message-modal-open') && typeof window.closeModal === 'function') window.closeModal();
  }

  function close() { stopIncomingAlerts(incomingCallId || activeCall?.id); incomingCallId = ''; activeCall = null; closePicker(); ensureLayer().innerHTML = ''; }

  async function poll() {
    if (polling || !me()?.id) return; polling = true; lastPollAt = Date.now();
    try {
      const result = await request('/api/voice-calls');
      if (Array.isArray(result.calls)) store().voiceCalls = result.calls;
      // Always look for a call that is ringing this user before considering an
      // older outgoing/active call. Otherwise a stale call can mask a new one.
      const waitingCall = calls().find(waitingForMe);
      if (waitingCall) renderIncoming(waitingCall);
      else if (incomingCallId) {
        stopIncomingAlerts(incomingCallId);
        incomingCallId = '';
        if (!activeCall) ensureLayer().innerHTML = '';
      }
      const current = activeCall && calls().find(item => item.id === activeCall.id);
      if (current && (['declined', 'ended', 'missed'].includes(current.status) || current.participantStatuses?.[me()?.id] === 'left')) finishLocal();
    } catch {} finally { polling = false; }
  }

  function requestPoll() {
    if (!me()?.id) return;
    const wait = Math.max(0, 3000 - (Date.now() - lastPollAt));
    if (!wait) return poll();
    if (pollWakeTimer) return;
    pollWakeTimer = setTimeout(() => {
      pollWakeTimer = null;
      poll();
    }, wait);
  }

  function startPolling() {
    if (pollTimer) return;
    // EventSource delivers call changes immediately. Polling is only a safety
    // net for a dropped realtime connection. The old 250 ms interval issued
    // about 240 requests per minute per open device even when nobody was on a
    // call, which could overload the server and make unrelated screens freeze.
    pollTimer = setInterval(poll, 5000);
  }

  function receiveVoiceEvent(event) {
    const payload = event?.detail || {};
    const call = payload.detail?.call;
    if (!call?.id || !me()?.id) return;
    const list = calls();
    const index = list.findIndex(item => item.id === call.id);
    if (index >= 0) list[index] = call; else list.push(call);
    if (waitingForMe(call)) renderIncoming(call);
    else if (incomingCallId === call.id) {
      stopIncomingAlerts(call.id);
      incomingCallId = '';
      if (!activeCall) ensureLayer().innerHTML = '';
    }
    if (activeCall?.id === call.id) {
      activeCall = call;
      const name = document.getElementById('quadCallName'); if (name) name.textContent = nameFor(call);
    }
    if (activeCall?.id === call.id && (['declined', 'ended', 'missed'].includes(call.status) || call.participantStatuses?.[me()?.id] === 'left')) finishLocal();
  }

  async function enableNotifications() {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  }

  window.QuadCalls = { start, accept, decline, end, toggleMute, toggleCamera, toggleMinimize, setTranslationMode, setTranslationLanguage, resumeTranslationAudio, close, poll, enableNotifications, pickParticipants, confirmParticipants, restoreCall, closePicker,
    startDirect: userId => start(userId),
    startGroup: () => pickParticipants(false) };
  if (window.__QUAD_CALL_TEST_MODE__) {
    window.QuadCalls.__test = {
      setRoom: value => { room = value; },
      translationState: () => ({ enabled:translationEnabled, selectionOpen:translationSelectionOpen, generation:translationGeneration, sidecars:[...translationSidecars.values()].map(sidecar => ({ targetLanguage:preferredTranslationLanguage(), participantIdentity:sidecar.participantIdentity, connectionState:sidecar.pc?.connectionState || '', stopping:Boolean(sidecar.stopping) })) }),
      cameraState: () => ({ enabled:cameraEnabled, busy:cameraBusy }),
      normalizeCallTranscript
    };
  }
  window.addEventListener('quad-voice-call', receiveVoiceEvent);
  document.addEventListener('pointerdown', unlockIncomingAlerts, { once:true, capture:true });
  document.addEventListener('keydown', unlockIncomingAlerts, { once:true, capture:true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) requestPoll(); });
  window.addEventListener('focus', requestPoll);
  window.addEventListener('pageshow', requestPoll);
  new MutationObserver(records => {
    if (records.some(record => record.attributeName === 'lang')) refreshCallLanguage();
  }).observe(document.documentElement, { attributes:true, attributeFilter:['lang'] });
  navigator.serviceWorker?.addEventListener?.('message', event => {
    if (event.data?.type === 'quad-incoming-call') {
      window.focus();
      requestPoll();
    }
  });
  startPolling();
  setTimeout(requestPoll, 1200);
})();
