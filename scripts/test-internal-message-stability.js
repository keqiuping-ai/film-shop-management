const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-internal-message-stability-'));
const port = 49100 + Math.floor(Math.random() * 400);
const baseUrl = `http://127.0.0.1:${port}`;
let child;
let output = '';

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Test server did not start.\n${output}`);
}

async function request(pathname, token = '', options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise(resolve => child.once('exit', resolve));
}

async function run() {
  const appSource = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const mobileSource = fs.readFileSync(path.join(root, 'public', 'mobile.js'), 'utf8');
  const mobileHtml = fs.readFileSync(path.join(root, 'public', 'mobile.html'), 'utf8');
  const indexSource = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');
  const realtimeSource = fs.readFileSync(path.join(root, 'public', 'realtime-calls.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

  assert.match(appSource, /selectedUserId \|\| activeMessageUserId \|\| rememberedMessageUserId \|\| \(firstUnread/, 'Remembered conversation must be considered before unread fallback');
  const renderMessageModalSource = appSource.slice(appSource.indexOf('function renderMessageModal'), appSource.indexOf('function messageModalHtml'));
  assert(renderMessageModalSource.indexOf('resolveActiveMessageThread(users);') < renderMessageModalSource.indexOf('messageModalHtml(users)'), 'Conversation must be resolved before its messages are rendered');
  assert.doesNotMatch(appSource, /const activeUser = isGroup \? null : \(users\.find[\s\S]{0,80}\|\| users\[0\]\)/, 'A transient contact list must not switch the visible conversation');
  assert.match(appSource, /message-row[^>]+data-message-id=/, 'Message rows need stable ids for scroll anchoring');
  assert.match(appSource, /captureMessageThreadScrollAnchor/, 'Message refresh must preserve the visible message anchor');
  assert.match(appSource, /\[0, 80, 180\]\.forEach/, 'Late timers must not keep moving the thread after the user starts reading');
  assert.match(appSource, /api\('\/api\/messages', \{ timeoutMs: 30000 \}\)/, 'Open chat must refresh from the dedicated durable messages endpoint');
  assert.match(appSource, /const internalMessageSendQueue = new Map\(\)/, 'Text sends must use a queue that survives state replacement');
  assert.match(appSource, /internalMessageSendQueue\.set\(pendingId, pendingMessage\)/, 'Text must be rendered optimistically before the request finishes');
  assert.match(appSource, /正在发送…/, 'Pending text must show a visible sending status');
  assert.match(appSource, /visibleMessagesBeforeRefresh\.length && !visibleMessagesAfterRefresh\.length/, 'Transient empty refreshes must preserve a visible thread');
  assert.match(appSource, /visibleMessagesBeforeRead\.length && !visibleMessagesAfterRead\.length/, 'A transient empty read response must preserve a visible thread');
  assert(indexSource.includes('/app.js?v=152'), 'Desktop app asset marker must be bumped');
  assert(indexSource.includes('/styles.css?v=103'), 'Desktop stylesheet marker must be bumped');
  assert.match(mobileSource, /const mobileMessageSendQueue = new Map\(\)/, 'Mobile text sends must survive bootstrap replacement');
  assert.match(mobileSource, /mobileMessageSendQueue\.set\(pendingId/, 'Mobile text must render optimistically');
  assert.match(mobileSource, /正在发送…/, 'Mobile pending text must show sending status');
  assert.match(mobileSource, /preserveMobileMessageSnapshot/, 'Mobile refreshes must preserve a visible non-empty thread');
  assert(mobileHtml.includes('/mobile.js?v=69'), 'Mobile app asset marker must be bumped');
  assert(serviceWorker.includes('film-shop-v143-portal-message-status'), 'Service worker cache must be bumped');
  assert.match(appSource, /function capturePageContinuityState\(\)/, 'Desktop refreshes must capture page and nested-scroll positions');
  assert.match(appSource, /function restorePageContinuityState\(snapshot\)/, 'Desktop refreshes must restore page and nested-scroll positions');
  assert.match(appSource, /const unchangedBackgroundRefresh = Boolean\(/, 'Unchanged background refreshes must not rebuild the current page');
  assert.match(appSource, /captureCustomerAiRulesUiState\(\) \|\| uiStateAtStart/, 'AI rules must preserve scrolling performed while a request is in flight');
  assert.match(appSource, /openInternalMessageAnalysis/, 'Desktop chat must expose the saved AI analysis panel');
  assert.match(mobileSource, /openMobileMessageAnalysis/, 'Mobile chat must expose the saved AI analysis panel');
  assert.match(serverSource, /detail:`AI 分析 \$\{targetDate\} 聊天；未自动创建任务`/, 'Chat analysis must be persisted without automatically creating a task');
  assert(serverSource.includes('用户明确确认后从聊天 AI 分析生成督办任务'), 'Task creation must require an explicit action');
  assert.match(serverSource, /realtime\/translations\/client_secrets/, 'Server must issue a short-lived Realtime translation secret');
  assert.match(realtimeSource, /gpt-realtime|realtime\/translations\/calls/, 'Call client must use the dedicated Realtime translation endpoint');
  assert.doesNotMatch(realtimeSource, /AI 正在自动记录|整理通话结果|toggleAutoRecord|createTaskFromCall/, 'Retired call recording and AI summary controls must be absent');
  assert.doesNotMatch(serverSource, /action === 'recording'|operation === 'summary'|voice-call-summary/, 'Retired call recording and AI summary API paths must be absent');
  assert.match(realtimeSource, /setTranslationLanguage/, 'Call UI must expose target-language selection');
  assert.match(realtimeSource, /translationEnabled = false/, 'Every call must default to direct audio without translation');
  assert.match(realtimeSource, /setTranslationMode\('direct'\)/, 'Call UI must expose an explicit direct-call mode');
  assert.match(realtimeSource, /setTranslationMode\('translate'\)/, 'Call UI must require an explicit translation mode');
  assert.match(realtimeSource, /document\.documentElement\.lang/, 'Call UI language must follow the app language');
  assert.match(realtimeSource, /translationSidecars\.get\(key\) === sidecar/, 'Stale translation sessions must not replace a newer session');
  assert.match(realtimeSource, /Choose the language you want to hear/, 'Translation mode must wait for an explicit language selection');
  assert(indexSource.includes('/realtime-calls.js?v=35') && mobileHtml.includes('/realtime-calls.js?v=35'), 'Call client asset marker must be bumped');
  assert(indexSource.includes('/realtime-calls.css?v=15') && mobileHtml.includes('/realtime-calls.css?v=15'), 'Call styles asset marker must be bumped');
  assert.match(realtimeSource, /webkitSpeechRecognition/, 'Local microphone captions must use browser speech recognition without opening a second OpenAI session');
  assert.match(realtimeSource, /SpeechRecognitionPhrase/, 'Supported browsers must receive automotive-film phrase hints');
  assert.match(realtimeSource, /磁控溅射膜/, 'Local captions must include the automotive-film terminology glossary');
  assert.match(realtimeSource, /normalizeCallTranscript/, 'Known industry homophones must be corrected before captions are rendered');
  assert.match(serverSource, /noise_reduction: \{ type:'far_field' \}/, 'OpenAI translation input must use laptop/conference-room noise reduction');
  assert.match(realtimeSource, /event\.type === 'session\.output_transcript\.delta'/, 'Remote translated speech must populate the translated transcript');
  assert.doesNotMatch(realtimeSource, /session\.input_transcript\.delta/, 'The stable translation path must not create a second OpenAI input-transcription session');
  assert.match(realtimeSource, /scrollTop = transcriptRow\.scrollHeight/, 'Both transcript panes must automatically follow the latest text');
  assert.match(realtimeSource, /sidecar\.track = mediaStreamTrack\.clone\(\)/, 'The proven first-version Safari translation path must use one cloned remote track');
  assert.match(realtimeSource, /tracks\.length === 1[\s\S]*startTranslationTrack\(tracks\[0\]\[0\], tracks\[0\]\[1\]\)/, 'Two-person translation must keep the proven direct remote-track path');
  assert.match(realtimeSource, /tracks\.length[\s\S]*createMediaStreamDestination\(\)[\s\S]*startTranslationTrack\(destination\.stream\.getAudioTracks\(\)\[0\], 'group'\)/, 'Group calls must mix remote speakers into one OpenAI translation connection');
  assert.doesNotMatch(realtimeSource, /translationRetryTimers|scheduleTranslationReconnect|getStats/, 'The restored first-version path must not layer reconnect or stats state machines over translation');
  assert.match(realtimeSource, /resolution:\{ width:640, height:360 \}, frameRate:15/, 'Optional camera must start at 360p and 15fps');
  assert.match(realtimeSource, /maxBitrate:400_000, maxFramerate:15/, 'Video bandwidth must be capped below the audio and translation priority path');
  assert.match(realtimeSource, /quality !== 'poor'.*!cameraEnabled/s, 'Weak-network protection must only act when video is enabled');
  assert.match(realtimeSource, /toggleCamera\(true,.*保护语音和翻译/s, 'Sustained weak network must shut video off before audio or translation');

  child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1', ENABLE_CLOUD_DAILY_BACKUPS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  await waitForServer();

  const login = await request('/api/login', '', {
    method: 'POST', body: JSON.stringify({ email: 'admin@filmshop.local', password: 'admin123' })
  });
  assert.equal(login.response.status, 200, JSON.stringify(login.body));
  const token = login.body.token;

  for (const text of ['第一条稳定性测试消息', '第二条稳定性测试消息']) {
    const sent = await request('/api/messages', token, {
      method: 'POST',
      body: JSON.stringify({ groupId: 'all-staff', text, clientRequestId: `stability-${text}` })
    });
    assert.equal(sent.response.status, 200, JSON.stringify(sent.body));
  }

  const beforeRead = await request('/api/messages', token);
  assert.equal(beforeRead.response.status, 200);
  const idsBeforeRead = beforeRead.body.messages.map(message => message.id);
  assert.deepEqual(beforeRead.body.messages.slice(-2).map(message => message.text), ['第一条稳定性测试消息', '第二条稳定性测试消息']);

  const markedRead = await request('/api/messages/read', token, {
    method: 'PUT', body: JSON.stringify({ groupId: 'all-staff' })
  });
  assert.equal(markedRead.response.status, 200);

  const afterRead = await request('/api/messages', token);
  assert.equal(afterRead.response.status, 200);
  assert.deepEqual(afterRead.body.messages.map(message => message.id), idsBeforeRead, 'Marking a thread read must never remove or reorder its messages');
  console.log('Internal message stability regression tests passed.');
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  await stopServer();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
