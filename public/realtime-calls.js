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
  let recording = null;
  let recordingChunks = [];
  let recordingContext = null;
  let recordingDestination = null;
  const recordingSources = new Map();
  const translationSidecars = new Map();
  const declinedCallerUntil = new Map();

  const context = () => window.getQuadCallContext?.() || {};
  const me = () => context().user || null;
  const store = () => context().state || {};
  const replaceStore = value => window.setQuadCallState?.(value);
  const request = (...args) => window.api(...args);
  const zh = () => window.lang !== 'en';
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
  const autoRecordKey = () => `filmShopCloud.autoAiCallRecord.${me()?.id || 'device'}`;
  const autoRecordEnabled = () => {
    try { return localStorage.getItem(autoRecordKey()) === '1'; } catch { return false; }
  };
  const setAutoRecordEnabled = enabled => {
    try { localStorage.setItem(autoRecordKey(), enabled ? '1' : '0'); } catch {}
  };
  const translationLanguageKey = () => `filmShopCloud.callTranslationLanguage.${me()?.id || 'device'}`;
  const preferredTranslationLanguage = () => {
    try {
      const value = String(localStorage.getItem(translationLanguageKey()) || 'off');
      return ['off', 'zh', 'en', 'es', 'pt'].includes(value) ? value : 'off';
    } catch { return 'off'; }
  };
  const translationLanguageName = value => ({ zh:'中文', en:'English', es:'Español', pt:'Português' }[value] || (zh() ? '关闭' : 'Off'));

  function updateTranslationStatus(message, tone = '') {
    const status = document.getElementById('quadCallTranslationStatus');
    if (!status) return;
    status.textContent = message || '';
    status.dataset.tone = tone;
  }

  function updateTranslationTranscript(kind, delta, participantIdentity = '') {
    const target = document.getElementById(kind === 'source' ? 'quadCallSourceTranscript' : 'quadCallTranslatedTranscript');
    if (!target || !delta) return;
    const currentSpeaker = target.dataset.participant || '';
    if (currentSpeaker && currentSpeaker !== participantIdentity) target.textContent = '';
    target.dataset.participant = participantIdentity;
    target.textContent = `${target.textContent || ''}${delta}`.slice(-800);
    const transcript = document.getElementById('quadCallTranslationTranscript');
    if (transcript) transcript.hidden = false;
  }

  function setOriginalAudioMuted(muted, participantIdentity = '') {
    document.querySelectorAll('#quadCallRemoteAudio audio[data-participant-identity]').forEach(element => {
      if (!participantIdentity || element.dataset.participantIdentity === participantIdentity) element.muted = muted;
    });
  }

  function stopTranslationSidecar(key) {
    const sidecar = translationSidecars.get(key);
    if (!sidecar) return;
    try {
      if (sidecar.events?.readyState === 'open') sidecar.events.send(JSON.stringify({ type:'session.close' }));
    } catch {}
    setTimeout(() => {
      try { sidecar.pc?.close(); } catch {}
      try { sidecar.track?.stop(); } catch {}
      try { sidecar.audio?.remove(); } catch {}
    }, 250);
    translationSidecars.delete(key);
  }

  function stopAllTranslationSidecars() {
    [...translationSidecars.keys()].forEach(stopTranslationSidecar);
    setOriginalAudioMuted(false);
  }

  async function startTranslationTrack(mediaStreamTrack, participantIdentity = '') {
    const targetLanguage = preferredTranslationLanguage();
    if (!mediaStreamTrack || targetLanguage === 'off') return;
    const key = `${participantIdentity || 'remote'}:${mediaStreamTrack.id}`;
    if (translationSidecars.has(key)) return;
    const sidecar = { pc:null, events:null, track:null, audio:null, participantIdentity, sourceTrackId:mediaStreamTrack.id };
    translationSidecars.set(key, sidecar);
    try {
      updateTranslationStatus(zh() ? `正在连接 ${translationLanguageName(targetLanguage)} 实时翻译…` : `Connecting live ${translationLanguageName(targetLanguage)} translation…`);
      const secret = await request('/api/realtime-translation/session', {
        method:'POST', body:JSON.stringify({ targetLanguage })
      });
      if (preferredTranslationLanguage() !== targetLanguage || !translationSidecars.has(key)) return stopTranslationSidecar(key);
      const pc = new RTCPeerConnection();
      sidecar.pc = pc;
      sidecar.track = mediaStreamTrack.clone();
      const sourceStream = new MediaStream([sidecar.track]);
      pc.addTrack(sidecar.track, sourceStream);
      const translatedAudio = new Audio();
      translatedAudio.autoplay = true;
      translatedAudio.playsInline = true;
      translatedAudio.dataset.translationParticipant = participantIdentity;
      sidecar.audio = translatedAudio;
      document.getElementById('quadCallRemoteAudio')?.appendChild(translatedAudio);
      pc.ontrack = event => {
        translatedAudio.srcObject = event.streams[0];
        translatedAudio.play().catch(() => updateTranslationStatus(zh() ? '请点一下通话画面以播放翻译语音' : 'Tap the call screen to play translated audio', 'warning'));
      };
      const events = pc.createDataChannel('oai-events');
      sidecar.events = events;
      events.onopen = () => updateTranslationStatus(zh() ? `实时翻译已开启：${translationLanguageName(targetLanguage)}` : `Live translation: ${translationLanguageName(targetLanguage)}`, 'ready');
      events.onmessage = ({ data }) => {
        try {
          const event = JSON.parse(data);
          if (event.type === 'session.input_transcript.delta') updateTranslationTranscript('source', event.delta, participantIdentity);
          if (event.type === 'session.output_transcript.delta') updateTranslationTranscript('translated', event.delta, participantIdentity);
          if (event.type === 'error') updateTranslationStatus(zh() ? `实时翻译暂时不可用：${event.error?.message || '未知错误'}` : `Translation unavailable: ${event.error?.message || 'Unknown error'}`, 'error');
        } catch {}
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const answer = await fetch('https://api.openai.com/v1/realtime/translations/calls', {
        method:'POST',
        headers:{ Authorization:`Bearer ${secret.value}`, 'Content-Type':'application/sdp' },
        body:offer.sdp
      });
      if (!answer.ok) throw new Error((await answer.text()).slice(0, 220) || `OpenAI ${answer.status}`);
      await pc.setRemoteDescription({ type:'answer', sdp:await answer.text() });
      setOriginalAudioMuted(true, participantIdentity);
    } catch (error) {
      stopTranslationSidecar(key);
      setOriginalAudioMuted(false, participantIdentity);
      updateTranslationStatus(zh() ? `实时翻译连接失败：${error.message || error}` : `Live translation failed: ${error.message || error}`, 'error');
    }
  }

  async function setTranslationLanguage(value) {
    const targetLanguage = ['zh', 'en', 'es', 'pt'].includes(String(value)) ? String(value) : 'off';
    try { localStorage.setItem(translationLanguageKey(), targetLanguage); } catch {}
    stopAllTranslationSidecars();
    const source = document.getElementById('quadCallSourceTranscript');
    const translated = document.getElementById('quadCallTranslatedTranscript');
    if (source) source.textContent = '';
    if (translated) translated.textContent = '';
    const transcript = document.getElementById('quadCallTranslationTranscript');
    if (transcript) transcript.hidden = targetLanguage === 'off';
    if (targetLanguage === 'off') {
      updateTranslationStatus(zh() ? '实时翻译已关闭' : 'Live translation is off');
      return;
    }
    updateTranslationStatus(zh() ? `正在连接 ${translationLanguageName(targetLanguage)} 实时翻译…` : `Connecting ${translationLanguageName(targetLanguage)} translation…`);
    const tracks = [];
    room?.remoteParticipants?.forEach(participant => participant.audioTrackPublications.forEach(publication => {
      if (publication.track?.mediaStreamTrack) tracks.push([publication.track.mediaStreamTrack, participant.identity]);
    }));
    if (!tracks.length) updateTranslationStatus(zh() ? '实时翻译已准备，等待对方说话' : 'Translation ready; waiting for the other speaker');
    await Promise.all(tracks.map(([track, identity]) => startTranslationTrack(track, identity)));
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
    const automatic = autoRecordEnabled();
    const translationLanguage = preferredTranslationLanguage();
    layer.innerHTML = `<div class="quad-call-backdrop"><section class="quad-call-card active">
      <button class="quad-call-minimize" onclick="QuadCalls.toggleMinimize()">—</button>
      <div class="quad-call-quality" id="quadCallQuality">● ${esc(statusText || (zh() ? '正在连接…' : 'Connecting…'))}</div>
      <div class="quad-call-avatar">🎧</div><h2 id="quadCallName">${esc(nameFor(call))}</h2><time id="quadCallTime">00:00</time>
      <div id="quadCallRecording" style="${call.recording ? '' : 'display:none'};color:#ff6b6b;font-weight:800;margin:.5rem 0">🔴 ${zh() ? 'AI 正在自动记录' : 'AI is recording automatically'}</div>
      <div class="quad-call-translation-controls"><label>${zh() ? '我需要听到' : 'Translate others to'}<select id="quadCallTranslationLanguage" onchange="QuadCalls.setTranslationLanguage(this.value)">
        <option value="off" ${translationLanguage === 'off' ? 'selected' : ''}>${zh() ? '关闭实时翻译' : 'Translation off'}</option>
        <option value="zh" ${translationLanguage === 'zh' ? 'selected' : ''}>中文</option>
        <option value="en" ${translationLanguage === 'en' ? 'selected' : ''}>English</option>
        <option value="es" ${translationLanguage === 'es' ? 'selected' : ''}>Español</option>
        <option value="pt" ${translationLanguage === 'pt' ? 'selected' : ''}>Português</option>
      </select></label><small id="quadCallTranslationStatus">${translationLanguage === 'off' ? (zh() ? '选择语言后，远端语音将发送到 OpenAI 实时翻译' : 'Choose a language to translate remote audio with OpenAI') : (zh() ? '实时翻译将在接通后自动连接' : 'Translation will connect after answer')}</small></div>
      <div class="quad-call-translation-transcript" id="quadCallTranslationTranscript" ${translationLanguage === 'off' ? 'hidden' : ''}><div><b>${zh() ? '对方原话' : 'Original'}</b><span id="quadCallSourceTranscript"></span></div><div><b>${zh() ? '实时译文' : 'Translation'}</b><span id="quadCallTranslatedTranscript"></span></div></div>
      <div id="quadCallRemoteAudio"></div>
      <footer><button id="quadMute" onclick="QuadCalls.toggleMute()">🎙️<br>${zh() ? '静音' : 'Mute'}</button>${call.callerUserId === me()?.id ? `<button id="quadRecord" onclick="QuadCalls.toggleAutoRecord()">${automatic ? '🔴' : '⚪️'}<br>${automatic ? (zh() ? '自动记录' : 'Auto record') : (zh() ? 'AI记录' : 'AI record')}</button>` : ''}<button onclick="QuadCalls.pickParticipants(true)">➕<br>${zh() ? '添加成员' : 'Add'}</button><button class="quad-call-end" onclick="QuadCalls.end()">📞<br>${zh() ? '挂断' : 'End'}</button></footer>
    </section></div>`;
    const audioHost = document.getElementById('quadCallRemoteAudio');
    translationSidecars.forEach(sidecar => { if (sidecar.audio && audioHost && !sidecar.audio.isConnected) audioHost.appendChild(sidecar.audio); });
  }

  async function join(call) {
    if (!window.LivekitClient) throw new Error(zh() ? '实时通话组件加载失败' : 'Call component did not load');
    activeCall = call; incomingCallId = ''; renderCall(call);
    const credentials = await request(`/api/voice-calls/${encodeURIComponent(call.id)}/token`, { method: 'POST', body: '{}' });
    room = new LivekitClient.Room({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true });
    room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind !== LivekitClient.Track.Kind.Audio) return;
      const element = track.attach(); element.autoplay = true; element.dataset.participantIdentity = participant.identity; document.getElementById('quadCallRemoteAudio')?.appendChild(element);
      connectRecordingTrack(track.mediaStreamTrack);
      if (preferredTranslationLanguage() !== 'off') startTranslationTrack(track.mediaStreamTrack, participant.identity);
    });
    room.on(LivekitClient.RoomEvent.TrackUnsubscribed, track => {
      track.detach().forEach(element => element.remove());
      [...translationSidecars.entries()].filter(([, sidecar]) => sidecar.sourceTrackId === track.mediaStreamTrack?.id).forEach(([key]) => stopTranslationSidecar(key));
    });
    room.on(LivekitClient.RoomEvent.ParticipantConnected, () => markAnswered());
    room.on(LivekitClient.RoomEvent.ParticipantDisconnected, participant => {
      participant.audioTrackPublications.forEach(publication => publication.track?.detach().forEach(element => element.remove()));
      document.querySelectorAll(`#quadCallRemoteAudio audio[data-participant-identity="${CSS.escape(participant.identity)}"]`).forEach(element => element.remove());
    });
    room.on(LivekitClient.RoomEvent.ConnectionQualityChanged, quality => {
      const label = document.getElementById('quadCallQuality');
      if (label) label.textContent = quality === 'excellent' ? '● 网络优秀' : quality === 'good' ? '● 网络良好' : quality === 'poor' ? '● 网络较弱' : '● 通话中';
    });
    room.on(LivekitClient.RoomEvent.Disconnected, () => { if (activeCall) finishLocal(false); });
    await room.connect(credentials.url, credentials.token, { autoSubscribe: true });
    await room.localParticipant.setMicrophoneEnabled(true, { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 });
    const localAudio = room.localParticipant.getTrackPublication?.(LivekitClient.Track.Source.Microphone)?.track;
    connectRecordingTrack(localAudio?.mediaStreamTrack);
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
    if (activeCall?.callerUserId === me()?.id && autoRecordEnabled()) startAiRecord();
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
    const call = activeCall; const wasRecording = Boolean(recording); const audioDataUrl = await stopAiRecord(); finishLocal(false); if (!call) return;
    try {
      if (wasRecording) await request(`/api/voice-calls/${encodeURIComponent(call.id)}`, { method:'PUT', body:JSON.stringify({ action:'recording', enabled:false }) }).catch(() => null);
      const result = await request(`/api/voice-calls/${encodeURIComponent(call.id)}`, { method:'PUT', body:JSON.stringify({ action:'leave' }) });
      if (result.data) replaceStore(result.data);
      if (audioDataUrl) showAiProcessing(); else showSummary(call.id);
    }
    catch (error) { alert(error.message || error); }
    if (audioDataUrl) transcribeAndSummarize(call.id, audioDataUrl);
  }

  function connectRecordingTrack(mediaStreamTrack) {
    if (!recordingDestination || !mediaStreamTrack || recordingSources.has(mediaStreamTrack.id)) return;
    try {
      const source = recordingContext.createMediaStreamSource(new MediaStream([mediaStreamTrack]));
      source.connect(recordingDestination); recordingSources.set(mediaStreamTrack.id, source);
    } catch {}
  }

  async function startAiRecord() {
    if (!room || !activeCall || recording) return;
    try {
      await request(`/api/voice-calls/${encodeURIComponent(activeCall.id)}`, { method:'PUT', body:JSON.stringify({ action:'recording', enabled:true }) });
      recordingContext = new (window.AudioContext || window.webkitAudioContext)();
      recordingDestination = recordingContext.createMediaStreamDestination(); recordingSources.clear(); recordingChunks = [];
      const localAudio = room.localParticipant.getTrackPublication?.(LivekitClient.Track.Source.Microphone)?.track;
      connectRecordingTrack(localAudio?.mediaStreamTrack);
      room.remoteParticipants.forEach(participant => participant.audioTrackPublications.forEach(publication => connectRecordingTrack(publication.track?.mediaStreamTrack)));
      const mimeType = ['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(type => MediaRecorder.isTypeSupported(type)) || '';
      recording = new MediaRecorder(recordingDestination.stream, { mimeType, audioBitsPerSecond:32000 });
      recording.ondataavailable = event => { if (event.data?.size) recordingChunks.push(event.data); };
      recording.start(1000); activeCall.recording = true;
      const indicator = document.getElementById('quadCallRecording'); if (indicator) indicator.style.display = '';
      updateAutoRecordButton();
    } catch (error) { alert(error.message || error); }
  }

  async function toggleAutoRecord() {
    const enabled = !autoRecordEnabled();
    setAutoRecordEnabled(enabled);
    updateAutoRecordButton();
    if (enabled && room && activeCall && callStartedAt) await startAiRecord();
    const indicator = document.getElementById('quadCallRecording');
    if (!enabled && recording && indicator) indicator.textContent = zh() ? '🔴 本次通话继续记录；以后通话已关闭自动记录' : '🔴 This call is still recording; auto record is off for future calls';
  }

  function updateAutoRecordButton() {
    const button = document.getElementById('quadRecord');
    if (!button) return;
    const enabled = autoRecordEnabled();
    button.innerHTML = `${enabled ? '🔴' : '⚪️'}<br>${enabled ? (recording ? (zh() ? '自动记录中' : 'Auto recording') : (zh() ? '自动记录' : 'Auto record')) : (zh() ? 'AI记录' : 'AI record')}`;
  }

  async function stopAiRecord() {
    if (!recording) return '';
    const current = recording; recording = null;
    return new Promise(resolve => {
      current.onstop = () => {
        const blob = new Blob(recordingChunks, { type:(current.mimeType || 'audio/webm').split(';')[0] });
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => resolve(''); reader.readAsDataURL(blob);
        recordingContext?.close?.(); recordingContext = null; recordingDestination = null; recordingSources.clear(); recordingChunks = [];
      };
      current.stop();
    });
  }

  async function transcribeAndSummarize(callId, dataUrl) {
    try {
      const transcript = await request('/api/ai-boss/transcribe', { method:'POST', body:JSON.stringify({ dataUrl, language:zh() ? 'zh' : 'en' }) });
      const result = await request(`/api/voice-calls/${encodeURIComponent(callId)}/summary`, { method:'POST', body:JSON.stringify({ notes:transcript.text, createTask:false }) });
      if (result.data) replaceStore(result.data);
      showAiComplete(callId);
    } catch (error) {
      showSummary(callId, zh() ? `自动整理失败：${error.message || error}。可以在这里补充通话要点。` : `Automatic summary failed: ${error.message || error}. Add call notes here.`);
    }
  }

  function showAiProcessing() {
    activeCall = null;
    ensureLayer().innerHTML = `<div class="quad-call-backdrop"><section class="quad-call-card summary"><div class="quad-call-pulse">🤖</div><h2>${zh() ? 'AI 正在整理通话记录' : 'AI is organizing the call'}</h2><p>${zh() ? '正在保存通话分析；不会自动生成督办任务。' : 'Saving the call analysis. No task will be created automatically.'}</p></section></div>`;
  }

  function showAiComplete(callId) {
    ensureLayer().innerHTML = `<div class="quad-call-backdrop"><section class="quad-call-card summary"><button class="quad-call-close" onclick="QuadCalls.close()">×</button><div class="quad-call-pulse">✅</div><h2>${zh() ? '通话分析已保存' : 'Call analysis saved'}</h2><p>${zh() ? '系统没有自动创建任务。请核对后再决定是否生成督办任务。' : 'No task was created automatically. Review first, then create one only if needed.'}</p><footer><button onclick="QuadCalls.close()">${zh() ? '完成' : 'Done'}</button><button class="quad-call-accept" onclick="QuadCalls.createTaskFromCall('${callId}')">${zh() ? '确认生成督办任务' : 'Create task'}</button></footer></section></div>`;
  }

  function finishLocal(clear = true) {
    clearInterval(timer); timer = null; stopIncomingAlerts(activeCall?.id); clearTimeout(ringTimeout); ringTimeout = null; callStartedAt = 0; stopAllTranslationSidecars(); if (room) { const old = room; room = null; old.disconnect().catch?.(() => {}); }
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

  function showSummary(callId, message = '') {
    activeCall = null; const layer = ensureLayer();
    layer.innerHTML = `<div class="quad-call-backdrop"><section class="quad-call-card summary"><button class="quad-call-close" onclick="QuadCalls.close()">×</button>
      <h2>${zh() ? '整理通话结果' : 'Summarize call'}</h2><p>${esc(message || (zh() ? '这次通话没有开启自动记录，可以输入要点让 AI 整理。' : 'Auto recording was not enabled for this call. Enter notes for AI follow-up.'))}</p>
      <textarea id="quadCallNotes" placeholder="${zh() ? '例：张三明天下午5点前核对仓库并回报结果…' : 'Call notes…'}"></textarea>
      <p class="quad-call-safe-note">${zh() ? '保存后只生成 AI 分析，不会自动创建任务。' : 'This saves AI analysis only and does not create a task.'}</p>
      <footer><button onclick="QuadCalls.close()">${zh() ? '稍后' : 'Later'}</button><button class="quad-call-accept" onclick="QuadCalls.summarize('${callId}')">${zh() ? '保存 AI 分析' : 'Save AI analysis'}</button></footer>
    </section></div>`;
  }

  async function summarize(callId) {
    const notes = document.getElementById('quadCallNotes')?.value.trim(); if (!notes) return alert(zh() ? '请先输入通话要点' : 'Enter call notes');
    try {
      const result = await request(`/api/voice-calls/${encodeURIComponent(callId)}/summary`, { method:'POST', body:JSON.stringify({ notes, createTask:false }) });
      if (result.data) replaceStore(result.data); showAiComplete(callId);
    } catch (error) { alert(error.message || error); }
  }

  async function createTaskFromCall(callId) {
    try {
      const result = await request(`/api/voice-calls/${encodeURIComponent(callId)}/summary`, { method:'POST', body:JSON.stringify({ createTask:true }) });
      if (result.data) replaceStore(result.data);
      close();
      alert(result.task ? (zh() ? '督办任务已生成' : 'Task created') : (zh() ? '没有生成任务' : 'No task was created'));
    } catch (error) { alert(error.message || error); }
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
    if (activeCall?.id === call.id) {
      const indicator = document.getElementById('quadCallRecording');
      if (indicator) {
        indicator.style.display = call.recording ? '' : 'none';
        if (call.recording) indicator.textContent = zh() ? '🔴 AI 正在自动记录' : '🔴 AI is recording automatically';
      }
    }
    if (activeCall?.id === call.id && (['declined', 'ended', 'missed'].includes(call.status) || call.participantStatuses?.[me()?.id] === 'left')) finishLocal();
  }

  async function enableNotifications() {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  }

  window.QuadCalls = { start, accept, decline, end, toggleMute, toggleMinimize, toggleAutoRecord, setTranslationLanguage, summarize, createTaskFromCall, showSummary, close, poll, enableNotifications, pickParticipants, confirmParticipants, restoreCall, closePicker,
    startDirect: userId => start(userId),
    startGroup: () => pickParticipants(false) };
  window.addEventListener('quad-voice-call', receiveVoiceEvent);
  document.addEventListener('pointerdown', unlockIncomingAlerts, { once:true, capture:true });
  document.addEventListener('keydown', unlockIncomingAlerts, { once:true, capture:true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) requestPoll(); });
  window.addEventListener('focus', requestPoll);
  window.addEventListener('pageshow', requestPoll);
  navigator.serviceWorker?.addEventListener?.('message', event => {
    if (event.data?.type === 'quad-incoming-call') {
      window.focus();
      requestPoll();
    }
  });
  startPolling();
  setTimeout(requestPoll, 1200);
})();
