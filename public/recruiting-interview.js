(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const invite = params.get('invite') || '';
  const interviewId = params.get('interview') || '';
  const authToken = localStorage.getItem('filmShopCloud.token') || '';
  let info = null, room = null, joining = false;
  const request = async (url, options = {}) => {
    const headers = { 'Content-Type':'application/json', ...(options.headers || {}) };
    if (options.auth) headers.Authorization = `Bearer ${authToken}`;
    const response = await fetch(url, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `请求失败 (${response.status})`);
    return body;
  };
  const when = value => value ? new Intl.DateTimeFormat(navigator.language || 'zh-CN', { dateStyle:'full', timeStyle:'short', timeZone:'America/Los_Angeles' }).format(new Date(value)) : '';
  function error(message) { $('error').textContent = message || ''; $('connectionBadge').textContent = '无法连接'; $('connectionBadge').className = 'badge warn'; }
  function ready(data, recruiter = false) {
    info = data; $('welcomeTitle').textContent = recruiter ? `进入与 ${data.candidateName} 的视频面试` : `${data.candidateName}，欢迎参加 QUAD FILM 视频面试`;
    $('welcomeMeta').textContent = `${when(data.startsAt)} · 预计 ${data.durationMinutes || 30} 分钟`;
    $('consentRow').hidden = recruiter; $('consent').checked = recruiter; $('join').disabled = !recruiter;
    $('join').textContent = recruiter ? '以面试官身份进入' : data.status === 'joined' ? '重新连接面试' : '进入视频面试';
    $('connectionBadge').textContent = '链接有效';
  }
  async function boot() {
    try {
      if (invite) return ready(await request(`/api/public/recruiting-video/invite/${encodeURIComponent(invite)}`));
      if (interviewId && authToken) return ready(await request(`/api/recruiting/interviews/${encodeURIComponent(interviewId)}/video-token`, { method:'POST', auth:true }), true);
      throw new Error('缺少有效的面试链接');
    } catch (cause) { error(cause.message); }
  }
  function attachRemote(track, participant) {
    const element = track.attach();
    if (track.kind === LivekitClient.Track.Kind.Video) {
      $('remoteStage').querySelector('.waiting')?.remove(); element.autoplay = true; element.playsInline = true; $('remoteStage').appendChild(element);
      $('participantState').textContent = `${participant?.name || '另一位参与者'} 已加入`;
    } else if (track.kind === LivekitClient.Track.Kind.Audio) {
      element.autoplay = true; $('audioStage').appendChild(element); element.play().catch(() => {});
    }
  }
  async function tokenForJoin() {
    if (!invite) return info;
    const stored = JSON.parse(localStorage.getItem(`quadInterview.${info.interviewId}`) || 'null');
    if (info.status === 'joined' && stored?.sessionSecret) return request('/api/public/recruiting-video/session', { method:'POST', body:JSON.stringify({ interviewId:info.interviewId, sessionSecret:stored.sessionSecret }) });
    const data = await request(`/api/public/recruiting-video/invite/${encodeURIComponent(invite)}/exchange`, { method:'POST', body:JSON.stringify({ consent:true }) });
    localStorage.setItem(`quadInterview.${data.interviewId}`, JSON.stringify({ sessionSecret:data.sessionSecret, expiresAt:data.expiresAt }));
    return data;
  }
  async function join() {
    if (joining || (!$('consent').checked && invite)) return;
    if (!window.LivekitClient?.isBrowserSupported?.()) return error('此浏览器不支持安全视频通话，请使用最新版 Chrome、Safari 或 Edge。');
    joining = true; $('join').disabled = true; $('join').textContent = '正在连接…';
    try {
      const access = await tokenForJoin();
      room = new LivekitClient.Room({ adaptiveStream:true, dynacast:true, disconnectOnPageLeave:true });
      room.on(LivekitClient.RoomEvent.TrackSubscribed, attachRemote);
      room.on(LivekitClient.RoomEvent.TrackUnsubscribed, track => track.detach().forEach(node => node.remove()));
      room.on(LivekitClient.RoomEvent.ParticipantConnected, participant => { $('participantState').textContent = `${participant.name || '另一位参与者'} 已加入`; });
      room.on(LivekitClient.RoomEvent.Reconnecting, () => { $('connectionBadge').textContent = '正在重连'; $('connectionBadge').className = 'badge warn'; });
      room.on(LivekitClient.RoomEvent.Reconnected, () => { $('connectionBadge').textContent = '通话中'; $('connectionBadge').className = 'badge live'; });
      await room.connect(access.url, access.token);
      await room.localParticipant.setCameraEnabled(true);
      await room.localParticipant.setMicrophoneEnabled(true, { echoCancellation:true, noiseSuppression:true, autoGainControl:true });
      const local = room.localParticipant.getTrackPublication(LivekitClient.Track.Source.Camera)?.track;
      if (local) { const video = local.attach(); video.muted = true; video.playsInline = true; $('localStage').appendChild(video); }
      $('welcome').hidden = true; $('roomView').hidden = false; $('connectionBadge').textContent = '通话中'; $('connectionBadge').className = 'badge live';
    } catch (cause) { error(cause.message); $('join').disabled = false; $('join').textContent = '重新尝试'; }
    finally { joining = false; }
  }
  $('consent').addEventListener('change', () => { if (invite) $('join').disabled = !$('consent').checked || !info; });
  $('join').addEventListener('click', join);
  $('mic').addEventListener('click', async () => { if (!room) return; const on = room.localParticipant.isMicrophoneEnabled; await room.localParticipant.setMicrophoneEnabled(!on); $('mic').textContent = on ? '🔇 打开麦克风' : '🎙️ 关闭麦克风'; });
  $('camera').addEventListener('click', async () => { if (!room) return; const on = room.localParticipant.isCameraEnabled; await room.localParticipant.setCameraEnabled(!on); $('camera').textContent = on ? '🚫 打开摄像头' : '🎥 关闭摄像头'; });
  $('leave').addEventListener('click', async () => { await room?.disconnect(); room = null; location.reload(); });
  boot();
})();
