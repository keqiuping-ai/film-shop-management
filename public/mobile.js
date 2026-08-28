const APP_TIMEZONE = 'America/Los_Angeles';
let token = localStorage.getItem('filmShopCloud.token') || '';
let state = null;
let user = null;
let tab = 'home';
let activeUserId = '';
let chatListMode = true;
let syncTimer = null;
let eventSource = null;
let syncInFlight = false;
let realtimeRetryTimer = null;
let realtimeConnected = false;
let lastDataRevision = '';
let deferredDataSyncTimer = null;
let lastRenderSnapshot = '';
let lastUserInputAt = 0;
let markReadTimer = null;
const chatDrafts = new Map();
const mobileMessageUploadQueue = new Map();
let leaveDraft = {};
let reimbursementDraft = {};
let reimbursementAttachments = [];
let deferredInstall = null;
let messageRecorder = null;
let messageAudioChunks = [];
let messageRecordingStream = null;
let messageVoiceHeld = false;
let messageVoiceStarting = false;
let messageVoiceStartedAt = 0;
let messageVoiceTimer = null;
let messageVoiceFeedbackTimer = null;
let supervisionRecorder = null;
let supervisionAudioChunks = [];
let supervisionRecordingStream = null;
let supervisionStopRequested = false;
let lang = localStorage.getItem('filmShopCloud.lang') || 'zh';
const MAX_MESSAGE_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const GROUP_CHAT_ID = '__all_staff__';
const CUSTOMER_CODEX_ID = 'customer-codex';
const CUSTOMER_CODEX_GROUP_ID = 'customer-codex-room';
let lastChatUserId = '';
let noteSaving = false;
let activeMobileNoteId = '';
let mobileNoteListMode = true;
let supervisionReminderTimer = null;
let supervisionReminderSessionUserId = '';
let supervisionReminderActivityCheckAt = 0;
let salesScreen = 'home';
let salesSelectedAccountIds = [];
let salesPlanDate = '';
let salesNearbyOrigin = null;
let salesActiveAccountId = '';

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
    sales: '业务',
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
    sales: 'Sales',
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
  setText('tabSales', t('sales'));
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
  const { timeoutMs = 30000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(path, {
    ...fetchOptions,
    signal: fetchOptions.signal || controller.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(lang === 'zh' ? '请求超时，请检查网络后重试' : 'Request timed out. Please check the network and try again.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) logout(false);
    throw new Error(body.error || t('requestFailed'));
  }
  const revision = String(res.headers.get('x-data-revision') || '');
  // sync-status must compare the server revision with the revision from the
  // last actual snapshot. Updating it here first would hide every change.
  if (revision && path !== '/api/sync-status') lastDataRevision = revision;
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
  stopSupervisionReminderLoop();
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
    render({ preserveActiveInput: !options.force });
    ensureSyncTimer();
    startRealtimeSync();
    startSupervisionReminderLoop();
  } catch (err) {
    console.warn(err);
  } finally {
    syncInFlight = false;
  }
}

function ensureSyncTimer() {
  if (syncTimer) return;
  syncTimer = setInterval(() => {
    if (!document.hidden) checkServerDataRevision();
  }, 30000);
}

async function checkServerDataRevision() {
  if (!token || syncInFlight || document.hidden) return;
  try {
    const body = await api('/api/sync-status', { timeoutMs: 10000 });
    const revision = String(body.revision || '');
    if (revision && lastDataRevision && revision !== lastDataRevision) {
      await sync();
      return;
    }
    if (revision) lastDataRevision = revision;
  } catch {}
}

function queueDataRevisionCheck(revision = '') {
  if (revision && lastDataRevision && revision === lastDataRevision) return;
  if (deferredDataSyncTimer) clearTimeout(deferredDataSyncTimer);
  deferredDataSyncTimer = setTimeout(() => {
    deferredDataSyncTimer = null;
    checkServerDataRevision();
  }, 1200);
}

function startRealtimeSync() {
  if (eventSource || !token || !window.EventSource || document.hidden) return;
  eventSource = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
  eventSource.addEventListener('ready', () => { realtimeConnected = true; });
  eventSource.addEventListener('data-changed', event => {
    let payload = {};
    try {
      payload = JSON.parse(event.data || '{}');
      if (String(payload.action || '').startsWith('voice-call-')) {
        window.dispatchEvent(new CustomEvent('quad-voice-call', { detail: payload }));
        return;
      }
    } catch {}
    queueDataRevisionCheck(String(payload.revision || ''));
  });
  eventSource.onerror = () => {
    realtimeConnected = false;
    stopRealtimeSync();
    if (realtimeRetryTimer) clearTimeout(realtimeRetryTimer);
    realtimeRetryTimer = setTimeout(() => {
      realtimeRetryTimer = null;
      if (token && !document.hidden) startRealtimeSync();
    }, 1000);
  };
}

function stopRealtimeSync() {
  realtimeConnected = false;
  if (eventSource) eventSource.close();
  eventSource = null;
  if (realtimeRetryTimer) clearTimeout(realtimeRetryTimer);
  realtimeRetryTimer = null;
  if (deferredDataSyncTimer) clearTimeout(deferredDataSyncTimer);
  deferredDataSyncTimer = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopRealtimeSync();
    return;
  }
  queueDataRevisionCheck();
  checkSupervisionReminder();
});
window.addEventListener('focus', () => { if (token) checkSupervisionReminder(); });
['pointerdown','keydown','touchstart'].forEach(eventName => {
  window.addEventListener(eventName, checkSupervisionReminderAfterActivity, { passive:true });
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
  if (isMobileChatViewport() && chatListMode) return;
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
  if (next === 'chat') chatListMode = true;
  if (next === 'notes') mobileNoteListMode = true;
  tab = next;
  document.getElementById('app')?.classList.toggle('module-open', tab !== 'home');
  document.querySelectorAll('.tabs button').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  render();
}

function closeMobileModule() {
  saveActiveDrafts();
  tab = 'home';
  chatListMode = true;
  mobileNoteListMode = true;
  document.getElementById('app')?.classList.remove('module-open');
  document.querySelectorAll('.tabs button').forEach(button => button.classList.remove('active'));
  render();
}

function moduleBar(title, extra = '') {
  return `<div class="mobile-module-bar"><button type="button" class="mobile-back" onclick="closeMobileModule()" aria-label="${lang === 'zh' ? '返回功能首页' : 'Back to home'}">‹</button><strong>${escapeHtml(title)}</strong>${extra || '<span></span>'}</div>`;
}

function homeHtml() {
  const items = [
    ['chat', '💬', t('chat'), Number(state?.unread || 0)],
    ['notes', '📝', t('notes'), 0],
    ['sales', '🧭', t('sales'), 0],
    ['clock', '📍', t('clock'), 0],
    ['supervision', '🧠', t('supervision'), 0],
    ['leave', '🗓️', t('leave'), 0],
    ['reimbursement', '🧾', t('reimbursement'), 0],
    ['me', '👤', t('me'), 0]
  ];
  return `<section class="mobile-home">
    <div class="mobile-home-hero"><small>QUAD FILM</small><h1>${lang === 'zh' ? '员工工作台' : 'Staff Workspace'}</h1><p>${lang === 'zh' ? '选择一项功能进入全屏操作' : 'Choose a module to open it full screen'}</p></div>
    <div class="mobile-home-grid">${items.map(([id, icon, label, count]) => `<button type="button" class="home-app home-app-${id}" onclick="setTab('${id}')"><i>${icon}</i><strong>${escapeHtml(label)}</strong>${count ? `<b>${count > 99 ? '99+' : count}</b>` : ''}</button>`).join('')}</div>
  </section>`;
}

function keepMobileChatAtLatest() {
  if (tab !== 'chat' || chatListMode) return;
  const thread = document.getElementById('thread');
  if (!thread) return;
  const conversationId = activeUserId;
  const scrollToLatest = () => {
    if (!thread.isConnected || tab !== 'chat' || chatListMode || activeUserId !== conversationId) return;
    thread.scrollTop = thread.scrollHeight;
  };

  scrollToLatest();
  requestAnimationFrame(() => {
    scrollToLatest();
    requestAnimationFrame(scrollToLatest);
  });
  [60, 180, 500, 1000].forEach(delay => setTimeout(scrollToLatest, delay));

  thread.querySelectorAll('img, video').forEach(media => {
    if (media.tagName === 'IMG' && media.complete) return;
    media.addEventListener('load', scrollToLatest, { once: true });
    media.addEventListener('loadedmetadata', scrollToLatest, { once: true });
    media.addEventListener('error', scrollToLatest, { once: true });
  });
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
  if ((messageRecorder || messageVoiceStarting) && view.childElementCount > 0) {
    lastRenderSnapshot = snapshot;
    return;
  }
  if (userIsEditing && view.childElementCount > 0) {
    lastRenderSnapshot = snapshot;
    return;
  }
  view.classList.toggle('chat-view', tab === 'chat');
  document.getElementById('app')?.classList.toggle('module-open', tab !== 'home');
  if (tab === 'home') view.innerHTML = homeHtml();
  if (tab === 'chat') view.innerHTML = chatHtml();
  if (tab === 'notes') view.innerHTML = moduleBar(t('notes')) + notesHtml();
  if (tab === 'sales') view.innerHTML = (salesScreen === 'home' ? moduleBar(t('sales')) : '') + salesHtml();
  if (tab === 'clock') view.innerHTML = moduleBar(t('clock')) + clockHtml();
  if (tab === 'supervision') view.innerHTML = moduleBar(t('supervision')) + supervisionHtml();
  if (tab === 'leave') view.innerHTML = moduleBar(t('leave')) + leaveHtml();
  if (tab === 'reimbursement') view.innerHTML = moduleBar(t('reimbursement')) + reimbursementHtml();
  if (tab === 'me') view.innerHTML = moduleBar(t('me')) + meHtml();
  lastRenderSnapshot = snapshot;
  if (tab === 'chat') {
    keepMobileChatAtLatest();
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
    salesAccountCount: (state?.fieldSales?.accounts || []).length,
    leaveCount: (state?.leaveRequests || []).length,
    clockCount: (state?.clockRecords || []).length,
    supervisionCount: (state?.aiBossTasks || []).length,
    reimbursementCount: (state?.reimbursements || []).length
  });
}

function staffUsers() {
  return (state.users || []).filter(item => item.id !== user?.id && item.active !== false);
}

function mobileMessageUsers() {
  return (state.messageUsers || state.users || []).filter(item =>
    item.id !== user?.id &&
    item.active !== false &&
    (item.id !== 'customer-codex' || Boolean(user?.permissions?.customerCodexChat))
  );
}

function unreadFrom(userId) {
  if (userId === GROUP_CHAT_ID) {
    return (state.messages || []).filter(message => message.groupId === 'all-staff' && message.fromUserId !== user?.id && !(message.readByUserIds || []).includes(user?.id)).length;
  }
  if (userId === CUSTOMER_CODEX_ID) {
    return (state.messages || []).filter(message =>
      (message.groupId === CUSTOMER_CODEX_GROUP_ID || message.fromUserId === CUSTOMER_CODEX_ID || message.toUserId === CUSTOMER_CODEX_ID) &&
      message.fromUserId !== user?.id &&
      !(message.readByUserIds || []).includes(user?.id) &&
      !message.readAt
    ).length;
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
  return [{ id: GROUP_CHAT_ID }, ...mobileMessageUsers()].filter(item => unreadFrom(item.id) > 0);
}

function selectNextUnreadConversation() {
  const unreadUsers = unreadChatUsers();
  if (!unreadUsers.length) return;
  const currentIndex = unreadUsers.findIndex(item => item.id === activeUserId);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % unreadUsers.length : 0;
  activeUserId = unreadUsers[nextIndex].id;
}

function conversation(otherUserId) {
  const queued = [...mobileMessageUploadQueue.values()];
  const withQueued = messages => [...messages, ...queued.filter(message => {
    if (otherUserId === GROUP_CHAT_ID) return message.groupId === 'all-staff';
    if (otherUserId === CUSTOMER_CODEX_ID) return message.groupId === CUSTOMER_CODEX_GROUP_ID;
    return message.toUserId === otherUserId;
  })];
  if (otherUserId === GROUP_CHAT_ID) {
    return withQueued((state.messages || []).filter(message => message.groupId === 'all-staff'))
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  }
  if (otherUserId === CUSTOMER_CODEX_ID) {
    return withQueued((state.messages || []).filter(message =>
      message.groupId === CUSTOMER_CODEX_GROUP_ID ||
      message.fromUserId === CUSTOMER_CODEX_ID ||
      message.toUserId === CUSTOMER_CODEX_ID
    )).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  }
  return withQueued((state.messages || []).filter(message =>
    (message.fromUserId === user?.id && message.toUserId === otherUserId) ||
    (message.fromUserId === otherUserId && message.toUserId === user?.id)
  )).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

function isMobileChatViewport() {
  return window.matchMedia ? window.matchMedia('(max-width: 759px)').matches : window.innerWidth < 760;
}

function messagePreview(message) {
  if (!message) return lang === 'zh' ? '还没有消息' : 'No messages yet';
  const text = String(message.text || '').replace(/\s+/g, ' ').trim();
  if (text) return text;
  const labels = { image: t('image'), video: t('video'), file: t('file'), audio: t('voice') };
  return `[${labels[message.attachment?.kind] || t('file')}]`;
}

function conversationTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: APP_TIMEZONE }).format(date);
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { month: '2-digit', day: '2-digit', timeZone: APP_TIMEZONE }).format(date);
}

function chatListUsers() {
  return [{ id: GROUP_CHAT_ID, name: t('groupChat'), group: true }, ...mobileMessageUsers()]
    .map(item => {
      const messages = conversation(item.id);
      return { ...item, latest: messages[messages.length - 1] || null };
    })
    .sort((a, b) => String(b.latest?.createdAt || '').localeCompare(String(a.latest?.createdAt || '')));
}

function chatHtml() {
  const users = chatListUsers();
  activeUserId = activeUserId || GROUP_CHAT_ID;
  const active = users.find(item => item.id === activeUserId) || users[0];
  if (!active) return `<div class="panel"><div class="panel-body">${t('noStaff')}</div></div>`;
  activeUserId = active.id;
  const thread = conversation(activeUserId);
  return `<div class="chat-layout ${chatListMode ? 'list-mode' : 'detail-mode'}">
    <section class="wechat-list-pane">
      ${moduleBar(lang === 'zh' ? '消息' : 'Messages')}
      <div class="wechat-search"><span>⌕</span><input type="search" placeholder="${lang === 'zh' ? '搜索' : 'Search'}" oninput="filterChatList(this.value)" /></div>
      <div class="people">
      ${users.map(item => {
        const mentioned = item.id === GROUP_CHAT_ID ? mobileUnreadMentionForUser(user) : mobileUnreadMentionForUser(item);
        const unread = unreadFrom(item.id);
        const preview = `${item.latest?.fromUserId === user?.id ? (lang === 'zh' ? '我：' : 'Me: ') : ''}${messagePreview(item.latest)}`;
        const search = `${item.name || item.email || ''} ${preview}`.toLocaleLowerCase();
        return `<button class="person ${item.id === activeUserId ? 'active' : ''}" data-chat-search="${escapeHtml(search)}" onclick="selectChatUser('${item.id}')">
          <span class="mobile-avatar-badge-wrap">${avatarHtml(item)}${mentioned ? `<i class="mobile-at-badge">@</i>` : ''}</span>
          <span class="wechat-conversation-copy"><strong>${escapeHtml(item.name || item.email)}</strong><small>${escapeHtml(preview)}</small></span>
          <span class="wechat-conversation-meta"><time>${conversationTime(item.latest?.createdAt)}</time>${unread ? `<b>${unread > 99 ? '99+' : unread}</b>` : ''}</span>
        </button>`;
      }).join('')}
      </div>
    </section>
    <section class="wechat-chat-pane">
      <div class="mobile-chat-head"><button type="button" class="mobile-back" onclick="showChatList()" aria-label="${lang === 'zh' ? '返回消息列表' : 'Back to conversations'}">‹</button><span>${avatarHtml(active)}<strong>${escapeHtml(active.name || active.email)}</strong></span>${active.id === GROUP_CHAT_ID || (active.virtual !== true && active.voiceCallEnabled !== false) ? `<button class="chat-call-head" type="button" onclick="QuadCalls.enableNotifications(); ${active.id === GROUP_CHAT_ID ? 'QuadCalls.startGroup()' : `QuadCalls.startDirect('${active.id}')`}">📞</button>` : ''}</div>
      <div class="thread" id="thread">
      ${thread.length ? thread.map(messageHtml).join('') : `<p class="hint">${t('noMessages')}</p>`}
      </div>
      <div class="chat-tools">
      <button onclick="document.getElementById('mobileImageInput').click()">${t('image')}</button>
      <button onclick="document.getElementById('mobileVideoInput').click()">${t('video')}</button>
      <button onclick="document.getElementById('mobileFileInput').click()">${t('file')}</button>
      <button id="mobileVoiceBtn" class="mobile-hold-voice" type="button"
        onpointerdown="startVoiceMessage(event)"
        onpointerup="finishVoiceMessage(event)"
        onpointercancel="cancelVoiceMessage(event)"
        onlostpointercapture="finishVoiceMessage(event)"
        oncontextmenu="event.preventDefault()"
        aria-label="${lang === 'zh' ? '按住说话，松开发送' : 'Hold to talk, release to send'}">${lang === 'zh' ? '🎙️ 按住说话' : '🎙️ Hold to talk'}</button>
      <input class="hidden" id="mobileImageInput" type="file" accept="image/*" onchange="sendMessageFile(this.files[0], 'image'); this.value='';" />
      <input class="hidden" id="mobileVideoInput" type="file" accept="video/*" onchange="sendMessageFile(this.files[0], 'video'); this.value='';" />
      <input class="hidden" id="mobileFileInput" type="file" onchange="sendMessageFile(this.files[0], 'file'); this.value='';" />
      </div>
      <div class="chat-send">
      <textarea id="messageText" placeholder="${t('messagePlaceholder')}" oninput="saveActiveChatDraft(); markUserInput();" oncompositionstart="markUserInput();" oncompositionend="saveActiveChatDraft(); markUserInput();">${escapeHtml(chatDraft(activeUserId))}</textarea>
      <button class="primary" onclick="sendMessage()">${t('send')}</button>
      </div>
    </section>
  </div>`;
}

function filterChatList(value) {
  const query = String(value || '').trim().toLocaleLowerCase();
  document.querySelectorAll('[data-chat-search]').forEach(item => {
    item.hidden = Boolean(query) && !String(item.dataset.chatSearch || '').includes(query);
  });
}

function showChatList() {
  saveActiveChatDraft();
  chatListMode = true;
  render();
}

function openActiveChatDetail() {
  chatListMode = false;
  render();
}

async function selectChatUser(id) {
  saveActiveChatDraft();
  activeUserId = id;
  chatListMode = false;
  render();
  await markRead(id);
}

/*
  The mobile chat intentionally uses a list/detail flow. Keeping this marker
  close to the renderer makes future realtime refresh changes less likely to
  reintroduce the old cramped horizontal contact strip.
*/

window.getQuadCallContext = () => ({ user, state });
window.setQuadCallState = value => { state = value; };

function messageHtml(message) {
  const mine = message.fromUserId === user?.id;
  const read = mine && message.scope !== 'group' ? ` · ${message.readAt ? t('read') : t('unread')}` : '';
  const sender = (state.messageUsers || state.users || []).find(item => item.id === message.fromUserId) || { name: message.fromName || '' };
  return `<div class="message-line ${mine ? 'mine' : ''}">${!mine ? avatarHtml(sender) : ''}<div class="bubble ${mine ? 'mine' : ''}">
    ${mine ? (message.pending ? (message.failed ? `<button class="mobile-message-retry" onclick="retryMobileMessageUpload('${message.id}')">${lang === 'zh' ? '重试' : 'Retry'}</button>` : '') : `<button class="delete" onclick="deleteMessage('${message.id}')">×</button>`) : ''}
    ${message.text ? `<div>${escapeHtml(message.text || '')}</div>` : ''}
    ${messageAttachmentHtml(message.attachment)}
    <small>${mine ? t('self') : escapeHtml(message.fromName || '')} · ${fmtDateTime(message.createdAt)}${message.pending ? ` · ${message.failed ? (lang === 'zh' ? '发送失败' : 'Failed') : (lang === 'zh' ? '后台发送中…' : 'Sending in background…')}` : read}</small>
  </div>${mine ? avatarHtml(user) : ''}</div>`;
}

function avatarHtml(item) {
  if (item?.group) return '<span class="avatar group-avatar">群</span>';
  const name = String(item?.name || item?.email || '?').trim();
  const avatar = item?.id === 'customer-codex'
    ? '/quad-film-icon-192.png'
    : item?.avatarDataUrl;
  if (avatar) return `<img class="avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(name)}" />`;
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
      body: JSON.stringify(fromUserId === GROUP_CHAT_ID
        ? { groupId: 'all-staff' }
        : (fromUserId === CUSTOMER_CODEX_ID ? { groupId: CUSTOMER_CODEX_GROUP_ID } : { fromUserId }))
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

async function postMessage({ text = '', attachment = null }, targetUserId = activeUserId) {
  const isGroup = targetUserId === GROUP_CHAT_ID || targetUserId === CUSTOMER_CODEX_ID;
  const groupId = targetUserId === CUSTOMER_CODEX_ID ? CUSTOMER_CODEX_GROUP_ID : 'all-staff';
  await api('/api/messages', {
    method: 'POST',
    body: JSON.stringify(isGroup ? { groupId, text, attachment } : { toUserId: targetUserId, text, attachment })
  });
  state = await api('/api/mobile/bootstrap');
  renderAuth();
  if (!messageRecorder && !messageVoiceStarting) render({ preserveActiveInput: false });
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
  queueMobileMessageUpload(file, kind, activeUserId);
}

function queueMobileMessageUpload(file, kind, targetUserId) {
  if (!file || !targetUserId) return;
  const isGroup = targetUserId === GROUP_CHAT_ID || targetUserId === CUSTOMER_CODEX_ID;
  const groupId = targetUserId === CUSTOMER_CODEX_ID ? CUSTOMER_CODEX_GROUP_ID : 'all-staff';
  const pendingId = `mobile-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const localUrl = URL.createObjectURL(file);
  mobileMessageUploadQueue.set(pendingId, {
    id: pendingId, pending: true, failed: false, file, kind, localUrl,
    scope: isGroup ? 'group' : 'direct', groupId: isGroup ? groupId : '',
    fromUserId: user?.id, fromName: user?.name || user?.email || '',
    toUserId: isGroup ? '' : targetUserId, text: '',
    attachment: { kind, name: file.name || kind, type: file.type || 'application/octet-stream', size: file.size, url: localUrl },
    createdAt: new Date().toISOString(), readAt: '', readByUserIds: isGroup ? [user?.id] : []
  });
  render({ preserveActiveInput: true });
  void runMobileMessageUpload(pendingId);
}

async function runMobileMessageUpload(pendingId) {
  const queued = mobileMessageUploadQueue.get(pendingId);
  if (!queued?.file) return;
  queued.failed = false;
  if (tab === 'chat' && !chatListMode) render({ preserveActiveInput: true });
  try {
    const uploaded = await api('/api/message-media/upload', {
      method: 'POST', timeoutMs: 120000,
      headers: {
        'Content-Type': queued.file.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(queued.file.name || 'attachment')
      },
      body: queued.file
    });
    const attachment = {
      kind: queued.kind, name: uploaded.name || queued.file.name || queued.kind,
      type: uploaded.type || queued.file.type || 'application/octet-stream',
      size: uploaded.size || queued.file.size, url: uploaded.url
    };
    await api('/api/messages', {
      method: 'POST',
      body: JSON.stringify(queued.scope === 'group'
        ? { groupId: queued.groupId, attachment, clientRequestId: pendingId }
        : { toUserId: queued.toUserId, attachment, clientRequestId: pendingId })
    });
    URL.revokeObjectURL(queued.localUrl);
    mobileMessageUploadQueue.delete(pendingId);
    state = await api('/api/mobile/bootstrap');
    renderAuth();
    if (tab === 'chat' && !messageRecorder && !messageVoiceStarting) render({ preserveActiveInput: true });
  } catch (err) {
    queued.failed = true;
    queued.error = String(err?.message || err || '');
    if (tab === 'chat' && !chatListMode) render({ preserveActiveInput: true });
  }
}

function retryMobileMessageUpload(pendingId) {
  const queued = mobileMessageUploadQueue.get(pendingId);
  if (!queued) return;
  queued.failed = false;
  render({ preserveActiveInput: true });
  void runMobileMessageUpload(pendingId);
}

function updateMobileVoiceButton(mode = 'idle', label = '') {
  const button = document.getElementById('mobileVoiceBtn');
  if (!button) return;
  button.classList.toggle('recording', mode === 'recording' || mode === 'starting');
  button.classList.toggle('sending', mode === 'sending');
  button.textContent = label || (lang === 'zh' ? '🎙️ 按住说话' : '🎙️ Hold to talk');
}

function showMobileVoiceFeedback(message, mode = 'success') {
  let feedback = document.getElementById('mobileVoiceFeedback');
  if (!feedback) {
    feedback = document.createElement('div');
    feedback.id = 'mobileVoiceFeedback';
    feedback.className = 'mobile-voice-feedback';
    feedback.setAttribute('role', 'status');
    document.body.appendChild(feedback);
  }
  clearTimeout(messageVoiceFeedbackTimer);
  feedback.className = `mobile-voice-feedback ${mode} show`;
  feedback.textContent = message;
  messageVoiceFeedbackTimer = setTimeout(() => feedback.classList.remove('show'), mode === 'sending' ? 5000 : 1800);
}

function updateMobileVoiceTimer() {
  if (messageRecorder?.state !== 'recording') return;
  const seconds = Math.min(60, Math.floor((Date.now() - messageVoiceStartedAt) / 1000));
  updateMobileVoiceButton('recording', lang === 'zh'
    ? `🔴 正在说话 ${seconds}秒 · 松开发送`
    : `🔴 Recording ${seconds}s · Release to send`);
  if (seconds >= 60) finishVoiceMessage();
}

function stopMobileVoiceTimer() {
  clearInterval(messageVoiceTimer);
  messageVoiceTimer = null;
  messageVoiceStartedAt = 0;
}

async function startVoiceMessage(event) {
  event?.preventDefault?.();
  if (messageRecorder || messageVoiceStarting) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    alert(lang === 'zh' ? '这个浏览器不支持语音录制。' : 'This browser does not support voice recording.');
    return;
  }
  messageVoiceHeld = true;
  messageVoiceStarting = true;
  try { event?.currentTarget?.setPointerCapture?.(event.pointerId); } catch {}
  updateMobileVoiceButton('starting', lang === 'zh' ? '🎙️ 正在打开麦克风…' : '🎙️ Opening microphone…');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    messageVoiceStarting = false;
    if (!messageVoiceHeld) {
      stream.getTracks().forEach(track => track.stop());
      updateMobileVoiceButton();
      return;
    }
    const targetUserId = activeUserId;
    messageRecordingStream = stream;
    messageAudioChunks = [];
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type)) || '';
    messageRecorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 24000 });
    messageRecorder.ondataavailable = event => {
      if (event.data?.size) messageAudioChunks.push(event.data);
    };
    messageRecorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      const type = messageRecorder?.mimeType || messageAudioChunks[0]?.type || 'audio/webm';
      const blob = new Blob(messageAudioChunks, { type });
      messageRecorder = null;
      messageRecordingStream = null;
      messageVoiceStarting = false;
      messageVoiceHeld = false;
      stopMobileVoiceTimer();
      if (!blob.size) return;
      if (blob.size > MAX_MESSAGE_ATTACHMENT_BYTES) {
        updateMobileVoiceButton();
        alert(t('voiceLimit'));
        return;
      }
      updateMobileVoiceButton('sending', lang === 'zh' ? '⏳ 正在发送…' : '⏳ Sending…');
      showMobileVoiceFeedback(lang === 'zh' ? '录音完成，正在发送…' : 'Recording complete. Sending…', 'sending');
      navigator.vibrate?.(35);
      try {
        const extension = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : 'webm';
        const dataUrl = await fileToDataUrl(blob);
        await postMessage({
          attachment: {
            kind: 'audio',
            name: `voice-${Date.now()}.${extension}`,
            type,
            size: blob.size,
            dataUrl
          }
        }, targetUserId);
        showMobileVoiceFeedback(lang === 'zh' ? '✓ 语音已发送' : '✓ Voice message sent');
        navigator.vibrate?.([35, 30, 70]);
      } catch (err) {
        showMobileVoiceFeedback(lang === 'zh' ? '发送失败，请重试' : 'Send failed. Please retry.', 'error');
        alert(err.message);
      } finally {
        if (!messageRecorder && !messageVoiceStarting) updateMobileVoiceButton();
      }
    };
    messageRecorder.start(100);
    messageVoiceStartedAt = Date.now();
    updateMobileVoiceTimer();
    messageVoiceTimer = setInterval(updateMobileVoiceTimer, 250);
  } catch {
    messageVoiceHeld = false;
    messageVoiceStarting = false;
    messageRecordingStream?.getTracks().forEach(track => track.stop());
    messageRecordingStream = null;
    updateMobileVoiceButton();
    alert(t('micDenied'));
  }
}

function finishVoiceMessage(event) {
  event?.preventDefault?.();
  if (!messageVoiceHeld && !messageVoiceStarting) return;
  messageVoiceHeld = false;
  if (messageRecorder?.state === 'recording') messageRecorder.stop();
}

function cancelVoiceMessage(event) {
  finishVoiceMessage(event);
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
  if (!notes.some(item => item.id === activeMobileNoteId)) activeMobileNoteId = notes[0]?.id || '';
  const selected = notes.find(item => item.id === activeMobileNoteId);
  const list = notes.map(noteListItemHtml).join('');
  return `<div class="mobile-notes-browser ${mobileNoteListMode ? 'list-mode' : 'detail-mode'}">
    <section class="mobile-notes-list-pane">
      <div class="notes-head"><div><strong>${t('myNotes')}</strong><p>${t('notesPrivate')}</p></div><div><button onclick="openNoteEditor('', 'memo')">＋ ${t('newMemo')}</button><button class="primary-inline" onclick="openNoteEditor('', 'task')">＋ ${t('newTask')}</button></div></div>
      <label class="mobile-notes-search"><span>⌕</span><input type="search" placeholder="${lang === 'zh' ? '搜索备忘录' : 'Search notes'}" oninput="filterMobileNotes(this.value)"></label>
      <div class="mobile-note-list">${list || `<div class="panel-body hint">${t('noNotes')}</div>`}</div>
    </section>
    <section class="mobile-notes-detail-pane">${selected ? mobileNoteDetailHtml(selected) : `<div class="mobile-note-empty">${t('noNotes')}</div>`}</section>
  </div>`;
}

function noteListItemHtml(item) {
  const preview = String(item.content || '').replace(/\s+/g, ' ').trim();
  const completed = item.status === 'completed';
  const search = [item.title, item.content, item.ownerName, item.type === 'task' ? t('todo') : t('memo')].filter(Boolean).join(' ');
  return `<button type="button" class="mobile-note-list-item ${item.id === activeMobileNoteId ? 'active' : ''} ${completed ? 'completed' : ''}" data-search="${escapeHtml(search)}" onclick="selectMobileNote('${item.id}')">
    <span class="mobile-note-list-icon">${item.type === 'task' ? '✓' : '▤'}</span>
    <span class="mobile-note-list-copy"><strong>${escapeHtml(item.title || (lang === 'zh' ? '未命名' : 'Untitled'))}</strong><span>${escapeHtml(preview || (item.type === 'task' ? t('todo') : t('memo')))}</span><small>${fmtDateTime(item.updatedAt || item.createdAt || item.remindAt)}</small></span>
    <b>›</b>
  </button>`;
}

function mobileNoteDetailHtml(item) {
  const completed = item.status === 'completed';
  const canEdit = item.canEdit !== false && (!item.ownerUserId || item.ownerUserId === user?.id);
  const share = item.shareScope === 'all' ? (lang === 'zh' ? '👥 全体员工' : '👥 All staff') : item.shareScope === 'users' ? (lang === 'zh' ? '↗ 指定员工' : '↗ Selected staff') : (lang === 'zh' ? '🔒 仅自己' : '🔒 Private');
  return `<article class="mobile-note-detail ${completed ? 'completed' : ''}">
    <header><button type="button" class="mobile-note-detail-back" onclick="showMobileNoteList()">‹ ${lang === 'zh' ? '记事本' : 'Notes'}</button><div>${canEdit ? `${item.type === 'task' && !completed ? `<button onclick="finishNote('${item.id}')">${t('finish')}</button>` : ''}<button onclick="openNoteEditor('${item.id}')">✎</button><button class="danger-text" onclick="deleteNote('${item.id}')">×</button>` : `<span>${lang === 'zh' ? '只读' : 'Read only'}</span>`}</div></header>
    <div class="mobile-note-paper">
      <small>${fmtDateTime(item.updatedAt || item.createdAt || item.remindAt)}</small>
      <h2>${escapeHtml(item.title || (lang === 'zh' ? '未命名' : 'Untitled'))}</h2>
      ${item.type === 'task' ? `<time>${completed ? '✓ ' + t('completed') : '⏰ ' + t('due') + ' ' + fmtDateTime(item.snoozedUntil || item.remindAt)}</time>` : ''}
      <div class="mobile-note-content">${item.content ? escapeHtml(item.content).replace(/\n/g, '<br>') : `<span>${lang === 'zh' ? '没有更多内容' : 'No additional details'}</span>`}</div>
      <footer>${canEdit ? '' : `${lang === 'zh' ? '来自' : 'From'} ${escapeHtml(item.ownerName || '')} · `}${share}</footer>
    </div>
  </article>`;
}

function selectMobileNote(noteId) {
  activeMobileNoteId = noteId || '';
  mobileNoteListMode = false;
  render();
}

function showMobileNoteList() {
  mobileNoteListMode = true;
  render();
}

function filterMobileNotes(value = '') {
  const keyword = String(value || '').trim().toLowerCase();
  document.querySelectorAll('.mobile-note-list-item').forEach(button => {
    button.hidden = Boolean(keyword) && !String(button.dataset.search || '').toLowerCase().includes(keyword);
  });
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
    activeMobileNoteId = result.item.id;
    mobileNoteListMode = false;
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
  if (activeMobileNoteId === noteId) activeMobileNoteId = state.personalNotes[0]?.id || '';
  mobileNoteListMode = true;
  render();
  try { await api(`/api/personal-notes/${noteId}`, { method: 'DELETE' }); }
  catch (err) { state.personalNotes = before; render(); alert(err.message); }
}

function salesLocalDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone:APP_TIMEZONE, year:'numeric', month:'2-digit', day:'2-digit' }).format(date);
}

function openSalesScreen(screen) {
  salesScreen = screen || 'home';
  window.scrollTo({ top:0, behavior:'smooth' });
  render();
}

function salesPage(title, body, action = '') {
  return `<section class="sales-page"><header class="sales-page-head"><button type="button" onclick="openSalesScreen('home')">‹</button><strong>${escapeHtml(title)}</strong>${action || '<span></span>'}</header>${body}</section>`;
}

function salesHomeHtml() {
  const sales = state.fieldSales || {};
  const today = salesLocalDate();
  const plans = (sales.visitPlans || []).filter(item => item.date === today && item.userId === user?.id);
  const completed = (sales.visits || []).filter(item => item.userId === user?.id && item.status === '已完成' && String(item.completedAt || '').slice(0,10) === today).length;
  const pending = (sales.accounts || []).filter(item => item.nextVisitAt && new Date(item.nextVisitAt) <= new Date()).length;
  const cards = [
    ['add','＋','新增客户','录入新客户资料','teal'], ['customers','♟','客户列表','查看全部共享客户','blue'],
    ['today','⌖','今日拜访','今天计划与进行中','orange'], ['plan','✓','计划拜访','选择客户并安排时间','purple'],
    ['report','▤','工作日报','记录今天完成事项','green'], ['nearby','⌖','附近客户','洛杉矶 / 拉斯维加斯','rose']
  ];
  return `<div class="sales-design-home"><section class="sales-design-hero"><small>QUaD FIELD SALES</small><h2>业务员管理中心</h2><p>客户 · 计划 · 拜访 · 总结</p></section><div class="sales-section-title"><b>常用功能</b><span>点击进入独立页面</span></div><div class="sales-menu-grid">${cards.map(([screen,icon,title,sub,color]) => `<button class="${color}" onclick="openSalesScreen('${screen}')"><i>${icon}</i><b>${title}</b><span>${sub}</span></button>`).join('')}</div><section class="sales-overview"><div class="sales-section-title"><b>今日概览</b><span>只显示数量</span></div><div><p><b>${plans.length}</b><span>计划拜访</span></p><p><b>${completed}</b><span>已经完成</span></p><p><b>${pending}</b><span>待跟进</span></p></div></section></div>`;
}

function salesCustomerMiniCard(account, selectMode = false) {
  const selected = salesSelectedAccountIds.includes(account.id);
  const distance = salesDistanceMiles(account);
  return `<article class="sales-customer-mini ${selected ? 'selected' : ''}"><div class="sales-customer-icon">🏪</div><div><b>${escapeHtml(account.businessName)}</b><p>${escapeHtml(account.address || '')}</p><small>${escapeHtml(account.customerType || account.stage || '客户')} · ${account.contactName ? `联系人：${escapeHtml(account.contactName)}` : '尚未填写联系人'}${distance !== null ? ` · ${distance.toFixed(1)} mi` : ''}</small></div><div class="sales-card-actions"><button onclick="openSalesReviewDialog('${account.id}')">查看资料</button><button class="primary-inline" onclick="${selectMode ? `toggleSalesPlanAccount('${account.id}')` : `quickPlanSalesAccount('${account.id}')`}">${selectMode ? (selected ? '已选择' : '选择') : '加入拜访计划'}</button></div></article>`;
}

function salesCustomersHtml(selectMode = false) {
  const accounts = state.fieldSales?.accounts || [];
  const title = selectMode ? '计划拜访' : '客户列表';
  const body = `<section class="sales-share-banner"><b>${selectMode ? '安排拜访客户' : '公司共享客户'}</b><span>${selectMode ? (salesPlanDate || salesLocalDate(1)) : '所有业务员均可查看和拜访'}</span></section><label class="sales-search">⌕<input placeholder="搜索名称、地址、电话或联系人" oninput="filterSalesCards(this.value)"></label><div class="sales-filter-row"><button>全部客户</button><button>城市⌄</button><button>距离⌄</button></div><div id="salesCustomerCards" class="sales-customer-list">${accounts.map(item => salesCustomerMiniCard(item,selectMode)).join('') || '<p class="hint">还没有共享客户</p>'}</div>${selectMode ? `<div class="sales-sticky-action"><span>已经选择 <b>${salesSelectedAccountIds.length}</b> 位客户</span><button onclick="openSalesScreen('schedule')">下一步：安排顺序和时间</button></div>` : ''}`;
  return salesPage(title, body, selectMode ? '' : '<button class="sales-head-add" onclick="openSalesScreen(\'add\')">＋ 新增</button>');
}

function filterSalesCards(value) {
  const query = String(value || '').trim().toLowerCase();
  document.querySelectorAll('#salesCustomerCards .sales-customer-mini').forEach(card => { card.hidden = query && !card.textContent.toLowerCase().includes(query); });
}

function toggleSalesPlanAccount(id) {
  salesSelectedAccountIds = salesSelectedAccountIds.includes(id) ? salesSelectedAccountIds.filter(x => x !== id) : [...salesSelectedAccountIds,id];
  render();
}

function quickPlanSalesAccount(id) { salesSelectedAccountIds = [id]; salesPlanDate = salesLocalDate(1); openSalesScreen('schedule'); }

function salesAddCustomerHtml() {
  return salesPage('新增客户', `<section class="sales-ai-import"><b>📷 拍照，AI 自动识别</b><span>识别店名、地址、电话和邮箱，并自动填入下方</span><input type="file" accept="image/*" capture onchange="analyzeSalesCustomerScreenshot(this)"></section><section class="sales-form-card"><div class="sales-section-title"><b>客户基本资料</b><span>也可以手动填写</span></div><label>客户或门店名称 *<input id="salesBusinessName"></label><label>客户地址 *<textarea id="salesAddress"></textarea></label><label>现场定位<button type="button" class="sales-location-button" onclick="fillSalesCurrentLocation()">📍 已到客户门口？获取当前位置</button></label><div class="sales-two"><label>城市<input id="salesCity"></label><label>联系电话<input id="salesPhone" type="tel"></label></div><label>电子邮箱<input id="salesEmail" type="email"></label><div class="sales-two"><label>客户类型<select id="salesCustomerType"><option>贴膜门店</option><option>汽车改色店</option><option>汽车美容店</option><option>其他</option></select></label><label>客户来源<select id="salesSource"><option>Google 搜集</option><option>Yelp 搜集</option><option>业务员发现</option><option>客户介绍</option></select></label></div><label>联系人<input id="salesContact"></label><label>客户备注<textarea id="salesNote"></textarea></label></section><button class="sales-page-primary" onclick="createSalesAccountFromPage(this)">保存到客户列表</button><p class="sales-page-note">新增客户时不安排拜访时间，保存后再到“计划拜访”选择。</p>`);
}

async function fillSalesCurrentLocation() {
  try { const p=await getPosition(); salesNearbyOrigin={lat:p.coords.latitude,lng:p.coords.longitude}; alert('定位已取得，请确认并填写完整门牌地址。'); } catch(e) { alert(e.message || t('locationFailed')); }
}

async function createSalesAccountFromPage(button) {
  try { button.disabled=true; state=await api('/api/field-sales/accounts',{method:'POST',body:JSON.stringify({businessName:document.getElementById('salesBusinessName').value,address:document.getElementById('salesAddress').value,city:document.getElementById('salesCity').value,phone:document.getElementById('salesPhone').value,email:document.getElementById('salesEmail').value,customerType:document.getElementById('salesCustomerType').value,source:document.getElementById('salesSource').value,contactName:document.getElementById('salesContact').value,note:document.getElementById('salesNote').value,lat:salesNearbyOrigin?.lat,lng:salesNearbyOrigin?.lng})}); user=state.user; salesScreen='customers'; render(); } catch(e){ alert(e.message); button.disabled=false; }
}

function salesScheduleHtml() {
  const accounts=(state.fieldSales?.accounts || []).filter(item=>salesSelectedAccountIds.includes(item.id));
  if(!salesPlanDate) salesPlanDate=salesLocalDate(1);
  return salesPage('安排顺序和时间', `<section class="sales-route-hero"><small>拜访路线</small><h3>${escapeHtml(salesPlanDate)}</h3><b>${accounts.length} 位客户</b></section><section class="sales-form-card"><label>计划日期<input id="salesPlanDate" type="date" value="${escapeHtml(salesPlanDate)}" onchange="salesPlanDate=this.value"></label><div class="sales-two"><label>开始时间<input id="salesPlanStart" type="time" value="09:30"></label><label>预计停留<input id="salesPlanStay" type="number" value="45" min="15"> 分钟</label></div></section><div class="sales-route-list">${accounts.map((item,index)=>`<article><i>${index+1}</i><div><b>${escapeHtml(item.businessName)}</b><p>${escapeHtml(item.address)}</p><small>计划到店 ${String(9+Math.floor((30+index*65)/60)).padStart(2,'0')}:${String((30+index*65)%60).padStart(2,'0')}</small></div><span>≡</span></article>`).join('') || '<p class="hint">请先选择客户</p>'}</div><button class="sales-page-primary" onclick="saveSalesVisitPlan(this)">确认并保存拜访计划</button><p class="sales-page-note">保存后将进入“今日拜访”，出发时重新使用地图更新实时路况。</p>`);
}

async function saveSalesVisitPlan(button){ if(!salesSelectedAccountIds.length)return alert('请先选择客户'); const [h,m]=(document.getElementById('salesPlanStart').value||'09:30').split(':').map(Number); try{button.disabled=true;state=await api('/api/field-sales/visit-plans',{method:'POST',body:JSON.stringify({accountIds:salesSelectedAccountIds,date:document.getElementById('salesPlanDate').value,startMinutes:h*60+m,stayMinutes:Number(document.getElementById('salesPlanStay').value||45)})});user=state.user;salesSelectedAccountIds=[];salesScreen='today';render();}catch(e){alert(e.message);button.disabled=false;}}

function salesPlanAction(plan){if(plan.status==='前往中')return `openSalesStartDialog('${plan.accountId}')`;if(plan.status==='拜访中')return `openSalesExecution('${plan.accountId}')`;return `openSalesDepartureDialog('${plan.accountId}')`;}
function salesTodayHtml(){ const today=salesLocalDate(); const plans=(state.fieldSales?.visitPlans||[]).filter(item=>item.date===today&&item.userId===user?.id); const visits=state.fieldSales?.visits||[]; const completed=plans.filter(p=>p.status==='已完成').length; const next=plans.find(p=>p.status!=='已完成'); return salesPage('今日拜访', `<section class="sales-today-stats"><p><b>${plans.length}</b><span>计划拜访</span></p><p><b>${completed}</b><span>已经完成</span></p><p><b>${Math.max(0,plans.length-completed)}</b><span>等待拜访</span></p></section>${next?`<section class="sales-next-card"><small>下一位客户</small><h3>${escapeHtml(next.businessName)}</h3><p>${escapeHtml(next.address)}</p><div><button onclick="openSalesReviewDialog('${next.accountId}')">查看资料</button><button onclick="${salesPlanAction(next)}">${next.status==='前往中'?'已到店 · 拍照打卡':next.status==='拜访中'?'继续拜访':'准备出发'}</button></div></section>`:''}<div class="sales-timeline">${plans.map(p=>`<article onclick="${p.status==='拜访中'?`openSalesExecution('${p.accountId}')`:''}"><time>${new Date(p.plannedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time><div><b>${escapeHtml(p.businessName)}</b><p>${escapeHtml(p.address)}</p></div><span>${escapeHtml(p.status||'待出发')}</span></article>`).join('')||'<p class="hint">今天还没有拜访计划，请先到“计划拜访”安排。</p>'}</div>`); }

function openSalesExecution(accountId){salesActiveAccountId=accountId;salesScreen='execution';render();}
function salesExecutionHtml(){const sales=state.fieldSales||{};const account=(sales.accounts||[]).find(x=>x.id===salesActiveAccountId);if(!account)return salesTodayHtml();const visit=(sales.visits||[]).find(x=>x.accountId===account.id&&x.userId===user?.id&&x.status==='进行中');const trip=(sales.trips||[]).find(x=>x.accountId===account.id&&x.userId===user?.id);const items=[['📷','现场照片','门店、样品和陈列照片',`openSalesCompleteDialog('${visit?.id||''}')`],['◉','沟通记录','录音转文字并由 AI 总结',`openSalesCompleteDialog('${visit?.id||''}')`],['▦','样品 / 放货','记录型号、数量和约定价格',`openSalesCompleteDialog('${visit?.id||''}')`],['＋','现场订单','直接建立客户销售订单',`openSalesFieldOrder('${account.id}','${visit?.id||''}')`],['✎','客户签收','英文签收单和手写签名',`openSalesCompleteDialog('${visit?.id||''}')`],['⌚','下次跟进','设置日期、原因和收款提醒',`openSalesFollowUp('${account.id}')`]];return salesPage('拜访执行', `<section class="sales-next-card"><small>已到店</small><h3>${escapeHtml(account.businessName)}</h3><p>${escapeHtml(account.address)}</p><div class="sales-trip-stats"><span>出发<b>${trip?.departedAt?formatMobileDateTime(trip.departedAt):'—'}</b></span><span>到达<b>${visit?.startedAt?formatMobileDateTime(visit.startedAt):'—'}</b></span></div></section><section class="sales-check-ok">✓ 到店打卡已完成<br><small>GPS 位置与客户地址匹配 · 门头照片已上传</small></section><div class="sales-execution-grid">${items.map(([icon,title,sub,action])=>`<button onclick="${action}"><i>${icon}</i><b>${title}</b><span>${sub}</span></button>`).join('')}</div><button class="sales-page-primary" onclick="openSalesCompleteDialog('${visit?.id||''}')">完成本次拜访</button>`);}

function openSalesFollowUp(accountId){const overlay=document.createElement('div');overlay.className='mobile-modal';overlay.innerHTML=`<div class="mobile-dialog"><div class="dialog-head"><strong>下次跟进</strong><button onclick="this.closest('.mobile-modal').remove()">×</button></div><label>跟进方式<input id="salesFollowMethod" value="到店拜访"></label><label>任务类型<input id="salesFollowType" value="样品测试回访"></label><label>跟进时间<input id="salesFollowDue" type="datetime-local" value="${localDateTimeValue(new Date(Date.now()+7*86400000).toISOString())}"></label><label>跟进原因<textarea id="salesFollowReason"></textarea></label><div class="dialog-actions"><button onclick="this.closest('.mobile-modal').remove()">取消</button><button class="primary" onclick="saveSalesFollowUp(this,'${accountId}')">保存跟进任务</button></div></div>`;document.body.appendChild(overlay);}
async function saveSalesFollowUp(button,accountId){try{button.disabled=true;state=await api('/api/field-sales/follow-ups',{method:'POST',body:JSON.stringify({accountId,method:document.getElementById('salesFollowMethod').value,type:document.getElementById('salesFollowType').value,dueAt:document.getElementById('salesFollowDue').value,reason:document.getElementById('salesFollowReason').value})});user=state.user;button.closest('.mobile-modal').remove();render();}catch(e){alert(e.message);button.disabled=false;}}

function openSalesFieldOrder(accountId,visitId){const overlay=document.createElement('div');overlay.className='mobile-modal';overlay.innerHTML=`<div class="mobile-dialog"><div class="dialog-head"><strong>现场订单</strong><button onclick="this.closest('.mobile-modal').remove()">×</button></div><label>订单类型<input id="salesOrderType" value="批发订单"></label><label>出货仓库<input id="salesOrderWarehouse" placeholder="可选可填"></label><label>产品 SKU<input id="salesOrderSku" list="salesProductModels"></label>${salesProductDatalist()}<div class="sales-two"><label>数量<input id="salesOrderQty" type="number" min="1" value="1"></label><label>成交单价<input id="salesOrderPrice" type="number" min="0"></label></div><div class="sales-two"><label>本次已收<input id="salesOrderPaid" type="number" min="0" value="0"></label><label>余款到期日<input id="salesOrderDue" type="date" value="${salesLocalDate(7)}"></label></div><label>付款方式<input id="salesOrderPayment" placeholder="可选可填"></label><div class="dialog-actions"><button onclick="this.closest('.mobile-modal').remove()">取消</button><button class="primary" onclick="saveSalesFieldOrder(this,'${accountId}','${visitId}')">创建现场订单</button></div></div>`;document.body.appendChild(overlay);}
async function saveSalesFieldOrder(button,accountId,visitId){try{button.disabled=true;state=await api('/api/field-sales/orders',{method:'POST',body:JSON.stringify({accountId,visitId,type:document.getElementById('salesOrderType').value,warehouse:document.getElementById('salesOrderWarehouse').value,items:[{sku:document.getElementById('salesOrderSku').value,quantity:Number(document.getElementById('salesOrderQty').value),unitPrice:Number(document.getElementById('salesOrderPrice').value)}],amountPaid:Number(document.getElementById('salesOrderPaid').value),paymentDueAt:document.getElementById('salesOrderDue').value,paymentMethod:document.getElementById('salesOrderPayment').value})});user=state.user;button.closest('.mobile-modal').remove();render();}catch(e){alert(e.message);button.disabled=false;}}

function salesDistanceMiles(account){ if(!salesNearbyOrigin||!Number.isFinite(Number(account.lat))||!Number.isFinite(Number(account.lng)))return null; const rad=x=>x*Math.PI/180; const dLat=rad(account.lat-salesNearbyOrigin.lat),dLng=rad(account.lng-salesNearbyOrigin.lng); const a=Math.sin(dLat/2)**2+Math.cos(rad(salesNearbyOrigin.lat))*Math.cos(rad(account.lat))*Math.sin(dLng/2)**2; return 3958.8*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)); }
async function locateSalesNearby(){try{const p=await getPosition();salesNearbyOrigin={lat:p.coords.latitude,lng:p.coords.longitude};render();}catch(e){alert(e.message||t('locationFailed'));}}
function salesNearbyHtml(){const accounts=[...(state.fieldSales?.accounts||[])].sort((a,b)=>(salesDistanceMiles(a)??9999)-(salesDistanceMiles(b)??9999));return salesPage('附近客户', `<section class="sales-nearby-hero"><b>当前位置周边客户</b><span>${salesNearbyOrigin?'GPS 已定位':'请先更新位置'}</span><button onclick="locateSalesNearby()">更新位置</button></section><div class="sales-filter-row"><button>10 mi 内</button><button>未拜访⌄</button><button>客户类型⌄</button></div><div class="sales-customer-list">${accounts.map((a,i)=>`<div class="sales-nearby-rank"><i>${i+1}</i>${salesCustomerMiniCard(a,false)}</div>`).join('')||'<p class="hint">还没有客户</p>'}</div>`);}

function salesReportHtml(){const today=salesLocalDate();const sales=state.fieldSales||{};const visits=(sales.visits||[]).filter(v=>v.userId===user?.id&&v.status==='已完成'&&String(v.completedAt||'').slice(0,10)===today);const trials=(sales.trialRolls||[]).filter(x=>x.userId===user?.id&&String(x.createdAt||'').slice(0,10)===today);const orders=(sales.fieldOrders||[]).filter(x=>x.userId===user?.id&&String(x.createdAt||'').slice(0,10)===today);const follow=(sales.followUps||[]).filter(x=>x.userId===user?.id&&String(x.createdAt||'').slice(0,10)===today);const total=orders.reduce((s,o)=>s+Number(o.total||0),0);const paid=orders.reduce((s,o)=>s+Number(o.amountPaid||0),0);return salesPage('工作日报', `<section class="sales-report-hero"><small>今日工作总结</small><h3>${today} · ${escapeHtml(user?.name||'')}</h3><b>${visits.length} 家已完成</b></section><section class="sales-auto-summary"><div><i>＋</i><span>新增客户</span><b>${(sales.accounts||[]).filter(x=>x.createdByUserId===user?.id&&String(x.createdAt||'').slice(0,10)===today).length} 家</b></div><div><i>⌖</i><span>客户拜访</span><b>${visits.length} 家</b></div><div><i>▦</i><span>样品 / 放货</span><b>${trials.reduce((s,x)=>s+Number(x.quantity||0),0)}</b></div><div><i>＄</i><span>现场订单</span><b>$${total.toLocaleString()}</b></div><div><i>✓</i><span>今日收款</span><b>$${paid.toLocaleString()}</b></div><div><i>⌚</i><span>新增跟进任务</span><b>${follow.length} 项</b></div></section><section class="sales-form-card"><label>AI 工作总结<textarea id="salesDailySummary">今日完成 ${visits.length} 家客户拜访，现场订单 $${total.toLocaleString()}，收款 $${paid.toLocaleString()}，已建立 ${follow.length} 项后续跟进。</textarea></label><label>客户问题／需要公司协助<textarea id="salesDailyBlockers"></textarea></label><label>人工补充<textarea id="salesDailyPlan"></textarea></label></section><button class="sales-page-primary" onclick="submitSalesDailyReport(this)">确认并提交今日工作日报</button><p class="sales-page-note">所有数字来自当天正式业务记录，AI 只负责整理总结。</p>`);}

function salesHtml() {
  const sales=state.fieldSales||{};
  if(!sales.enabled)return `<div class="panel"><div class="panel-body hint">当前账号没有业务员管理权限。</div></div>`;
  if(salesScreen==='add')return salesAddCustomerHtml();
  if(salesScreen==='customers')return salesCustomersHtml(false);
  if(salesScreen==='plan'){if(!salesPlanDate)salesPlanDate=salesLocalDate(1);return salesCustomersHtml(true);}
  if(salesScreen==='schedule')return salesScheduleHtml();
  if(salesScreen==='today')return salesTodayHtml();
  if(salesScreen==='nearby')return salesNearbyHtml();
  if(salesScreen==='report')return salesReportHtml();
  if(salesScreen==='execution')return salesExecutionHtml();
  return salesHomeHtml();
}

function legacySalesHtml() {
  const sales = state.fieldSales || {};
  if (!sales.enabled) return `<div class="panel"><div class="panel-body hint">${lang === 'en' ? 'This account has no field sales access.' : '当前账号没有业务员管理权限。'}</div></div>`;
  const now = Date.now();
  const accounts = sales.accounts || [];
  const visits = sales.visits || [];
  const trips = sales.trips || [];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
  const completedToday = visits.filter(item => item.status === '已完成' && item.completedAt && new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(item.completedAt)) === today).length;
  const overdue = accounts.filter(item => item.nextVisitAt && new Date(item.nextVisitAt).getTime() < now).length;
  const active = visits.filter(item => item.status === '进行中' && item.userId === user?.id);
  const activeTrips = trips.filter(item => item.status === '前往中' && item.userId === user?.id);
  const latestReport = (sales.dailyReports || [])[0];
  const reportAnalysis = latestReport?.aiAnalysis || {};
  const latestLocationIssues = latestReport
    ? (sales.checkInAttempts || []).filter(item => (latestReport.checkInAttemptIds || []).includes(item.id))
    : [];
  return `<section class="sales-hero">
    <div><small>QUaD FIELD SALES</small><h2>${lang === 'en' ? 'Field Sales Center' : '业务员管理中心'}</h2><p>${lang === 'en' ? 'Visit, check in, follow up, and convert.' : '到店有定位、拜访有过程、跟进有结果'}</p></div>
    <div class="sales-actions"><button onclick="openSalesAccountDialog()">＋ ${lang === 'en' ? 'Customer' : '新增客户'}</button><button onclick="openSalesDailyReport()">📝 ${lang === 'en' ? 'Daily report' : '工作日报'}</button></div>
  </section>
  <div class="sales-kpis"><div><b>${accounts.length}</b><span>${lang === 'en' ? 'Customers' : '负责客户'}</span></div><div><b>${completedToday}</b><span>${lang === 'en' ? 'Visits today' : '今日拜访'}</span></div><div class="${overdue ? 'danger' : ''}"><b>${overdue}</b><span>${lang === 'en' ? 'Overdue' : '逾期回访'}</span></div></div>
  ${activeTrips.length ? activeTrips.map(trip => `<div class="sales-trip-active"><div><small>${lang === 'en' ? 'ON THE WAY' : '正在前往'}</small><strong>${escapeHtml(trip.businessName)}</strong><p>📍 ${escapeHtml(trip.destination?.address || '')}</p></div><div class="sales-trip-stats"><span>${lang === 'en' ? 'Distance' : '预计距离'}<b>${(Number(trip.estimatedDistanceMeters || 0) / 1609.344).toFixed(1)} mi</b></span><span>${lang === 'en' ? 'Time' : '预计用时'}<b>${Number(trip.estimatedMinutes || 0)} ${lang === 'en' ? 'min' : '分钟'}</b></span></div><button onclick="openSalesStartDialog('${trip.accountId}')">${lang === 'en' ? 'Arrived · check in' : '已到店 · 拍照打卡'}</button></div>`).join('') : ''}
  ${active.length ? `<div class="sales-active"><strong>${lang === 'en' ? 'Active visit' : '正在拜访'}</strong>${active.map(item => `<button onclick="openSalesCompleteDialog('${item.id}')">${escapeHtml(item.businessName)} · ${lang === 'en' ? 'Finish report' : '结束并提交报告'}</button>`).join('')}</div>` : ''}
  ${latestReport ? `<div class="sales-active"><strong>${lang === 'en' ? 'Latest daily report' : '最近工作日报'} · AI ${escapeHtml(latestReport.aiStatus || '—')}</strong>${latestLocationIssues.length ? `<p class="bad-text">⚠️ ${lang === 'en' ? `${latestLocationIssues.length} rejected location check-in(s) were recorded.` : `发现 ${latestLocationIssues.length} 次打卡位置与客户地址不符，已写入 AI 工作报告。`}</p>` : ''}${reportAnalysis.performanceSummaryZh ? `<p>${escapeHtml(lang === 'en' ? reportAnalysis.performanceSummaryEn : reportAnalysis.performanceSummaryZh)}</p>` : ''}</div>` : ''}
  <div class="sales-list">${accounts.length ? accounts.map(salesAccountCard).join('') : `<div class="panel-body hint">${lang === 'en' ? 'No field customers yet.' : '还没有外勤客户，点击“新增客户”开始。'}</div>`}</div>`;
}

function salesAccountCard(account) {
  const visit = (state.fieldSales?.visits || []).find(item => item.accountId === account.id && item.status === '进行中' && item.userId === user?.id);
  const trip = (state.fieldSales?.trips || []).find(item => item.accountId === account.id && item.status === '前往中' && item.userId === user?.id);
  const dueAt = account.nextVisitAt ? new Date(account.nextVisitAt) : null;
  const overdue = dueAt && Number.isFinite(dueAt.getTime()) && dueAt.getTime() < Date.now();
  const latestTrial = (state.fieldSales?.trialRolls || []).find(item => item.accountId === account.id);
  const latestVisit = (state.fieldSales?.visits || []).find(item => item.accountId === account.id && item.status === '已完成');
  return `<article class="sales-card ${overdue ? 'overdue' : ''}">
    <header><div><small>${escapeHtml(account.stage || '待拜访')}</small><h3>${escapeHtml(account.businessName)}</h3></div><span>${escapeHtml(account.assignedUserName || '')}</span></header>
    <p>📍 ${escapeHtml(account.address || '')}</p>
    ${account.contactName || account.phone ? `<p>👤 ${escapeHtml(account.contactName || '')} ${escapeHtml(account.phone || '')}</p>` : ''}
    <div class="sales-meta"><span>${lang === 'en' ? 'Next' : '下次'}：<b class="${overdue ? 'bad-text' : ''}">${escapeHtml(formatMobileDateTime(account.nextVisitAt) || '—')}</b></span><span>${lang === 'en' ? 'Cycle' : '周期'}：${Number(account.cadenceDays || 7)} ${lang === 'en' ? 'days' : '天'}</span>${latestTrial ? `<span>${lang === 'en' ? 'Trial' : '试用'}：${escapeHtml(latestTrial.status)}</span>` : ''}${latestVisit ? `<span>AI：${escapeHtml(latestVisit.aiStatus || '—')}</span>` : ''}</div>
    <footer><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(account.address || '')}" target="_blank">${lang === 'en' ? 'Map' : '导航'}</a><button class="sales-review-button" onclick="openSalesReviewDialog('${account.id}')">📋 ${lang === 'en' ? 'Review' : '复盘'}</button>${visit ? `<button class="primary-inline" onclick="openSalesCompleteDialog('${visit.id}')">${lang === 'en' ? 'Finish visit' : '结束拜访'}</button>` : trip ? `<button class="primary-inline" onclick="openSalesStartDialog('${account.id}')">${lang === 'en' ? 'Arrived' : '到店打卡'}</button>` : `<button class="primary-inline" onclick="openSalesDepartureDialog('${account.id}')">${lang === 'en' ? 'Depart' : '准备出发'}</button>`}</footer>
  </article>`;
}

function salesReviewTrialHtml(item) {
  const price = value => Number(value || 0).toLocaleString(undefined, { style:'currency', currency:'USD', maximumFractionDigits:2 });
  return `<div class="sales-review-trial">
    <strong>${escapeHtml(item.productSku || item.productName || (lang === 'en' ? 'Trial product' : '试用产品'))}</strong>
    ${item.productName && item.productName !== item.productSku ? `<span>${escapeHtml(item.productName)}</span>` : ''}
    <span>${lang === 'en' ? 'Delivered' : '交付'}：${Number(item.quantity || 0)} · ${lang === 'en' ? 'Single' : '单卷'} ${price(item.singlePrice)}</span>
    <span>${lang === 'en' ? 'Wholesale' : '批发'}：${Number(item.bulkQuantity || 0)} × ${price(item.bulkUnitPrice)} · ${escapeHtml(item.status || '')}</span>
  </div>`;
}

function salesReviewConsignmentHtml(item) {
  const money = value => Number(value || 0).toLocaleString(undefined, { style:'currency', currency:'USD' });
  return `<section class="sales-consignment-review"><b>${lang === 'en' ? 'Signed consignment receipt' : '客户签收放货单'} · ${escapeHtml(item.receiptNumber || '')}</b><p>${(item.items || []).map(row => `${escapeHtml(row.productSku || row.productName || '')} × ${Number(row.quantity || 0)} · ${money(row.lineTotal)}`).join('<br>')}</p><p><strong>${lang === 'en' ? 'Received by' : '签收人'}：</strong>${escapeHtml(item.signedBy || '')} · <strong>${lang === 'en' ? 'Balance due' : '欠款'}：</strong>${money(item.amountDue)} · ${escapeHtml(formatMobileDateTime(item.paymentDueAt) || '')}</p>${item.signatureUrl ? `<img class="sales-signature-preview" src="${escapeHtml(item.signatureUrl)}" alt="signature">` : ''}</section>`;
}

function salesReviewVisitHtml(visit, trials, consignments) {
  const analysis = visit.aiAnalysis || {};
  const summary = lang === 'en' ? analysis.summaryEn : analysis.summaryZh;
  const needs = lang === 'en' ? analysis.customerNeedsEn : analysis.customerNeedsZh;
  const advice = lang === 'en' ? analysis.managerAdviceEn : analysis.managerAdviceZh;
  const checkIn = visit.checkIn || {};
  const matched = checkIn.locationMatched;
  return `<article class="sales-review-visit">
    <header><div><small>${escapeHtml(visit.outcome || visit.status || '')}</small><h4>${escapeHtml(formatMobileDateTime(visit.completedAt || visit.startedAt) || '—')}</h4></div><span>${escapeHtml(visit.userName || '')}</span></header>
    <div class="sales-review-facts">
      ${visit.contactMet ? `<span>👤 ${lang === 'en' ? 'Met' : '见到'}：${escapeHtml(visit.contactMet)}</span>` : ''}
      <span>📍 ${matched === true ? (lang === 'en' ? 'Location verified' : '定位已核验') : matched === false ? (lang === 'en' ? 'Outside location range' : '超出门店定位范围') : (lang === 'en' ? 'No location result' : '无定位结果')}</span>
      ${Number.isFinite(Number(checkIn.distanceToAccountMeters)) ? `<span>${lang === 'en' ? 'Distance' : '距离门店'}：${Math.round(Number(checkIn.distanceToAccountMeters))}m</span>` : ''}
      ${visit.travel ? `<span>🚗 ${lang === 'en' ? 'Travel' : '行程用时'}：${Number(visit.travel.actualMinutes || 0)} / ${Number(visit.travel.estimatedMinutes || 0)} ${lang === 'en' ? 'min' : '分钟'}</span><span class="${visit.travel.routeStatus === '用时异常待说明' ? 'bad-text' : ''}">${escapeHtml(visit.travel.routeStatus || '')}</span>` : ''}
    </div>
    ${checkIn.photoUrl ? `<button type="button" class="sales-review-photo" onclick="openSalesVisitPhoto('${visit.accountId}','${visit.id}')"><img src="${escapeHtml(checkIn.photoUrl)}" alt="${lang === 'en' ? 'Storefront check-in' : '到店打卡照片'}"><span>${lang === 'en' ? 'Photo & location details' : '查看照片和定位地址'}</span></button>` : ''}
    <section><b>${lang === 'en' ? 'Visit report' : '当时拜访情况'}</b><p>${escapeHtml(visit.reportText || (lang === 'en' ? 'No report.' : '没有填写拜访内容。'))}</p></section>
    ${visit.nextAction ? `<section><b>${lang === 'en' ? 'Next action' : '下一步动作'}</b><p>${escapeHtml(visit.nextAction)}</p></section>` : ''}
    ${visit.nextVisitAt ? `<p class="sales-review-next">⏰ ${lang === 'en' ? 'Next visit' : '下次回访'}：${escapeHtml(formatMobileDateTime(visit.nextVisitAt))}</p>` : ''}
    ${trials.length ? `<section><b>${lang === 'en' ? 'Products delivered' : '送出的试用产品'}</b><div class="sales-review-trials">${trials.map(salesReviewTrialHtml).join('')}</div></section>` : ''}
    ${consignments.length ? consignments.map(salesReviewConsignmentHtml).join('') : ''}
    ${(visit.evidencePhotoUrls || []).length ? `<section><b>${lang === 'en' ? 'Visit photos' : '现场拜访照片'}</b><div class="sales-evidence-grid">${visit.evidencePhotoUrls.map(url => `<img src="${escapeHtml(url)}" alt="visit evidence">`).join('')}</div></section>` : ''}
    ${summary || needs || advice ? `<section class="sales-review-ai"><b>AI ${lang === 'en' ? 'review' : '复盘分析'} · ${escapeHtml(visit.aiStatus || '')}</b>${summary ? `<p>${escapeHtml(summary)}</p>` : ''}${needs ? `<p><strong>${lang === 'en' ? 'Needs' : '客户需求'}：</strong>${escapeHtml(needs)}</p>` : ''}${advice ? `<p><strong>${lang === 'en' ? 'Advice' : '跟进建议'}：</strong>${escapeHtml(advice)}</p>` : ''}</section>` : `<p class="hint">AI：${escapeHtml(visit.aiStatus || (lang === 'en' ? 'Not analyzed' : '未分析'))}</p>`}
  </article>`;
}

function openSalesVisitPhoto(accountId, visitId) {
  const sales = state.fieldSales || {};
  const account = (sales.accounts || []).find(item => item.id === accountId);
  const visit = (sales.visits || []).find(item => item.id === visitId);
  const checkIn = visit?.checkIn || {};
  if (!visit || !checkIn.photoUrl) return;
  const customerMap = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(account?.address || visit.customerAddress || '')}`;
  const overlay = document.createElement('div');
  overlay.className = 'mobile-modal sales-photo-modal';
  overlay.innerHTML = `<div class="mobile-dialog sales-photo-dialog">
    <div class="dialog-head sales-photo-head"><div><small>${lang === 'en' ? 'Visit evidence' : '到店打卡凭证'}</small><strong>${escapeHtml(visit.businessName || account?.businessName || '')}</strong></div><button type="button" aria-label="${lang === 'en' ? 'Close' : '关闭'}" onclick="this.closest('.mobile-modal').remove()">×</button></div>
    <div class="sales-photo-body">
      <img src="${escapeHtml(checkIn.photoUrl)}" alt="${lang === 'en' ? 'Storefront check-in' : '到店打卡照片'}">
      <div class="sales-photo-location">
        <p><b>${lang === 'en' ? 'Customer address' : '客户登记地址'}</b><span>${escapeHtml(account?.address || visit.customerAddress || '—')}</span></p>
        <p><b>${lang === 'en' ? 'Photo GPS address' : '拍照定位地址'}</b><span>${escapeHtml(checkIn.address || (lang === 'en' ? 'GPS address unavailable' : '未取得定位文字地址'))}</span></p>
        <p><b>${lang === 'en' ? 'Distance' : '与客户地址距离'}</b><span>${Number.isFinite(Number(checkIn.distanceToAccountMeters)) ? `${Math.round(Number(checkIn.distanceToAccountMeters)).toLocaleString()} m` : '—'} · ${checkIn.locationMatched === true ? (lang === 'en' ? 'Verified' : '范围内') : checkIn.locationMatched === false ? (lang === 'en' ? 'Outside allowed range' : '超出允许范围') : (lang === 'en' ? 'Not verified' : '未核验')}</span></p>
      </div>
      <div class="sales-photo-actions">
        <a href="${escapeHtml(customerMap)}" target="_blank">${lang === 'en' ? 'Customer address map' : '查看客户地址地图'}</a>
        ${checkIn.mapUrl ? `<a href="${escapeHtml(checkIn.mapUrl)}" target="_blank">${lang === 'en' ? 'Photo location map' : '查看拍照位置地图'}</a>` : ''}
        <button type="button" onclick="this.closest('.mobile-modal').remove()">${lang === 'en' ? 'Back to visit review' : '返回拜访复盘'}</button>
      </div>
    </div>
  </div>`;
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function openSalesReviewDialog(accountId) {
  const sales = state.fieldSales || {};
  const account = (sales.accounts || []).find(item => item.id === accountId);
  if (!account) return;
  const visits = (sales.visits || [])
    .filter(item => item.accountId === accountId && item.status === '已完成')
    .sort((a, b) => String(b.completedAt || b.startedAt || '').localeCompare(String(a.completedAt || a.startedAt || '')));
  const trials = sales.trialRolls || [];
  const consignments = sales.consignments || [];
  const overlay = document.createElement('div'); overlay.className = 'mobile-modal sales-review-modal';
  overlay.innerHTML = `<div class="mobile-dialog sales-review-dialog">
    <div class="dialog-head"><div><small>${lang === 'en' ? 'Customer visit review' : '客户拜访复盘'}</small><strong>${escapeHtml(account.businessName)}</strong></div><button onclick="this.closest('.mobile-modal').remove()">×</button></div>
    <div class="sales-review-account">
      <p>📍 ${escapeHtml(account.address || '—')}</p>
      ${account.contactName || account.phone || account.email ? `<p>👤 ${escapeHtml(account.contactName || '')} ${escapeHtml(account.phone || '')}${account.email ? ` · ${escapeHtml(account.email)}` : ''}</p>` : ''}
      ${account.note ? `<p>📝 ${escapeHtml(account.note)}</p>` : ''}
      <p>⏰ ${lang === 'en' ? 'Current next visit' : '当前下次回访'}：${escapeHtml(formatMobileDateTime(account.nextVisitAt) || '—')}</p>
    </div>
    <div class="sales-review-title"><strong>${lang === 'en' ? 'Visit history' : '历次拜访记录'}</strong><span>${visits.length} ${lang === 'en' ? 'visits' : '次'}</span></div>
    <div class="sales-review-list">${visits.length ? visits.map(visit => salesReviewVisitHtml(visit, trials.filter(item => item.visitId === visit.id), consignments.filter(item => item.visitId === visit.id))).join('') : `<div class="sales-review-empty">${lang === 'en' ? 'No completed visits yet. The submitted report will appear here.' : '还没有已完成的拜访。业务员提交拜访结果后，会自动保存在这里。'}</div>`}</div>
  </div>`;
  document.body.appendChild(overlay);
}

function salesUserOptions(selectedId = '') {
  return (state.users || []).filter(item => item.active !== false).map(item => `<option value="${item.id}" ${item.id === selectedId ? 'selected' : ''}>${escapeHtml(item.name || item.email)}</option>`).join('');
}

function openSalesAccountDialog() {
  const sales = state.fieldSales || {};
  const overlay = document.createElement('div'); overlay.className = 'mobile-modal';
  overlay.innerHTML = `<div class="mobile-dialog"><div class="dialog-head"><strong>${lang === 'en' ? 'New field customer' : '新增业务客户'}</strong><button onclick="this.closest('.mobile-modal').remove()">×</button></div>
    <div class="sales-screenshot-import"><strong>📷 ${lang === 'en' ? 'Import from listing screenshot' : '上传客户截图自动识别'}</strong><p>${lang === 'en' ? 'Upload a Google or web listing screenshot. AI fills the form for your review.' : '上传 Google 或网页商家截图，AI 自动识别门店名称、地址和电话，保存前仍可修改。'}</p><label>${lang === 'en' ? 'Choose screenshot' : '选择客户截图'}<input id="salesScreenshot" type="file" accept="image/*" onchange="analyzeSalesCustomerScreenshot(this)"></label><span id="salesScreenshotStatus" class="hint"></span></div>
    <label>${lang === 'en' ? 'Business name' : '客户门店名称'}<input id="salesBusinessName"></label>
    <label>${lang === 'en' ? 'Address' : '门店地址'}<input id="salesAddress"></label>
    <label>${lang === 'en' ? 'Contact' : '联系人'}<input id="salesContact"></label>
    <label>${lang === 'en' ? 'Phone' : '电话'}<input id="salesPhone" inputmode="tel"></label>
    <label>Email<input id="salesEmail" type="email"></label>
    ${sales.canManage ? `<label>${lang === 'en' ? 'Salesperson' : '负责业务员'}<select id="salesAssignee">${salesUserOptions(user?.id)}</select></label>` : ''}
    <label>${lang === 'en' ? 'Visit every (days)' : '回访周期（天）'}<input id="salesCadence" type="number" min="1" value="7"></label>
    <label>${lang === 'en' ? 'Notes' : '客户备注'}<textarea id="salesNote"></textarea></label>
    <div class="dialog-actions"><button onclick="this.closest('.mobile-modal').remove()">${t('cancel')}</button><button class="primary" onclick="createSalesAccount(this)">${t('save')}</button></div></div>`;
  document.body.appendChild(overlay);
}

async function analyzeSalesCustomerScreenshot(input) {
  const file = input?.files?.[0];
  if (!file) return;
  const status = document.getElementById('salesScreenshotStatus');
  try {
    input.disabled = true;
    if (status) status.textContent = lang === 'en' ? 'Uploading and reading…' : '正在上传并识别截图…';
    const uploaded = await uploadSalesPhoto(file);
    const result = await api('/api/field-sales/accounts/extract-screenshot', { method:'POST', body:JSON.stringify({ mediaUrl:uploaded.url }) });
    const item = result.extracted || {};
    const values = {
      salesBusinessName:item.businessName,
      salesAddress:item.address,
      salesContact:item.contactName,
      salesPhone:item.phone,
      salesEmail:item.email
    };
    Object.entries(values).forEach(([id, value]) => { const field = document.getElementById(id); if (field && value) field.value = value; });
    const notes = [item.website ? `${lang === 'en' ? 'Website' : '网站'}：${item.website}` : '', item.sourceNote || ''].filter(Boolean).join('\n');
    if (notes) document.getElementById('salesNote').value = notes;
    if (status) status.textContent = lang === 'en' ? 'Recognition complete. Please verify before saving.' : '识别完成，请核对后再保存客户。';
  } catch (error) {
    if (status) status.textContent = '';
    alert(error.message || (lang === 'en' ? 'Screenshot recognition failed.' : '截图识别失败。'));
  } finally { input.disabled = false; }
}

async function createSalesAccount(button) {
  try {
    button.disabled = true;
    state = await api('/api/field-sales/accounts', { method:'POST', body:JSON.stringify({
      businessName: document.getElementById('salesBusinessName').value,
      address: document.getElementById('salesAddress').value,
      contactName: document.getElementById('salesContact').value,
      phone: document.getElementById('salesPhone').value,
      email: document.getElementById('salesEmail').value,
      assignedUserId: document.getElementById('salesAssignee')?.value || user?.id,
      cadenceDays: document.getElementById('salesCadence').value,
      note: document.getElementById('salesNote').value
    }) });
    button.closest('.mobile-modal').remove(); user = state.user; render();
  } catch (error) { alert(error.message); button.disabled = false; }
}

function openSalesDepartureDialog(accountId) {
  const account = (state.fieldSales?.accounts || []).find(item => item.id === accountId);
  if (!account) return;
  const overlay = document.createElement('div'); overlay.className = 'mobile-modal';
  overlay.innerHTML = `<div class="mobile-dialog"><div class="dialog-head"><strong>${lang === 'en' ? 'Start customer trip' : '准备出发拜访'}</strong><button onclick="this.closest('.mobile-modal').remove()">×</button></div>
    <div class="sales-departure-target"><small>${lang === 'en' ? 'TARGET CUSTOMER' : '本次目标客户'}</small><strong>${escapeHtml(account.businessName)}</strong><p>📍 ${escapeHtml(account.address)}</p></div>
    <p>${lang === 'en' ? 'The system will record this departure location and time, then compare estimated travel time with your actual arrival.' : '系统会记录本次出发位置和时间；到店打卡后自动比较预计用时与实际用时。'}</p>
    <label class="consent-row"><input id="salesTripLocationConsent" type="checkbox">${lang === 'en' ? 'I agree to use my location for this trip.' : '我同意本次行程使用手机实时定位'}</label>
    <p class="hint">${lang === 'en' ? 'Location is collected at departure and arrival only; it is not continuously tracked in the background.' : '只在出发和到店时各获取一次定位，不会在后台持续跟踪。'}</p>
    <div class="dialog-actions"><button onclick="this.closest('.mobile-modal').remove()">${t('cancel')}</button><button class="primary" onclick="startSalesTrip(this,'${account.id}')">${lang === 'en' ? 'Confirm departure' : '确认出发'}</button></div></div>`;
  document.body.appendChild(overlay);
}

async function startSalesTrip(button, accountId) {
  if (!document.getElementById('salesTripLocationConsent')?.checked) return alert(lang === 'en' ? 'Please agree to location use for this trip.' : '请先同意本次行程使用定位。');
  try {
    button.disabled = true; button.textContent = lang === 'en' ? 'Locating…' : '正在记录出发位置…';
    const position = await getPosition();
    state = await api('/api/field-sales/trips/start', { method:'POST', body:JSON.stringify({
      accountId, locationConsent:true, lat:position.coords.latitude, lng:position.coords.longitude, accuracy:position.coords.accuracy
    }) });
    user = state.user; salesScreen = 'today'; button.closest('.mobile-modal').remove(); render();
  } catch (error) { alert(error.message || t('locationFailed')); button.disabled = false; button.textContent = lang === 'en' ? 'Confirm departure' : '确认出发'; }
}

function openSalesStartDialog(accountId) {
  const account = (state.fieldSales?.accounts || []).find(item => item.id === accountId);
  if (!account) return;
  const overlay = document.createElement('div'); overlay.className = 'mobile-modal';
  overlay.innerHTML = `<div class="mobile-dialog"><div class="dialog-head"><strong>${lang === 'en' ? 'Visit check-in' : '客户拜访打卡'}</strong><button onclick="this.closest('.mobile-modal').remove()">×</button></div>
    <p><b>${escapeHtml(account.businessName)}</b><br><span class="hint">${escapeHtml(account.address)}</span></p>
    <label>${lang === 'en' ? 'Storefront live photo (required)' : '现场门店照片（必拍）'}<input id="salesVisitPhoto" type="file" accept="image/*" capture="environment"></label>
    <label>${lang === 'en' ? 'Person met' : '本次见到的人'}<input id="salesContactMet"></label>
    <label class="consent-row"><input id="salesLocationConsent" type="checkbox">${lang === 'en' ? 'I agree to use my current location for this visit.' : '我同意本次拜访使用手机实时定位'}</label>
    <p class="hint">${lang === 'en' ? 'Location is collected only when you check in.' : '系统只在本次到店打卡时获取一次定位，不会后台持续跟踪。'}</p>
    <div class="dialog-actions"><button onclick="this.closest('.mobile-modal').remove()">${t('cancel')}</button><button class="primary" onclick="startSalesVisit(this,'${account.id}')">${lang === 'en' ? 'Check in now' : '确认到店打卡'}</button></div></div>`;
  document.body.appendChild(overlay);
}

async function uploadSalesPhoto(file) {
  const optimized = await optimizeMobileImage(file);
  return api('/api/message-media/upload', { method:'POST', body:JSON.stringify({ name:optimized.name, type:optimized.type, dataUrl:await fileToDataUrl(optimized) }) });
}

async function startSalesVisit(button, accountId) {
  const photo = document.getElementById('salesVisitPhoto')?.files?.[0];
  if (!photo) return alert(lang === 'en' ? 'Take a storefront photo first.' : '请先现场拍摄客户门店照片。');
  if (!document.getElementById('salesLocationConsent')?.checked) return alert(t('needConsent'));
  try {
    button.disabled = true; button.textContent = lang === 'en' ? 'Locating…' : '正在定位…';
    const position = await getPosition();
    button.textContent = lang === 'en' ? 'Uploading…' : '正在上传照片…';
    const uploaded = await uploadSalesPhoto(photo);
    state = await api('/api/field-sales/visits/start', { method:'POST', body:JSON.stringify({
      accountId, locationConsent:true, lat:position.coords.latitude, lng:position.coords.longitude,
      accuracy:position.coords.accuracy, photoUrl:uploaded.url,
      contactMet:document.getElementById('salesContactMet')?.value || ''
    }) });
    user = state.user; salesActiveAccountId = accountId; salesScreen = 'execution'; button.closest('.mobile-modal').remove(); render();
  } catch (error) { alert(error.message || t('locationFailed')); button.disabled = false; button.textContent = lang === 'en' ? 'Check in now' : '确认到店打卡'; }
}

function salesProductDatalist() {
  return `<datalist id="salesProductModels">${(state.fieldSales?.products || []).map(item =>
    `<option value="${escapeHtml(item.sku)}">${escapeHtml(item.name || '')}</option>`
  ).join('')}</datalist>`;
}

function salesTrialRowHtml(values = {}) {
  const campaign = state.fieldSales?.campaign || {};
  return `<div class="sales-trial-row">
    <label class="sales-trial-model">${lang === 'en' ? 'Product model' : '产品型号'}<input class="sales-trial-sku" list="salesProductModels" value="${escapeHtml(values.productSku || '')}" placeholder="${lang === 'en' ? 'Search or enter a model' : '搜索或直接填写型号'}"></label>
    <label>${lang === 'en' ? 'Qty' : '数量'}<input class="sales-trial-qty" type="number" min="1" value="${Number(values.quantity || 1)}"></label>
    <label>${lang === 'en' ? 'Single price' : '单卷价'}<input class="sales-trial-single" type="number" min="0" step="0.01" value="${Number(values.singlePrice ?? campaign.singlePrice ?? 800)}"></label>
    <label>${lang === 'en' ? 'Bulk qty' : '批发数量'}<input class="sales-trial-bulk-qty" type="number" min="1" value="${Number(values.bulkQuantity ?? campaign.bulkQuantity ?? 10)}"></label>
    <label>${lang === 'en' ? 'Bulk unit' : '批发单价'}<input class="sales-trial-bulk-price" type="number" min="0" step="0.01" value="${Number(values.bulkUnitPrice ?? campaign.bulkUnitPrice ?? 500)}"></label>
    <button class="sales-trial-remove" type="button" onclick="removeSalesTrialRow(this)" aria-label="${lang === 'en' ? 'Remove row' : '删除这一行'}">×</button>
  </div>`;
}

function addSalesTrialRow() {
  const rows = document.getElementById('salesTrialRows');
  if (!rows || rows.children.length >= 20) return;
  rows.insertAdjacentHTML('beforeend', salesTrialRowHtml());
}

function removeSalesTrialRow(button) {
  const rows = document.getElementById('salesTrialRows');
  button.closest('.sales-trial-row')?.remove();
  if (rows && !rows.children.length) addSalesTrialRow();
}

function readSalesTrialItems() {
  return [...document.querySelectorAll('#salesTrialRows .sales-trial-row')].map(row => ({
    productSku: row.querySelector('.sales-trial-sku')?.value.trim() || '',
    quantity: Number(row.querySelector('.sales-trial-qty')?.value || 1),
    singlePrice: Number(row.querySelector('.sales-trial-single')?.value || 0),
    bulkQuantity: Number(row.querySelector('.sales-trial-bulk-qty')?.value || 1),
    bulkUnitPrice: Number(row.querySelector('.sales-trial-bulk-price')?.value || 0)
  })).filter(item => item.productSku);
}

let salesSignatureHasInk = false;

function setupSalesSignaturePad() {
  const canvas = document.getElementById('salesCustomerSignature');
  if (!canvas) return;
  salesSignatureHasInk = false;
  const context = canvas.getContext('2d');
  context.lineWidth = 3; context.lineCap = 'round'; context.strokeStyle = '#17212b';
  let drawing = false;
  const point = event => { const rect = canvas.getBoundingClientRect(); return { x:(event.clientX - rect.left) * canvas.width / rect.width, y:(event.clientY - rect.top) * canvas.height / rect.height }; };
  canvas.addEventListener('pointerdown', event => { drawing = true; salesSignatureHasInk = true; canvas.setPointerCapture(event.pointerId); const p = point(event); context.beginPath(); context.moveTo(p.x,p.y); });
  canvas.addEventListener('pointermove', event => { if (!drawing) return; const p = point(event); context.lineTo(p.x,p.y); context.stroke(); });
  const stop = () => { drawing = false; };
  canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop);
}

function clearSalesSignature() {
  const canvas = document.getElementById('salesCustomerSignature');
  canvas?.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height); salesSignatureHasInk = false;
}

function salesSignatureFile() {
  const canvas = document.getElementById('salesCustomerSignature');
  if (!canvas || !salesSignatureHasInk) return Promise.resolve(null);
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob ? new File([blob], `customer-signature-${Date.now()}.png`, { type:'image/png' }) : null), 'image/png'));
}

async function transcribeSalesVisitAudio(input) {
  const file = input?.files?.[0]; if (!file) return;
  const status = document.getElementById('salesAudioStatus');
  try {
    input.disabled = true; if (status) status.textContent = lang === 'en' ? 'Transcribing…' : '正在把拜访录音转成文字…';
    const result = await api('/api/ai-boss/transcribe', { method:'POST', body:JSON.stringify({ dataUrl:await fileToDataUrl(file), language:lang === 'en' ? 'en' : 'zh' }) });
    const report = document.getElementById('salesReportText');
    report.value = [report.value.trim(), result.text || ''].filter(Boolean).join('\n\n');
    if (status) status.textContent = lang === 'en' ? 'Transcript added below. Please verify it.' : '录音文字已填入下方，请核对和补充。';
  } catch (error) { if (status) status.textContent = ''; alert(`${t('transcribeFailed')}：${error.message}`); }
  finally { input.disabled = false; }
}

function openSalesCompleteDialog(visitId) {
  const visit = (state.fieldSales?.visits || []).find(item => item.id === visitId);
  if (!visit) return;
  const overlay = document.createElement('div'); overlay.className = 'mobile-modal';
  overlay.innerHTML = `<div class="mobile-dialog"><div class="dialog-head"><strong>${lang === 'en' ? 'Visit report' : '提交拜访结果'}</strong><button onclick="this.closest('.mobile-modal').remove()">×</button></div>
    <p><b>${escapeHtml(visit.businessName)}</b></p>
    <label>${lang === 'en' ? 'Visit audio (AI transcription)' : '拜访录音（AI 转文字）'}<input id="salesVisitAudio" type="file" accept="audio/*" capture onchange="transcribeSalesVisitAudio(this)"></label><span id="salesAudioStatus" class="hint"></span>
    <label>${lang === 'en' ? 'Visit result' : '拜访过程和结果'}<textarea id="salesReportText" placeholder="${lang === 'en' ? 'Customer needs, objections, decision maker, result…' : '客户需求、异议、决策人、沟通过程和结果…'}"></textarea></label>
    <label>${lang === 'en' ? 'Store, samples, and delivery photos' : '门店、样品和放货现场照片（可多选）'}<input id="salesEvidencePhotos" type="file" accept="image/*" multiple></label>
    <label>${lang === 'en' ? 'Outcome' : '本次结果'}<select id="salesOutcome"><option>继续跟进</option><option>已送试用</option><option>有采购意向</option><option>已成交</option><option>暂不需要</option></select></label>
    <label>${lang === 'en' ? 'Next action' : '下一步动作'}<textarea id="salesNextAction"></textarea></label>
    <label>${lang === 'en' ? 'Next visit' : '下次回访时间'}<input id="salesNextVisit" type="datetime-local" value="${localDateTimeValue()}"></label>
    <label class="consent-row"><input id="salesTrialDelivered" type="checkbox" onchange="document.getElementById('salesTrialFields').classList.toggle('hidden',!this.checked)">${lang === 'en' ? 'Trial roll delivered' : '本次已交付试用膜'}</label>
    <div id="salesTrialFields" class="hidden">${salesProductDatalist()}<div class="sales-trial-head"><strong>${lang === 'en' ? 'Trial products and pricing' : '试用型号与对应价格'}</strong><button type="button" onclick="addSalesTrialRow()">＋ ${lang === 'en' ? 'Add model' : '增加型号'}</button></div>
      <div id="salesTrialRows">${salesTrialRowHtml()}</div>
      <div class="sales-consignment-fields"><label>${lang === 'en' ? 'Amount paid now' : '本次已收款'}<input id="salesAmountPaid" type="number" min="0" step="0.01" value="0"></label><label>${lang === 'en' ? 'Balance due date' : '欠款到期时间'}<input id="salesPaymentDueAt" type="datetime-local" value="${localDateTimeValue(new Date(Date.now()+7*86400000).toISOString())}"></label><label>${lang === 'en' ? 'Received by' : '客户签收人'}<input id="salesSignedBy" placeholder="${lang === 'en' ? 'Customer name' : '客户姓名'}"></label></div>
      <div class="sales-signature-box"><div><strong>${lang === 'en' ? 'Customer signature' : '客户手写签名'}</strong><button type="button" onclick="clearSalesSignature()">${lang === 'en' ? 'Clear' : '清除'}</button></div><p>${lang === 'en' ? 'I acknowledge receipt of the listed products and agreed prices.' : '英文签收说明：客户确认收到上述产品，并认可所列数量与约定价格。'}</p><canvas id="salesCustomerSignature" width="600" height="180"></canvas></div>
    </div>
    <p class="hint">${lang === 'en' ? 'The report is saved immediately. AI bilingual analysis is queued when configured.' : '提交后立即保存；已配置 AI 时会进入中英文分析队列。'}</p>
    <div class="dialog-actions"><button onclick="this.closest('.mobile-modal').remove()">${t('cancel')}</button><button class="primary" onclick="completeSalesVisit(this,'${visit.id}')">${lang === 'en' ? 'Submit result' : '提交结果'}</button></div></div>`;
  document.body.appendChild(overlay); setupSalesSignaturePad();
}

async function completeSalesVisit(button, visitId) {
  try {
    const trialDelivered = document.getElementById('salesTrialDelivered').checked;
    const trialItems = readSalesTrialItems();
    if (trialDelivered && !trialItems.length) {
      return alert(lang === 'en' ? 'Add at least one trial product model.' : '请至少填写一个试用产品型号。');
    }
    button.disabled = true;
    button.textContent = lang === 'en' ? 'Uploading…' : '正在保存现场资料…';
    const evidencePhotoUrls = [];
    for (const file of [...(document.getElementById('salesEvidencePhotos')?.files || [])].slice(0,12)) {
      const uploaded = await uploadSalesPhoto(file); evidencePhotoUrls.push(uploaded.url);
    }
    let signatureUrl = '';
    if (trialDelivered) {
      const signature = await salesSignatureFile();
      if (!signature) { button.disabled = false; button.textContent = lang === 'en' ? 'Submit result' : '提交结果'; return alert(lang === 'en' ? 'Ask the customer to sign before submitting.' : '请客户先在签名框手写签名。'); }
      signatureUrl = (await uploadSalesPhoto(signature)).url;
    }
    state = await api(`/api/field-sales/visits/${visitId}/complete`, { method:'PUT', body:JSON.stringify({
      reportText:document.getElementById('salesReportText').value,
      outcome:document.getElementById('salesOutcome').value,
      nextAction:document.getElementById('salesNextAction').value,
      nextVisitAt:document.getElementById('salesNextVisit').value,
      trialDelivered,
      trialItems,
      evidencePhotoUrls,
      amountPaid:Number(document.getElementById('salesAmountPaid')?.value || 0),
      paymentDueAt:document.getElementById('salesPaymentDueAt')?.value || '',
      signedBy:document.getElementById('salesSignedBy')?.value || '',
      signatureUrl
    }) });
    user = state.user; button.closest('.mobile-modal')?.remove(); render();
    const savedVisit = (state.fieldSales?.visits || []).find(item => item.id === visitId);
    if (savedVisit?.aiStatus === '待分析') {
      api(`/api/field-sales/visits/${visitId}/analyze`, { method:'POST', body:'{}' })
        .then(next => { state = next; user = state.user; render(); })
        .catch(() => sync({ force:true }));
    }
  } catch (error) { alert(error.message); button.disabled = false; }
}

function openSalesDailyReport() {
  const overlay = document.createElement('div'); overlay.className = 'mobile-modal';
  overlay.innerHTML = `<div class="mobile-dialog"><div class="dialog-head"><strong>${lang === 'en' ? 'Daily sales report' : '业务员工作日报'}</strong><button onclick="this.closest('.mobile-modal').remove()">×</button></div>
    <label>${lang === 'en' ? 'Today summary' : '今天完成了什么'}<textarea id="salesDailySummary"></textarea></label>
    <label>${lang === 'en' ? 'Problems / support needed' : '客户问题／需要公司协助'}<textarea id="salesDailyBlockers"></textarea></label>
    <label>${lang === 'en' ? 'Tomorrow plan' : '下一步计划'}<textarea id="salesDailyPlan"></textarea></label>
    <div class="dialog-actions"><button onclick="this.closest('.mobile-modal').remove()">${t('cancel')}</button><button class="primary" onclick="submitSalesDailyReport(this)">${t('save')}</button></div></div>`;
  document.body.appendChild(overlay);
}

async function submitSalesDailyReport(button) {
  try {
    button.disabled = true;
    state = await api('/api/field-sales/daily-reports', { method:'POST', body:JSON.stringify({
      summary:document.getElementById('salesDailySummary').value,
      blockers:document.getElementById('salesDailyBlockers').value,
      plan:document.getElementById('salesDailyPlan').value
    }) });
    user = state.user; button.closest('.mobile-modal')?.remove(); render();
    const report = (state.fieldSales?.dailyReports || []).find(item => item.userId === user?.id);
    if (report?.aiStatus === '待分析') {
      api(`/api/field-sales/daily-reports/${report.id}/analyze`, { method:'POST', body:'{}' })
        .then(next => { state = next; user = state.user; render(); })
        .catch(() => sync({ force:true }));
    }
  } catch (error) { alert(error.message); button.disabled = false; }
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

function supervisionTaskIsOverdue(task) {
  const dueTime = new Date(task?.dueAt || '').getTime();
  const createdTime = new Date(task?.createdAt || '').getTime();
  if (!Number.isFinite(dueTime) || (Number.isFinite(createdTime) && dueTime < createdTime)) return false;
  return !['已完成','已取消','completed','cancelled','canceled'].includes(String(task.status || '').toLowerCase()) && dueTime < Date.now();
}

function supervisionTaskDueLabel(task) {
  const dueTime = new Date(task?.dueAt || '').getTime();
  const createdTime = new Date(task?.createdAt || '').getTime();
  if (!Number.isFinite(dueTime) || (Number.isFinite(createdTime) && dueTime < createdTime)) return '原自动时间无效，请重新设置';
  return formatMobileDateTime(task.dueAt) || '—';
}

function checkSupervisionReminder(options = {}) {
  if (!state?.aiBossTasks || document.hidden || !user?.id) return;
  const completedStatuses = ['已完成','已取消','待验收','completed','cancelled','canceled'];
  const candidates = state.aiBossTasks.filter(task => task.assigneeUserId === user.id && !completedStatuses.includes(String(task.status || '').toLowerCase()));
  if (!candidates.length || document.querySelector('.supervision-reminder.open')) return;
  const timeKey = `filmShopCloud.aiBossReminder.${user.id}`;
  const overdue = candidates.some(supervisionTaskIsOverdue);
  const interval = overdue ? 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
  if (!options.force && Date.now() - Number(localStorage.getItem(timeKey) || 0) < interval) return;
  const sorted = [...candidates].sort((a,b) => Number(supervisionTaskIsOverdue(b)) - Number(supervisionTaskIsOverdue(a)) || String(a.dueAt || '').localeCompare(String(b.dueAt || '')));
  const taskKey = `filmShopCloud.aiBossReminder.lastTask.${user.id}`;
  const previousIndex = sorted.findIndex(task => task.id === (localStorage.getItem(taskKey) || ''));
  const task = sorted[previousIndex >= 0 ? (previousIndex + 1) % sorted.length : 0];
  const position = sorted.findIndex(row => row.id === task.id) + 1;
  let overlay = document.querySelector('.supervision-reminder');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'supervision-reminder';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="supervision-reminder-card"><div class="supervision-reminder-icon">🧠</div><small>智能督办提醒 · ${supervisionTaskIsOverdue(task) ? '任务已逾期（每1小时提醒）' : `未完成任务（每2小时提醒 · ${position}/${sorted.length}）`}</small><h2>${escapeHtml(task.title || '')}</h2><p>${escapeHtml(task.description || '')}</p><time>截止：${escapeHtml(supervisionTaskDueLabel(task))}</time><footer><button onclick="closeSupervisionReminder()">稍后提醒</button><button class="primary" onclick="openSupervisionReminderTask()">立即处理</button></footer></div>`;
  overlay.classList.add('open');
  localStorage.setItem(timeKey, String(Date.now()));
  localStorage.setItem(taskKey, task.id);
}

function closeSupervisionReminder() { document.querySelector('.supervision-reminder')?.classList.remove('open'); }
function openSupervisionReminderTask() { closeSupervisionReminder(); setTab('supervision'); }
function checkSupervisionReminderAfterActivity() {
  if (!token || Date.now() - supervisionReminderActivityCheckAt < 60000) return;
  supervisionReminderActivityCheckAt = Date.now();
  checkSupervisionReminder();
}
function startSupervisionReminderLoop() {
  if (!supervisionReminderTimer) supervisionReminderTimer = setInterval(checkSupervisionReminder, 60000);
  if (!user?.id || supervisionReminderSessionUserId === user.id) return;
  supervisionReminderSessionUserId = user.id;
  setTimeout(() => checkSupervisionReminder({ force:true }), 800);
}
function stopSupervisionReminderLoop() {
  if (supervisionReminderTimer) clearInterval(supervisionReminderTimer);
  supervisionReminderTimer = null;
  supervisionReminderSessionUserId = '';
  supervisionReminderActivityCheckAt = 0;
  closeSupervisionReminder();
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
  return `<article class="supervision-card"><header><span>${escapeHtml(task.status || '')}</span><b>${escapeHtml(task.priority || '普通')}</b></header><h3>${escapeHtml(task.title || '')}</h3><p>${escapeHtml(task.description || '')}</p><dl><div><dt>负责人</dt><dd>${escapeHtml(task.assigneeName || '')}</dd></div><div><dt>截止</dt><dd>${escapeHtml(supervisionTaskDueLabel(task))}</dd></div><div><dt>进度</dt><dd>${Number(task.progress || 0)}%</dd></div></dl>${task.acceptanceCriteria ? `<aside><strong>验收：</strong>${escapeHtml(task.acceptanceCriteria)}</aside>` : ''}${task.result ? `<aside><strong>结果：</strong>${escapeHtml(task.result)}</aside>` : ''}<footer>${actions.join('')}</footer></article>`;
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
  const proposed = value ? new Date(value) : new Date('');
  const fallback = new Date(Date.now() + 24 * 60 * 60 * 1000); fallback.setHours(17,0,0,0);
  const date = Number.isFinite(proposed.getTime()) && proposed.getTime() > Date.now() ? proposed : fallback;
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:APP_TIMEZONE, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23' }).formatToParts(date).reduce((result,item)=>(result[item.type]=item.value,result),{});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function openSupervisionDraft(draft, sourceText, provider) {
  const minimumDue = localDateTimeValue(new Date(Date.now() + 60 * 1000).toISOString());
  const overlay = document.createElement('div'); overlay.className = 'mobile-modal';
  overlay.innerHTML = `<div class="mobile-dialog"><div class="dialog-head"><strong>AI 任务确认单</strong><button onclick="this.closest('.mobile-modal').remove()">×</button></div><p class="hint">${provider === 'openai' ? 'OpenAI' : 'DeepSeek'} 已整理，请确认后再正式派单。</p>
    <label>任务标题<input id="supervisionTitle" value="${escapeHtml(draft.title || '')}"></label>
    <label>具体要求<textarea id="supervisionDescription">${escapeHtml(draft.description || sourceText || '')}</textarea></label>
    <label>负责人<select id="supervisionAssignee"><option value="">请选择</option>${supervisionUserOptions(draft.assigneeUserId || '')}</select></label>
    <label>截止时间<input id="supervisionDueAt" type="datetime-local" min="${minimumDue}" value="${localDateTimeValue(draft.dueAt)}"></label>
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
