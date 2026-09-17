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
  let query = '', status = '', tab = 'candidates', scope = '', busy = false;
  let messageRequestId = '', messageRequestText = '';
  const tr = (zh, en) => lang === 'zh' ? zh : en;
  const h = value => escapeHtml(value);
  const label = (list, value) => { const item = list.find(row => row[0] === value); return item ? tr(item[1], item[2]) : value || '—'; };
  const canEdit = () => hasPerm('recruitingEdit');
  const candidates = () => data?.candidates || [];
  const interviews = () => data?.interviews || [];
  const findCandidate = id => candidates().find(item => item.id === id);
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
      identity = next; data = null; loadedAt = 0; loading = null; error = ''; query = ''; status = ''; scope = '';
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
    }).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  function candidateTable() {
    const rows = filteredCandidates();
    if (!rows.length) return empty(candidates().length ? tr('没有匹配的应聘者', 'No matching candidates') : tr('把下一位合适的人，安排到店', 'Meet your next great salesperson'), candidates().length ? tr('调整搜索或状态筛选后再试。', 'Try another search or status.') : tr('新增应聘者后，可以保存简历、联系候选人、安排面试，并在这里跟进每一步。', 'Add a candidate to keep resumes, conversations, interviews and evaluation together.'), !candidates().length);
    return `<div class="rec-table-scroll"><table class="rec-table"><thead><tr><th>${tr('应聘者', 'Candidate')}</th><th>${tr('岗位 / 来源', 'Position / source')}</th><th>${tr('进展', 'Progress')}</th><th>${tr('面试时间 · 洛杉矶', 'Interview · Pacific')}</th><th>${tr('评分', 'Score')}</th><th>${tr('操作', 'Actions')}</th></tr></thead><tbody>${rows.map(item => {
      const meeting = nextInterview(item.id), score = average(item);
      return `<tr><td><div class="rec-person"><span class="rec-avatar">${h(String(item.name || '?').trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase())}</span><div><button type="button" data-rec-action="candidate" data-rec-id="${h(item.id)}">${h(item.name)}</button><span class="rec-muted">${h(item.phone || item.email || tr('联系方式待补充', 'Contact details needed'))}</span>${needsReply(item) ? `<span class="rec-pill warn">${tr('有新回复', 'Reply received')}</span>` : ''}</div></div></td><td>${h(item.position || '—')}<span class="rec-muted">${h(item.source || '—')}${item.location ? ` · ${h(item.location)}` : ''}</span></td><td>${pill(item.status)}</td><td>${meeting ? `${h(when(meeting.startsAt))}<span class="rec-muted">${h(label(interviewStates, meeting.status))}</span>` : '<span class="rec-muted">—</span>'}</td><td>${score ? `<span class="rec-score">${score.number}<small> / 10</small></span><span class="rec-muted">${score.count}/6 ${tr('项已评', 'rated')}</span>` : `<span class="rec-muted">${tr('待面试', 'Not rated')}</span>`}</td><td><div class="rec-actions"><button class="rec-text-button" data-rec-action="messages" data-rec-id="${h(item.id)}">${tr('短信', 'Messages')}</button>${canEdit() ? `<button class="rec-text-button" data-rec-action="${meeting ? 'edit-interview' : 'schedule'}" data-rec-id="${h(meeting?.id || item.id)}">${meeting ? tr('查看预约', 'Review interview') : tr('预约', 'Schedule')}</button>` : ''}</div></td></tr>`;
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
    return `<section id="recRoot" class="rec-center">${data?.settings?.preview ? `<div class="rec-banner">${tr('本地演示环境 · 示例资料仅用于验证，短信不会发送。', 'Local preview · Sample records are for verification; SMS is not sent.')}</div>` : ''}<header class="rec-hero"><div><div class="rec-eyebrow">QUAD FILM · PEOPLE</div><h2>${tr('让每一次面试，都有准备', 'Make every interview count')}</h2><p>${tr('汽车膜销售与业务开发优先 · 经销商合作 / 膜材批发', 'Automotive film sales & business development · Dealership partnerships / wholesale')}</p><p>${h(data?.settings?.address || DEFAULT_ADDRESS)}</p></div><div class="rec-actions">${action('refresh', '', tr('刷新', 'Refresh'))}${canEdit() ? action('candidate', '', tr('＋ 新增应聘者', '+ Add candidate'), true) : ''}</div></header><div class="rec-stats">${counts.map(([key, title, count, note]) => `<button class="rec-stat ${scope === key ? 'selected' : ''}" data-rec-action="scope" data-rec-id="${key}"><small>${h(title)}</small><strong>${count}</strong><span>${h(note)}</span></button>`).join('')}</div>${error ? `<div class="rec-alert">${h(error)} ${tr('请点击刷新重试。', 'Select Refresh to retry.')}</div>` : ''}<div class="rec-board"><div class="rec-board-head"><div class="rec-tabs"><button class="rec-tab ${tab === 'candidates' ? 'active' : ''}" data-rec-action="tab" data-rec-id="candidates">${tr('应聘者', 'Candidates')} · ${candidates().length}</button><button class="rec-tab ${tab === 'interviews' ? 'active' : ''}" data-rec-action="tab" data-rec-id="interviews">${tr('面试日程', 'Interviews')}</button></div>${tab === 'candidates' ? `<div class="rec-filters"><input id="recSearch" aria-label="${tr('搜索应聘者', 'Search candidates')}" placeholder="${tr('搜索姓名、电话、经验…', 'Search name, phone, experience…')}" value="${h(query)}"><select id="recStatusFilter" aria-label="${tr('招聘状态', 'Recruiting status')}">${options([['', '全部状态', 'All statuses'], ...candidateStates], status)}</select></div>` : `<button class="rec-text-button" data-rec-action="scope" data-rec-id="">${tr('显示全部日程', 'Show all interviews')}</button>`}</div><div id="recResults">${!data && loading ? empty(tr('正在读取招聘资料…', 'Loading recruiting records…'), '') : tab === 'candidates' ? candidateTable() : scheduleList()}</div></div><p class="rec-footer-note">${tr('短信通道', 'SMS channel')}: ${data?.sms?.configured ? tr('已配置', 'Configured') : tr('尚未配置或本地环境已关闭', 'Not configured or disabled locally')} · ${tr('评分仅作为人工招聘决策的参考；空白项表示尚未核实。', 'Scores support human review; blank dimensions have not been verified.')}${loadedAt ? ` · ${tr('更新于', 'Updated')} ${h(when(loadedAt))}` : ''}</p>${quarantineHtml()}</section>`;
  }

  function dialogError(message, ok = false) {
    const box = el('recDialogError');
    if (box) { box.className = ok ? 'rec-ok' : 'rec-alert'; box.textContent = message || ''; }
  }

  async function saveMutation(path, body) {
    if (busy) return false;
    busy = true; dialogError('');
    const dialog = document.querySelector('[data-rec-dialog]');
    const button = el('modalSave'); if (button) button.disabled = true;
    try {
      await api(path, { method: path.endsWith('/candidates') || path.endsWith('/interviews') ? 'POST' : 'PATCH', body: JSON.stringify(body), timeoutMs: 20000 });
      if (dialog?.isConnected) closeModal();
      await load(true);
      return true;
    } catch (err) { if (dialog?.isConnected) dialogError(err.message); return false; }
    finally { busy = false; if (button && dialog?.isConnected) button.disabled = false; }
  }

  function openCandidate(id = '') {
    if (!checkIdentity()) return;
    const item = findCandidate(id);
    if (id && !item) return;
    if (!item && !canEdit()) return;
    const c = item || { position: tr('汽车膜销售 / 业务开发', 'Automotive film sales / Business development'), source: 'Indeed', status: 'new' };
    const edit = canEdit();
    const currentMeeting = item ? nextInterview(item.id) : null;
    const phoneLink = /^[+\d\s().-]+$/.test(c.phone || '') ? `<a href="tel:${h(c.phone.replace(/[^+\d]/g, ''))}" class="btn">${tr('拨打电话', 'Call')}</a>` : '';
    const emailLink = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email || '') ? `<a href="mailto:${h(encodeURIComponent(c.email))}" class="btn">${tr('打开邮件客户端', 'Open email app')}</a>` : '';
    const html = `<div class="rec-dialog" data-rec-dialog="candidate" data-rec-id="${h(id)}"><div id="recDialogError" class="rec-alert" role="alert"></div>${item ? `<div class="rec-person-summary"><div><strong>${h(c.name)}</strong><p>${h(c.phone || '')} ${h(c.email || '')}</p>${pill(c.status)}</div><div class="rec-actions">${phoneLink}${emailLink}${action('messages', id, tr('短信记录', 'Messages'))}${edit ? currentMeeting ? action('edit-interview', currentMeeting.id, tr('查看预约', 'Review interview'), true) : action('schedule', id, tr('安排面试', 'Schedule'), true) : ''}</div></div>` : ''}<fieldset ${edit ? '' : 'disabled'}><div class="rec-form-grid">${input('recName', tr('姓名 *', 'Name *'), c.name, 'text', 'maxlength="160" required')}${input('recPosition', tr('应聘岗位', 'Position'), c.position, 'text', 'maxlength="160"')}${input('recPhone', tr('手机号', 'Phone'), c.phone, 'tel', 'maxlength="40"')}${input('recEmail', tr('邮箱', 'Email'), c.email, 'email', 'maxlength="254"')}${input('recSource', tr('来源平台', 'Source'), c.source, 'text', 'maxlength="100" list="recSources"')}<datalist id="recSources"><option>Indeed</option><option>Craigslist</option><option>Handshake</option><option>Referral</option><option>Walk-in</option><option>Email</option></datalist>${select('recStatus', tr('招聘状态', 'Recruiting status'), candidateStates, c.status)}${input('recLocation', tr('所在地 / 通勤情况', 'Location / commute'), c.location, 'text', 'maxlength="240"')}${input('recAvailability', tr('最早到岗 / 可工作时间', 'Start date / work availability'), c.availability, 'text', 'maxlength="2000"')}${select('recEmployment', tr('全职 / 兼职意愿', 'Employment preference'), [['', '待确认', 'To confirm'], ['full_time', '全职', 'Full-time'], ['part_time', '兼职', 'Part-time'], ['flexible', '均可', 'Flexible']], c.employmentType || '')}${input('recCompensation', tr('对已发布薪资的匹配情况', 'Fit with published compensation'), c.compensation, 'text', 'maxlength="2000"')}${textarea('recExperience', tr('汽车 / 贴膜 / 销售经验及可核实业绩', 'Automotive / film / sales experience and verifiable results'), c.experience)}${textarea('recResources', tr('经销商资源及第一周开发计划', 'Dealership relationships and first-week outreach plan'), c.dealershipResources)}${textarea('recNotes', tr('跟进备注', 'Follow-up notes'), c.notes)}</div></fieldset><details ${!item ? 'open' : ''}><summary>${tr('简历与附件', 'Resume & attachment')}</summary><fieldset ${edit ? '' : 'disabled'}><div class="rec-form-grid">${input('recResumeUrl', tr('简历 / 作品链接（https://）', 'Resume / portfolio URL (https://)'), c.resumeUrl, 'url', 'maxlength="2000"')}${textarea('recResumeText', tr('简历文本', 'Resume text'), c.resumeText, 60000)}</div></fieldset>${item ? `<div class="rec-attachment">${c.resume ? `<span class="rec-note">${h(c.resume.name)}</span>${action('view-resume', id, tr('查看 PDF', 'View PDF'))}` : `<span class="rec-note">${tr('尚未上传 PDF 简历', 'No PDF uploaded')}</span>`}${edit ? `<label class="btn">${tr('上传 PDF（≤5 MB）', 'Upload PDF (≤5 MB)')}<input type="file" id="recResumeFile" data-rec-id="${h(id)}" accept="application/pdf,.pdf" hidden></label>` : ''}</div>` : `<p class="rec-note">${tr('先保存应聘者档案，即可上传私有 PDF 简历。', 'Save the candidate first to upload a private PDF resume.')}</p>`}</details><details><summary>${tr('面试评分与证据', 'Interview scorecard & evidence')}</summary><fieldset ${edit ? '' : 'disabled'}><p class="rec-note" style="margin-bottom:12px">${tr('1 分为证据弱，10 分为证据充分且匹配度高。未核实请留空；请记录具体案例。', '1 = weak evidence, 10 = strong verified fit. Leave unverified dimensions blank and record examples.')}</p><div class="rec-score-grid">${dimensions.map(([key, zh, en]) => input(`recScore_${key}`, tr(zh, en), c.scores?.[key] ?? '', 'number', 'min="1" max="10" step="1"')).join('')}</div>${textarea('recScoreNotes', tr('评分依据 / 优势 / 待核实事项', 'Evidence / strengths / open questions'), c.scoreNotes)}</fieldset></details><fieldset ${edit ? '' : 'disabled'}><label class="rec-check"><input type="checkbox" id="recConsent" ${c.smsConsent ? 'checked' : ''} ${c.smsOptedOut ? 'disabled' : ''}>${tr('已获得候选人同意，通过短信联系本次招聘和面试安排', 'Candidate agreed to receive recruiting and interview SMS')}</label>${input('recConsentNote', tr('同意来源与日期（勾选时必填）', 'Consent source and date (required when checked)'), c.smsConsentNote, 'text', 'maxlength="2000"')}${c.smsOptedOut ? `<p class="rec-alert">${tr('候选人已退订短信。系统会阻止发送，请通过其他已授权方式联系。', 'Candidate opted out of SMS. Sending is blocked; use another authorized channel.')}</p>` : ''}</fieldset><p class="rec-note">${tr('保存资料不会发送邀请；“打开邮件客户端”仅打开邮件，不会自动发送。', 'Saving a profile sends no invitation. Open email app only opens a draft; it does not send email.')}</p></div>`;
    openModal(item ? tr('应聘者档案', 'Candidate profile') : tr('新增应聘者', 'Add candidate'), html, async () => {
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
      const body = { name, phone: value('recPhone'), email: value('recEmail'), source: value('recSource'), position: value('recPosition'), location: value('recLocation'), experience: value('recExperience'), dealershipResources: value('recResources'), availability: value('recAvailability'), employmentType: value('recEmployment'), compensation: value('recCompensation'), notes: value('recNotes'), resumeText: value('recResumeText'), resumeUrl: value('recResumeUrl'), status: value('recStatus'), scores, scoreNotes: value('recScoreNotes'), smsConsent: el('recConsent').checked, smsConsentNote: value('recConsentNote') };
      await saveMutation(`/api/recruiting/candidates${id ? `/${encodeURIComponent(id)}` : ''}`, body);
    });
    if (!edit) el('modalSave').hidden = true;
  }

  function openInterview(candidateId, interviewId = '') {
    if (!checkIdentity() || !canEdit()) return;
    const meeting = interviewId ? interviews().find(item => item.id === interviewId) : null;
    const person = findCandidate(meeting?.candidateId || candidateId); if (!person) return;
    const initial = meeting?.startsAt ? localParts(meeting.startsAt) : { date: localParts(Date.now()).date, time: '10:00' };
    const html = `<div class="rec-dialog" data-rec-dialog="interview" data-rec-id="${h(person.id)}"><div id="recDialogError" class="rec-alert" role="alert"></div><div class="rec-person-summary"><strong>${h(person.name)}</strong>${pill(person.status)}</div><p class="rec-note">${tr('所有预约均使用洛杉矶时间（PST / PDT），与本机时区无关。保存后，请到短信窗口预览并发送邀请。', 'All appointments use Los Angeles time (PST / PDT), regardless of this computer’s time zone. After saving, preview and send the invitation from Messages.')}</p><div class="rec-form-grid">${input('recInterviewDate', tr('面试日期 *', 'Interview date *'), initial.date, 'date', 'required')}${input('recInterviewTime', tr('面试时间 *', 'Interview time *'), initial.time, 'time', 'required')}<div id="recTimeAmbiguity" class="rec-wide"></div>${input('recDuration', tr('时长（分钟）', 'Duration (minutes)'), meeting?.durationMinutes || 30, 'number', 'min="15" max="180" step="5"')}${input('recInterviewer', tr('面试官', 'Interviewer'), meeting?.interviewerName || user?.name || '', 'text', 'maxlength="160" list="recInterviewers"')}<datalist id="recInterviewers">${(data?.interviewers || []).map(person => `<option>${h(person.name)}</option>`).join('')}</datalist>${input('recInterviewAddress', tr('面试地址 *', 'Interview address *'), meeting?.address || data?.settings?.address || DEFAULT_ADDRESS, 'text', 'maxlength="500" required')}${select('recInterviewStatus', tr('预约状态', 'Appointment status'), interviewStates, meeting?.status || 'scheduled')}${textarea('recInterviewNotes', tr('面试备注', 'Interview notes'), meeting?.notes)}</div><label class="rec-check"><input type="checkbox" id="recCandidateConfirmed" ${['confirmed', 'arrived', 'completed'].includes(meeting?.status) ? 'checked' : ''}>${tr('我已收到候选人对这个日期、时间和地址的明确确认', 'I have the candidate’s explicit confirmation of this date, time and address')}</label><label class="rec-check"><input type="checkbox" id="recAutoReminders" ${meeting?.automaticReminders ? 'checked' : ''} ${data?.settings?.remindersEnabled === false ? 'disabled' : ''}>${tr('开启本次面试的自动短信提醒（24 小时 / 2 小时前）', 'Enable automatic SMS reminders for this interview (24 hours / 2 hours before)')}</label><p class="rec-note">${data?.settings?.remindersEnabled === false ? tr('本地环境已关闭自动发送。', 'Automatic sending is disabled in this environment.') : tr('自动提醒需要短信同意且预约已确认；取消或改期后按最新安排处理。', 'Automatic reminders require SMS consent and a confirmed appointment. Cancellation or rescheduling uses the latest appointment.')}</p></div>`;
    openModal(meeting ? tr('查看 / 修改面试安排', 'Review / reschedule interview') : tr('安排面试', 'Schedule interview'), html, async () => {
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
    return list.length ? list.map(message => `<div class="rec-bubble ${message.direction === 'outbound' ? 'outbound' : ''}">${h(message.text)}<small>${h(when(message.timestamp || message.createdAt))} · ${h(message.direction === 'outbound' ? tr('我们', 'Us') : person.name)} · ${h(messageStatus(message.status))}${message.errorCode ? ` · ${h(message.errorCode)}` : ''}</small></div>`).join('') : `<p class="rec-note">${tr('暂无短信记录。选择模板，检查内容后再发送。', 'No SMS yet. Choose a template, review the text, then send.')}</p>`;
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

  function openMessages(id) {
    if (!checkIdentity()) return;
    const person = findCandidate(id); if (!person) return;
    messageRequestId = ''; messageRequestText = '';
    const canSend = canEdit() && person.phone && person.smsConsent && !person.smsOptedOut && data?.sms?.configured;
    const blocker = person.smsOptedOut ? tr('此候选人已退订，无法发送短信。', 'Candidate opted out; SMS is blocked.') : !person.smsConsent ? tr('请先在档案中记录候选人的短信同意。', 'Record candidate SMS consent in the profile before sending.') : !person.phone ? tr('请先补充手机号。', 'Add a phone number first.') : !data?.sms?.configured ? tr('当前环境短信通道尚未启用。', 'SMS is not enabled in this environment.') : '';
    const html = `<div class="rec-dialog" data-rec-dialog="messages" data-rec-id="${h(id)}"><div class="rec-person-summary"><div><strong>${h(person.name)}</strong><p>${h(person.phone || tr('没有手机号', 'No phone number'))}</p></div><div class="rec-actions">${action('refresh-messages', id, tr('刷新回复', 'Refresh replies'))}${action('candidate', id, tr('查看档案', 'Profile'))}</div></div><div id="recThreads" class="rec-threads">${threadHtml(person)}</div><div id="recDialogError" class="rec-alert" role="alert"></div>${canEdit() ? `${blocker ? `<p class="rec-banner">${h(blocker)}</p>` : ''}<div class="rec-templates">${[['invitation', '面试邀请', 'Invitation'], ['confirm', '确认时间', 'Confirm time'], ['reminder', '面试提醒', 'Reminder'], ['late', '未到场询问', 'Arrival check']].map(([kind, zh, en]) => `<button type="button" data-rec-action="template" data-rec-id="${kind}">${tr(zh, en)}</button>`).join('')}</div><label for="recSmsBody">${tr('英文短信草稿（可直接编辑）', 'English SMS draft (editable)')}<textarea id="recSmsBody" class="rec-sms-compose" maxlength="1600" placeholder="${tr('先选择一个模板，或输入要发送的内容…', 'Choose a template or write a message…')}"></textarea></label><div class="rec-recipient">${tr('收件人', 'Recipient')}: <strong>${h(person.name)}</strong> · ${h(person.phone || '—')}<span class="rec-muted">${tr('点击“发送短信”后立即发送；保存预约不会发送此草稿。', 'Send SMS sends immediately. Saving an appointment does not send this draft.')}</span></div><div class="rec-actions"><button id="recSendSms" class="btn primary" type="button" data-rec-action="send-sms" data-rec-id="${h(id)}" ${canSend ? '' : 'disabled'}>${tr('发送短信', 'Send SMS')}</button><span class="rec-note" id="recSmsCount">0 / 1600</span></div>` : ''}</div>`;
    openModal(tr('应聘者短信', 'Candidate SMS'), html, null); el('modalSave').hidden = true;
    const thread = el('recThreads'); thread.scrollTop = thread.scrollHeight;
  }

  async function refreshMessages(id) {
    await load(true);
    const dialog = document.querySelector('[data-rec-dialog="messages"]');
    if (dialog?.dataset.recId !== id) return;
    if (error) { dialogError(error); return; }
    const person = findCandidate(id); if (!person) return;
    el('recThreads').innerHTML = threadHtml(person);
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
    thread.innerHTML = threadHtml(person);
    thread.scrollTop = nearBottom ? thread.scrollHeight : previousScroll;
    if (el('recSendSms')) el('recSendSms').disabled = busy || !canEdit() || !person.phone || !person.smsConsent || person.smsOptedOut || !data?.sms?.configured;
    if (person.smsOptedOut) dialogError(tr('候选人已退订，短信发送已停止。', 'Candidate opted out; SMS sending is blocked.'));
  }

  async function sendSms(id) {
    if (!canEdit() || busy) return;
    const text = value('recSmsBody');
    if (!text) { dialogError(tr('请先填写短信内容。', 'Enter a message first.')); return; }
    if (text.length > 1600) { dialogError(tr('短信不能超过 1600 字符。', 'Message must be at most 1600 characters.')); return; }
    if (!messageRequestId || messageRequestText !== text) { messageRequestId = window.crypto.randomUUID(); messageRequestText = text; }
    busy = true; const button = el('recSendSms'); button.disabled = true; dialogError('');
    try {
      const result = await api(`/api/recruiting/candidates/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify({ text, clientMessageId: messageRequestId }), timeoutMs: 30000 });
      const sameDialog = document.querySelector('[data-rec-dialog="messages"]')?.dataset.recId === id;
      if (sameDialog) {
        const sentStatus = result.message?.status;
        const failed = ['failed', 'undelivered'].includes(sentStatus);
        const uncertain = !sentStatus || ['send_unknown', 'pending'].includes(sentStatus);
        if (!failed && !uncertain && value('recSmsBody') === text) { el('recSmsBody').value = ''; el('recSmsCount').textContent = '0 / 1600'; messageRequestId = ''; messageRequestText = ''; }
        dialogError(uncertain ? tr('发送状态尚未确认，草稿已保留。请刷新记录核实，重复点击不会再次发送。', 'Sending is not yet confirmed; the draft was preserved. Refresh to check. Retrying this draft will not send it twice.') : failed ? tr('短信未送达，请检查状态后再决定是否重试。', 'Message failed. Review its status before retrying.') : tr('短信已提交，送达情况以短信记录状态为准。', 'Message submitted; the message status shows delivery progress.'), !failed && !uncertain);
      }
      await refreshMessages(id);
    } catch (err) { if (document.querySelector('[data-rec-dialog="messages"]')?.dataset.recId === id) dialogError(`${err.message} ${tr('草稿已保留。', 'Your draft was preserved.')}`); }
    finally {
      busy = false;
      if (button.isConnected) { const person = findCandidate(id); button.disabled = !person?.smsConsent || person?.smsOptedOut || !data?.sms?.configured; }
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
    if (!checkIdentity()) return;
    const id = button.dataset.recId || '';
    switch (button.dataset.recAction) {
      case 'refresh': load(true); break;
      case 'candidate': openCandidate(id); break;
      case 'schedule': openInterview(id); break;
      case 'edit-interview': openInterview('', id); break;
      case 'messages': openMessages(id); break;
      case 'refresh-messages': refreshMessages(id); break;
      case 'view-resume': viewResume(id); break;
      case 'send-sms': sendSms(id); break;
      case 'tab': tab = id; scope = ''; repaint(); break;
      case 'scope': scope = scope === id ? '' : id; tab = id === 'reply' ? 'candidates' : 'interviews'; status = ''; repaint(); break;
      case 'template': {
        const candidateId = document.querySelector('[data-rec-dialog="messages"]')?.dataset.recId;
        const person = findCandidate(candidateId); if (!person) break;
        const content = template(person, id);
        if (!content) { dialogError(tr('请先保存面试日期和时间，再使用此模板。', 'Save an interview date and time before using this template.')); break; }
        dialogError(''); el('recSmsBody').value = content; el('recSmsCount').textContent = `${content.length} / 1600`; break;
      }
    }
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'recSearch') { query = event.target.value; el('recResults').innerHTML = candidateTable(); }
    if (event.target.id === 'recSmsBody') el('recSmsCount').textContent = `${event.target.value.length} / 1600`;
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'recStatusFilter') { status = event.target.value; el('recResults').innerHTML = candidateTable(); }
    if (['recInterviewDate', 'recInterviewTime', 'recInterviewAddress'].includes(event.target.id)) { if (el('recCandidateConfirmed')) el('recCandidateConfirmed').checked = false; updateAmbiguity(); }
    if (event.target.id === 'recResumeFile') uploadResume(event.target.files?.[0], event.target.dataset.recId);
    if (event.target.id === 'recInterviewStatus' && event.target.value !== 'confirmed' && el('recAutoReminders')) el('recAutoReminders').checked = false;
  });
  // Clear private cache as soon as logout/authentication changes, even if another module is open.
  const authObserver = new MutationObserver(() => {
    if (!user || !token || !hasPerm('recruitingView')) checkIdentity();
  });
  if (el('app')) authObserver.observe(el('app'), { attributes: true, attributeFilter: ['class'] });
  setInterval(() => { if (!document.hidden && !busy && current === 'recruiting' && checkIdentity()) load(true); }, 30000);
  window.Recruiting = Object.freeze({ render: renderPage, openCandidate, refresh: () => load(true), onAuthChanged: checkIdentity, localToInstants, localParts });
  if (state && current === 'recruiting') render();
})();
