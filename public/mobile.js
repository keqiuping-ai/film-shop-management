const APP_TIMEZONE = 'America/Los_Angeles';
let token = localStorage.getItem('filmShopCloud.token') || '';
let state = null;
let user = null;
let tab = 'chat';
let activeUserId = '';
let syncTimer = null;
let eventSource = null;
let syncInFlight = false;
let realtimeRetryTimer = null;
let lastRenderSnapshot = '';
let lastUserInputAt = 0;
let markReadTimer = null;
const chatDrafts = new Map();
let leaveDraft = {};
let deferredInstall = null;
let messageRecorder = null;
let messageAudioChunks = [];
let lang = localStorage.getItem('filmShopCloud.lang') || 'zh';
const MAX_MESSAGE_ATTACHMENT_BYTES = 8 * 1024 * 1024;

const I18N = {
  zh: {
    languageToggle: 'English',
    loginTitle: 'QUAD FILM 员工端',
    loginSub: '聊天、打卡、请假审批',
    email: '邮箱',
    password: '密码',
    login: '登录',
    loginHint: '手机浏览器打开后，可添加到主屏幕作为客户端使用。',
    employeeApp: '员工端',
    employee: '员工',
    refresh: '刷新',
    chat: '留言',
    clock: '打卡',
    leave: '请假',
    me: '我的',
    requestFailed: '请求失败',
    noStaff: '还没有可留言的员工账号。',
    noMessages: '还没有留言。',
    image: '图片',
    file: '文件',
    voice: '语音',
    stop: '停止',
    send: '发送',
    messagePlaceholder: '输入留言内容...',
    read: '已读',
    unread: '未读',
    self: '我',
    play: '播放',
    pause: '暂停',
    voiceMessage: '语音留言',
    filePrefix: '文件：',
    close: '关闭',
    confirmDeleteMessage: '确定删除/撤销这条留言吗？',
    fileReadFailed: '读取文件失败',
    attachmentLimit: '附件不能超过 8MB。',
    voiceLimit: '语音不能超过 8MB。',
    micDenied: '无法录音，请确认手机浏览器允许麦克风权限。',
    mobileClock: '手机定位打卡',
    clockConsent: '我同意本次打卡使用手机定位',
    clockPrivacy: '系统只在你主动点击“上班打卡/下班打卡”时获取一次定位，用于核对是否在公司附近打卡；不会后台持续跟踪。',
    clockBrowserHint: '浏览器还会弹出系统定位权限提示；如果不同意，系统不会打卡。',
    clockIn: '上班打卡',
    clockOut: '下班打卡',
    clockRecords: '打卡记录',
    noClockRecords: '暂无打卡记录',
    clockInShort: '上班',
    clockOutShort: '下班',
    accuracy: '精度',
    insideOffice: '公司范围内',
    outsideOffice: '公司范围外',
    distanceOffice: '距公司',
    meter: '米',
    distanceUnknown: '未计算公司距离',
    viewMap: '查看地图位置',
    noGeolocation: '这台手机不支持定位',
    needConsent: '请先勾选同意本次打卡使用手机定位。',
    clockInSuccess: '上班打卡成功',
    clockOutSuccess: '下班打卡成功',
    locationFailed: '定位失败，请确认浏览器允许定位权限',
    submitLeave: '提交请假',
    leaveType: '请假类型',
    personalLeave: '事假',
    sickLeave: '病假',
    compLeave: '调休',
    annualLeave: '年假',
    startDate: '开始日期',
    startTime: '开始时间',
    endDate: '结束日期',
    endTime: '结束时间',
    leaveHours: '请假小时数',
    reason: '原因',
    reasonPlaceholder: '请填写请假原因',
    leaveApprovals: '请假审批/记录',
    myLeaveRecords: '我的请假记录',
    noLeaveRecords: '暂无请假记录',
    approved: '已批准',
    rejected: '已拒绝',
    pendingApproval: '待审批',
    approve: '批准',
    reject: '拒绝',
    reviewedBy: '审批人：',
    hoursUnit: '小时',
    to: '至',
    leaveSubmitted: '请假申请已提交',
    reviewNotePrompt: '审批备注（可空）：',
    myAccount: '我的账号',
    mobileUrl: '手机端地址',
    installDesktop: '安装到桌面',
    installHint: '安装后手机桌面会显示 QUAD FILM 图标，打开直接进入员工端。',
    logout: '退出登录',
    iosInstall: 'iPhone/iPad 安装方法：点击 Safari 底部“分享”按钮，然后选择“添加到主屏幕”。图标会使用 QUAD FILM 黑色品牌标。',
    browserInstall: '如果浏览器没有弹出安装窗口，请打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。'
  },
  en: {
    languageToggle: '中文',
    loginTitle: 'QUAD FILM Staff',
    loginSub: 'Messages, clock-in, leave approval',
    email: 'Email',
    password: 'Password',
    login: 'Log In',
    loginHint: 'Open this in your phone browser and add it to the Home Screen.',
    employeeApp: 'Staff App',
    employee: 'Staff',
    refresh: 'Refresh',
    chat: 'Messages',
    clock: 'Clock',
    leave: 'Leave',
    me: 'Me',
    requestFailed: 'Request failed',
    noStaff: 'No staff accounts are available for messaging.',
    noMessages: 'No messages yet.',
    image: 'Image',
    file: 'File',
    voice: 'Voice',
    stop: 'Stop',
    send: 'Send',
    messagePlaceholder: 'Type a message...',
    read: 'Read',
    unread: 'Unread',
    self: 'Me',
    play: 'Play',
    pause: 'Pause',
    voiceMessage: 'Voice message',
    filePrefix: 'File: ',
    close: 'Close',
    confirmDeleteMessage: 'Delete or revoke this message?',
    fileReadFailed: 'Failed to read file',
    attachmentLimit: 'Attachment cannot exceed 8MB.',
    voiceLimit: 'Voice message cannot exceed 8MB.',
    micDenied: 'Cannot record. Please allow microphone access in your mobile browser.',
    mobileClock: 'Mobile Location Clock',
    clockConsent: 'I agree to use my phone location for this clock record',
    clockPrivacy: 'The system only gets your location once when you tap Clock In/Clock Out to verify whether you are near the company. It does not track location in the background.',
    clockBrowserHint: 'Your browser will also ask for location permission. If you do not allow it, the clock record will not be submitted.',
    clockIn: 'Clock In',
    clockOut: 'Clock Out',
    clockRecords: 'Clock Records',
    noClockRecords: 'No clock records',
    clockInShort: 'In',
    clockOutShort: 'Out',
    accuracy: 'Accuracy',
    insideOffice: 'Inside company area',
    outsideOffice: 'Outside company area',
    distanceOffice: 'Distance to company',
    meter: 'm',
    distanceUnknown: 'Company distance not calculated',
    viewMap: 'View map location',
    noGeolocation: 'This phone does not support location',
    needConsent: 'Please check the location consent box first.',
    clockInSuccess: 'Clock-in successful',
    clockOutSuccess: 'Clock-out successful',
    locationFailed: 'Location failed. Please allow browser location permission.',
    submitLeave: 'Submit Leave',
    leaveType: 'Leave Type',
    personalLeave: 'Personal',
    sickLeave: 'Sick',
    compLeave: 'Comp Time',
    annualLeave: 'Annual',
    startDate: 'Start Date',
    startTime: 'Start Time',
    endDate: 'End Date',
    endTime: 'End Time',
    leaveHours: 'Leave Hours',
    reason: 'Reason',
    reasonPlaceholder: 'Enter leave reason',
    leaveApprovals: 'Leave Approval / Records',
    myLeaveRecords: 'My Leave Records',
    noLeaveRecords: 'No leave records',
    approved: 'Approved',
    rejected: 'Rejected',
    pendingApproval: 'Pending',
    approve: 'Approve',
    reject: 'Reject',
    reviewedBy: 'Reviewed by: ',
    hoursUnit: 'hours',
    to: 'to',
    leaveSubmitted: 'Leave request submitted',
    reviewNotePrompt: 'Review note (optional): ',
    myAccount: 'My Account',
    mobileUrl: 'Mobile URL',
    installDesktop: 'Install to Home Screen',
    installHint: 'After installation, your phone Home Screen will show the QUAD FILM icon and open directly to the staff app.',
    logout: 'Log Out',
    iosInstall: 'iPhone/iPad: tap the Safari Share button, then choose Add to Home Screen. The icon will use the black QUAD FILM brand icon.',
    browserInstall: 'If the install prompt does not appear, open the browser menu and choose Install App or Add to Home Screen.'
  }
};

function t(key) {
  return I18N[lang]?.[key] || I18N.zh[key] || key;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function applyLanguage() {
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  document.title = t('loginTitle');
  setText('loginLangToggle', t('languageToggle'));
  setText('appLangToggle', t('languageToggle'));
  setText('loginTitle', t('loginTitle'));
  setText('loginSub', t('loginSub'));
  setText('emailLabel', t('email'));
  setText('passwordLabel', t('password'));
  setText('loginButton', t('login'));
  setText('loginHint', t('loginHint'));
  setText('refreshButton', t('refresh'));
  setText('tabChat', t('chat'));
  setText('tabClock', t('clock'));
  setText('tabLeave', t('leave'));
  setText('tabMe', t('me'));
  if (!user) setText('userName', t('employeeApp'));
}

function toggleLanguage() {
  lang = lang === 'zh' ? 'en' : 'zh';
  localStorage.setItem('filmShopCloud.lang', lang);
  applyLanguage();
  renderAuth();
  render();
}

function translateStatus(value) {
  if (lang !== 'en') return value;
  return { '已批准': t('approved'), '已拒绝': t('rejected'), '待审批': t('pendingApproval') }[value] || value;
}

function leaveTypeOptions(selected = '事假') {
  return [
    ['事假', t('personalLeave')],
    ['病假', t('sickLeave')],
    ['调休', t('compLeave')],
    ['年假', t('annualLeave')]
  ].map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
}

function translateLeaveType(value) {
  if (lang !== 'en') return value;
  return {
    '事假': t('personalLeave'),
    '病假': t('sickLeave'),
    '调休': t('compLeave'),
    '年假': t('annualLeave'),
    '请假': t('leave')
  }[value] || value;
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstall = event;
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function fmtDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) logout(false);
    throw new Error(body.error || t('requestFailed'));
  }
  return body;
}

async function login() {
  try {
    const body = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value
      })
    });
    token = body.token;
    localStorage.setItem('filmShopCloud.token', token);
    await sync();
  } catch (err) {
    alert(err.message);
  }
}

function logout(clear = true) {
  if (clear) api('/api/logout', { method: 'POST' }).catch(() => {});
  token = '';
  localStorage.removeItem('filmShopCloud.token');
  state = null;
  user = null;
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = null;
  stopRealtimeSync();
  renderAuth();
}

async function sync(options = {}) {
  if (syncInFlight) return;
  if (!token) return renderAuth();
  if (document.hidden && !options.force) return;
  try {
    syncInFlight = true;
    state = await api('/api/mobile/bootstrap');
    user = state.user;
    renderAuth();
    render({ preserveActiveInput: !options.force || userRecentlyEditing() });
    ensureSyncTimer();
    startRealtimeSync();
  } catch (err) {
    console.warn(err);
  } finally {
    syncInFlight = false;
  }
}

function ensureSyncTimer() {
  if (syncTimer) return;
  syncTimer = setInterval(() => {
    if (!document.hidden) sync();
  }, 30000);
}

function startRealtimeSync() {
  if (eventSource || !token || !window.EventSource || document.hidden) return;
  eventSource = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
  eventSource.addEventListener('data-changed', () => sync());
  eventSource.onerror = () => {
    stopRealtimeSync();
    if (realtimeRetryTimer) clearTimeout(realtimeRetryTimer);
    realtimeRetryTimer = setTimeout(() => {
      realtimeRetryTimer = null;
      if (token && !document.hidden) startRealtimeSync();
    }, 15000);
  };
}

function stopRealtimeSync() {
  if (eventSource) eventSource.close();
  eventSource = null;
  if (realtimeRetryTimer) clearTimeout(realtimeRetryTimer);
  realtimeRetryTimer = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopRealtimeSync();
    return;
  }
  sync({ force: !userRecentlyEditing() });
});

document.addEventListener('focusin', event => {
  if (isEditableElement(event.target)) markUserInput();
});
document.addEventListener('input', event => {
  if (isEditableElement(event.target)) markUserInput();
});
document.addEventListener('compositionstart', event => {
  if (isEditableElement(event.target)) markUserInput();
});
document.addEventListener('compositionend', event => {
  if (isEditableElement(event.target)) markUserInput();
});

function markUserInput() {
  lastUserInputAt = Date.now();
}

function userRecentlyEditing() {
  return Date.now() - lastUserInputAt < 120000;
}

function isEditableElement(element) {
  return element && ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName);
}

function saveActiveChatDraft() {
  const input = document.getElementById('messageText');
  if (input && activeUserId) chatDrafts.set(activeUserId, input.value);
}

function chatDraft(userId) {
  return chatDrafts.get(userId) || '';
}

function hasActiveDraft() {
  return (tab === 'chat' && activeUserId && Boolean(chatDraft(activeUserId))) || (tab === 'leave' && hasLeaveDraft());
}

function saveLeaveDraft() {
  const fields = ['leaveType', 'startDate', 'startTime', 'endDate', 'endTime', 'hours', 'reason'];
  const next = {};
  fields.forEach(id => {
    const element = document.getElementById(id);
    if (element) next[id] = element.value;
  });
  if (Object.keys(next).length) leaveDraft = { ...leaveDraft, ...next };
}

function leaveDraftValue(id, fallback = '') {
  return leaveDraft[id] ?? fallback;
}

function hasLeaveDraft() {
  return Object.values(leaveDraft || {}).some(value => String(value || '').trim());
}

function clearLeaveDraft() {
  leaveDraft = {};
}

function saveActiveDrafts() {
  saveActiveChatDraft();
  saveLeaveDraft();
}

function scheduleActiveConversationRead() {
  if (tab !== 'chat' || !activeUserId || !unreadFrom(activeUserId)) return;
  if (markReadTimer) clearTimeout(markReadTimer);
  markReadTimer = setTimeout(() => {
    markReadTimer = null;
    if (tab === 'chat' && activeUserId) markRead(activeUserId);
  }, 250);
}

function renderAuth() {
  const loggedIn = Boolean(user && state);
  document.getElementById('login').classList.toggle('hidden', loggedIn);
  document.getElementById('app').classList.toggle('hidden', !loggedIn);
  if (!loggedIn) return;
  document.getElementById('userName').textContent = user.name || user.email;
  document.getElementById('userRole').textContent = user.role || t('employee');
  const badge = document.getElementById('messageBadge');
  const unread = Number(state.unread || 0);
  badge.textContent = unread > 99 ? '99+' : String(unread);
  badge.classList.toggle('hidden', unread <= 0);
}

function setTab(next) {
  if (next === 'chat') selectNextUnreadConversation();
  tab = next;
  document.querySelectorAll('.tabs button').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  render();
}

function render(options = {}) {
  if (!state) return;
  const view = document.getElementById('view');
  saveActiveDrafts();
  const active = document.activeElement;
  const userIsEditing = options.preserveActiveInput && (
    (active && view.contains(active) && isEditableElement(active)) ||
    userRecentlyEditing() ||
    hasActiveDraft()
  );
  const snapshot = renderSnapshot();
  if (userIsEditing) {
    lastRenderSnapshot = snapshot;
    return;
  }
  view.classList.toggle('chat-view', tab === 'chat');
  if (tab === 'chat') view.innerHTML = chatHtml();
  if (tab === 'clock') view.innerHTML = clockHtml();
  if (tab === 'leave') view.innerHTML = leaveHtml();
  if (tab === 'me') view.innerHTML = meHtml();
  lastRenderSnapshot = snapshot;
  if (tab === 'chat') {
    const thread = document.getElementById('thread');
    if (thread) thread.scrollTop = thread.scrollHeight;
    scheduleActiveConversationRead();
  }
}

function renderSnapshot() {
  return JSON.stringify({
    tab,
    userId: user?.id || '',
    unread: state?.unread || 0,
    activeUserId,
    messageCount: (state?.messages || []).length,
    leaveCount: (state?.leaveRequests || []).length,
    clockCount: (state?.clockRecords || []).length
  });
}

function staffUsers() {
  return (state.users || []).filter(item => item.id !== user?.id && item.active !== false);
}

function unreadFrom(userId) {
  return (state.messages || []).filter(message => message.fromUserId === userId && message.toUserId === user?.id && !message.readAt).length;
}

function unreadChatUsers() {
  return staffUsers().filter(item => unreadFrom(item.id) > 0);
}

function selectNextUnreadConversation() {
  const unreadUsers = unreadChatUsers();
  if (!unreadUsers.length) return;
  const currentIndex = unreadUsers.findIndex(item => item.id === activeUserId);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % unreadUsers.length : 0;
  activeUserId = unreadUsers[nextIndex].id;
}

function conversation(otherUserId) {
  return (state.messages || []).filter(message =>
    (message.fromUserId === user?.id && message.toUserId === otherUserId) ||
    (message.fromUserId === otherUserId && message.toUserId === user?.id)
  ).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

function chatHtml() {
  const users = staffUsers();
  activeUserId = activeUserId || users[0]?.id || '';
  const active = users.find(item => item.id === activeUserId) || users[0];
  if (!active) return `<div class="panel"><div class="panel-body">${t('noStaff')}</div></div>`;
  activeUserId = active.id;
  const thread = conversation(activeUserId);
  return `<div class="chat-layout">
    <div class="people">
      ${users.map(item => `<button class="${item.id === activeUserId ? 'active' : ''}" onclick="selectChatUser('${item.id}')">${escapeHtml(item.name || item.email)}${unreadFrom(item.id) ? ` (${unreadFrom(item.id)})` : ''}</button>`).join('')}
    </div>
    <div class="thread" id="thread">
      ${thread.length ? thread.map(messageHtml).join('') : `<p class="hint">${t('noMessages')}</p>`}
    </div>
    <div class="chat-tools">
      <button onclick="document.getElementById('mobileImageInput').click()">${t('image')}</button>
      <button onclick="document.getElementById('mobileFileInput').click()">${t('file')}</button>
      <button id="mobileVoiceBtn" onclick="toggleVoiceMessage()">${t('voice')}</button>
      <input class="hidden" id="mobileImageInput" type="file" accept="image/*" onchange="sendMessageFile(this.files[0], 'image'); this.value='';" />
      <input class="hidden" id="mobileFileInput" type="file" onchange="sendMessageFile(this.files[0], 'file'); this.value='';" />
    </div>
    <div class="chat-send">
      <textarea id="messageText" placeholder="${t('messagePlaceholder')}" oninput="saveActiveChatDraft(); markUserInput();" oncompositionstart="markUserInput();" oncompositionend="saveActiveChatDraft(); markUserInput();">${escapeHtml(chatDraft(activeUserId))}</textarea>
      <button class="primary" onclick="sendMessage()">${t('send')}</button>
    </div>
  </div>`;
}

async function selectChatUser(id) {
  saveActiveChatDraft();
  activeUserId = id;
  render();
  await markRead(id);
}

function messageHtml(message) {
  const mine = message.fromUserId === user?.id;
  const read = mine ? ` · ${message.readAt ? t('read') : t('unread')}` : '';
  return `<div class="bubble ${mine ? 'mine' : ''}">
    ${mine ? `<button class="delete" onclick="deleteMessage('${message.id}')">×</button>` : ''}
    ${message.text ? `<div>${escapeHtml(message.text || '')}</div>` : ''}
    ${messageAttachmentHtml(message.attachment)}
    <small>${mine ? t('self') : escapeHtml(message.fromName || '')} · ${fmtDateTime(message.createdAt)}${read}</small>
  </div>`;
}

function messageAttachmentHtml(attachment) {
  if (!attachment?.dataUrl) return '';
  const name = escapeHtml(attachment.name || 'attachment');
  if (attachment.kind === 'image') {
    return `<img class="message-image" src="${attachment.dataUrl}" alt="${name}" onclick="openImagePreview(this.src, this.alt)" />`;
  }
  if (attachment.kind === 'audio') {
    const audioId = `audio-${Math.random().toString(36).slice(2)}`;
    return `<div class="message-audio">
      <button onclick="toggleAudio('${audioId}', this)" type="button">${t('play')}</button>
      <span>${t('voiceMessage')}</span>
      <audio id="${audioId}" preload="metadata" src="${attachment.dataUrl}" onended="resetAudioButton(this)"></audio>
    </div>`;
  }
  return `<a class="message-file" href="${attachment.dataUrl}" download="${name}">${t('filePrefix')}${name}</a>`;
}

function openImagePreview(src, title = '') {
  const overlay = document.createElement('div');
  overlay.className = 'image-preview';
  overlay.innerHTML = `<button type="button">${t('close')}</button><img src="${src}" alt="${escapeHtml(title || 'image')}" />`;
  overlay.onclick = event => {
    if (event.target === overlay || event.target.tagName === 'BUTTON') overlay.remove();
  };
  document.body.appendChild(overlay);
}

function toggleAudio(audioId, button) {
  const audio = document.getElementById(audioId);
  if (!audio) return;
  document.querySelectorAll('.message-audio audio').forEach(item => {
    if (item !== audio) {
      item.pause();
      const otherButton = item.closest('.message-audio')?.querySelector('button');
      if (otherButton) otherButton.textContent = t('play');
    }
  });
  if (audio.paused) {
    audio.play().then(() => { button.textContent = t('pause'); }).catch(() => {});
  } else {
    audio.pause();
    button.textContent = t('play');
  }
}

function resetAudioButton(audio) {
  const button = audio.closest('.message-audio')?.querySelector('button');
  if (button) button.textContent = t('play');
}

async function markRead(fromUserId) {
  if (!fromUserId || !unreadFrom(fromUserId)) return;
  try {
    const body = await api('/api/messages/read', {
      method: 'PUT',
      body: JSON.stringify({ fromUserId })
    });
    state = { ...state, ...body };
    renderAuth();
    render({ preserveActiveInput: true });
  } catch (err) {
    console.warn(err);
  }
}

async function sendMessage() {
  const input = document.getElementById('messageText');
  const text = input.value.trim();
  if (!text || !activeUserId) return;
  const draftUserId = activeUserId;
  input.value = '';
  chatDrafts.delete(draftUserId);
  lastUserInputAt = 0;
  try {
    await postMessage({ text });
    chatDrafts.delete(draftUserId);
    const currentInput = document.getElementById('messageText');
    if (currentInput && activeUserId === draftUserId) currentInput.value = '';
    render({ preserveActiveInput: false });
  } catch (err) {
    chatDrafts.set(draftUserId, text);
    const currentInput = document.getElementById('messageText');
    if (currentInput && activeUserId === draftUserId) currentInput.value = text;
    alert(err.message);
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(t('fileReadFailed')));
    reader.readAsDataURL(file);
  });
}

async function postMessage({ text = '', attachment = null }) {
  await api('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ toUserId: activeUserId, text, attachment })
  });
  state = await api('/api/mobile/bootstrap');
  renderAuth();
  render({ preserveActiveInput: false });
}

async function sendMessageFile(file, kind) {
  if (!file || !activeUserId) return;
  if (file.size > MAX_MESSAGE_ATTACHMENT_BYTES) {
    alert(t('attachmentLimit'));
    return;
  }
  try {
    const dataUrl = await fileToDataUrl(file);
    await postMessage({
      attachment: {
        kind,
        name: file.name || (kind === 'image' ? 'image' : 'file'),
        type: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl
      }
    });
  } catch (err) {
    alert(err.message);
  }
}

async function toggleVoiceMessage() {
  const button = document.getElementById('mobileVoiceBtn');
  if (messageRecorder && messageRecorder.state === 'recording') {
    messageRecorder.stop();
    if (button) button.textContent = t('voice');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    messageAudioChunks = [];
    messageRecorder = new MediaRecorder(stream);
    messageRecorder.ondataavailable = event => {
      if (event.data?.size) messageAudioChunks.push(event.data);
    };
    messageRecorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      const type = messageAudioChunks[0]?.type || 'audio/webm';
      const blob = new Blob(messageAudioChunks, { type });
      messageRecorder = null;
      if (!blob.size) return;
      if (blob.size > MAX_MESSAGE_ATTACHMENT_BYTES) {
        alert(t('voiceLimit'));
        return;
      }
      const dataUrl = await fileToDataUrl(blob);
      await postMessage({
        attachment: {
          kind: 'audio',
          name: `voice-${Date.now()}.webm`,
          type,
          size: blob.size,
          dataUrl
        }
      });
    };
    messageRecorder.start();
    if (button) button.textContent = t('stop');
  } catch {
    alert(t('micDenied'));
  }
}

async function deleteMessage(messageId) {
  if (!confirm(t('confirmDeleteMessage'))) return;
  try {
    await api(`/api/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' });
    state = await api('/api/mobile/bootstrap');
    renderAuth();
    render();
  } catch (err) {
    alert(err.message);
  }
}

function clockHtml() {
  const records = state.clockRecords || [];
  return `<div class="panel">
    <div class="panel-head">${t('mobileClock')}</div>
    <div class="panel-body">
      <label class="consent-row"><input id="locationConsent" type="checkbox" />${t('clockConsent')}</label>
      <p class="hint">${t('clockPrivacy')}</p>
      <div class="clock-actions">
        <button class="clock-in" onclick="clock('in')">${t('clockIn')}</button>
        <button class="clock-out" onclick="clock('out')">${t('clockOut')}</button>
      </div>
      <p class="hint">${t('clockBrowserHint')}</p>
    </div>
  </div>
  <div class="panel">
    <div class="panel-head">${t('clockRecords')}</div>
    ${records.length ? records.map(clockRecordHtml).join('') : `<div class="row"><span>${t('noClockRecords')}</span></div>`}
  </div>`;
}

function clockRecordHtml(item) {
  const mapUrl = item.mapUrl || `https://www.google.com/maps?q=${encodeURIComponent(`${item.lat},${item.lng}`)}`;
  const address = item.address || `${Number(item.lat || 0).toFixed(6)}, ${Number(item.lng || 0).toFixed(6)}`;
  const hasDistance = Number.isFinite(Number(item.officeDistanceMeters));
  const matchText = hasDistance
    ? `${item.officeMatched ? t('insideOffice') : t('outsideOffice')} · ${t('distanceOffice')} ${Number(item.officeDistanceMeters).toLocaleString()} ${t('meter')}`
    : t('distanceUnknown');
  const matchClass = item.officeMatched ? 'approved' : 'rejected';
  return `<div class="row"><div>
    <strong>${escapeHtml(item.userName)} · ${item.type === 'in' ? t('clockInShort') : t('clockOutShort')}</strong>
    <span>${fmtDateTime(item.at)} · ${t('accuracy')} ${item.accuracy || 0}m</span>
    <span>${escapeHtml(address)}</span>
    <span><span class="status ${matchClass}">${escapeHtml(matchText)}</span></span>
    <span><a href="${mapUrl}" target="_blank" rel="noopener">${t('viewMap')}</a></span>
  </div></div>`;
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error(t('noGeolocation')));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  });
}

async function clock(type) {
  try {
    const consent = document.getElementById('locationConsent')?.checked;
    if (!consent) {
      alert(t('needConsent'));
      return;
    }
    const pos = await getPosition();
    state = await api('/api/mobile/clock', {
      method: 'POST',
      body: JSON.stringify({
        type,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        locationConsent: true
      })
    });
    renderAuth();
    render();
    alert(type === 'in' ? t('clockInSuccess') : t('clockOutSuccess'));
  } catch (err) {
    alert(err.message || t('locationFailed'));
  }
}

function leaveHtml() {
  saveLeaveDraft();
  const requests = state.leaveRequests || [];
  return `<div class="panel">
    <div class="panel-head">${t('submitLeave')}</div>
    <div class="panel-body">
      <label>${t('leaveType')}<select id="leaveType" onchange="saveLeaveDraft(); markUserInput();">${leaveTypeOptions(leaveDraftValue('leaveType', '事假'))}</select></label>
      <label>${t('startDate')}<input id="startDate" type="date" value="${escapeHtml(leaveDraftValue('startDate'))}" oninput="saveLeaveDraft(); markUserInput();" onchange="saveLeaveDraft(); markUserInput();" /></label>
      <label>${t('startTime')}<input id="startTime" type="time" value="${escapeHtml(leaveDraftValue('startTime'))}" oninput="saveLeaveDraft(); markUserInput();" onchange="saveLeaveDraft(); markUserInput();" /></label>
      <label>${t('endDate')}<input id="endDate" type="date" value="${escapeHtml(leaveDraftValue('endDate'))}" oninput="saveLeaveDraft(); markUserInput();" onchange="saveLeaveDraft(); markUserInput();" /></label>
      <label>${t('endTime')}<input id="endTime" type="time" value="${escapeHtml(leaveDraftValue('endTime'))}" oninput="saveLeaveDraft(); markUserInput();" onchange="saveLeaveDraft(); markUserInput();" /></label>
      <label>${t('leaveHours')}<input id="hours" type="number" step="0.5" min="0.5" value="${escapeHtml(leaveDraftValue('hours'))}" oninput="saveLeaveDraft(); markUserInput();" onchange="saveLeaveDraft(); markUserInput();" /></label>
      <label>${t('reason')}<textarea id="reason" placeholder="${t('reasonPlaceholder')}" oninput="saveLeaveDraft(); markUserInput();" oncompositionstart="markUserInput();" oncompositionend="saveLeaveDraft(); markUserInput();">${escapeHtml(leaveDraftValue('reason'))}</textarea></label>
      <button class="primary" onclick="submitLeave()">${t('submitLeave')}</button>
    </div>
  </div>
  <div class="panel">
    <div class="panel-head">${state.canApproveLeave ? t('leaveApprovals') : t('myLeaveRecords')}</div>
    ${requests.length ? requests.map(leaveItemHtml).join('') : `<div class="row"><span>${t('noLeaveRecords')}</span></div>`}
  </div>`;
}

function leaveItemHtml(item) {
  const statusClass = item.status === '已批准' ? 'approved' : item.status === '已拒绝' ? 'rejected' : 'pending';
  const approve = state.canApproveLeave && item.status === '待审批'
    ? `<div class="approve-grid"><button onclick="reviewLeave('${item.id}', '已批准')">${t('approve')}</button><button onclick="reviewLeave('${item.id}', '已拒绝')">${t('reject')}</button></div>`
    : '';
  return `<div class="row"><div style="width:100%">
    <strong>${escapeHtml(item.userName)} · ${escapeHtml(translateLeaveType(item.leaveType || '请假'))} <span class="status ${statusClass}">${escapeHtml(translateStatus(item.status))}</span></strong>
    <span>${escapeHtml(item.startDate)} ${escapeHtml(item.startTime || '')} ${t('to')} ${escapeHtml(item.endDate)} ${escapeHtml(item.endTime || '')} · ${Number(item.hours || 0)} ${t('hoursUnit')}</span>
    <span>${escapeHtml(item.reason || '')}</span>
    ${item.reviewedBy ? `<span>${t('reviewedBy')}${escapeHtml(item.reviewedBy)} ${item.reviewNote ? `· ${escapeHtml(item.reviewNote)}` : ''}</span>` : ''}
    ${approve}
  </div></div>`;
}

async function submitLeave() {
  try {
    saveLeaveDraft();
    state = await api('/api/mobile/leave', {
      method: 'POST',
      body: JSON.stringify({
        leaveType: document.getElementById('leaveType').value,
        startDate: document.getElementById('startDate').value,
        startTime: document.getElementById('startTime').value,
        endDate: document.getElementById('endDate').value,
        endTime: document.getElementById('endTime').value,
        hours: document.getElementById('hours').value,
        reason: document.getElementById('reason').value
      })
    });
    clearLeaveDraft();
    lastUserInputAt = 0;
    renderAuth();
    render({ preserveActiveInput: false });
    alert(t('leaveSubmitted'));
  } catch (err) {
    alert(err.message);
  }
}

async function reviewLeave(id, status) {
  const reviewNote = prompt(`${t('reviewNotePrompt')}${translateStatus(status)}`) || '';
  try {
    state = await api(`/api/mobile/leave/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ status, reviewNote })
    });
    renderAuth();
    render();
  } catch (err) {
    alert(err.message);
  }
}

function meHtml() {
  return `<div class="panel">
    <div class="panel-head">${t('myAccount')}</div>
    <div class="row"><div><strong>${escapeHtml(user.name || '')}</strong><span>${escapeHtml(user.email || '')}</span></div></div>
    <div class="row"><div><strong>${t('mobileUrl')}</strong><span>${location.origin}/mobile.html</span></div></div>
    <div class="panel-body">
      <button class="install-mobile-btn" onclick="installMobileApp()"><img src="/quad-film-icon.png" alt="" />${t('installDesktop')}</button>
      <p class="hint">${t('installHint')}</p>
      <button class="primary" onclick="logout()">${t('logout')}</button>
    </div>
  </div>`;
}

async function installMobileApp() {
  if (deferredInstall) {
    deferredInstall.prompt();
    try { await deferredInstall.userChoice; } catch {}
    deferredInstall = null;
    return;
  }
  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isiOS) {
    alert(t('iosInstall'));
    return;
  }
  alert(t('browserInstall'));
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

applyLanguage();
sync({ force: true });
