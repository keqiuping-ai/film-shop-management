/* Private recruiting workspace. Candidate records are fetched independently of bootstrap. */
(() => {
  'use strict';
  const TZ = 'America/Los_Angeles';
  const DEFAULT_ADDRESS = '3212 Santa Monica Blvd, Santa Monica, CA 90404';
  const candidateStates = [
    ['new', '新申请', 'New'], ['reviewing', '待审核', 'Reviewing'], ['contacted', '已联系', 'Contacted'],
    ['invited', '已邀请', 'Invited'], ['confirmed', '已确认面试', 'Confirmed'], ['interviewed', '已面试', 'Interviewed'],
    ['on_hold', '待跟进', 'On hold'], ['hired', '已录用', 'Hired'], ['not_suitable', '暂不适合', 'Not suitable']
  ];
  const interviewStates = [
    ['scheduled', '拟定时间·待对方确认', 'Proposed · awaiting confirmation'], ['confirmed', '对方已确认', 'Candidate confirmed'],
    ['arrived', '已到店', 'Arrived'], ['completed', '面试完成', 'Completed'], ['cancelled', '已取消', 'Cancelled'], ['no_show', '未到场', 'No-show']
  ];
  const dimensions = [
    ['sales', '销售能力', 'Sales skills'], ['dealershipNetwork', '经销商资源', 'Dealership network'],
    ['plan', '第一周开发计划', 'First-week plan'], ['communication', '业务沟通', 'Business communication'],
    ['execution', '执行力与案例', 'Execution and evidence'], ['fit', '通勤、到岗及岗位匹配', 'Availability and job fit']
  ];
  let data = null, identity = '', loadedAt = 0, loading = null, error = '';
  let query = '', status = '', tab = 'candidates', scope = '', candidateSort = 'applied', busy = false;
  let composeContext = null;
  const translationCache = new Map(), translationPending = new Map();
  let translationQueue = Promise.resolve(), translationCacheSize = 0;
  const hasHan = text => /\p{Script=Han}/u.test(String(text || ''));
  const phoneKey = phone => { const digits = String(phone || '').replace(/\D/g, ''); return digits.length === 10 ? `1${digits}` : digits; };
  const tr = (zh, en) => lang === 'zh' ? zh : en;
  const h = value => escapeHtml(value);
  const label = (list, value) => { const item = list.find(row => row[0] === value); return item ? tr(item[1], item[2]) : value || '—'; };
  const canEdit = () => hasPerm('recruitingEdit');
  const candidates = () => data?.candidates || [];
  const interviews = () => data?.interviews || [];
  const interviewKits = () => data?.interviewKits || [];
  const findCandidate = id => candidates().find(item => item.id === id);
  const findInterviewKit = id => interviewKits().find(item => item.id === id);
  const el = id => document.getElementById(id);
  const value = id => String(el(id)?.value || '').trim();
  const action = (name, id = '', text = '', primary = false) => `<button type="button" class="btn${primary ? ' primary' : ''}" data-rec-action="${h(name)}" data-rec-id="${h(id)}">${h(text)}</button>`;
  const options = (rows, selected) => rows.map(row => `<option value="${h(row[0])}" ${row[0] === selected ? 'selected' : ''}>${h(row.length > 2 ? tr(row[1], row[2]) : row[1])}</option>`).join('');
  const input = (id, name, content = '', type = 'text', extra = '') => `<label for="${id}">${h(name)}<input id="${id}" type="${type}" value="${h(content)}" ${extra}></label>`;
  const textarea = (id, name, content = '', limit = 8000) => `<label class="rec-wide" for="${id}">${h(name)}<textarea id="${id}" maxlength="${limit}">${h(content)}</textarea></label>`;
  const select = (id, name, rows, selected) => `<label for="${id}">${h(name)}<select id="${id}">${options(rows, selected)}</select></label>`;
  const pill = (value, list = candidateStates) => {
    const color = ['confirmed', 'arrived', 'hired', 'completed'].includes(value) ? 'good' : ['new', 'contacted', 'invited'].includes(value) ? 'blue' : ['on_hold', 'scheduled'].includes(value) ? 'warn' : ['no_show', 'not_suitable'].includes(value) ? 'bad' : '';
    return `<span class="rec-pill ${color}">${h(label(list, value))}</span>`;
  };

  function translationKey(candidateId, text, targetLanguage) {
    return JSON.stringify([candidateId, targetLanguage, text]);
  }

  function translationUnavailable() {
    return !canEdit() ? tr('需要招聘编辑权限才能使用 AI 翻译。', 'Recruiting edit permission is required for AI translation.') : !data?.translation?.configured ? tr('AI 翻译尚未配置。原文仍可阅读；英文草稿可直接生成预览。', 'AI translation is not configured. Originals remain available, and English drafts can still be previewed.') : '';
  }

  async function requestTranslation(candidateId, text, targetLanguage, stillWanted) {
    if (!checkIdentity()) throw new Error(tr('请重新登录。', 'Please sign in again.'));
    const unavailable = translationUnavailable();
    if (unavailable) throw new Error(unavailable);
    if (!text.trim() || text.length > 60000) throw new Error(tr('翻译原文需为 1–60000 字符，请分段处理过长内容。', 'Translation input must contain 1–60,000 characters. Split longer content.'));
    const key = translationKey(candidateId, text, targetLanguage);
    if (translationCache.has(key)) return translationCache.get(key);
    if (translationPending.has(key)) return translationPending.get(key);
    const requestedIdentity = identity;
    const job = translationQueue.catch(() => {}).then(async () => {
      if (!checkIdentity() || identity !== requestedIdentity || !stillWanted()) throw new Error(tr('已取消过期的翻译请求。', 'The outdated translation request was cancelled.'));
      const result = await api('/api/recruiting/translate', { method: 'POST', body: JSON.stringify({ text, targetLanguage }), timeoutMs: 110000 });
      if (!checkIdentity() || identity !== requestedIdentity) throw new Error(tr('登录状态已改变，请重新打开档案。', 'Your sign-in changed. Reopen the profile.'));
      if (result.targetLanguage !== targetLanguage || typeof result.text !== 'string' || !result.text.trim() || (targetLanguage === 'en' && hasHan(result.text))) throw new Error(tr('未获得完整、有效的翻译，请重试并核对原文。', 'A complete valid translation was not returned. Retry and compare the original.'));
      const translated = result.text.trim();
      const size = text.length + translated.length;
      while (translationCache.size && (translationCache.size >= 100 || translationCacheSize + size > 500000)) {
        const oldest = translationCache.keys().next().value;
        translationCacheSize -= JSON.parse(oldest)[2].length + translationCache.get(oldest).length;
        translationCache.delete(oldest);
      }
      if (size <= 500000) { translationCache.set(key, translated); translationCacheSize += size; }
      return translated;
    });
    translationPending.set(key, job);
    // The backend permits one active translation per user. Queue every reading and draft request.
    translationQueue = job.catch(() => {});
    try { return await job; }
    finally { if (translationPending.get(key) === job) translationPending.delete(key); }
  }

  function bilingualBlock(candidateId, title, original, preferredLanguage = '') {
    const text = String(original || '');
    if (!text.trim()) return `<section class="rec-profile-section"><h3>${h(title)}</h3><p class="rec-missing">${tr('尚未提供，需向候选人核实。', 'Not provided. Confirm with the candidate.')}</p></section>`;
    const targetLanguage = preferredLanguage || (hasHan(text) && !/[A-Za-z]/.test(text) ? 'en' : 'zh');
    const cached = translationCache.get(translationKey(candidateId, text, targetLanguage));
    const unavailable = translationUnavailable();
    return `<section class="rec-profile-section" data-rec-translation-block data-rec-id="${h(candidateId)}" data-rec-language="${targetLanguage}"><h3>${h(title)}</h3><div class="rec-bilingual-grid"><div><h4>${tr('原始资料 · 原文保留', 'Original · unchanged')}</h4><div class="rec-readable-text rec-original-text" dir="auto">${h(text)}</div></div><div><h4 class="rec-translation-title">${targetLanguage === 'zh' ? '中文对照 / Chinese translation' : '英文对照 / English translation'}</h4><label class="rec-translation-language">${tr('翻译目标语言', 'Translation language')}<select data-rec-translation-language aria-label="${tr('翻译目标语言', 'Translation language')}">${options([['zh', '中文 / Chinese'], ['en', '英文 / English']], targetLanguage)}</select></label><div class="rec-readable-text rec-translated-text" dir="auto" aria-live="polite">${cached ? h(cached) : `<span class="rec-note">${tr('尚未翻译。点击下方按钮生成对照，不会修改原资料或发送消息。', 'Not translated yet. Generate a comparison below; this does not change the record or send a message.')}</span>`}</div><button class="btn" type="button" data-rec-action="translate-reading" ${unavailable ? 'disabled' : ''}>${tr('生成 AI 对照翻译', 'Generate AI translation')}</button><p class="rec-note rec-translation-status" role="status">${h(unavailable || tr('AI 翻译仅供理解，请以原文核实经历、数字及联系方式。', 'AI translation is for reference. Verify experience, numbers and contacts against the original.'))}</p></div></div></section>`;
  }

  async function translateReading(button) {
    const block = button.closest('[data-rec-translation-block]');
    if (!block || button.disabled) return;
    const text = block.querySelector('.rec-original-text')?.textContent || '';
    const candidateId = block.dataset.recId, targetLanguage = block.dataset.recLanguage;
    const requestedIdentity = identity;
    const active = () => block.isConnected && el('modal')?.classList.contains('open') && identity === requestedIdentity && block.dataset.recLanguage === targetLanguage && block.querySelector('.rec-original-text')?.textContent === text;
    const output = block.querySelector('.rec-translated-text'), note = block.querySelector('.rec-translation-status');
    button.disabled = true; note.textContent = tr('正在排队 / 翻译，较长资料可能需要约 1 分钟…', 'Queued / translating. Longer documents may take about a minute…');
    try {
      const translated = await requestTranslation(candidateId, text, targetLanguage, active);
      if (!active()) return;
      output.textContent = translated;
      note.textContent = tr('AI 翻译 · 原文保持不变；请核对数字、日期及联系方式。', 'AI translation · Original unchanged. Check numbers, dates and contacts.');
    } catch (err) { if (active()) note.textContent = `${err.message} ${tr('原文仍保留，可稍后重试。', 'The original is preserved. Retry later.')}`; }
    finally { if (active()) button.disabled = Boolean(translationUnavailable()); }
  }

  function changeReadingLanguage(selectElement) {
    const block = selectElement.closest('[data-rec-translation-block]');
    if (!block || !['zh', 'en'].includes(selectElement.value)) return;
    block.dataset.recLanguage = selectElement.value;
    const original = block.querySelector('.rec-original-text')?.textContent || '';
    const translated = translationCache.get(translationKey(block.dataset.recId, original, selectElement.value));
    block.querySelector('.rec-translation-title').textContent = selectElement.value === 'zh' ? '中文对照 / Chinese translation' : '英文对照 / English translation';
    block.querySelector('.rec-translated-text').textContent = translated || tr('此语言尚未翻译。点击下方按钮生成对照；切换语言本身不会调用 AI。', 'This language has not been translated. Use the button below; changing the language does not call AI.');
    block.querySelector('.rec-translation-status').textContent = translationUnavailable() || tr('原文保持不变；仅按所选语言生成对照。', 'The original stays unchanged; translation uses the selected language.');
    block.querySelector('[data-rec-action="translate-reading"]').disabled = Boolean(translationUnavailable());
  }

  function localParts(instant) {
    const date = new Date(instant);
    if (!Number.isFinite(date.getTime())) return { date: '', time: '' };
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(item => [item.type, item.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
  }

  // Compare both Pacific offsets to reject spring-forward gaps and expose fall-back ambiguity.
  function localToInstants(date, time) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return [];
    const nominal = Date.parse(`${date}T${time}:00Z`);
    if (!Number.isFinite(nominal)) return [];
    return [7, 8].map(hours => new Date(nominal + hours * 3600000).toISOString()).filter(instant => {
      const parts = localParts(instant);
      return parts.date === date && parts.time === time;
    });
  }

  function when(instant, english = false) {
    const date = new Date(instant);
    if (!Number.isFinite(date.getTime())) return '—';
    return new Intl.DateTimeFormat(english ? 'en-US' : (lang === 'zh' ? 'zh-CN' : 'en-US'), {
      timeZone: TZ, month: 'short', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    }).format(date);
  }

  function parseApplicationDate(raw) {
    const text = String(raw || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const instant = Date.parse(`${text}T00:00:00Z`);
      if (!Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 10) !== text) return null;
      return { raw: text, date: text, precision: 'date', instant: null };
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(text)) {
      const instant = Date.parse(text);
      if (!Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 19) !== text.slice(0, 19)) return null;
      return { raw: text, date: localParts(instant).date, precision: 'instant', instant };
    }
    return null;
  }

  function applicationInfo(candidate) {
    const parsed = parseApplicationDate(candidate.appliedAt);
    const source = String(candidate.applicationDateNote || '').trim();
    return { ...parsed, source, verified: Boolean(parsed && source) };
  }

  function recordedWhen(instant) {
    if (!instant || !Number.isFinite(Date.parse(instant))) return tr('未记录', 'Not recorded');
    return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(new Date(instant));
  }

  function applicationWhen(info) {
    if (!info.verified) return tr('申请时间未核实', 'Application date unverified');
    return info.precision === 'date' ? `${info.date} · ${tr('仅日期，时刻未知', 'date only, time unknown')}` : recordedWhen(info.raw);
  }

  function compareCandidates(a, b) {
    const created = (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
    if (candidateSort === 'created') return created;
    const left = applicationInfo(a), right = applicationInfo(b);
    if (left.verified !== right.verified) return left.verified ? -1 : 1;
    if (!left.verified) return created;
    const byDay = right.date.localeCompare(left.date);
    if (byDay) return byDay;
    // Date-only records have no time. Never invent midnight to mix them with exact instants.
    if (left.precision !== right.precision) return left.precision === 'instant' ? -1 : 1;
    if (left.precision === 'instant' && left.instant !== right.instant) return right.instant - left.instant;
    return created;
  }

  function applicationDatesHtml(candidate) {
    const info = applicationInfo(candidate);
    return `<section class="rec-application-dates"><h3>${tr('申请与录入时间 · 洛杉矶', 'Application and entry dates · Los Angeles')}</h3><dl><div><dt>申请时间 / Applied</dt><dd class="${info.verified ? '' : 'rec-unverified-date'}">${h(applicationWhen(info))}</dd></div><div><dt>录入系统时间 / Entered in system</dt><dd>${h(recordedWhen(candidate.createdAt))}</dd></div><div class="rec-wide"><dt>申请日期依据 / Application date source</dt><dd>${h(info.source || tr('尚无可核实的来源记录。', 'No verified source recorded.'))}</dd></div></dl><p class="rec-note">${tr('录入时间是档案进入本系统的时间，不代表投递时间。仅有相对时间或备注时，申请日期保留“未核实”，不会自动推算。', 'Entry time is when this record was added to our system, not when the candidate applied. Relative dates or notes are not automatically converted into an application date.')}</p></section>`;
  }

  function average(candidate) {
    const scores = dimensions.map(([key]) => candidate.scores?.[key]).filter(score => Number.isFinite(score) && score >= 1 && score <= 10);
    return scores.length ? { number: (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1), count: scores.length } : null;
  }

  function nextInterview(candidateId) {
    const live = interviews().filter(item => item.candidateId === candidateId && ['scheduled', 'confirmed', 'arrived'].includes(item.status));
    const upcoming = live.filter(item => Date.parse(item.startsAt) >= Date.now()).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    return upcoming[0] || live.sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))[0] || null;
  }

  function needsReply(candidate) {
    const messages = orderedMessages(candidate);
    return messages.length ? messages[messages.length - 1].direction === 'inbound' : false;
  }

  function orderedMessages(candidate) {
    return [...(candidate.messages || [])].sort((a, b) => Date.parse(a.timestamp || a.createdAt) - Date.parse(b.timestamp || b.createdAt));
  }

  function checkIdentity() {
    const next = user && token && hasPerm('recruitingView') ? `${user.id}:${token}` : '';
    if (identity !== next) {
      if (document.querySelector('[data-rec-dialog]') && identity) closeModal();
      identity = next; data = null; loadedAt = 0; loading = null; error = ''; query = ''; status = ''; scope = ''; candidateSort = 'applied';
      composeContext = null; translationCache.clear(); translationPending.clear(); translationCacheSize = 0;
    }
    return Boolean(next);
  }

  async function load(force = false) {
    if (!checkIdentity()) return;
    if (loading) {
      await loading;
      return force ? load(true) : data;
    }
    if (!force && data && Date.now() - loadedAt < 30000) return data;
    const requestedIdentity = identity;
    loading = (async () => {
      try {
        const result = await api('/api/recruiting', { timeoutMs: 20000 });
        if (!checkIdentity() || identity !== requestedIdentity) return;
        data = result; loadedAt = Date.now(); error = '';
        updateOpenMessageThread();
      } catch (err) {
        if (identity === requestedIdentity) error = err.message;
      } finally {
        if (identity === requestedIdentity) { loading = null; if (current === 'recruiting') repaint(); }
      }
      return data;
    })();
    return loading;
  }

  function repaint() {
    if (!checkIdentity()) return;
    const root = el('recRoot');
    if (root) root.outerHTML = renderPage(false);
  }

  function filteredCandidates() {
    const needle = query.toLocaleLowerCase();
    return candidates().filter(item => {
      if (status && item.status !== status) return false;
      if (scope === 'reply' && !needsReply(item)) return false;
      return !needle || [item.name, item.phone, item.email, item.position, item.source, item.location, item.experience, item.dealershipResources].join(' ').toLocaleLowerCase().includes(needle);
    }).sort(compareCandidates);
  }

  function candidateTable() {
    const rows = filteredCandidates();
    if (!rows.length) return empty(candidates().length ? tr('没有匹配的应聘者', 'No matching candidates') : tr('把下一位合适的人，安排到店', 'Meet your next great salesperson'), candidates().length ? tr('调整搜索或状态筛选后再试。', 'Try another search or status.') : tr('新增应聘者后，可以保存简历、联系候选人、安排面试，并在这里跟进每一步。', 'Add a candidate to keep resumes, conversations, interviews and evaluation together.'), !candidates().length);
    return `<p class="rec-order-note">${candidateSort === 'created' ? tr('按录入系统时间最近优先；录入时间不代表申请时间。', 'Sorted by latest system entry, not application date.') : tr('已核实申请日期最近优先；同日先列已知时刻，只有日期不推算时刻。申请日期未核实者单独列后，按录入时间最近优先。', 'Verified application dates, newest first. Within a day, known times appear first; date-only records have no assumed time. Unverified applications follow, sorted by latest system entry.')}</p><div class="rec-table-scroll"><table class="rec-table"><thead><tr><th>${tr('应聘者', 'Candidate')}</th><th>${tr('岗位 / 来源', 'Position / source')}</th><th>${tr('进展', 'Progress')}</th><th>${tr('申请时间 · 洛杉矶', 'Applied · Pacific')}</th><th>${tr('录入系统 · 洛杉矶', 'Entered · Pacific')}</th><th>${tr('面试时间 · 洛杉矶', 'Interview · Pacific')}</th><th>${tr('评分', 'Score')}</th><th>${tr('操作', 'Actions')}</th></tr></thead><tbody>${rows.map((item, index) => {
      const meeting = nextInterview(item.id), score = average(item), info = applicationInfo(item);
      const unknownBoundary = candidateSort === 'applied' && !info.verified && (index === 0 || applicationInfo(rows[index - 1]).verified);
      return `${unknownBoundary ? `<tr class="rec-date-group"><th colspan="8">${tr('以下申请时间尚未核实 · 按录入系统时间排序，不代表最近投递', 'Application dates below are unverified · sorted by system entry, not recent application')}</th></tr>` : ''}<tr class="rec-candidate-row" tabindex="0" data-rec-action="profile" data-rec-id="${h(item.id)}" aria-label="${h(tr('查看应聘者档案：', 'View candidate profile: ') + item.name)}" aria-haspopup="dialog"><td><div class="rec-person"><span class="rec-avatar">${h(String(item.name || '?').trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase())}</span><div><button type="button" data-rec-action="profile" data-rec-id="${h(item.id)}">${h(item.name)}</button><span class="rec-muted">${h(item.phone || item.email || tr('联系方式待补充', 'Contact details needed'))}</span>${needsReply(item) ? `<span class="rec-pill warn">${tr('有新回复', 'Reply received')}</span>` : ''}</div></div></td><td>${h(item.position || '—')}<span class="rec-muted">${h(item.source || '—')}${item.location ? ` · ${h(item.location)}` : ''}</span></td><td>${pill(item.status)}</td><td class="rec-date-cell">${info.verified ? `<time datetime="${h(info.raw)}">${h(applicationWhen(info))}</time><span class="rec-muted">${tr('有来源依据', 'Source recorded')}</span>` : `<span class="rec-unverified-date">${tr('申请时间未核实', 'Application date unverified')}</span><span class="rec-muted">${tr('仅按录入时间辅助排序', 'System entry used for ordering only')}</span>`}</td><td class="rec-date-cell"><time datetime="${h(item.createdAt || '')}">${h(recordedWhen(item.createdAt))}</time><span class="rec-muted">${tr('录入 ≠ 投递', 'Entry ≠ application')}</span></td><td>${meeting ? `${h(when(meeting.startsAt))}<span class="rec-muted">${h(label(interviewStates, meeting.status))}</span>` : '<span class="rec-muted">—</span>'}</td><td>${score ? `<span class="rec-score">${score.number}<small> / 10</small></span><span class="rec-muted">${score.count}/6 ${tr('项已评', 'rated')}</span>` : `<span class="rec-muted">${tr('待面试', 'Not rated')}</span>`}</td><td><div class="rec-actions"><button class="rec-text-button" data-rec-action="messages" data-rec-id="${h(item.id)}">${tr('短信', 'Messages')}</button>${canEdit() ? `<button class="rec-text-button" data-rec-action="${meeting ? 'edit-interview' : 'schedule'}" data-rec-id="${h(meeting?.id || item.id)}">${meeting ? tr('查看预约', 'Review interview') : tr('预约', 'Schedule')}</button>` : ''}</div></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function scheduleList() {
    const today = localParts(Date.now()).date;
    const rows = interviews().filter(item => {
      if (scope === 'today') return localParts(item.startsAt).date === today && item.status !== 'cancelled';
      if (scope === 'no_show') return item.status === 'no_show';
      if (scope === 'upcoming') return ['scheduled', 'confirmed'].includes(item.status) && Date.parse(item.startsAt) >= Date.now();
      return true;
    }).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    if (!rows.length) return empty(tr('这里还没有面试安排', 'No interviews in this view'), tr('在应聘者档案中点击“预约”，保存日期、时间和面试官。', 'Select Schedule on a candidate to choose the date, time and interviewer.'));
    return `<div class="rec-timeline">${rows.map(item => {
      const person = findCandidate(item.candidateId);
      const overdue = ['confirmed', 'scheduled'].includes(item.status) && Date.parse(item.startsAt) < Date.now();
      return `<article class="rec-appointment ${overdue ? 'past' : ''}"><div class="rec-appointment-time">${h(localParts(item.startsAt).date)}<span class="rec-muted">${h(localParts(item.startsAt).time)} · ${Number(item.durationMinutes) || 30} min</span></div><div class="rec-appointment-main"><h3>${h(person?.name || tr('应聘者', 'Candidate'))} ${pill(item.status, interviewStates)}</h3><p class="rec-note">${h(item.address || DEFAULT_ADDRESS)}</p><p class="rec-note">${tr('面试官', 'Interviewer')}: ${h(item.interviewerName || '—')} · ${h(when(item.startsAt))}${item.automaticReminders ? ` · ${tr('自动提醒已开启', 'Automatic reminders on')}` : ''}</p>${overdue ? `<span class="rec-muted">${tr('预约时间已到，请核实到场或改期情况。', 'Appointment time has passed. Check arrival or rescheduling.')}</span>` : ''}</div><div class="rec-actions">${action('messages', item.candidateId, tr('联系', 'Contact'))}${canEdit() ? action('edit-interview', item.id, tr('查看 / 改期', 'Review / reschedule')) : ''}</div></article>`;
    }).join('')}</div>`;
  }

  function empty(title, note, add = false) {
    return `<div class="rec-empty"><div class="rec-empty-symbol">♧</div><h3>${h(title)}</h3><p>${h(note)}</p>${add && canEdit() ? action('candidate', '', tr('新增第一位应聘者', 'Add your first candidate'), true) : ''}</div>`;
  }

  function quarantineHtml() {
    const rows = data?.quarantine || [];
    if (!rows.length) return '';
    return `<details class="rec-quarantine"><summary>${tr('同号短信待核对', 'Shared-number messages to review')} · ${rows.length}</summary><p class="rec-note">${tr('这些号码也关联其他档案，暂未自动分配。请核对发件人和上下文后跟进。', 'These numbers are shared with other records. Check the sender and context before following up.')}</p>${rows.map(message => `<article class="rec-quarantine-item"><strong>${h(message.from)}</strong><span class="rec-muted">${h(when(message.timestamp))}</span><p>${h(message.text)}</p><div class="rec-actions">${(message.candidateIds || []).map(id => action('candidate', id, findCandidate(id)?.name || tr('查看应聘者', 'View candidate'))).join('')}</div></article>`).join('')}</details>`;
  }

  function renderPage(fetchData = true) {
    if (!checkIdentity()) return `<div id="recRoot" class="rec-center"><p>${tr('没有查看招聘资料的权限。', 'Recruiting access is required.')}</p></div>`;
    if (fetchData) setTimeout(() => load(), 0);
    const today = localParts(Date.now()).date;
    const counts = [
      ['today', tr('今日面试', 'Today’s interviews'), interviews().filter(item => localParts(item.startsAt).date === today && item.status !== 'cancelled').length, tr('洛杉矶当地时间', 'Los Angeles local time')],
      ['reply', tr('待回复消息', 'Replies to review'), candidates().filter(needsReply).length, tr('候选人最后一条为回复', 'Latest message from candidate')],
      ['upcoming', tr('即将到来的面试', 'Upcoming interviews'), interviews().filter(item => ['scheduled', 'confirmed'].includes(item.status) && Date.parse(item.startsAt) >= Date.now()).length, tr('含等待确认的预约', 'Includes proposed appointments')],
      ['no_show', tr('未到场待跟进', 'No-show follow-up'), interviews().filter(item => item.status === 'no_show').length, tr('已人工标记未到场', 'Marked as no-show')]
    ];
    return `<section id="recRoot" class="rec-center">${data?.settings?.preview ? `<div class="rec-banner">${tr('本地演示环境 · 示例资料仅用于验证，短信不会发送。', 'Local preview · Sample records are for verification; SMS is not sent.')}</div>` : ''}<header class="rec-hero"><div><div class="rec-eyebrow">QUAD FILM · PEOPLE</div><h2>${tr('让每一次面试，都有准备', 'Make every interview count')}</h2><p>${tr('汽车膜销售与业务开发优先 · 经销商合作 / 膜材批发', 'Automotive film sales & business development · Dealership partnerships / wholesale')}</p><p>${h(data?.settings?.address || DEFAULT_ADDRESS)}</p></div><div class="rec-actions">${action('refresh', '', tr('刷新', 'Refresh'))}${canEdit() ? action('candidate', '', tr('＋ 新增应聘者', '+ Add candidate'), true) : ''}</div></header><div class="rec-stats">${counts.map(([key, title, count, note]) => `<button class="rec-stat ${scope === key ? 'selected' : ''}" data-rec-action="scope" data-rec-id="${key}"><small>${h(title)}</small><strong>${count}</strong><span>${h(note)}</span></button>`).join('')}</div>${error ? `<div class="rec-alert">${h(error)} ${tr('请点击刷新重试。', 'Select Refresh to retry.')}</div>` : ''}<div class="rec-board"><div class="rec-board-head"><div class="rec-tabs"><button class="rec-tab ${tab === 'candidates' ? 'active' : ''}" data-rec-action="tab" data-rec-id="candidates">${tr('应聘者', 'Candidates')} · ${candidates().length}</button><button class="rec-tab ${tab === 'interviews' ? 'active' : ''}" data-rec-action="tab" data-rec-id="interviews">${tr('面试日程', 'Interviews')}</button></div>${tab === 'candidates' ? `<div class="rec-filters"><input id="recSearch" aria-label="${tr('搜索应聘者', 'Search candidates')}" placeholder="${tr('搜索姓名、电话、经验…', 'Search name, phone, experience…')}" value="${h(query)}"><select id="recStatusFilter" aria-label="${tr('招聘状态', 'Recruiting status')}">${options([['', '全部状态', 'All statuses'], ...candidateStates], status)}</select><select id="recCandidateSort" aria-label="${tr('应聘者排序', 'Candidate ordering')}">${options([['applied', '申请时间最近 · 未核实置后', 'Latest application · unverified last'], ['created', '录入系统时间最近', 'Latest system entry']], candidateSort)}</select></div>` : `<button class="rec-text-button" data-rec-action="scope" data-rec-id="">${tr('显示全部日程', 'Show all interviews')}</button>`}</div><div id="recResults">${!data && loading ? empty(tr('正在读取招聘资料…', 'Loading recruiting records…'), '') : tab === 'candidates' ? candidateTable() : scheduleList()}</div></div><p class="rec-footer-note">${tr('短信通道', 'SMS channel')}: ${data?.sms?.configured ? tr('已配置', 'Configured') : tr('尚未配置或本地环境已关闭', 'Not configured or disabled locally')} · ${tr('评分仅作为人工招聘决策的参考；空白项表示尚未核实。', 'Scores support human review; blank dimensions have not been verified.')}${loadedAt ? ` · ${tr('更新于', 'Updated')} ${h(when(loadedAt))}` : ''}</p>${quarantineHtml()}</section>`;
  }

  function dialogError(message, ok = false) {
    const box = el('recDialogError');
    if (box) { box.className = ok ? 'rec-ok' : 'rec-alert'; box.textContent = message || ''; }
  }

  function openRecruitingModal(title, html, onSave) {
    openModal(title, html, onSave);
    const content = document.querySelector('[data-rec-dialog]'), modal = el('modal'), shell = modal?.querySelector('.dialog');
    if (shell) { shell.scrollTop = 0; shell.setAttribute('role', 'dialog'); shell.setAttribute('aria-modal', 'true'); shell.setAttribute('aria-labelledby', 'modalTitle'); }
    if (el('modalBody')) el('modalBody').scrollTop = 0;
    if (modal) modal.scrollTop = 0;
    requestAnimationFrame(() => {
      if (!content?.isConnected || !modal?.classList.contains('open')) return;
      if (shell) shell.scrollTop = 0;
      content.setAttribute('tabindex', '-1'); content.focus({ preventScroll: true });
    });
  }

  async function saveMutation(path, body) {
    if (busy) return false;
    busy = true; dialogError('');
    const dialog = document.querySelector('[data-rec-dialog]');
    const button = el('modalSave'); if (button) button.disabled = true;
    try {
      await api(path, { method: path.endsWith('/candidates') || path.endsWith('/interviews') || path.endsWith('/scorecard') ? 'POST' : 'PATCH', body: JSON.stringify(body), timeoutMs: 20000 });
      if (dialog?.isConnected) closeModal();
      await load(true);
      return true;
    } catch (err) { if (dialog?.isConnected) dialogError(err.message); return false; }
    finally { busy = false; if (button && dialog?.isConnected) button.disabled = false; }
  }

  function scorecardAverage(card, kit = findInterviewKit(card?.templateId)) {
    const values = (kit?.questions || []).map(question => card?.scores?.[question.id]).filter(score => Number.isInteger(score) && score >= 1 && score <= 10);
    return { completed:values.length, total:kit?.questions?.length || 0, average:values.length ? values.reduce((sum, score) => sum + score, 0) / values.length : null };
  }

  function interviewScorecardsHtml(candidate) {
    const cards = (candidate.interviewScorecards || []).map(card => {
      const kit = findInterviewKit(card.templateId); if (!kit) return '';
      const summary = scorecardAverage(card, kit);
      return `<button type="button" class="rec-kit-saved" data-rec-action="interview-kit" data-rec-id="${h(candidate.id)}" data-rec-template-id="${h(kit.id)}"><strong>${h(tr(kit.titleZh, kit.titleEn))}</strong><span>${summary.average === null ? tr('尚未评分', 'Not scored') : `${summary.average.toFixed(1)} / 10`} · ${summary.completed}/${summary.total}</span></button>`;
    }).join('');
    return `<section class="rec-profile-section rec-kit-summary"><div class="rec-section-heading"><div><h3>${tr('面试题库与逐题评分', 'Interview kits & question scores')}</h3><p class="rec-note">${tr('可选择快速版或完整版；每套题单独保存，不覆盖原六维评分。', 'Choose a quick or full kit. Each kit is saved separately from the six-dimension scorecard.')}</p></div>${canEdit() ? action('interview-kit', candidate.id, tr('选择题库 / 开始评分', 'Choose kit / start scoring'), true) : ''}</div>${cards || `<p class="rec-missing">${tr('尚未保存逐题面试记录。', 'No question-level interview record has been saved.')}</p>`}</section>`;
  }

  function suggestedKit(candidate) {
    const text = `${candidate?.position || ''} ${candidate?.experience || ''}`.toLowerCase();
    if (/技师|installer|安装|施工/.test(text)) return 'installer_quick_6';
    if (/4s|经销商|dealer|外跑|地推/.test(text)) return 'dealer_quick_8';
    if (/网络|remote|客服|online/.test(text)) return 'remote_quick_6';
    return 'wholesale_quick_6';
  }

  function interviewKitCopyText(kit, language = 'zh') {
    if (!kit) return '';
    const zh = language !== 'en';
    const title = zh ? kit.titleZh : kit.titleEn;
    const description = zh ? kit.descriptionZh : kit.descriptionEn;
    const scoreLine = zh ? '评分：____ / 10    记录：________________' : 'Score: ____ / 10    Notes: ________________';
    return [`QUAD FILM — ${title}`, description, '', ...kit.questions.flatMap((question, index) => zh ? [
      `${index + 1}. ${question.zh}`, `观察重点: ${question.focus}`, `高分参考: ${question.strong}`, scoreLine, ''
    ] : [
      `${index + 1}. ${question.en}`, scoreLine, ''
    ])].join('\n').trim();
  }

  function updateInterviewKitScore() {
    const dialog = document.querySelector('[data-rec-dialog="interview-kit"]'); if (!dialog) return;
    const kit = findInterviewKit(dialog.dataset.recTemplateId); if (!kit) return;
    const values = kit.questions.map(question => Number(el(`recKitScore_${question.id}`)?.value)).filter(score => Number.isInteger(score) && score >= 1 && score <= 10);
    const average = values.length ? values.reduce((sum, score) => sum + score, 0) / values.length : null;
    const target = el('recKitTotal');
    if (target) target.textContent = average === null ? tr(`已评分 0 / ${kit.questions.length}`, `Scored 0 / ${kit.questions.length}`) : tr(`平均 ${average.toFixed(1)} / 10 · 已评分 ${values.length} / ${kit.questions.length}`, `Average ${average.toFixed(1)} / 10 · scored ${values.length} / ${kit.questions.length}`);
  }

  function openInterviewKit(candidateId, requestedTemplateId = '') {
    if (!checkIdentity()) return;
    const candidate = findCandidate(candidateId); if (!candidate) return;
    const saved = candidate.interviewScorecards || [];
    const templateId = requestedTemplateId || saved[0]?.templateId || suggestedKit(candidate);
    const kit = findInterviewKit(templateId) || interviewKits()[0]; if (!kit) return;
    const card = saved.find(item => item.templateId === kit.id) || { scores:{}, notes:{}, overallNote:'' };
    const kitOptions = interviewKits().map(item => `<option value="${h(item.id)}" ${item.id === kit.id ? 'selected' : ''}>${h(tr(item.titleZh, item.titleEn))}</option>`).join('');
    const questions = kit.questions.map((question, index) => `<article class="rec-kit-question" data-rec-question-id="${h(question.id)}"><div class="rec-kit-question-head"><span>${index + 1}</span><div><h3>${h(question.zh)}</h3><p>${h(question.en)}</p></div>${question.critical ? `<em>${tr('关键题', 'Critical')}</em>` : ''}</div><div class="rec-kit-evidence"><p><strong>${tr('观察重点', 'Focus')}</strong>${h(question.focus)}</p><p><strong>${tr('高分参考', 'Strong evidence')}</strong>${h(question.strong)}</p></div><div class="rec-kit-record"><label>${tr('评分 1–10', 'Score 1–10')}<input class="rec-kit-score" id="recKitScore_${h(question.id)}" type="number" min="1" max="10" step="1" value="${h(card.scores?.[question.id] ?? '')}"></label><label>${tr('回答证据 / 面试记录', 'Answer evidence / notes')}<textarea id="recKitNote_${h(question.id)}" maxlength="1200">${h(card.notes?.[question.id] || '')}</textarea></label></div></article>`).join('');
    const html = `<div class="rec-dialog rec-interview-kit" data-rec-dialog="interview-kit" data-rec-id="${h(candidate.id)}" data-rec-template-id="${h(kit.id)}"><div id="recDialogError" class="rec-alert" role="alert"></div><header class="rec-person-summary"><div><h2>${h(candidate.name)}</h2><p>${h(candidate.position || tr('岗位待确认', 'Position to confirm'))}</p></div><strong id="recKitTotal"></strong></header><div class="rec-kit-layout"><aside class="rec-kit-sidebar"><label>${tr('选择面试模板', 'Choose interview kit')}<select id="recInterviewKitSelect">${kitOptions}</select></label><h3>${h(tr(kit.titleZh, kit.titleEn))}</h3><p>${h(tr(kit.descriptionZh, kit.descriptionEn))}</p><div class="rec-actions"><button type="button" class="btn" data-rec-action="copy-interview-kit-zh" data-rec-id="${h(kit.id)}">${tr('复制中文题单', 'Copy Chinese')}</button><button type="button" class="btn" data-rec-action="copy-interview-kit-en" data-rec-id="${h(kit.id)}">${tr('复制英文题单', 'Copy English')}</button></div><p class="rec-kit-rubric">${tr('统一评分：1–3 无证据；4–6 部分符合；7–8 有清晰案例；9–10 有强证据、量化结果并高度匹配。', 'Rubric: 1–3 no evidence; 4–6 partial; 7–8 clear example; 9–10 strong evidence, measurable result, and excellent fit.')}</p><label>${tr('总体结论 / 下一步', 'Overall conclusion / next step')}<textarea id="recKitOverallNote" maxlength="8000">${h(card.overallNote || '')}</textarea></label></aside><div class="rec-kit-questions">${questions}</div></div></div>`;
    openRecruitingModal(tr('面试题库与评分', 'Interview kit & scoring'), html, canEdit() ? async () => {
      const scores = {}, notes = {};
      for (const question of kit.questions) {
        const raw = value(`recKitScore_${question.id}`);
        if (raw && (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 10)) { dialogError(tr('每道题评分请填写 1–10 的整数，未提问可留空。', 'Use whole-number scores from 1 to 10, or leave unanswered questions blank.')); return; }
        scores[question.id] = raw ? Number(raw) : null;
        notes[question.id] = value(`recKitNote_${question.id}`);
      }
      await saveMutation(`/api/recruiting/candidates/${encodeURIComponent(candidate.id)}/scorecard`, { templateId:kit.id, scores, notes, overallNote:value('recKitOverallNote') });
    } : null);
    if (!canEdit()) el('modalSave').hidden = true;
    updateInterviewKitScore();
  }

  async function copyInterviewKit(button, language) {
    const text = interviewKitCopyText(findInterviewKit(button.dataset.recId), language); if (!text) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else { const area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); }
      dialogError(tr('题单已复制，可直接粘贴使用。', 'Interview questions copied and ready to paste.'), true);
    } catch { dialogError(tr('浏览器未允许自动复制，请手动选择题目。', 'The browser blocked copying. Select the questions manually.')); }
  }

  function openCandidateProfile(id) {
    if (!checkIdentity()) return;
    const c = findCandidate(id); if (!c) return;
    const meeting = nextInterview(id);
    const missing = tr('尚未提供 / 待核实', 'Not provided / unverified');
    const employment = label([['full_time', '全职', 'Full-time'], ['part_time', '兼职', 'Part-time'], ['flexible', '均可', 'Flexible']], c.employmentType);
    const facts = [
      ['电话 / Phone', c.phone], ['邮箱 / Email', c.email], ['所在地 / Location', c.location],
      ['来源 / Source', c.source], ['应聘岗位 / Position', c.position], ['最早到岗 / Availability', c.availability],
      ['工作意愿 / Employment', c.employmentType ? employment : ''], ['薪酬匹配 / Compensation fit', c.compensation]
    ];
    const phoneLink = /^[+\d\s().-]+$/.test(c.phone || '') ? `<a class="btn" href="tel:${h(c.phone.replace(/[^+\d]/g, ''))}">${tr('拨打电话', 'Call')}</a>` : '';
    const emailLink = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email || '') ? `<a class="btn" href="mailto:${h(encodeURIComponent(c.email))}">${tr('打开邮件客户端', 'Open email app')}</a>` : '';
    let resumeLink = '';
    try { const url = new URL(c.resumeUrl); if (url.protocol === 'https:') resumeLink = `<a class="btn" href="${h(url.href)}" target="_blank" rel="noopener noreferrer">${tr('打开简历 / 作品来源', 'Open resume / portfolio source')}</a>`; } catch {}
    const html = `<div class="rec-dialog rec-profile" data-rec-dialog="profile" data-rec-id="${h(id)}"><div id="recDialogError" class="rec-alert" role="alert"></div><header class="rec-person-summary"><div><h2>${h(c.name)}</h2><p>${h(c.position || missing)}</p>${pill(c.status)}</div><div class="rec-actions">${action('messages', id, tr('中文起草 / 英文短信', 'Draft / English SMS'), true)}${canEdit() ? action('interview-kit', id, tr('面试题库 / 评分', 'Interview kit / score')) : ''}${canEdit() ? action('candidate', id, tr('编辑档案 / 六维评分', 'Edit profile / six scores')) : ''}${canEdit() ? action(meeting ? 'edit-interview' : 'schedule', meeting?.id || id, meeting ? tr('查看预约', 'Review interview') : tr('安排面试', 'Schedule interview')) : ''}</div></header><dl class="rec-profile-facts">${facts.map(([name, content]) => `<div class="rec-profile-fact"><dt>${h(name)}</dt><dd class="${content ? '' : 'rec-missing rec-profile-fact-missing'}">${h(content || missing)}</dd></div>`).join('')}</dl>${applicationDatesHtml(c)}<div class="rec-profile-contact-row"><div class="rec-actions">${phoneLink}${emailLink}</div><p class="rec-note">${tr('联系方式按档案原文显示；Indeed 转发邮箱不是候选人的私人邮箱。打开邮件客户端不会自动发信。', 'Contact details are shown as recorded. An Indeed relay address is not a personal email. Opening an email app does not send email.')}</p></div>${meeting ? `<div class="rec-recipient"><strong>${tr('当前面试安排', 'Current interview')}: ${h(when(meeting.startsAt))}</strong><p>${h(meeting.address || DEFAULT_ADDRESS)}</p>${pill(meeting.status, interviewStates)}</div>` : ''}${interviewScorecardsHtml(c)}${bilingualBlock(id, '经验与经历概览 / Experience overview', c.experience)}${bilingualBlock(id, '经销商资源与开发计划 / Dealership resources & outreach plan', c.dealershipResources)}${bilingualBlock(id, '跟进备注 / Follow-up notes', c.notes)}<section class="rec-profile-section rec-resume-section">${c.resumeText?.trim() ? `<div class="rec-resume-pair">${bilingualBlock(id, '已保存简历原文与对照 / Saved resume text & translation', c.resumeText, 'zh')}</div>` : `<h3>简历原文 / Original resume</h3><p class="rec-missing">${c.resume ? tr('已上传 PDF，但尚未提取文字，暂不能生成全文对照。可查看 PDF 原件；编辑档案可补充提取后的原文。', 'A PDF is uploaded, but text has not been extracted, so full-text translation is unavailable. View the PDF or add its extracted text through Edit profile.') : tr('尚无简历原文。上方经验摘要不能替代完整简历，请补充原文或附件。', 'Original resume text is missing. The experience summary is not a full resume. Add the original text or an attachment.')}</p>`}<div class="rec-attachment">${c.resume ? `${action('view-resume', id, tr('查看 PDF 原件', 'View original PDF'))}<span class="rec-note">${h(c.resume.name)}</span>` : `<span class="rec-note">${tr('尚无 PDF 附件', 'No PDF attachment')}</span>`}${resumeLink}</div><p class="rec-note">${tr('以上为已保存原文，不使用 AI 补写缺失履历；编辑档案可补充简历与附件。', 'This is the saved original. AI does not fill missing history. Use Edit profile to add resume text or attachments.')}</p></section><p class="rec-note">${tr('短信联系', 'SMS contact')}: ${c.smsOptedOut ? tr('已退订 · 禁止发送', 'Opted out · blocked') : c.smsConsent ? tr('已有同意记录', 'Consent recorded') : tr('尚无同意记录 · 不能发送', 'No consent recorded · cannot send')} ${h(c.smsConsentNote || '')}</p></div>`;
    openRecruitingModal(tr('应聘者详情', 'Candidate details'), html, null);
    el('modalSave').hidden = true;
  }

  function openCandidate(id = '') {
    if (!checkIdentity()) return;
    const item = findCandidate(id);
    if (id && !item) return;
    if (!item && !canEdit()) return;
    const c = item || { position: tr('汽车膜销售 / 业务开发', 'Automotive film sales / Business development'), source: 'Indeed', status: 'new' };
    const initialApplied = parseApplicationDate(c.appliedAt), initialAppliedDate = initialApplied?.date || '';
    const edit = canEdit();
    const currentMeeting = item ? nextInterview(item.id) : null;
    const phoneLink = /^[+\d\s().-]+$/.test(c.phone || '') ? `<a href="tel:${h(c.phone.replace(/[^+\d]/g, ''))}" class="btn">${tr('拨打电话', 'Call')}</a>` : '';
    const emailLink = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email || '') ? `<a href="mailto:${h(encodeURIComponent(c.email))}" class="btn">${tr('打开邮件客户端', 'Open email app')}</a>` : '';
    const html = `<div class="rec-dialog" data-rec-dialog="candidate" data-rec-id="${h(id)}"><div id="recDialogError" class="rec-alert" role="alert"></div>${item ? `<div class="rec-person-summary"><div><strong>${h(c.name)}</strong><p>${h(c.phone || '')} ${h(c.email || '')}</p>${pill(c.status)}</div><div class="rec-actions">${phoneLink}${emailLink}${action('messages', id, tr('短信记录', 'Messages'))}${edit ? currentMeeting ? action('edit-interview', currentMeeting.id, tr('查看预约', 'Review interview'), true) : action('schedule', id, tr('安排面试', 'Schedule'), true) : ''}</div></div>` : ''}<fieldset ${edit ? '' : 'disabled'}><div class="rec-form-grid">${input('recName', tr('姓名 *', 'Name *'), c.name, 'text', 'maxlength="160" required')}${input('recPosition', tr('应聘岗位', 'Position'), c.position, 'text', 'maxlength="160"')}${input('recPhone', tr('手机号', 'Phone'), c.phone, 'tel', 'maxlength="40"')}${input('recEmail', tr('邮箱', 'Email'), c.email, 'email', 'maxlength="254"')}${input('recSource', tr('来源平台', 'Source'), c.source, 'text', 'maxlength="100" list="recSources"')}<datalist id="recSources"><option>Indeed</option><option>Craigslist</option><option>Handshake</option><option>Referral</option><option>Walk-in</option><option>Email</option></datalist>${select('recStatus', tr('招聘状态', 'Recruiting status'), candidateStates, c.status)}${input('recAppliedDate', tr('已核实申请日期（未知请留空）', 'Verified application date (leave blank if unknown)'), initialAppliedDate, 'date', `max="${localParts(Date.now()).date}"`)}${input('recApplicationDateNote', tr('申请日期依据（填写日期时必填）', 'Application date source (required with a date)'), c.applicationDateNote, 'text', 'maxlength="1000"')}<div class="rec-wide rec-date-edit-note"><p class="rec-note">${tr('仅填写来自原始申请或邮件的可核实日期，不要根据录入时间或“几天前”自动推算。清空日期会标记未核实。', 'Use a verifiable date from the original application or email. Do not infer it from system entry or relative dates. Clearing the date marks it unverified.')}${initialApplied?.precision === 'instant' ? ` ${tr('当前保存的精确申请时间：', 'Saved exact application time: ')}${h(recordedWhen(initialApplied.raw))}${tr('；日期不变时保留原始精确时刻，改日期后只保存日期。', '. Keeping the date preserves the exact time; changing it saves a date only.')}` : ''}</p><p class="rec-note">${tr('录入系统时间（只读，不是申请时间）：', 'System entry time (read-only; not application time): ')}${h(item ? recordedWhen(c.createdAt) : tr('将在首次保存时记录', 'Recorded on first save'))}</p></div>${input('recLocation', tr('所在地 / 通勤情况', 'Location / commute'), c.location, 'text', 'maxlength="240"')}${input('recAvailability', tr('最早到岗 / 可工作时间', 'Start date / work availability'), c.availability, 'text', 'maxlength="2000"')}${select('recEmployment', tr('全职 / 兼职意愿', 'Employment preference'), [['', '待确认', 'To confirm'], ['full_time', '全职', 'Full-time'], ['part_time', '兼职', 'Part-time'], ['flexible', '均可', 'Flexible']], c.employmentType || '')}${input('recCompensation', tr('对已发布薪资的匹配情况', 'Fit with published compensation'), c.compensation, 'text', 'maxlength="2000"')}${textarea('recExperience', tr('汽车 / 贴膜 / 销售经验及可核实业绩', 'Automotive / film / sales experience and verifiable results'), c.experience)}${textarea('recResources', tr('经销商资源及第一周开发计划', 'Dealership relationships and first-week outreach plan'), c.dealershipResources)}${textarea('recNotes', tr('跟进备注', 'Follow-up notes'), c.notes)}</div></fieldset><details ${!item ? 'open' : ''}><summary>${tr('简历与附件', 'Resume & attachment')}</summary><fieldset ${edit ? '' : 'disabled'}><div class="rec-form-grid">${input('recResumeUrl', tr('简历 / 作品链接（https://）', 'Resume / portfolio URL (https://)'), c.resumeUrl, 'url', 'maxlength="2000"')}${textarea('recResumeText', tr('简历文本', 'Resume text'), c.resumeText, 60000)}</div></fieldset>${item ? `<div class="rec-attachment">${c.resume ? `<span class="rec-note">${h(c.resume.name)}</span>${action('view-resume', id, tr('查看 PDF', 'View PDF'))}` : `<span class="rec-note">${tr('尚未上传 PDF 简历', 'No PDF uploaded')}</span>`}${edit ? `<label class="btn">${tr('上传 PDF（≤5 MB）', 'Upload PDF (≤5 MB)')}<input type="file" id="recResumeFile" data-rec-id="${h(id)}" accept="application/pdf,.pdf" hidden></label>` : ''}</div>` : `<p class="rec-note">${tr('先保存应聘者档案，即可上传私有 PDF 简历。', 'Save the candidate first to upload a private PDF resume.')}</p>`}</details><details><summary>${tr('面试评分与证据', 'Interview scorecard & evidence')}</summary><fieldset ${edit ? '' : 'disabled'}><p class="rec-note" style="margin-bottom:12px">${tr('1 分为证据弱，10 分为证据充分且匹配度高。未核实请留空；请记录具体案例。', '1 = weak evidence, 10 = strong verified fit. Leave unverified dimensions blank and record examples.')}</p><div class="rec-score-grid">${dimensions.map(([key, zh, en]) => input(`recScore_${key}`, tr(zh, en), c.scores?.[key] ?? '', 'number', 'min="1" max="10" step="1"')).join('')}</div>${textarea('recScoreNotes', tr('评分依据 / 优势 / 待核实事项', 'Evidence / strengths / open questions'), c.scoreNotes)}</fieldset></details><fieldset ${edit ? '' : 'disabled'}><label class="rec-check"><input type="checkbox" id="recConsent" ${c.smsConsent ? 'checked' : ''} ${c.smsOptedOut ? 'disabled' : ''}>${tr('已获得候选人同意，通过短信联系本次招聘和面试安排', 'Candidate agreed to receive recruiting and interview SMS')}</label>${input('recConsentNote', tr('同意来源与日期（勾选时必填）', 'Consent source and date (required when checked)'), c.smsConsentNote, 'text', 'maxlength="2000"')}${c.smsOptedOut ? `<p class="rec-alert">${tr('候选人已退订短信。系统会阻止发送，请通过其他已授权方式联系。', 'Candidate opted out of SMS. Sending is blocked; use another authorized channel.')}</p>` : ''}</fieldset><p class="rec-note">${tr('保存资料不会发送邀请；“打开邮件客户端”仅打开邮件，不会自动发送。', 'Saving a profile sends no invitation. Open email app only opens a draft; it does not send email.')}</p></div>`;
    openRecruitingModal(item ? tr('应聘者档案', 'Candidate profile') : tr('新增应聘者', 'Add candidate'), html, async () => {
      if (!edit) return;
      const name = value('recName');
      if (!name) { dialogError(tr('请填写应聘者姓名。', 'Please enter the candidate’s name.')); return; }
      if (!el('recEmail').checkValidity() || !el('recResumeUrl').checkValidity()) { dialogError(tr('请检查邮箱和简历链接格式。', 'Please check the email and resume URL.')); return; }
      const scores = {};
      for (const [key] of dimensions) {
        const raw = value(`recScore_${key}`);
        if (raw && (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 10)) { dialogError(tr('评分请填 1–10 的整数，未评项留空。', 'Use whole-number scores from 1 to 10, or leave blank.')); return; }
        scores[key] = raw ? Number(raw) : null;
      }
      if (el('recConsent').checked && !value('recConsentNote')) { dialogError(tr('请记录短信同意的来源和日期。', 'Record how and when SMS consent was obtained.')); return; }
      const appliedDate = value('recAppliedDate'), applicationDateNote = value('recApplicationDateNote');
      if (appliedDate && (!parseApplicationDate(appliedDate) || !el('recAppliedDate').checkValidity() || appliedDate > localParts(Date.now()).date)) { dialogError(tr('请填写真实有效且不晚于今天的洛杉矶申请日期；未知请留空。', 'Enter a valid Los Angeles application date no later than today, or leave it blank if unknown.')); return; }
      if (appliedDate && !applicationDateNote) { dialogError(tr('请填写申请日期的来源依据，例如平台申请记录或原始邮件时间。', 'Provide the application date source, such as the platform application record or original email.')); return; }
      const appliedAt = !appliedDate ? '' : appliedDate === initialAppliedDate && initialApplied ? initialApplied.raw : appliedDate;
      const body = { name, phone: value('recPhone'), email: value('recEmail'), source: value('recSource'), position: value('recPosition'), location: value('recLocation'), experience: value('recExperience'), dealershipResources: value('recResources'), availability: value('recAvailability'), employmentType: value('recEmployment'), compensation: value('recCompensation'), notes: value('recNotes'), resumeText: value('recResumeText'), resumeUrl: value('recResumeUrl'), status: value('recStatus'), scores, scoreNotes: value('recScoreNotes'), smsConsent: el('recConsent').checked, smsConsentNote: value('recConsentNote') };
      body.appliedAt = appliedAt; body.applicationDateNote = applicationDateNote;
      await saveMutation(`/api/recruiting/candidates${id ? `/${encodeURIComponent(id)}` : ''}`, body);
    });
    if (!edit) el('modalSave').hidden = true;
  }

  function openInterview(candidateId, interviewId = '') {
    if (!checkIdentity() || !canEdit()) return;
    const meeting = interviewId ? interviews().find(item => item.id === interviewId) : null;
    const person = findCandidate(meeting?.candidateId || candidateId); if (!person) return;
    const initial = meeting?.startsAt ? localParts(meeting.startsAt) : { date: localParts(Date.now()).date, time: '10:00' };
    const html = `<div class="rec-dialog" data-rec-dialog="interview" data-rec-id="${h(person.id)}"><div id="recDialogError" class="rec-alert" role="alert"></div><div class="rec-person-summary"><strong>${h(person.name)}</strong>${pill(person.status)}</div><p class="rec-note">${tr('所有预约均使用洛杉矶时间（PST / PDT），与本机时区无关。保存后，请到短信窗口预览并发送邀请。', 'All appointments use Los Angeles time (PST / PDT), regardless of this computer’s time zone. After saving, preview and send the invitation from Messages.')}</p><div class="rec-form-grid">${input('recInterviewDate', tr('面试日期 *', 'Interview date *'), initial.date, 'date', 'required')}${input('recInterviewTime', tr('面试时间 *', 'Interview time *'), initial.time, 'time', 'required')}<div id="recTimeAmbiguity" class="rec-wide"></div>${input('recDuration', tr('时长（分钟）', 'Duration (minutes)'), meeting?.durationMinutes || 30, 'number', 'min="15" max="180" step="5"')}${input('recInterviewer', tr('面试官', 'Interviewer'), meeting?.interviewerName || user?.name || '', 'text', 'maxlength="160" list="recInterviewers"')}<datalist id="recInterviewers">${(data?.interviewers || []).map(person => `<option>${h(person.name)}</option>`).join('')}</datalist>${input('recInterviewAddress', tr('面试地址 *', 'Interview address *'), meeting?.address || data?.settings?.address || DEFAULT_ADDRESS, 'text', 'maxlength="500" required')}${select('recInterviewStatus', tr('预约状态', 'Appointment status'), interviewStates, meeting?.status || 'scheduled')}${textarea('recInterviewNotes', tr('面试备注', 'Interview notes'), meeting?.notes)}</div><label class="rec-check"><input type="checkbox" id="recCandidateConfirmed" ${['confirmed', 'arrived', 'completed'].includes(meeting?.status) ? 'checked' : ''}>${tr('我已收到候选人对这个日期、时间和地址的明确确认', 'I have the candidate’s explicit confirmation of this date, time and address')}</label><label class="rec-check"><input type="checkbox" id="recAutoReminders" ${meeting?.automaticReminders ? 'checked' : ''} ${data?.settings?.remindersEnabled === false ? 'disabled' : ''}>${tr('开启本次面试的自动短信提醒（24 小时 / 2 小时前）', 'Enable automatic SMS reminders for this interview (24 hours / 2 hours before)')}</label><p class="rec-note">${data?.settings?.remindersEnabled === false ? tr('本地环境已关闭自动发送。', 'Automatic sending is disabled in this environment.') : tr('自动提醒需要短信同意且预约已确认；取消或改期后按最新安排处理。', 'Automatic reminders require SMS consent and a confirmed appointment. Cancellation or rescheduling uses the latest appointment.')}</p>${meeting ? `<section class="rec-video-invite"><strong>${tr('QUAD 视频面试室', 'QUAD video interview room')}</strong><p class="rec-note">${tr('一次性候选人链接不会显示候选人的电话或邮箱；重新生成会立即作废旧链接。', 'The one-time candidate link exposes no phone or email. Regenerating it immediately revokes the old link.')}</p><div class="rec-actions">${action('create-video-invite', meeting.id, tr('生成一次性链接', 'Create one-time link'), true)}${action('join-video-interview', meeting.id, tr('进入视频面试', 'Join video interview'))}</div><div id="recVideoInviteResult" class="rec-video-invite-result"></div></section>` : `<p class="rec-note">${tr('先保存面试安排，然后即可生成一次性视频链接。', 'Save the interview first to create a one-time video link.')}</p>`}</div>`;
    openRecruitingModal(meeting ? tr('查看 / 修改面试安排', 'Review / reschedule interview') : tr('安排面试', 'Schedule interview'), html, async () => {
      const valid = localToInstants(value('recInterviewDate'), value('recInterviewTime'));
      if (!valid.length) { dialogError(tr('该洛杉矶日期或时间无效（可能处于夏令时跳转空档）。请重新选择。', 'That Los Angeles date/time is invalid or falls in a daylight-saving gap. Choose another time.')); return; }
      const startsAt = valid.length === 1 ? valid[0] : value('recTimeFold');
      if (!startsAt || !valid.includes(startsAt)) { dialogError(tr('请选择夏令时回拨时段中的具体时间。', 'Choose which repeated daylight-saving time you mean.')); return; }
      const nextStatus = value('recInterviewStatus');
      if (['confirmed', 'arrived', 'completed'].includes(nextStatus) && !el('recCandidateConfirmed').checked) { dialogError(tr('请先确认候选人明确同意此预约；否则保留“拟定时间”。', 'Confirm the candidate agreed to this appointment, or leave it proposed.')); return; }
      const durationMinutes = Number(value('recDuration'));
      if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 180 || !value('recInterviewAddress')) { dialogError(tr('请填写地址，并将面试时长设为 15–180 分钟。', 'Enter an address and a duration of 15–180 minutes.')); return; }
      if (el('recAutoReminders').checked && (!person.smsConsent || person.smsOptedOut)) { dialogError(tr('自动短信提醒需要有效的短信同意，且候选人没有退订。', 'Automatic SMS requires valid consent and no opt-out.')); return; }
      if (el('recAutoReminders').checked && nextStatus !== 'confirmed') { dialogError(tr('请将预约标记为“对方已确认”，再开启自动提醒。', 'Mark the appointment Candidate confirmed before enabling reminders.')); return; }
      await saveMutation(`/api/recruiting/interviews${interviewId ? `/${encodeURIComponent(interviewId)}` : ''}`, { candidateId: person.id, startsAt, durationMinutes, timeZone: TZ, address: value('recInterviewAddress'), interviewerName: value('recInterviewer'), interviewerId: (data?.interviewers || []).find(person => person.name === value('recInterviewer'))?.id || (value('recInterviewer') === meeting?.interviewerName ? meeting?.interviewerId || '' : ''), status: nextStatus, notes: value('recInterviewNotes'), automaticReminders: el('recAutoReminders').checked });
    });
    updateAmbiguity(meeting?.startsAt);
  }

  async function createVideoInvite(interviewId) {
    if (!interviewId || busy) return;
    busy = true; dialogError('');
    try {
      const result = await api(`/api/recruiting/interviews/${encodeURIComponent(interviewId)}/video-invite`, { method:'POST', body:'{}', timeoutMs:20000 });
      const box = el('recVideoInviteResult'); if (!box) return;
      box.innerHTML = `<label>${tr('一次性候选人链接（仅显示一次）', 'One-time candidate link (shown once)')}<input id="recVideoInviteUrl" readonly value="${h(result.joinUrl)}"></label><div class="rec-actions">${action('copy-video-invite', interviewId, tr('复制链接', 'Copy link'), true)}</div><p class="rec-note">${tr('失效时间：', 'Expires: ')}${h(when(result.expiresAt, true))}</p>`;
    } catch (err) { dialogError(err.message); }
    finally { busy = false; }
  }

  async function copyVideoInvite() {
    const url = value('recVideoInviteUrl'); if (!url) return;
    try { await navigator.clipboard.writeText(url); dialogError(tr('链接已复制。', 'Link copied.')); }
    catch { el('recVideoInviteUrl')?.select(); dialogError(tr('请按 Command+C 复制选中的链接。', 'Press Command+C to copy the selected link.')); }
  }

  function joinVideoInterview(interviewId) {
    window.open(`/recruiting-interview.html?interview=${encodeURIComponent(interviewId)}`, '_blank', 'noopener');
  }

  function updateAmbiguity(selected = '') {
    const box = el('recTimeAmbiguity'); if (!box) return;
    const instants = localToInstants(value('recInterviewDate'), value('recInterviewTime'));
    box.innerHTML = instants.length > 1 ? select('recTimeFold', tr('该时间出现两次，请选择', 'This time occurs twice; choose one'), [['', tr('请选择', 'Choose a time')], ...instants.map(instant => [instant, when(instant, true)])], selected) : '';
  }

  function template(person, kind) {
    const meeting = nextInterview(person.id);
    const greeting = `Hi ${person.name}, this is QUAD FILM.`;
    const address = meeting?.address || data?.settings?.address || DEFAULT_ADDRESS;
    const role = 'automotive film sales and business development';
    const time = meeting ? when(meeting.startsAt, true) : '';
    const optOut = ' Reply STOP to opt out.';
    if (kind === 'invitation') return `${greeting} Thank you for your interest in our ${role} role. The work includes visiting dealerships to bring installation orders to our Santa Monica shop and selling film to businesses with installation capabilities. ${meeting ? `Would you be available for an interview on ${time} at ${address}? Please reply to confirm or suggest another time.` : `We would like to invite you to interview at ${address}. Which dates and times work for you?`} Thank you!${optOut}`;
    if (!meeting) return '';
    if (kind === 'confirm') return `${greeting} Your interview is scheduled for ${time} at ${address}. Please reply YES to confirm that this date, time and location work for you, or let us know if you need to reschedule. Thank you!${optOut}`;
    if (kind === 'reminder') return `${greeting} A reminder about your interview on ${time} at ${address}. Please let us know if your availability has changed. We look forward to meeting you.${optOut}`;
    return `${greeting} We were expecting you for your interview on ${time} at ${address}. Are you still on your way? Please let us know your estimated arrival time, or if you need to reschedule. Thank you.${optOut}`;
  }

  function threadHtml(person) {
    const list = orderedMessages(person);
    return list.length ? list.map(message => `<div class="rec-bubble ${message.direction === 'outbound' ? 'outbound' : ''}">${bilingualBlock(person.id, message.direction === 'outbound' ? tr('我们发送的短信', 'Our SMS') : tr('候选人回复', 'Candidate reply'), message.text)}<small>${h(when(message.timestamp || message.createdAt))} · ${h(message.direction === 'outbound' ? tr('我们', 'Us') : person.name)} · ${h(messageStatus(message.status))}${message.errorCode ? ` · ${h(message.errorCode)}` : ''}</small></div>`).join('') : `<p class="rec-note">${tr('暂无短信记录。选择模板，检查内容后再发送。', 'No SMS yet. Choose a template, review the text, then send.')}</p>`;
  }

  function messageStatus(value) {
    const labels = {
      pending: ['提交中', 'Submitting'], accepted: ['已受理', 'Accepted'], queued: ['排队中', 'Queued'],
      sending: ['发送中', 'Sending'], sent: ['已发送，未确认送达', 'Sent, delivery unconfirmed'],
      delivered: ['已送达', 'Delivered'], read: ['已读', 'Read'], failed: ['发送失败', 'Sending failed'],
      undelivered: ['未送达', 'Not delivered'], send_unknown: ['发送结果待核实', 'Sending result unconfirmed'],
      received: ['已收到', 'Received'], receiving: ['接收中', 'Receiving'], canceled: ['已取消', 'Canceled'],
      cancelled: ['已取消', 'Canceled'], scheduled: ['待定时发送', 'Scheduled to send']
    };
    const pair = labels[value];
    return pair ? tr(pair[0], pair[1]) : value || '';
  }

  function smsContactBlockers(person) {
    const reasons = [];
    if (!person?.phone?.trim()) reasons.push(tr('未填写手机号，请先在档案中补充；只有邮箱不能发送短信。', 'No phone number. Add it to the profile; an email address cannot receive SMS.'));
    else if (!/^[+()\d\s.-]+$/.test(person.phone) || !/^1\d{10}$/.test(phoneKey(person.phone))) reasons.push(tr('手机号格式无效，请在档案中核实美国手机号。', 'Invalid phone number. Verify the US phone number in the profile.'));
    if (person?.smsOptedOut) reasons.push(tr('候选人已退订短信，请改用其他已授权方式联系。', 'Candidate opted out of SMS. Use another authorized contact method.'));
    else if (!person?.smsConsent || !String(person.smsConsentNote || '').trim()) reasons.push(tr('尚无完整的短信同意记录，请先在档案中记录实际取得的同意及来源。', 'SMS consent is incomplete. Record the consent actually obtained and its source in the profile.'));
    if (!data?.sms?.configured) reasons.push(tr('当前环境短信通道尚未启用。', 'SMS is not enabled in this environment.'));
    return reasons;
  }

  function openMessages(id) {
    if (!checkIdentity()) return;
    const person = findCandidate(id); if (!person) return;
    const blocker = smsContactBlockers(person).join(' ');
    const html = `<div class="rec-dialog" data-rec-dialog="messages" data-rec-id="${h(id)}"><div class="rec-person-summary"><div><strong>${h(person.name)}</strong><p>${h(person.phone || tr('没有手机号', 'No phone number'))}</p></div><div class="rec-actions">${action('refresh-messages', id, tr('刷新回复', 'Refresh replies'))}${action('profile', id, tr('查看档案', 'Profile'))}</div></div><div id="recThreads" class="rec-threads">${threadHtml(person)}</div><div id="recDialogError" class="rec-alert" role="alert"></div>${canEdit() ? `${blocker ? `<p class="rec-banner">${h(blocker)}</p>` : ''}<div class="rec-templates">${[['invitation', '面试邀请', 'Invitation'], ['confirm', '确认时间', 'Confirm time'], ['reminder', '面试提醒', 'Reminder'], ['late', '未到场询问', 'Arrival check']].map(([kind, zh, en]) => `<button type="button" data-rec-action="template" data-rec-id="${kind}">${tr(zh, en)}</button>`).join('')}</div><section class="rec-compose-step"><label for="recSmsDraft">${tr('① 中文起草（也可输入英文）', '① Draft in Chinese or English')}<textarea id="recSmsDraft" class="rec-sms-compose" maxlength="1600" placeholder="${tr('用中文写想说的话，或选择上方英文模板。这里的草稿不会直接发送。', 'Write your message or choose a template. This draft is never sent directly.')}"></textarea></label><div class="rec-actions"><button id="recMakePreview" type="button" class="btn" data-rec-action="preview-sms">${tr('生成英文预览', 'Generate English preview')}</button><span class="rec-note">${tr('内容不为空即可，几个字也可以；中文先翻译成英文，核对后发送。', 'No minimum length beyond a non-empty message. Translate Chinese to English and review before sending.')}</span></div><p class="rec-note">${h(translationUnavailable())}</p></section><section class="rec-compose-step"><label for="recSmsBody">${tr('② 核对英文预览（实际发送内容）', '② Review English preview (actual message)')}<textarea id="recSmsBody" class="rec-sms-compose" readonly aria-describedby="recPreviewState" placeholder="${tr('先生成预览。修改上方草稿后需要重新生成。', 'Generate a preview first. Draft edits require a new preview.')}"></textarea></label><p id="recPreviewState" class="rec-note" role="status">${tr('尚未生成英文预览。', 'No English preview yet.')}</p><div class="rec-recipient">${tr('收件人', 'Recipient')}: <strong>${h(person.name)}</strong> · ${h(person.phone || '—')}<span class="rec-muted">${tr('只会发送这里的英文预览。AI 翻译和保存预约均不会发送短信。', 'Only this English preview will be sent. AI translation and saving an appointment do not send SMS.')}</span></div><label class="rec-check"><input id="recSmsReviewed" type="checkbox" disabled>${tr('我已核对收件人、英文内容、日期、时间及地址，并确认发送此内容', 'I checked the recipient, English wording, date, time and address and approve this message')}</label><div class="rec-actions"><button id="recSendSms" aria-describedby="recSmsCount recSmsSendState" class="btn primary" type="button" data-rec-action="send-sms" data-rec-id="${h(id)}" disabled>${tr('③ 确认发送英文短信', '③ Send reviewed English SMS')}</button><span class="rec-note" id="recSmsCount"></span></div><p id="recSmsSendState" class="rec-note" role="status" aria-live="polite"></p></section>` : ''}</div>`;
    openRecruitingModal(tr('应聘者短信', 'Candidate SMS'), html, null); el('modalSave').hidden = true;
    composeContext = { dialog: document.querySelector('[data-rec-dialog="messages"]'), id, identity, recipientPhone: person.phone || '', version: 0, pending: false, ready: false, sourceText: '', previewText: '', requestId: '', requestText: '' };
    updateComposeControls();
    const thread = el('recThreads'); thread.dataset.rendered = threadHtml(person); thread.scrollTop = thread.scrollHeight;
  }

  function activeComposer(context = composeContext) {
    return Boolean(user && token && hasPerm('recruitingView') && context && context === composeContext && context.dialog?.isConnected && el('modal')?.classList.contains('open') && context.identity === identity && context.identity === `${user.id}:${token}` && context.dialog.dataset.recId === context.id);
  }

  function updateComposeControls() {
    const context = composeContext; if (!activeComposer(context)) return;
    const person = findCandidate(context.id);
    const sameRecipient = person && phoneKey(person.phone) === phoneKey(context.recipientPhone);
    const ready = context.ready && context.sourceText === value('recSmsDraft') && context.previewText === value('recSmsBody') && Boolean(context.previewText) && !hasHan(context.previewText) && context.previewText.length <= 1600;
    const reviewed = el('recSmsReviewed');
    if (reviewed) { reviewed.disabled = !ready || busy; if (!ready) reviewed.checked = false; }
    if (el('recMakePreview')) el('recMakePreview').disabled = busy || context.pending || !value('recSmsDraft');
    const reasons = smsContactBlockers(person);
    if (!canEdit()) reasons.push(tr('需要招聘编辑权限。', 'Recruiting edit permission is required.'));
    if (!sameRecipient) reasons.push(tr('收件人的手机号已更新，请重新打开短信窗口并核对新号码。', 'The recipient phone changed. Reopen Messages and review the new number.'));
    if (busy) reasons.push(tr('正在提交，请勿重复发送。', 'Submitting; do not send again.'));
    else if (context.pending) reasons.push(tr('正在生成英文预览，请稍候。', 'Generating the English preview; please wait.'));
    else if (!value('recSmsDraft')) reasons.push(tr('请输入非空内容，几个字也可以。', 'Enter a non-empty message; a few characters are enough.'));
    else if (!ready) reasons.push(tr('请先生成当前草稿的有效英文预览。', 'Generate a valid English preview of the current draft first.'));
    else if (!reviewed?.checked) reasons.push(tr('请勾选上方核对确认。', 'Check the review confirmation above.'));
    if (el('recSendSms')) el('recSendSms').disabled = reasons.length > 0;
    if (el('recSmsSendState')) {
      el('recSmsSendState').textContent = reasons.length ? `${tr('暂不能发送：', 'Cannot send yet: ')}${reasons.join(' ')}` : tr('已就绪，短消息也可以发送。点击按钮才会发送。', 'Ready, including short messages. Nothing is sent until you click Send.');
      el('recSmsSendState').className = reasons.length ? 'rec-banner' : 'rec-note';
    }
    if (el('recSmsCount')) el('recSmsCount').textContent = tr(`英文预览 ${value('recSmsBody').length} 个字符；最多 1600 个字符，不用写满。`, `English preview: ${value('recSmsBody').length} characters; maximum 1,600, not a minimum.`);
  }

  function invalidatePreview() {
    if (!activeComposer()) return;
    composeContext.version += 1; composeContext.ready = false; composeContext.sourceText = ''; composeContext.previewText = '';
    if (el('recSmsBody')) el('recSmsBody').value = '';
    if (el('recPreviewState')) el('recPreviewState').textContent = tr('草稿已修改，请重新生成英文预览并核对后再发送。', 'Draft changed. Generate and review a new English preview before sending.');
    updateComposeControls();
  }

  async function makeSmsPreview() {
    const context = composeContext;
    if (!checkIdentity() || !canEdit() || !activeComposer(context) || context.pending || busy) return;
    const draft = value('recSmsDraft');
    if (!draft) { dialogError(tr('请先输入草稿。', 'Enter a draft first.')); return; }
    invalidatePreview();
    const version = context.version;
    const active = () => activeComposer(context) && context.version === version && value('recSmsDraft') === draft;
    context.pending = true; updateComposeControls(); dialogError('');
    el('recPreviewState').textContent = tr('正在生成英文预览，不会发送短信…', 'Generating an English preview. No SMS will be sent…');
    try {
      const preview = hasHan(draft) ? await requestTranslation(context.id, draft, 'en', active) : draft;
      if (!active()) return;
      if (hasHan(preview) || !preview.trim()) throw new Error(tr('预览仍含中文或为空，已阻止发送，请重新翻译。', 'The preview is empty or still contains Chinese. Sending is blocked; translate again.'));
      if (preview.length > 1600) throw new Error(tr('英文译文超过 1600 字符，请缩短草稿后重新生成。', 'English translation exceeds 1,600 characters. Shorten the draft and regenerate.'));
      context.sourceText = draft; context.previewText = preview.trim(); context.ready = true;
      el('recSmsBody').value = context.previewText;
      el('recPreviewState').textContent = hasHan(draft) ? tr('AI 英文预览已准备好。请核对姓名、电话、日期、时间及地址，再勾选确认；尚未发送。', 'AI English preview ready, not sent. Check names, phone numbers, dates, times and addresses, then approve below.') : tr('草稿未含汉字，已按原文预览，未自动判断其他语言。请人工确认内容为英文并核对姓名、日期、时间及地址；尚未发送。', 'No Han characters found: previewing the original without detecting other languages. Confirm it is English and check names, dates, times and addresses. Not sent.');
    } catch (err) { if (active()) { dialogError(err.message); el('recPreviewState').textContent = tr('未生成有效预览，短信不会发送。请检查草稿或稍后重试。', 'No valid preview was generated. Nothing will be sent. Check the draft or retry later.'); } }
    finally { if (activeComposer(context)) { context.pending = false; updateComposeControls(); } }
  }

  async function refreshMessages(id) {
    const dialog = document.querySelector('[data-rec-dialog="messages"]'), requestedIdentity = identity;
    await load(true);
    if (!dialog?.isConnected || identity !== requestedIdentity || dialog.dataset.recId !== id) return;
    if (error) { dialogError(error); return; }
    const person = findCandidate(id); if (!person) return;
    updateOpenMessageThread();
    el('recThreads').scrollTop = el('recThreads').scrollHeight;
    if (person.smsOptedOut && el('recSendSms')) { el('recSendSms').disabled = true; dialogError(tr('候选人已退订，短信发送已停止。', 'Candidate opted out; SMS sending is blocked.')); }
  }

  function updateOpenMessageThread() {
    const dialog = document.querySelector('[data-rec-dialog="messages"]');
    if (!dialog || !el('recThreads')) return;
    const person = findCandidate(dialog.dataset.recId); if (!person) return;
    const thread = el('recThreads');
    const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 45;
    const previousScroll = thread.scrollTop;
    const html = threadHtml(person);
    if (thread.dataset.rendered !== html) { thread.innerHTML = html; thread.dataset.rendered = html; }
    thread.scrollTop = nearBottom ? thread.scrollHeight : previousScroll;
    updateComposeControls();
    if (person.smsOptedOut) dialogError(tr('候选人已退订，短信发送已停止。', 'Candidate opted out; SMS sending is blocked.'));
  }

  async function sendSms(id) {
    if (!checkIdentity() || !canEdit() || busy) return;
    const context = composeContext;
    if (!activeComposer(context) || context.id !== id || context.pending) return;
    const text = value('recSmsBody');
    if (!text) { dialogError(tr('请先填写短信内容。', 'Enter a message first.')); return; }
    if (text.length > 1600) { dialogError(tr('短信不能超过 1600 字符。', 'Message must be at most 1600 characters.')); return; }
    if (hasHan(text)) { dialogError(tr('短信不能包含中文。请重新生成并核对英文预览。', 'SMS must not contain Chinese. Generate and review an English preview.')); return; }
    if (!context.ready || context.sourceText !== value('recSmsDraft') || context.previewText !== text || !el('recSmsReviewed')?.checked) { dialogError(tr('请重新生成当前草稿的英文预览，并勾选核对确认。', 'Generate an English preview of the current draft and approve it first.')); return; }
    const person = findCandidate(id);
    if (phoneKey(person?.phone) !== phoneKey(context.recipientPhone)) { updateComposeControls(); return; }
    const contactBlockers = smsContactBlockers(person);
    if (contactBlockers.length) { updateComposeControls(); dialogError(contactBlockers.join(' ')); return; }
    if (!context.requestId || context.requestText !== text) { context.requestId = window.crypto.randomUUID(); context.requestText = text; }
    const requestId = context.requestId, sentVersion = context.version;
    busy = true; updateComposeControls(); dialogError('');
    try {
      const result = await api(`/api/recruiting/candidates/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify({ text, clientMessageId: requestId, expectedPhone: context.recipientPhone }), timeoutMs: 30000 });
      if (activeComposer(context)) {
        const sentStatus = result.message?.status;
        const failed = ['failed', 'undelivered'].includes(sentStatus);
        const uncertain = !sentStatus || ['send_unknown', 'pending'].includes(sentStatus);
        if (!failed && !uncertain && context.version === sentVersion && value('recSmsBody') === text) {
          el('recSmsDraft').value = ''; invalidatePreview(); context.requestId = ''; context.requestText = '';
          el('recPreviewState').textContent = tr('本条短信已提交。新的草稿需要重新生成预览。', 'This message was submitted. A new draft needs a new preview.');
        }
        dialogError(uncertain ? tr('发送状态尚未确认，草稿已保留。请刷新记录核实，重复点击不会再次发送。', 'Sending is not yet confirmed; the draft was preserved. Refresh to check. Retrying this draft will not send it twice.') : failed ? tr('短信未送达，请检查状态后再决定是否重试。', 'Message failed. Review its status before retrying.') : tr('短信已提交，送达情况以短信记录状态为准。', 'Message submitted; the message status shows delivery progress.'), !failed && !uncertain);
      }
      await load(true);
    } catch (err) { if (activeComposer(context)) dialogError(`${err.message} ${tr('草稿已保留，请刷新短信记录核实后再决定是否重试。', 'Draft preserved. Refresh the message history and verify the status before retrying.')}`); }
    finally {
      busy = false;
      updateComposeControls();
    }
  }

  async function uploadResume(file, id) {
    if (!file || !canEdit()) return;
    if (file.size > 5 * 1024 * 1024 || !/\.pdf$/i.test(file.name)) { dialogError(tr('请选择不超过 5 MB 的 PDF 文件。', 'Choose a PDF file no larger than 5 MB.')); return; }
    const upload = el('recResumeFile'); if (upload) upload.disabled = true;
    try {
      const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error(tr('无法读取文件。', 'Unable to read file.'))); reader.readAsDataURL(file); });
      const result = await api(`/api/recruiting/candidates/${encodeURIComponent(id)}/resume`, { method: 'POST', body: JSON.stringify({ name: file.name, type: 'application/pdf', data: base64 }), timeoutMs: 30000 });
      const person = findCandidate(id); if (person && result.candidate) person.resume = result.candidate.resume;
      if (document.querySelector('[data-rec-dialog="candidate"]')?.dataset.recId === id) {
        dialogError(tr('PDF 已安全上传；其他未保存的档案内容仍保留。', 'PDF uploaded. Other unsaved profile changes are still here.'), true);
        const attachments = document.querySelector('.rec-attachment');
        if (attachments && !attachments.querySelector('[data-rec-action="view-resume"]')) attachments.insertAdjacentHTML('afterbegin', action('view-resume', id, tr('查看 PDF', 'View PDF')));
      }
      await load(true);
    } catch (err) { dialogError(err.message); }
    finally { if (upload?.isConnected) { upload.disabled = false; upload.value = ''; } }
  }

  async function viewResume(id) {
    if (!checkIdentity()) return;
    try {
      const response = await fetch(`/api/recruiting/candidates/${encodeURIComponent(id)}/resume`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || tr('无法读取简历。', 'Unable to load the resume.')); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { dialogError(err.message); }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-rec-action]'); if (!button || button.disabled) return;
    const row = button.closest('.rec-candidate-row');
    if (row && button.dataset.recAction === 'profile') {
      const selection = window.getSelection?.();
      if (selection && !selection.isCollapsed && (row.contains(selection.anchorNode) || row.contains(selection.focusNode))) return;
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    }
    if (!checkIdentity()) return;
    const id = button.dataset.recId || '';
    switch (button.dataset.recAction) {
      case 'refresh': load(true); break;
      case 'candidate': openCandidate(id); break;
      case 'profile': openCandidateProfile(id); break;
      case 'interview-kit': openInterviewKit(id, button.dataset.recTemplateId || ''); break;
      case 'copy-interview-kit-zh': copyInterviewKit(button, 'zh'); break;
      case 'copy-interview-kit-en': copyInterviewKit(button, 'en'); break;
      case 'schedule': openInterview(id); break;
      case 'edit-interview': openInterview('', id); break;
      case 'create-video-invite': createVideoInvite(id); break;
      case 'copy-video-invite': copyVideoInvite(); break;
      case 'join-video-interview': joinVideoInterview(id); break;
      case 'messages': openMessages(id); break;
      case 'refresh-messages': refreshMessages(id); break;
      case 'view-resume': viewResume(id); break;
      case 'send-sms': sendSms(id); break;
      case 'preview-sms': makeSmsPreview(); break;
      case 'translate-reading': translateReading(button); break;
      case 'tab': tab = id; scope = ''; repaint(); break;
      case 'scope': scope = scope === id ? '' : id; tab = id === 'reply' ? 'candidates' : 'interviews'; status = ''; repaint(); break;
      case 'template': {
        const candidateId = document.querySelector('[data-rec-dialog="messages"]')?.dataset.recId;
        const person = findCandidate(candidateId); if (!person) break;
        const content = template(person, id);
        if (!content) { dialogError(tr('请先保存面试日期和时间，再使用此模板。', 'Save an interview date and time before using this template.')); break; }
        if (!activeComposer() || busy) break;
        dialogError(''); el('recSmsDraft').value = content; invalidatePreview(); break;
      }
    }
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'recSearch') { query = event.target.value; el('recResults').innerHTML = candidateTable(); }
    if (event.target.id === 'recSmsDraft') invalidatePreview();
    if (event.target.id === 'recSmsBody') invalidatePreview();
    if (event.target.matches('.rec-kit-score')) updateInterviewKitScore();
  });
  document.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key) || !event.target.matches('.rec-candidate-row')) return;
    event.preventDefault();
    openCandidateProfile(event.target.dataset.recId);
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'recStatusFilter') { status = event.target.value; el('recResults').innerHTML = candidateTable(); }
    if (event.target.id === 'recCandidateSort') { candidateSort = event.target.value === 'created' ? 'created' : 'applied'; el('recResults').innerHTML = candidateTable(); }
    if (event.target.id === 'recInterviewKitSelect') {
      const candidateId = document.querySelector('[data-rec-dialog="interview-kit"]')?.dataset.recId;
      if (candidateId) openInterviewKit(candidateId, event.target.value);
    }
    if (event.target.matches('[data-rec-translation-language]')) changeReadingLanguage(event.target);
    if (['recInterviewDate', 'recInterviewTime', 'recInterviewAddress'].includes(event.target.id)) { if (el('recCandidateConfirmed')) el('recCandidateConfirmed').checked = false; updateAmbiguity(); }
    if (event.target.id === 'recResumeFile') uploadResume(event.target.files?.[0], event.target.dataset.recId);
    if (event.target.id === 'recSmsReviewed') updateComposeControls();
    if (event.target.id === 'recInterviewStatus' && event.target.value !== 'confirmed' && el('recAutoReminders')) el('recAutoReminders').checked = false;
  });
  // Clear private cache as soon as logout/authentication changes, even if another module is open.
  const authObserver = new MutationObserver(() => {
    if (!user || !token || !hasPerm('recruitingView')) checkIdentity();
  });
  if (el('app')) authObserver.observe(el('app'), { attributes: true, attributeFilter: ['class'] });
  setInterval(() => { if (!document.hidden && !busy && current === 'recruiting' && checkIdentity()) load(true); }, 30000);
  window.Recruiting = Object.freeze({ render: renderPage, openCandidate, openCandidateProfile, openInterviewKit, refresh: () => load(true), onAuthChanged: checkIdentity, localToInstants, localParts });
  if (state && current === 'recruiting') render();
})();
