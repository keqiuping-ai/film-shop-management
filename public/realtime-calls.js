(function () {
  'use strict';
  let room = null;
  let activeCall = null;
  let incomingCallId = '';
  let callStartedAt = 0;
  let timer = null;
  let polling = false;

  const context = () => window.getQuadCallContext?.() || {};
  const me = () => context().user || null;
  const store = () => context().state || {};
  const replaceStore = value => window.setQuadCallState?.(value);
  const request = (...args) => window.api(...args);
  const zh = () => window.lang !== 'en';
  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const callUsers = () => store().messageUsers || store().users || [];
  const calls = () => store().voiceCalls || [];
  const activeForMe = () => calls().find(call => ['ringing', 'active'].includes(call.status) && (call.callerUserId === me()?.id || (call.participantUserIds || []).includes(me()?.id)));

  function ensureLayer() {
    let layer = document.getElementById('quadCallLayer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'quadCallLayer';
      document.body.appendChild(layer);
    }
    return layer;
  }

  function nameFor(call) {
    if (call.callerUserId === me()?.id) return (call.participantNames || []).join('、') || (zh() ? '员工' : 'Staff');
    return call.callerName || (zh() ? '员工' : 'Staff');
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
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification(zh() ? 'QUaD 语音来电' : 'QUaD voice call', { body: `${call.callerName || ''} ${zh() ? '正在呼叫你' : 'is calling'}`, icon: '/quad-film-icon-192.png', tag: `call-${call.id}`, requireInteraction: true });
    }
  }

  function renderCall(call, statusText) {
    const layer = ensureLayer();
    layer.innerHTML = `<div class="quad-call-backdrop"><section class="quad-call-card active">
      <div class="quad-call-quality" id="quadCallQuality">● ${esc(statusText || (zh() ? '正在连接…' : 'Connecting…'))}</div>
      <div class="quad-call-avatar">🎧</div><h2>${esc(nameFor(call))}</h2><time id="quadCallTime">00:00</time>
      <div id="quadCallRemoteAudio"></div>
      <footer><button id="quadMute" onclick="QuadCalls.toggleMute()">🎙️<br>${zh() ? '静音' : 'Mute'}</button><button class="quad-call-end" onclick="QuadCalls.end()">📞<br>${zh() ? '挂断' : 'End'}</button></footer>
    </section></div>`;
  }

  async function join(call) {
    if (!window.LivekitClient) throw new Error(zh() ? '实时通话组件加载失败' : 'Call component did not load');
    activeCall = call; incomingCallId = ''; renderCall(call);
    const credentials = await request(`/api/voice-calls/${encodeURIComponent(call.id)}/token`, { method: 'POST', body: '{}' });
    room = new LivekitClient.Room({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true });
    room.on(LivekitClient.RoomEvent.TrackSubscribed, track => {
      if (track.kind !== LivekitClient.Track.Kind.Audio) return;
      const element = track.attach(); element.autoplay = true; document.getElementById('quadCallRemoteAudio')?.appendChild(element);
    });
    room.on(LivekitClient.RoomEvent.ConnectionQualityChanged, quality => {
      const label = document.getElementById('quadCallQuality');
      if (label) label.textContent = quality === 'excellent' ? '● 网络优秀' : quality === 'good' ? '● 网络良好' : quality === 'poor' ? '● 网络较弱' : '● 通话中';
    });
    room.on(LivekitClient.RoomEvent.Disconnected, () => { if (activeCall) finishLocal(false); });
    await room.connect(credentials.url, credentials.token, { autoSubscribe: true });
    await room.localParticipant.setMicrophoneEnabled(true, { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 });
    callStartedAt = Date.now(); startTimer();
    const label = document.getElementById('quadCallQuality'); if (label) label.textContent = '● 已连接';
  }

  function startTimer() {
    clearInterval(timer); timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - callStartedAt) / 1000); const el = document.getElementById('quadCallTime');
      if (el) el.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }, 1000);
  }

  async function start(userIds) {
    try {
      const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(id => id && id !== me()?.id))];
      if (!ids.length) return alert(zh() ? '没有可呼叫的员工' : 'No staff to call');
      const result = await request('/api/voice-calls', { method:'POST', body:JSON.stringify({ participantUserIds: ids }) });
      if (result.data) replaceStore(result.data); activeCall = result.call; renderCall(result.call, zh() ? '正在呼叫…' : 'Calling…'); await join(result.call);
    } catch (error) { finishLocal(false); alert(error.message || error); }
  }

  async function accept(callId) {
    try {
      const result = await request(`/api/voice-calls/${encodeURIComponent(callId)}`, { method:'PUT', body:JSON.stringify({ action:'accept' }) });
      if (result.data) replaceStore(result.data); await join(result.call);
    } catch (error) { incomingCallId = ''; ensureLayer().innerHTML = ''; alert(error.message || error); }
  }

  async function decline(callId) {
    try { const result = await request(`/api/voice-calls/${encodeURIComponent(callId)}`, { method:'PUT', body:JSON.stringify({ action:'decline' }) }); if (result.data) replaceStore(result.data); }
    catch (error) { alert(error.message || error); }
    incomingCallId = ''; ensureLayer().innerHTML = '';
  }

  async function end() {
    const call = activeCall; finishLocal(false); if (!call) return;
    try { const result = await request(`/api/voice-calls/${encodeURIComponent(call.id)}`, { method:'PUT', body:JSON.stringify({ action:'end' }) }); if (result.data) replaceStore(result.data); showSummary(call.id); }
    catch (error) { alert(error.message || error); }
  }

  function finishLocal(clear = true) {
    clearInterval(timer); timer = null; if (room) { const old = room; room = null; old.disconnect().catch?.(() => {}); }
    if (clear) activeCall = null; ensureLayer().innerHTML = '';
  }

  async function toggleMute() {
    if (!room) return; const enabled = room.localParticipant.isMicrophoneEnabled; await room.localParticipant.setMicrophoneEnabled(!enabled);
    const button = document.getElementById('quadMute'); if (button) button.innerHTML = `${enabled ? '🔇' : '🎙️'}<br>${enabled ? (zh() ? '恢复' : 'Unmute') : (zh() ? '静音' : 'Mute')}`;
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

  function close() { incomingCallId = ''; activeCall = null; ensureLayer().innerHTML = ''; }

  async function poll() {
    if (polling || !me()?.id) return; polling = true;
    try {
      const result = await request('/api/voice-calls');
      if (Array.isArray(result.calls)) store().voiceCalls = result.calls;
      const call = activeForMe();
      if (call?.status === 'ringing' && call.callerUserId !== me()?.id) renderIncoming(call);
      if (activeCall && ['declined', 'ended', 'missed'].includes(calls().find(item => item.id === activeCall.id)?.status)) finishLocal();
    } catch {} finally { polling = false; }
  }

  async function enableNotifications() {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  }

  window.QuadCalls = { start, accept, decline, end, toggleMute, summarize, showSummary, close, poll, enableNotifications,
    startDirect: userId => start(userId),
    startGroup: () => start(callUsers().filter(item => item.id !== me()?.id && item.active !== false).map(item => item.id)) };
  setInterval(poll, 2500); document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); }); setTimeout(poll, 1200);
})();
