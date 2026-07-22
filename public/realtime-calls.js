(function () {
  'use strict';
  let room = null;
  let activeCall = null;
  let incomingCallId = '';
  let callStartedAt = 0;
  let timer = null;
  let ringTimer = null;
  let ringContext = null;
  let ringTimeout = null;
  let polling = false;
  let actionBusy = false;
  let recording = null;
  let recordingChunks = [];
  let recordingContext = null;
  let recordingDestination = null;
  const recordingSources = new Map();

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
    const status = call.participantStatuses?.[me()?.id];
    return status ? ['ringing', 'invited'].includes(status) : call.status === 'ringing';
  };

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
    const layer = ensureLayer();
    layer.innerHTML = `<div class="quad-call-backdrop"><section class="quad-call-card incoming">
      <div class="quad-call-pulse">📞</div><small>${zh() ? '实时语音来电' : 'Incoming voice call'}</small>
      <h2>${esc(call.callerName)}</h2><p>${zh() ? '正在呼叫你…' : 'is calling you…'}</p>
      <footer><button class="quad-call-decline" onclick="QuadCalls.decline('${call.id}')">拒绝</button><button class="quad-call-accept" onclick="QuadCalls.accept('${call.id}')">接听</button></footer>
    </section></div>`;
    try { navigator.vibrate?.([300, 200, 300, 200, 500]); } catch {}
    startRinging();
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification(zh() ? 'QUaD 语音来电' : 'QUaD voice call', { body: `${call.callerName || ''} ${zh() ? '正在呼叫你' : 'is calling'}`, icon: '/quad-film-icon-192.png', tag: `call-${call.id}`, requireInteraction: true });
    }
  }

  function ringOnce() {
    try {
      ringContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ringContext.createOscillator(); const gain = ringContext.createGain();
      oscillator.frequency.value = 720; gain.gain.setValueAtTime(.0001, ringContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.16, ringContext.currentTime + .02); gain.gain.exponentialRampToValueAtTime(.0001, ringContext.currentTime + .5);
      oscillator.connect(gain); gain.connect(ringContext.destination); oscillator.start(); oscillator.stop(ringContext.currentTime + .55);
    } catch {}
  }

  function startRinging() { stopRinging(); ringOnce(); ringTimer = setInterval(ringOnce, 1500); }
  function stopRinging() { clearInterval(ringTimer); ringTimer = null; }

  function renderCall(call, statusText) {
    const layer = ensureLayer();
    layer.innerHTML = `<div class="quad-call-backdrop"><section class="quad-call-card active">
      <button class="quad-call-minimize" onclick="QuadCalls.toggleMinimize()">—</button>
      <div class="quad-call-quality" id="quadCallQuality">● ${esc(statusText || (zh() ? '正在连接…' : 'Connecting…'))}</div>
      <div class="quad-call-avatar">🎧</div><h2 id="quadCallName">${esc(nameFor(call))}</h2><time id="quadCallTime">00:00</time>
      <div id="quadCallRecording" style="${call.recording ? '' : 'display:none'};color:#ff6b6b;font-weight:800;margin:.5rem 0">🔴 ${zh() ? 'AI 通话记录已开启' : 'AI recording enabled'}</div>
      <div id="quadCallRemoteAudio"></div>
      <footer><button id="quadMute" onclick="QuadCalls.toggleMute()">🎙️<br>${zh() ? '静音' : 'Mute'}</button>${call.callerUserId === me()?.id ? `<button id="quadRecord" onclick="QuadCalls.startAiRecord()">🔴<br>${zh() ? 'AI记录' : 'AI record'}</button>` : ''}<button onclick="QuadCalls.pickParticipants(true)">➕<br>${zh() ? '添加成员' : 'Add'}</button><button class="quad-call-end" onclick="QuadCalls.end()">📞<br>${zh() ? '挂断' : 'End'}</button></footer>
    </section></div>`;
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
    });
    room.on(LivekitClient.RoomEvent.TrackUnsubscribed, track => {
      track.detach().forEach(element => element.remove());
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
    if (callStartedAt) return; stopRinging(); clearTimeout(ringTimeout); ringTimeout = null;
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
  function closePicker() { const layer = document.getElementById('quadCallPickerLayer'); if (layer) layer.innerHTML = ''; }

  async function accept(callId) {
    if (actionBusy) return;
    actionBusy = true;
    try {
      stopRinging();
      const call = calls().find(item => item.id === callId);
      if (call) { activeCall = call; renderCall(call, zh() ? '正在接听…' : 'Answering…'); }
      const result = await request(`/api/voice-calls/${encodeURIComponent(callId)}`, { method:'PUT', body:JSON.stringify({ action:'accept' }) });
      if (result.data) replaceStore(result.data); await join(result.call);
    } catch (error) { incomingCallId = ''; activeCall = null; ensureLayer().innerHTML = ''; alert(error.message || error); }
    finally { actionBusy = false; }
  }

  async function decline(callId) {
    stopRinging();
    try { const result = await request(`/api/voice-calls/${encodeURIComponent(callId)}`, { method:'PUT', body:JSON.stringify({ action:'decline' }) }); if (result.data) replaceStore(result.data); }
    catch (error) { alert(error.message || error); }
    incomingCallId = ''; ensureLayer().innerHTML = '';
  }

  async function end() {
    const call = activeCall; const audioDataUrl = await stopAiRecord(); finishLocal(false); if (!call) return;
    try { const result = await request(`/api/voice-calls/${encodeURIComponent(call.id)}`, { method:'PUT', body:JSON.stringify({ action:'leave' }) }); if (result.data) replaceStore(result.data); showSummary(call.id); }
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
    if (!confirm(zh() ? '开启后，本次通话声音会被录制并发送给 AI 生成记录。请确认已告知所有通话成员。' : 'This records the call for AI notes. Confirm all participants have been informed.')) return;
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
      const button = document.getElementById('quadRecord'); if (button) { button.disabled = true; button.innerHTML = `🔴<br>${zh() ? '记录中' : 'Recording'}`; }
    } catch (error) { alert(error.message || error); }
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
    const notes = document.getElementById('quadCallNotes'); if (notes) notes.placeholder = zh() ? 'AI 正在转写通话，请稍候…' : 'AI is transcribing the call…';
    try {
      const transcript = await request('/api/ai-boss/transcribe', { method:'POST', body:JSON.stringify({ dataUrl, language:zh() ? 'zh' : 'en' }) });
      if (notes) notes.value = transcript.text || '';
      const result = await request(`/api/voice-calls/${encodeURIComponent(callId)}/summary`, { method:'POST', body:JSON.stringify({ notes:transcript.text, createTask:true }) });
      if (result.data) replaceStore(result.data); close(); alert(result.task ? (zh() ? 'AI 通话记录和督办任务已生成' : 'AI notes and task created') : (zh() ? 'AI 通话记录已生成' : 'AI notes created'));
    } catch (error) { if (notes) notes.placeholder = zh() ? '自动转写失败，可在这里补充通话要点…' : 'Transcription failed; enter notes…'; alert(error.message || error); }
  }

  function finishLocal(clear = true) {
    clearInterval(timer); timer = null; stopRinging(); clearTimeout(ringTimeout); ringTimeout = null; callStartedAt = 0; if (room) { const old = room; room = null; old.disconnect().catch?.(() => {}); }
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

  function showSummary(callId) {
    activeCall = null; const layer = ensureLayer();
    layer.innerHTML = `<div class="quad-call-backdrop"><section class="quad-call-card summary"><button class="quad-call-close" onclick="QuadCalls.close()">×</button>
      <h2>${zh() ? '整理通话结果' : 'Summarize call'}</h2><p>${zh() ? '为保护员工隐私，系统默认不录音。请输入本次通话要点，AI 会整理并生成督办任务。' : 'Calls are not recorded by default. Enter notes for AI follow-up.'}</p>
      <textarea id="quadCallNotes" placeholder="${zh() ? '例：张三明天下午5点前核对仓库并回报结果…' : 'Call notes…'}"></textarea>
      <label><input id="quadCallCreateTask" type="checkbox" checked> ${zh() ? '同时生成智能督办任务' : 'Create a supervision task'}</label>
      <footer><button onclick="QuadCalls.close()">${zh() ? '稍后' : 'Later'}</button><button class="quad-call-accept" onclick="QuadCalls.summarize('${callId}')">${zh() ? 'AI 整理' : 'AI summarize'}</button></footer>
    </section></div>`;
  }

  async function summarize(callId) {
    const notes = document.getElementById('quadCallNotes')?.value.trim(); if (!notes) return alert(zh() ? '请先输入通话要点' : 'Enter call notes');
    try {
      const result = await request(`/api/voice-calls/${encodeURIComponent(callId)}/summary`, { method:'POST', body:JSON.stringify({ notes, createTask:document.getElementById('quadCallCreateTask')?.checked !== false }) });
      if (result.data) replaceStore(result.data); close(); alert(result.task ? (zh() ? '已生成通话摘要和智能督办任务' : 'Summary and task created') : (zh() ? '通话摘要已保存' : 'Summary saved'));
    } catch (error) { alert(error.message || error); }
  }

  function close() { incomingCallId = ''; activeCall = null; closePicker(); ensureLayer().innerHTML = ''; }

  async function poll() {
    if (polling || !me()?.id) return; polling = true;
    try {
      const result = await request('/api/voice-calls');
      if (Array.isArray(result.calls)) store().voiceCalls = result.calls;
      const call = activeForMe();
      if (waitingForMe(call)) renderIncoming(call);
      const current = activeCall && calls().find(item => item.id === activeCall.id);
      if (current && (['declined', 'ended', 'missed'].includes(current.status) || current.participantStatuses?.[me()?.id] === 'left')) finishLocal();
    } catch {} finally { polling = false; }
  }

  function receiveVoiceEvent(event) {
    const payload = event?.detail || {};
    const call = payload.detail?.call;
    if (!call?.id || !me()?.id) return;
    const list = calls();
    const index = list.findIndex(item => item.id === call.id);
    if (index >= 0) list[index] = call; else list.push(call);
    if (waitingForMe(call)) renderIncoming(call);
    if (activeCall?.id === call.id) {
      activeCall = call;
      const name = document.getElementById('quadCallName'); if (name) name.textContent = nameFor(call);
    }
    if (activeCall?.id === call.id && call.recording) { const indicator = document.getElementById('quadCallRecording'); if (indicator) indicator.style.display = ''; }
    if (activeCall?.id === call.id && (['declined', 'ended', 'missed'].includes(call.status) || call.participantStatuses?.[me()?.id] === 'left')) finishLocal();
  }

  async function enableNotifications() {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  }

  window.QuadCalls = { start, accept, decline, end, toggleMute, toggleMinimize, startAiRecord, summarize, showSummary, close, poll, enableNotifications, pickParticipants, confirmParticipants, restoreCall, closePicker,
    startDirect: userId => start(userId),
    startGroup: () => pickParticipants(false) };
  window.addEventListener('quad-voice-call', receiveVoiceEvent);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  setTimeout(poll, 1200);
})();
