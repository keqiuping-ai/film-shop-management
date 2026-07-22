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
let reimbursementDraft = {};
let reimbursementAttachments = [];
let deferredInstall = null;
let messageRecorder = null;
let messageAudioChunks = [];
let supervisionRecorder = null;
let supervisionAudioChunks = [];
let supervisionRecordingStream = null;
let supervisionStopRequested = false;
let lang = localStorage.getItem('filmShopCloud.lang') || 'zh';
const MAX_MESSAGE_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const GROUP_CHAT_ID = '__all_staff__';
let lastChatUserId = '';
let noteSaving = false;

const I18N = {
  zh: {
    languageToggle: 'English',
    loginTitle: 'QUAD FILM 员工端',
    loginSub: '聊天、记事本、打卡、请假审批',
    email: '邮箱',
    password: '密码',
    login: '登录',
    loginHint: '手机浏览器打开后，可添加到主屏幕作为客户端使用。',
    employeeApp: '员工端',
    employee: '员工',
    refresh: '刷新',
    chat: '留言',
    notes: '记事本',
    clock: '打卡',
    leave: '请假',
    reimbursement: '报销',
    me: '我的',
    requestFailed: '请求失败',
    noStaff: '还没有可留言的员工账号。',
    noMessages: '还没有留言。',
    image: '图片',
    file: '文件',
    voice: '语音',
    video: '视频',
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
    ,groupChat: '全体员工群聊', myNotes: '我的记事本', notesPrivate: '包含自己的记事和别人分享给你的内容；只有原作者能修改。', newMemo: '新建备忘录', newTask: '新建待办', memo: '备忘', todo: '待办', completed: '已完成', finish: '办完了', edit: '编辑', delete: '删除', noteTitle: '标题', noteContent: '详细内容（可不填）', remindAt: '提醒时间', save: '保存', cancel: '取消', noteTitleRequired: '请填写标题', noteTimeRequired: '请选择提醒日期和时间', confirmDeleteNote: '确定删除这条记事吗？', noNotes: '还没有记事或待办。', due: '提醒', attachmentSending: '正在发送附件…', submitClaim: '提交报销', expenseDate: '消费日期', category: '报销类别', vendor: '商家（可不填）', purpose: '费用用途', amount: '金额', paymentMethod: '付款方式（可不填）', claimNotes: '备注（没有小票时必须说明）', receipt: '拍照或上传小票', receiptHint: '支持照片或 PDF，单个不超过 5MB', myClaims: '我的报销记录', noClaims: '暂无报销记录', claimSubmitted: '报销申请已提交', uploadingReceipt: '正在上传凭证…', remove: '删除', noClaimPermission: '当前账号没有提交报销的权限。', receiptCount: '个凭证', supervision: '督办', supervisionTitle: '智能督办中心', holdToSpeak: '按住说话', releaseToCreate: '松开后 AI 生成任务确认单', manualAssignment: '手动交办', noSupervisionTasks: '还没有与你相关的督办任务。', aiProcessing: 'AI 正在整理任务…', recording: '正在录音，松开结束', transcribeFailed: '语音识别失败', draftFailed: '任务分析失败'
  },
  en: {
    languageToggle: '中文',
    loginTitle: 'QUAD FILM Staff',
    loginSub: 'Messages, notes, clock-in, leave approval',
    email: 'Email',
    password: 'Password',
    login: 'Log In',
    loginHint: 'Open this in your phone browser and add it to the Home Screen.',
    employeeApp: 'Staff App',
    employee: 'Staff',
    refresh: 'Refresh',
    chat: 'Messages',
    notes: 'Notes',
    clock: 'Clock',
    leave: 'Leave',
    reimbursement: 'Expense',
    me: 'Me',
    requestFailed: 'Request failed',
    noStaff: 'No staff accounts are available for messaging.',
    noMessages: 'No messages yet.',
    image: 'Image',
    file: 'File',
    voice: 'Voice',
    video: 'Video',
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
    ,groupChat: 'All Staff', myNotes: 'My Notes', notesPrivate: 'Includes your notes and notes shared with you; only authors can edit.', newMemo: 'New Memo', newTask: 'New Task', memo: 'Memo', todo: 'To-do', completed: 'Completed', finish: 'Done', edit: 'Edit', delete: 'Delete', noteTitle: 'Title', noteContent: 'Details (optional)', remindAt: 'Reminder', save: 'Save', cancel: 'Cancel', noteTitleRequired: 'Enter a title', noteTimeRequired: 'Choose a reminder date and time', confirmDeleteNote: 'Delete this note?', noNotes: 'No notes or tasks yet.', due: 'Reminder', attachmentSending: 'Sending attachment…', submitClaim: 'Submit Expense', expenseDate: 'Expense Date', category: 'Category', vendor: 'Vendor (optional)', purpose: 'Business Purpose', amount: 'Amount', paymentMethod: 'Payment Method (optional)', claimNotes: 'Notes (required without a receipt)', receipt: 'Take Photo or Upload Receipt', receiptHint: 'Photo or PDF, up to 5MB each', myClaims: 'My Expense Claims', noClaims: 'No expense claims', claimSubmitted: 'Expense claim submitted', uploadingReceipt: 'Uploading receipt…', remove: 'Remove', noClaimPermission: 'This account cannot submit expense claims.', receiptCount: 'receipt(s)', supervision: 'Tasks', supervisionTitle: 'Smart Supervision', holdToSpeak: 'Hold to speak', releaseToCreate: 'Release for AI task draft', manualAssignment: 'Manual task', noSupervisionTasks: 'No supervision tasks related to you.', aiProcessing: 'AI is preparing the task…', recording: 'Recording — release to finish', transcribeFailed: 'Transcription failed', draftFailed: 'Task analysis failed'
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
  setText('tabNotes', t('notes'));
  setText('tabClock', t('clock'));
  setText('tabSupervision', t('supervision'));
  setText('tabLeave', t('leave'));
  setText('tabReimbursement', t('reimbursement'));
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
    lastUserInputAt = 0;
    await sync({ force: true });
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
  eventSource.addEventListener('data-changed', event => {
    try {
      const payload = JSON.parse(event.data || '{}');
      if (String(payload.action || '').startsWith('voice-call-')) {
        window.dispatchEvent(new CustomEvent('quad-voice-call', { detail: payload }));
        return;
      }
    } catch {}
    sync();
  });
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
  return (tab === 'chat' && activeUserId && Boolean(chatDraft(activeUserId))) || (tab === 'leave' && hasLeaveDraft()) || (tab === 'reimbursement' && hasReimbursementDraft());
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
  saveReimbursementDraft();
}

function saveReimbursementDraft() {
  const fields = ['claimDate', 'claimCategory', 'claimVendor', 'claimPurpose', 'claimAmount', 'claimPaymentMethod', 'claimNotes'];
  const next = {};
  fields.forEach(id => { const element = document.getElementById(id); if (element) next[id] = element.value; });
  if (Object.keys(next).length) reimbursementDraft = { ...reimbursementDraft, ...next };
}

function reimbursementDraftValue(id, fallback = '') { return reimbursementDraft[id] ?? fallback; }
function hasReimbursementDraft() { return reimbursementAttachments.length > 0 || Object.values(reimbursementDraft).some(value => String(value || '').trim()); }

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
  const mentionedMe = mobileUnreadMentionForUser(user);
  badge.textContent = mentionedMe ? '@' : (unread > 99 ? '99+' : String(unread));
  badge.classList.toggle('mention', mentionedMe);
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
  if (tab === 'notes') view.innerHTML = notesHtml();
  if (tab === 'clock') view.innerHTML = clockHtml();
  if (tab === 'supervision') view.innerHTML = supervisionHtml();
  if (tab === 'leave') view.innerHTML = leaveHtml();
  if (tab === 'reimbursement') view.innerHTML = reimbursementHtml();
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
    noteCount: (state?.personalNotes || []).length,
    leaveCount: (state?.leaveRequests || []).length,
    clockCount: (state?.clockRecords || []).length,
    supervisionCount: (state?.aiBossTasks || []).length,
    reimbursementCount: (state?.reimbursements || []).length
  });
}

function staffUsers() {
  return (state.users || []).filter(item => item.id !== user?.id && item.active !== false);
}

function unreadFrom(userId) {
  if (userId === GROUP_CHAT_ID) {
    return (state.messages || []).filter(message => message.scope === 'group' && message.fromUserId !== user?.id && !(message.readByUserIds || []).includes(user?.id)).length;
  }
  return (state.messages || []).filter(message => message.fromUserId === userId && message.toUserId === user?.id && !message.readAt).length;
}

function mobileMessageMentionsUser(message, targetUser) {
  const text = String(message?.text || '');
  const name = String(targetUser?.name || '').trim();
  if (!text || !name) return false;
  const aliases = [name, name.split(/\s+/)[0]].filter((item, index, all) => item && all.indexOf(item) === index);
  return aliases.some(alias => text.toLocaleLowerCase().includes(`@${alias.toLocaleLowerCase()}`));
}

function mobileUnreadMentionForUser(targetUser) {
  return (state.messages || []).some(message =>
    message.scope === 'group' && message.fromUserId !== targetUser?.id &&
    !(message.readByUserIds || []).includes(targetUser?.id) && mobileMessageMentionsUser(message, targetUser)
  );
}

function unreadChatUsers() {
  return [{ id: GROUP_CHAT_ID }, ...staffUsers()].filter(item => unreadFrom(item.id) > 0);
}

function selectNextUnreadConversation() {
  const unreadUsers = unreadChatUsers();
  if (!unreadUsers.length) return;
  const currentIndex = unreadUsers.findIndex(item => item.id === activeUserId);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % unreadUsers.length : 0;
  activeUserId = unreadUsers[nextIndex].id;
}

function conversation(otherUserId) {
  if (otherUserId === GROUP_CHAT_ID) {
    return (state.messages || []).filter(message => message.scope === 'group')
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  }
  return (state.messages || []).filter(message =>
    (message.fromUserId === user?.id && message.toUserId === otherUserId) ||
    (message.fromUserId === otherUserId && message.toUserId === user?.id)
  ).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

function chatHtml() {
  const users = [{ id: GROUP_CHAT_ID, name: t('groupChat'), group: true }, ...staffUsers()];
  activeUserId = activeUserId || GROUP_CHAT_ID;
  const active = users.find(item => item.id === activeUserId) || users[0];
  if (!active) return `<div class="panel"><div class="panel-body">${t('noStaff')}</div></div>`;
  activeUserId = active.id;
  const thread = conversation(activeUserId);
  return `<div class="chat-layout">
    <div class="people">
      ${users.map(item => {
        const mentioned = item.id === GROUP_CHAT_ID ? mobileUnreadMentionForUser(user) : mobileUnreadMentionForUser(item);
        return `<button class="person ${item.id === activeUserId ? 'active' : ''}" onclick="selectChatUser('${item.id}')"><span class="mobile-avatar-badge-wrap">${avatarHtml(item)}${mentioned ? `<i class="mobile-at-badge">${item.id === GROUP_CHAT_ID ? '@我' : '@'}</i>` : ''}</span><span>${escapeHtml(item.name || item.email)}${!mentioned && unreadFrom(item.id) ? `<b>${unreadFrom(item.id)}</b>` : ''}</span></button>`;
      }).join('')}
    </div>
    <div class="mobile-chat-head"><strong>${escapeHtml(active.name || active.email)}</strong></div>
    <div class="thread" id="thread">
      ${thread.length ? thread.map(messageHtml).join('') : `<p class="hint">${t('noMessages')}</p>`}
    </div>
    <div class="chat-tools">
      <button onclick="document.getElementById('mobileImageInput').click()">${t('image')}</button>
      <button onclick="document.getElementById('mobileVideoInput').click()">${t('video')}</button>
      <button onclick="document.getElementById('mobileFileInput').click()">${t('file')}</button>
      <button id="mobileVoiceBtn" onclick="toggleVoiceMessage()">${t('voice')}</button>
      <button class="quad-call-tool-button" type="button" onclick="QuadCalls.enableNotifications(); ${active.id === GROUP_CHAT_ID ? 'QuadCalls.startGroup()' : `QuadCalls.startDirect('${active.id}')`}">📞 ${lang === 'zh' ? '语音通话' : 'Voice call'}</button>
      <input class="hidden" id="mobileImageInput" type="file" accept="image/*" onchange="sendMessageFile(this.files[0], 'image'); this.value='';" />
      <input class="hidden" id="mobileVideoInput" type="file" accept="video/*" onchange="sendMessageFile(this.files[0], 'video'); this.value='';" />
      <input class="hidden" id="mobileFileInput" type="file" onchange="sendMessageFile(this.files[0], 'file'); this.value='';" />
    </div>
    <div class="chat-send">
      <textarea id="messageText" placeholder="${t('messagePlaceholder')}" oninput="saveActiveChatDraft(); markUserInput();" oncompositionstart="markUserInput();" oncompositionend="saveActiveChatDraft(); markUserInput();">${escapeHtml(chatDraft(activeUserId))}</textarea>
      <button class="primary" onclick="sendMessage()">${t('send')}</button>
    </div>
  </div>`;
}

window.getQuadCallContext = () => ({ user, state });
window.setQuadCallState = value => { state = value; };

async function selectChatUser(id) {
  saveActiveChatDraft();
  activeUserId = id;
  render();
  await markRead(id);
}

function messageHtml(message) {
  const mine = message.fromUserId === user?.id;
  const read = mine && message.scope !== 'group' ? ` · ${message.readAt ? t('read') : t('unread')}` : '';
  const sender = (state.users || []).find(item => item.id === message.fromUserId) || { name: message.fromName || '' };
  return `<div class="message-line ${mine ? 'mine' : ''}">${!mine ? avatarHtml(sender) : ''}<div class="bubble ${mine ? 'mine' : ''}">
    ${mine ? `<button class="delete" onclick="deleteMessage('${message.id}')">×</button>` : ''}
    ${message.text ? `<div>${escapeHtml(message.text || '')}</div>` : ''}
    ${messageAttachmentHtml(message.attachment)}
    <small>${mine ? t('self') : escapeHtml(message.fromName || '')} · ${fmtDateTime(message.createdAt)}${read}</small>
  </div>${mine ? avatarHtml(user) : ''}</div>`;
}

function avatarHtml(item) {
  if (item?.group) return '<span class="avatar group-avatar">群</span>';
  const name = String(item?.name || item?.email || '?').trim();
  if (item?.avatarDataUrl) return `<img class="avatar" src="${escapeHtml(item.avatarDataUrl)}" alt="${escapeHtml(name)}" />`;
  return `<span class="avatar">${escapeHtml(name.slice(0, 1).toUpperCase())}</span>`;
}

function messageAttachmentHtml(attachment) {
  const src = attachment?.url || attachment?.dataUrl;
  if (!src) return '';
  const name = escapeHtml(attachment.name || 'attachment');
  if (attachment.kind === 'image') {
    return `<img class="message-image" src="${src}" alt="${name}" onclick="openImagePreview(this.src, this.alt)" />`;
  }
  if (attachment.kind === 'video') {
    return `<video class="message-video" src="${src}" controls preload="metadata" playsinline></video>`;
  }
  if (attachment.kind === 'audio') {
    const audioId = `audio-${Math.random().toString(36).slice(2)}`;
    return `<div class="message-audio">
      <button onclick="toggleAudio('${audioId}', this)" type="button">${t('play')}</button>
      <span>${t('voiceMessage')}</span>
      <audio id="${audioId}" preload="metadata" src="${src}" onended="resetAudioButton(this)"></audio>
    </div>`;
  }
  return `<a class="message-file" href="${src}" download="${name}">${t('filePrefix')}${name}</a>`;
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
      body: JSON.stringify(fromUserId === GROUP_CHAT_ID ? { groupId: 'all-staff' } : { fromUserId })
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

async function optimizeMobileImage(file) {
  if (!String(file?.type || '').startsWith('image/') || file.size <= 850 * 1024) return file;
  const source = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  if (source.close) source.close();
  let quality = .82;
  let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  while (blob && blob.size > 850 * 1024 && quality > .42) {
    quality -= .1;
    blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  }
  if (!blob) throw new Error(t('fileReadFailed'));
  return new File([blob], String(file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

async function postMessage({ text = '', attachment = null }) {
  await api('/api/messages', {
    method: 'POST',
    body: JSON.stringify(activeUserId === GROUP_CHAT_ID ? { groupId: 'all-staff', text, attachment } : { toUserId: activeUserId, text, attachment })
  });
  state = await api('/api/mobile/bootstrap');
  renderAuth();
  render({ preserveActiveInput: false });
}

async function sendMessageFile(file, kind) {
  if (!file || !activeUserId) return;
  if (kind === 'image') {
    try { file = await optimizeMobileImage(file); }
    catch (err) { alert(err.message); return; }
  }
  const max = kind === 'video' ? 50 * 1024 * 1024 : kind === 'file' ? 5 * 1024 * 1024 : MAX_MESSAGE_ATTACHMENT_BYTES;
  if (file.size > max) {
    alert(t('attachmentLimit'));
    return;
  }
  try {
    const uploaded = await api('/api/message-media/upload', {
      method: 'POST',
      body: JSON.stringify({ name: file.name, type: file.type || 'application/octet-stream', dataUrl: await fileToDataUrl(file) })
    });
    await postMessage({
      attachment: {
        kind,
        name: uploaded.name || file.name || kind,
        type: uploaded.type || file.type || 'application/octet-stream',
        size: uploaded.size || file.size,
        url: uploaded.url
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

function notesHtml() {
  const notes = [...(state.personalNotes || [])].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
    return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
  });
  return `<div class="notes-head"><div><strong>${t('myNotes')}</strong><p>${t('notesPrivate')}</p></div><div><button onclick="openNoteEditor('', 'memo')">＋ ${t('newMemo')}</button><button class="primary-inline" onclick="openNoteEditor('', 'task')">＋ ${t('newTask')}</button></div></div>
    <div class="note-grid">${notes.length ? notes.map(noteCardHtml).join('') : `<div class="panel-body hint">${t('noNotes')}</div>`}</div>`;
}

function noteCardHtml(item) {
  const completed = item.status === 'completed';
  const canEdit = item.canEdit !== false && (!item.ownerUserId || item.ownerUserId === user?.id);
  const share = item.shareScope === 'all' ? (lang === 'zh' ? '👥 全体员工' : '👥 All staff') : item.shareScope === 'users' ? (lang === 'zh' ? '↗ 指定员工' : '↗ Selected staff') : (lang === 'zh' ? '🔒 仅自己' : '🔒 Private');
  return `<article class="note-card ${completed ? 'completed' : ''}" data-note-id="${item.id}">
    <div class="note-card-top"><span>${item.type === 'task' ? t('todo') : t('memo')}</span><div>${canEdit ? `${item.type === 'task' && !completed ? `<button onclick="finishNote('${item.id}')">${t('finish')}</button>` : ''}<button onclick="openNoteEditor('${item.id}')">✎</button><button onclick="deleteNote('${item.id}')">×</button>` : (lang === 'zh' ? '只读' : 'Read only')}</div></div>
    <h3>${escapeHtml(item.title)}</h3>${item.content ? `<p>${escapeHtml(item.content)}</p>` : ''}
    ${item.type === 'task' ? `<time>${completed ? '✓ ' + t('completed') : '⏰ ' + t('due') + ' ' + fmtDateTime(item.snoozedUntil || item.remindAt)}</time>` : ''}
    <small>${canEdit ? '' : `${lang === 'zh' ? '来自' : 'From'} ${escapeHtml(item.ownerName || '')} · `}${share}</small>
  </article>`;
}

function openNoteEditor(noteId = '', type = 'memo') {
  const item = (state.personalNotes || []).find(note => note.id === noteId);
  if (item && item.canEdit === false) return alert(lang === 'zh' ? '别人分享的记事只能查看。' : 'Shared notes are read-only.');
  const nextType = item?.type || type;
  const shareScope = ['all', 'users'].includes(item?.shareScope) ? item.shareScope : 'private';
  const staff = (state.users || []).filter(row => row.active !== false && row.id !== user?.id);
  const overlay = document.createElement('div');
  overlay.className = 'mobile-modal';
  const localDate = item?.remindAt ? new Date(new Date(item.remindAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  overlay.innerHTML = `<div class="mobile-dialog"><div class="dialog-head"><strong>${item ? t('edit') : (nextType === 'task' ? t('newTask') : t('newMemo'))}</strong><button onclick="this.closest('.mobile-modal').remove()">×</button></div>
    <label>${t('noteTitle')}<input id="noteEditorTitle" value="${escapeHtml(item?.title || '')}" /></label>
    <label>${t('noteContent')}<textarea id="noteEditorContent">${escapeHtml(item?.content || '')}</textarea></label>
    ${nextType === 'task' ? `<label>${t('remindAt')}<input id="noteEditorRemindAt" type="datetime-local" value="${escapeHtml(localDate)}" /></label>` : ''}
    <label>${lang === 'zh' ? '分享范围' : 'Sharing'}<select id="noteEditorShareScope" onchange="this.closest('.mobile-dialog').querySelector('#noteEditorRecipients').classList.toggle('hidden',this.value!=='users')"><option value="private" ${shareScope === 'private' ? 'selected' : ''}>${lang === 'zh' ? '仅自己可见' : 'Private'}</option><option value="all" ${shareScope === 'all' ? 'selected' : ''}>${lang === 'zh' ? '全体员工' : 'All staff'}</option><option value="users" ${shareScope === 'users' ? 'selected' : ''}>${lang === 'zh' ? '指定员工' : 'Selected staff'}</option></select></label>
    <div id="noteEditorRecipients" class="note-recipient-list ${shareScope === 'users' ? '' : 'hidden'}">${staff.map(row => `<label><input type="checkbox" value="${escapeHtml(row.id)}" ${(item?.sharedUserIds || []).includes(row.id) ? 'checked' : ''}>${escapeHtml(row.name || row.email)}</label>`).join('')}</div>
    <div class="dialog-actions"><button onclick="this.closest('.mobile-modal').remove()">${t('cancel')}</button><button class="primary-inline" onclick="saveNote('${noteId}', '${nextType}', this)">${t('save')}</button></div></div>`;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.querySelector('#noteEditorTitle')?.focus(), 20);
}

async function saveNote(noteId, type, button) {
  if (noteSaving) return;
  const overlay = button.closest('.mobile-modal');
  const title = overlay.querySelector('#noteEditorTitle').value.trim();
  const content = overlay.querySelector('#noteEditorContent').value.trim();
  const rawTime = overlay.querySelector('#noteEditorRemindAt')?.value || '';
  const shareScope = overlay.querySelector('#noteEditorShareScope').value;
  const sharedUserIds = [...overlay.querySelectorAll('#noteEditorRecipients input:checked')].map(input => input.value);
  if (!title) return alert(t('noteTitleRequired'));
  if (type === 'task' && !rawTime) return alert(t('noteTimeRequired'));
  if (shareScope === 'users' && !sharedUserIds.length) return alert(lang === 'zh' ? '请至少选择一名接收员工' : 'Choose at least one recipient');
  noteSaving = true;
  button.disabled = true;
  const existing = (state.personalNotes || []).find(note => note.id === noteId);
  const body = { ...(existing || {}), type, title, content, remindAt: rawTime ? new Date(rawTime).toISOString() : '', status: existing?.status || 'pending', shareScope, sharedUserIds, requestId: existing?.requestId || `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}` };
  overlay.remove();
  try {
    const result = await api(`/api/personal-notes${noteId ? `/${noteId}` : ''}`, { method: noteId ? 'PUT' : 'POST', body: JSON.stringify(body) });
    const list = (state.personalNotes || []).filter(note => note.id !== result.item.id && note.id !== noteId);
    state.personalNotes = [result.item, ...list];
    render();
  } catch (err) { alert(err.message); }
  finally { noteSaving = false; }
}

async function finishNote(noteId) {
  const item = (state.personalNotes || []).find(note => note.id === noteId);
  if (!item) return;
  state.personalNotes = state.personalNotes.map(note => note.id === noteId ? { ...note, status: 'completed' } : note);
  render();
  try {
    const result = await api(`/api/personal-notes/${noteId}`, { method: 'PUT', body: JSON.stringify({ ...item, status: 'completed' }) });
    state.personalNotes = state.personalNotes.map(note => note.id === noteId ? result.item : note);
  } catch (err) { state.personalNotes = state.personalNotes.map(note => note.id === noteId ? item : note); render(); alert(err.message); }
}

async function deleteNote(noteId) {
  if (!confirm(t('confirmDeleteNote'))) return;
  const before = [...(state.personalNotes || [])];
  state.personalNotes = before.filter(note => note.id !== noteId);
  render();
  try { await api(`/api/personal-notes/${noteId}`, { method: 'DELETE' }); }
  catch (err) { state.personalNotes = before; render(); alert(err.message); }
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

function supervisionHtml() {
  const tasks = state.aiBossTasks || [];
  return `<section class="supervision-hero">
    <div><small>QUaD AI</small><h2>${t('supervisionTitle')}</h2><p>${t('releaseToCreate')}</p></div>
    <select id="supervisionProvider" aria-label="AI Provider"><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option></select>
    <button id="supervisionVoiceButton" class="supervision-voice" onpointerdown="startSupervisionVoice(event)" onpointerup="stopSupervisionVoice(event)" onpointercancel="stopSupervisionVoice(event)">🎙️ <strong>${t('holdToSpeak')}</strong></button>
    <button class="supervision-manual" onclick="manualSupervisionTask()">＋ ${t('manualAssignment')}</button>
    <div id="supervisionStatus" class="hint"></div>
  </section>
  <div class="supervision-list">${tasks.length ? tasks.map(supervisionTaskHtml).join('') : `<div class="panel-body hint">${t('noSupervisionTasks')}</div>`}</div>`;
}

function supervisionTaskHtml(task) {
  const isManager = ['owner', 'manager'].includes(user?.role);
  const isAssignee = task.assigneeUserId === user?.id;
  const isCreator = task.createdByUserId === user?.id;
  const actions = [];
  if (task.status === '待接单' && (isAssignee || isManager)) actions.push(`<button onclick="updateSupervisionTask('${task.id}','accept')">接单</button>`);
  if (!['已完成','已取消','待验收'].includes(task.status) && (isAssignee || isManager)) {
    actions.push(`<button onclick="supervisionProgress('${task.id}')">报进度</button>`);
    actions.push(`<button onclick="supervisionResult('${task.id}')">交结果</button>`);
  }
  if (task.status === '待验收' && (isCreator || isManager)) {
    actions.push(`<button onclick="updateSupervisionTask('${task.id}','approve','',{qualityScore:90})">验收通过</button>`);
    actions.push(`<button onclick="supervisionReject('${task.id}')">退回</button>`);
  }
  return `<article class="supervision-card"><header><span>${escapeHtml(task.status || '')}</span><b>${escapeHtml(task.priority || '普通')}</b></header><h3>${escapeHtml(task.title || '')}</h3><p>${escapeHtml(task.description || '')}</p><dl><div><dt>负责人</dt><dd>${escapeHtml(task.assigneeName || '')}</dd></div><div><dt>截止</dt><dd>${escapeHtml(formatMobileDateTime(task.dueAt || '')) || '—'}</dd></div><div><dt>进度</dt><dd>${Number(task.progress || 0)}%</dd></div></dl>${task.acceptanceCriteria ? `<aside><strong>验收：</strong>${escapeHtml(task.acceptanceCriteria)}</aside>` : ''}${task.result ? `<aside><strong>结果：</strong>${escapeHtml(task.result)}</aside>` : ''}<footer>${actions.join('')}</footer></article>`;
}

function formatMobileDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN', { timeZone: APP_TIMEZONE, month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}

async function startSupervisionVoice(event) {
  event?.preventDefault();
  if (supervisionRecorder?.state === 'recording') return;
  try {
    supervisionStopRequested = false;
    supervisionRecordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    supervisionAudioChunks = [];
    supervisionRecorder = new MediaRecorder(supervisionRecordingStream);
    supervisionRecorder.ondataavailable = item => { if (item.data?.size) supervisionAudioChunks.push(item.data); };
    supervisionRecorder.onstop = processSupervisionRecording;
    supervisionRecorder.start();
    if (supervisionStopRequested) supervisionRecorder.stop();
    document.getElementById('supervisionVoiceButton')?.classList.add('recording');
    const status = document.getElementById('supervisionStatus'); if (status) status.textContent = t('recording');
  } catch { alert(t('micDenied')); }
}

function stopSupervisionVoice(event) {
  event?.preventDefault();
  supervisionStopRequested = true;
  if (supervisionRecorder?.state === 'recording') supervisionRecorder.stop();
}

async function processSupervisionRecording() {
  const stream = supervisionRecordingStream;
  supervisionRecordingStream = null;
  stream?.getTracks().forEach(track => track.stop());
  const type = supervisionAudioChunks[0]?.type || 'audio/webm';
  const blob = new Blob(supervisionAudioChunks, { type });
  supervisionRecorder = null; supervisionAudioChunks = [];
  document.getElementById('supervisionVoiceButton')?.classList.remove('recording');
  if (!blob.size) return;
  if (blob.size > 12 * 1024 * 1024) return alert(t('voiceLimit'));
  const status = document.getElementById('supervisionStatus'); if (status) status.textContent = t('aiProcessing');
  try {
    const transcription = await api('/api/ai-boss/transcribe', { method:'POST', body:JSON.stringify({ dataUrl:await fileToDataUrl(blob), language:lang === 'en' ? 'en' : 'zh' }) });
    await analyzeSupervisionText(transcription.text);
  } catch (error) { alert(`${t('transcribeFailed')}：${error.message}`); if (status) status.textContent = ''; }
}

async function manualSupervisionTask() {
  const text = prompt(lang === 'en' ? 'Describe the task:' : '请说清楚或输入要交办的事情：');
  if (String(text || '').trim()) await analyzeSupervisionText(String(text).trim());
}

async function analyzeSupervisionText(text) {
  const provider = document.getElementById('supervisionProvider')?.value || 'deepseek';
  const status = document.getElementById('supervisionStatus'); if (status) status.textContent = t('aiProcessing');
  try {
    const result = await api('/api/ai-boss/draft', { method:'POST', body:JSON.stringify({ text, provider }) });
    openSupervisionDraft(result.draft || {}, result.sourceText || text, result.provider || provider);
  } catch (error) { alert(`${t('draftFailed')}：${error.message}`); }
  finally { if (status) status.textContent = ''; }
}

function supervisionUserOptions(selectedId) {
  return (state.users || []).filter(item => item.active !== false).map(item => `<option value="${item.id}" ${item.id === selectedId ? 'selected' : ''}>${escapeHtml(item.name || item.email)}</option>`).join('');
}

function localDateTimeValue(value) {
  const date = value ? new Date(value) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:APP_TIMEZONE, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23' }).formatToParts(date).reduce((result,item)=>(result[item.type]=item.value,result),{});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function openSupervisionDraft(draft, sourceText, provider) {
  const overlay = document.createElement('div'); overlay.className = 'mobile-modal';
  overlay.innerHTML = `<div class="mobile-dialog"><div class="dialog-head"><strong>AI 任务确认单</strong><button onclick="this.closest('.mobile-modal').remove()">×</button></div><p class="hint">${provider === 'openai' ? 'OpenAI' : 'DeepSeek'} 已整理，请确认后再正式派单。</p>
    <label>任务标题<input id="supervisionTitle" value="${escapeHtml(draft.title || '')}"></label>
    <label>具体要求<textarea id="supervisionDescription">${escapeHtml(draft.description || sourceText || '')}</textarea></label>
    <label>负责人<select id="supervisionAssignee"><option value="">请选择</option>${supervisionUserOptions(draft.assigneeUserId || '')}</select></label>
    <label>截止时间<input id="supervisionDueAt" type="datetime-local" value="${localDateTimeValue(draft.dueAt)}"></label>
    <label>优先级<select id="supervisionPriority">${['低','普通','高','紧急'].map(item=>`<option ${item===(draft.priority||'普通')?'selected':''}>${item}</option>`).join('')}</select></label>
    <label>验收标准<textarea id="supervisionCriteria">${escapeHtml(draft.acceptanceCriteria || '')}</textarea></label>
    <input id="supervisionSourceText" type="hidden" value="${escapeHtml(sourceText || '')}"><input id="supervisionDifficulty" type="hidden" value="${Number(draft.difficulty || 3)}">
    <div class="dialog-actions"><button onclick="this.closest('.mobile-modal').remove()">${t('cancel')}</button><button class="primary-inline" onclick="submitSupervisionDraft(this)">确认派单</button></div></div>`;
  document.body.appendChild(overlay);
}

async function submitSupervisionDraft(button) {
  const overlay = button.closest('.mobile-modal'); const value = id => String(overlay.querySelector(`#${id}`)?.value || '').trim();
  try {
    button.disabled = true;
    await api('/api/ai-boss/tasks', { method:'POST', body:JSON.stringify({ title:value('supervisionTitle'), description:value('supervisionDescription'), sourceText:value('supervisionSourceText'), assigneeUserId:value('supervisionAssignee'), dueAt:value('supervisionDueAt'), priority:value('supervisionPriority'), difficulty:Number(value('supervisionDifficulty') || 3), acceptanceCriteria:value('supervisionCriteria'), reminderHours:2 }) });
    overlay.remove(); state = await api('/api/mobile/bootstrap'); renderAuth(); render();
  } catch (error) { alert(error.message); button.disabled = false; }
}

async function updateSupervisionTask(id, action, note = '', extra = {}) {
  try { await api(`/api/ai-boss/tasks/${encodeURIComponent(id)}`, { method:'PUT', body:JSON.stringify({ action, note, ...extra }) }); state = await api('/api/mobile/bootstrap'); renderAuth(); render(); } catch (error) { alert(error.message); }
}
function supervisionProgress(id) { const progress=prompt('当前完成进度（1-99）：'); if(progress===null)return; const note=prompt('已经完成什么、下一步做什么：')||''; if(note) updateSupervisionTask(id,'progress',note,{progress:Number(progress)}); }
function supervisionResult(id) { const note=prompt('请提交最终结果和证据说明：')||''; if(note) updateSupervisionTask(id,'result',note); }
function supervisionReject(id) { const note=prompt('请说明退回原因和需要继续完成的内容：')||''; if(note) updateSupervisionTask(id,'reject',note); }

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

function reimbursementCategoryOptions(selected = '') {
  const options = lang === 'zh'
    ? ['交通/汽油', '停车/过路费', '餐饮', '办公用品', '工具/材料', '差旅/住宿', '广告/推广', '其他']
    : ['Transportation / Gas', 'Parking / Tolls', 'Meals', 'Office Supplies', 'Tools / Materials', 'Travel / Lodging', 'Advertising', 'Other'];
  return `<option value="">${lang === 'zh' ? '请选择' : 'Select'}</option>` + options.map(label => `<option value="${escapeHtml(label)}" ${label === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
}

function reimbursementStatus(value) {
  if (lang === 'zh') return value;
  return { '待审批': 'Pending', '已批准': 'Approved', '已驳回': 'Rejected', '已报销': 'Reimbursed' }[value] || value;
}

function reimbursementStatusClass(value) {
  return value === '已批准' || value === '已报销' ? 'approved' : value === '已驳回' ? 'rejected' : 'pending';
}

function reimbursementHtml() {
  saveReimbursementDraft();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const claims = state.reimbursements || [];
  const form = state.canCreateReimbursements ? `<div class="panel">
    <div class="panel-head">${t('submitClaim')}</div>
    <div class="panel-body reimbursement-form">
      <label>${t('expenseDate')}<input id="claimDate" type="date" value="${escapeHtml(reimbursementDraftValue('claimDate', today))}" oninput="saveReimbursementDraft(); markUserInput()"></label>
      <label>${t('category')}<select id="claimCategory" onchange="saveReimbursementDraft(); markUserInput()">${reimbursementCategoryOptions(reimbursementDraftValue('claimCategory'))}</select></label>
      <label>${t('vendor')}<input id="claimVendor" value="${escapeHtml(reimbursementDraftValue('claimVendor'))}" oninput="saveReimbursementDraft(); markUserInput()"></label>
      <label>${t('purpose')}<textarea id="claimPurpose" oninput="saveReimbursementDraft(); markUserInput()">${escapeHtml(reimbursementDraftValue('claimPurpose'))}</textarea></label>
      <label>${t('amount')}<input id="claimAmount" type="number" min="0.01" step="0.01" inputmode="decimal" value="${escapeHtml(reimbursementDraftValue('claimAmount'))}" oninput="saveReimbursementDraft(); markUserInput()"></label>
      <label>${t('paymentMethod')}<input id="claimPaymentMethod" value="${escapeHtml(reimbursementDraftValue('claimPaymentMethod'))}" oninput="saveReimbursementDraft(); markUserInput()"></label>
      <div class="reimbursement-upload"><label for="claimReceipts">📷 ${t('receipt')}</label><span class="hint">${t('receiptHint')}</span><input id="claimReceipts" type="file" accept="image/*,.pdf,application/pdf" capture="environment" multiple onchange="uploadReimbursementAttachments(this)"></div>
      <div id="claimReceiptList" class="receipt-list">${reimbursementAttachmentListHtml()}</div>
      <label>${t('claimNotes')}<textarea id="claimNotes" oninput="saveReimbursementDraft(); markUserInput()">${escapeHtml(reimbursementDraftValue('claimNotes'))}</textarea></label>
      <button id="submitClaimButton" class="primary" onclick="submitReimbursement()">${t('submitClaim')}</button>
    </div>
  </div>` : `<div class="panel"><div class="panel-body hint">${t('noClaimPermission')}</div></div>`;
  return `${form}<div class="panel"><div class="panel-head">${t('myClaims')}</div>${claims.length ? claims.map(reimbursementItemHtml).join('') : `<div class="row"><span>${t('noClaims')}</span></div>`}</div>`;
}

function reimbursementAttachmentListHtml() {
  return reimbursementAttachments.map((file, index) => `<div class="receipt-item"><span>📎 ${escapeHtml(file.name || t('receipt'))}</span><button type="button" onclick="removeReimbursementAttachment(${index})">×</button></div>`).join('');
}

function reimbursementItemHtml(item) {
  return `<div class="row"><div style="width:100%"><strong>${escapeHtml(item.reimbursementNo || '')} <span class="status ${reimbursementStatusClass(item.status)}">${escapeHtml(reimbursementStatus(item.status))}</span></strong><span>${escapeHtml(item.date || '')} · ${escapeHtml(item.category || '')}${item.vendor ? ` · ${escapeHtml(item.vendor)}` : ''}</span><span>${escapeHtml(item.purpose || '')}</span><div style="display:flex;justify-content:space-between;align-items:center;margin-top:7px"><strong class="claim-amount">$${Number(item.amount || 0).toFixed(2)}</strong><span>${(item.attachments || []).length} ${t('receiptCount')}</span></div></div></div>`;
}

function removeReimbursementAttachment(index) {
  reimbursementAttachments = reimbursementAttachments.filter((_, itemIndex) => itemIndex !== index);
  const list = document.getElementById('claimReceiptList');
  if (list) list.innerHTML = reimbursementAttachmentListHtml();
}

async function uploadReimbursementAttachments(input) {
  const files = [...(input?.files || [])];
  if (!files.length) return;
  try {
    input.disabled = true;
    for (let file of files) {
      if (String(file.type || '').startsWith('image/')) file = await optimizeMobileImage(file);
      if (file.size > 5 * 1024 * 1024) throw new Error(t('receiptHint'));
      const uploaded = await api('/api/reimbursement-media/upload', {
        method: 'POST',
        body: JSON.stringify({ name: file.name, type: file.type || 'application/octet-stream', dataUrl: await fileToDataUrl(file) })
      });
      reimbursementAttachments.push({ name: uploaded.name, type: uploaded.type, url: uploaded.url });
    }
    const list = document.getElementById('claimReceiptList');
    if (list) list.innerHTML = reimbursementAttachmentListHtml();
  } catch (err) {
    alert(err.message);
  } finally {
    input.disabled = false;
    input.value = '';
  }
}

async function submitReimbursement() {
  saveReimbursementDraft();
  const button = document.getElementById('submitClaimButton');
  try {
    if (button) button.disabled = true;
    await api('/api/reimbursements', {
      method: 'POST',
      body: JSON.stringify({
        requestId: `mobile-claim-${user.id}-${Date.now()}`,
        date: reimbursementDraftValue('claimDate'),
        category: reimbursementDraftValue('claimCategory'),
        vendor: reimbursementDraftValue('claimVendor'),
        purpose: reimbursementDraftValue('claimPurpose'),
        amount: reimbursementDraftValue('claimAmount'),
        paymentMethod: reimbursementDraftValue('claimPaymentMethod'),
        notes: reimbursementDraftValue('claimNotes'),
        attachments: reimbursementAttachments
      })
    });
    reimbursementDraft = {};
    reimbursementAttachments = [];
    lastUserInputAt = 0;
    state = await api('/api/mobile/bootstrap');
    renderAuth();
    render({ preserveActiveInput: false });
    alert(t('claimSubmitted'));
  } catch (err) {
    alert(err.message);
  } finally {
    if (button) button.disabled = false;
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
