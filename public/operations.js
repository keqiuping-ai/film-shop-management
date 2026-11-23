/* Operations records are fetched separately, scoped on the server to owners and assignees. */
(() => {
  'use strict';
  let data = null, identity = '', loading = false, error = '', tab = 'tasks';
  let company = '', status = '', search = '', onlyMine = false, dueOnly = false;
  const statusNames = { unverified:'待核实', pending:'待办理', in_progress:'办理中', waiting:'等待外部回复', completed:'已完成', not_applicable:'不适用', archived:'已归档' };
  const applicabilityNames = { unverified:'是否需要：待核实', required:'必须办理', conditional:'符合条件时需要', recommended:'建议配置', not_applicable:'不适用' };
  const e = value => escapeHtml(String(value ?? ''));
  const byId = (kind, id) => data[kind].find(row => row.id === id);
  const button = (label, action, primary = false) => `<button class="btn ${primary ? 'primary' : ''}" onclick="${action}">${e(label)}</button>`;
  const options = (map, value) => Object.entries(map).map(([key, name]) => `<option value="${e(key)}" ${String(value) === key ? 'selected' : ''}>${e(name)}</option>`).join('');
  const input = (key, label, value = '', type = 'text') => `<label>${e(label)}<input id="op-${key}" type="${type}" value="${e(value)}"></label>`;
  const textarea = (key, label, value = '') => `<label class="span-2">${e(label)}<textarea id="op-${key}" rows="4">${e(value)}</textarea></label>`;
  const select = (key, label, map, value) => `<label>${e(label)}<select id="op-${key}">${options(map, value)}</select></label>`;
  const value = key => document.getElementById(`op-${key}`)?.value || '';
  const checks = name => [...document.querySelectorAll(`input[name="op-${name}"]:checked`)].map(el => el.value);
  const companyOptions = () => Object.fromEntries(data.entities.map(row => [row.id, `${row.city || '地点待核实'} · ${row.name}`]));
  function flags(t) {
    const active = !['archived','not_applicable'].includes(t.status);
    return { late: active && t.status !== 'completed' && t.dueDate && t.dueDate < data.today,
      review: active && t.reviewDate && t.reviewDate <= data.today };
  }
  function repaint() { if (current === 'operations') render(); }
  async function load() {
    if (loading) return;
    const requestIdentity = token;
    loading = true; error = '';
    try { const result = await api('/api/operations'); if (requestIdentity === token) data = result; }
    catch (err) { if (requestIdentity === token) error = err.message; }
    finally { loading = false; repaint(); }
  }
  function view() {
    if (identity !== token) { identity = token; data = null; error = ''; company = ''; status = ''; search = ''; }
    if (!data) {
      if (!loading && !error) setTimeout(load, 0);
      return `<section class="op-card"><h2>运营事务台账</h2><p>${e(error || '正在加载公司档案与待办事项…')}</p>${error ? button('重试', 'Operations.refresh()') : ''}</section>`;
    }
    const tasks = data.tasks.filter(t => !company || t.entityId === company);
    const late = tasks.filter(t => flags(t).late).length, review = tasks.filter(t => flags(t).review).length;
    const open = tasks.filter(t => !['completed','not_applicable','archived'].includes(t.status)).length;
    const controls = `<div class="op-actions">${button('刷新', 'Operations.refresh()')}${data.canManage ? button('＋ 公司／地点档案', "Operations.edit('entities')") + button('＋ 联系人', "Operations.edit('contacts')") + button('＋ 事项', "Operations.edit('tasks')", true) : ''}</div>`;
    const toolbar = `<div class="op-filters"><label>公司／地点<select onchange="Operations.filter('company',this.value)"><option value="">全部公司／地点</option>${options(companyOptions(), company)}</select></label><label>搜索<input type="search" value="${e(search)}" placeholder="事项、公司、联系人、处理细节" onchange="Operations.filter('search',this.value)"></label><label>状态<select onchange="Operations.filter('status',this.value)"><option value="">全部状态</option>${options(statusNames,status)}</select></label><label class="op-check"><input type="checkbox" ${onlyMine ? 'checked' : ''} onchange="Operations.filter('mine',this.checked)">只看我负责</label><label class="op-check"><input type="checkbox" ${dueOnly ? 'checked' : ''} onchange="Operations.filter('due',this.checked)">仅逾期／待复查</label></div>`;
    let body;
    if (tab === 'tasks') body = taskTable(tasks);
    else if (tab === 'entities') body = entityCards();
    else body = contactCards();
    return `<div class="op-root"><div class="op-heading"><div><h2>运营事务台账</h2><p>按公司梳理要办的事，明确负责人，保留每次复查结果。</p></div>${controls}</div>
      <div class="op-stats"><div><strong>${open}</strong>未完成事项</div><div class="${late ? 'op-alert' : ''}"><strong>${late}</strong>办理已逾期</div><div class="${review ? 'op-alert' : ''}"><strong>${review}</strong>到期需复查</div><div><strong>${tasks.filter(t => !t.assignedUserIds.length && !['archived','not_applicable'].includes(t.status)).length}</strong>尚未分配负责人</div></div>
      <p class="op-hint">复查提醒在本台账显示；请定期登录查看。办理截止日与复查日期分别跟踪。未核实的要求不会自动标成“必须办理”。</p>
      <div class="op-actions">${[['tasks','事项总表'],['entities','公司／地点档案'],['contacts','联系人通讯录']].map(([key,label]) => button(label,`Operations.tab('${key}')`,tab === key)).join('')}</div>${toolbar}${error ? `<p role="alert">${e(error)}</p>` : ''}${body}</div>`;
  }
  function taskTable(tasks) {
    const rows = tasks.filter(t => {
      if (status ? t.status !== status : t.status === 'archived') return false;
      if (onlyMine && !t.assignedUserIds.includes(user.id)) return false;
      if (dueOnly && !flags(t).late && !flags(t).review) return false;
      const entity = byId('entities',t.entityId), contacts = t.contactIds.map(id => byId('contacts', id));
      return JSON.stringify([t,entity,contacts]).toLowerCase().includes(search.toLowerCase());
    }).sort((a,b) => Number(Boolean(flags(b).late || flags(b).review))-Number(Boolean(flags(a).late || flags(a).review)) || (a.reviewDate || '9999').localeCompare(b.reviewDate || '9999'));
    if (!rows.length) return `<div class="op-empty">${data.tasks.length ? '没有符合筛选条件的事项。' : '还没有运营事项。先新建公司／地点档案，再添加联系人和事项。公司法定名称暂不清楚时可以留空，并写明待核实。'}</div>`;
    return `<div class="op-table"><table><thead><tr>${['公司／地点','事项与要求','负责人','状态','办理截止','下次复查','联系人','操作'].map(s=>`<th>${s}</th>`).join('')}</tr></thead><tbody>${rows.map(t => {
      const entity = byId('entities',t.entityId), f = flags(t);
      return `<tr><td>${e(entity?.city || '地点待核实')}<small>${e(entity?.legalName || entity?.name || '公司待核实')}</small></td><td><strong>${e(t.title)}</strong><small>${e(t.category)} · ${e(applicabilityNames[t.applicability])}</small></td><td>${e(t.assignedUserIds.map(id => byId('staff',id)?.name || '员工已停用／已分配').join('、') || '未分配')}</td><td>${e(statusNames[t.status])}</td><td class="${f.late ? 'op-danger' : ''}">${e(t.dueDate || '未填写')}${f.late ? '<small>已逾期</small>' : ''}</td><td class="${f.review ? 'op-danger' : ''}">${e(t.reviewDate || '未设置')}${f.review ? '<small>需要复查</small>' : ''}</td><td>${e(t.contactIds.map(id => byId('contacts',id)?.name).filter(Boolean).join('、') || '未关联')}</td><td>${button('详情／复查',`Operations.detail('${t.id}')`)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function entityCards() {
    const rows = data.entities.filter(r => (!company || r.id === company) && JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
    return `<div class="op-grid">${rows.map(r => `<section class="op-card"><h3>${e(r.name)}</h3><p>${e(r.city)} · ${e(r.state)}</p><p>法定名称：${e(r.legalName || '待核实')}</p><p>当前情况：${e(r.status || '待核实')}</p><p class="op-pre">${e(r.details)}</p><p>未完成事项：${data.tasks.filter(t=>t.entityId === r.id && !['completed','not_applicable','archived'].includes(t.status)).length}</p>${data.canManage ? button('编辑档案',`Operations.edit('entities','${r.id}')`) + button('添加待核实检查清单',`Operations.starter('${r.id}')`) : ''}</section>`).join('') || '<div class="op-empty">暂无档案</div>'}</div>`;
  }
  function contactCard(r) { return `<section class="op-card"><h3>${e(r.name)} · ${e(r.role)}</h3><p>${e(r.organization)}</p><p>所属档案：${e(byId('entities',r.entityId)?.name)}</p><p>电话：${e(r.phone || '未填写')}</p><p>邮箱：${e(r.email || '未填写')}</p><p class="op-pre">${e(r.details)}</p>${data.canManage ? button('编辑联系人',`Operations.edit('contacts','${r.id}')`) : ''}</section>`; }
  function contactCards() { return `<div class="op-grid">${data.contacts.filter(r=>(!company || r.entityId === company) && JSON.stringify(r).toLowerCase().includes(search.toLowerCase())).map(contactCard).join('') || '<div class="op-empty">暂无联系人。可以记录会计、财务、保险经纪、物业、税务及其他服务联系人。</div>'}</div>`; }
  function edit(kind, id = '') {
    if (!data.canManage) return;
    if (kind !== 'entities' && !data.entities.length) return alert('请先新建公司／地点档案');
    const r = id ? byId(kind,id) : {};
    const entityId = r.entityId || company || data.entities[0]?.id;
    let fields;
    if (kind === 'entities') fields = input('name','档案名称（例如：拉斯维加斯公司）',r.name) + input('legalName','公司法定名称（不清楚可留空）',r.legalName) + input('city','城市',r.city) + input('state','州',r.state) + input('status','当前情况／待解决问题',r.status) + textarea('details','公司背景、当前问题和后续计划',r.details);
    else if (kind === 'contacts') fields = select('entityId','所属公司／档案',companyOptions(),entityId) + input('name','联系人姓名',r.name) + input('role','职责（会计／保险／物业等）',r.role) + input('organization','机构名称',r.organization) + input('phone','电话',r.phone,'tel') + input('email','邮箱',r.email,'email') + textarea('details','负责范围、联系偏好及服务细节',r.details);
    else fields = `<label>所属公司／档案<select id="op-entityId" onchange="Operations.contactChoices(this.value)">${options(companyOptions(),entityId)}</select></label>` + input('title','事项名称',r.title) + input('category','分类（税务／员工／保险／房产等）',r.category) + select('applicability','是否必须办理',applicabilityNames,r.applicability || 'unverified') + select('status','办理状态',statusNames,r.status || 'unverified') + input('dueDate','办理截止日期',r.dueDate,'date') + input('reviewDate','下次复查日期',r.reviewDate || data.today,'date') + select('reviewMonths','复查周期（月）',{'0':'一次性／不自动重复','1':'每月','3':'每季度','6':'每半年','12':'每年'},r.reviewMonths ?? 1) + `<fieldset class="span-2"><legend>勾选跟踪负责人（可多选）</legend>${data.staff.map(u=>`<label class="op-check"><input type="checkbox" name="op-staff" value="${e(u.id)}" ${(r.assignedUserIds || []).includes(u.id) ? 'checked' : ''}>${e(u.name)}</label>`).join('')}</fieldset><fieldset class="span-2"><legend>关联外部联系人</legend><div id="op-contactChoices">${contactChoiceHtml(entityId,r.contactIds || [])}</div></fieldset>` + textarea('details','需办理内容、适用条件、当前问题和下一步',r.details) + textarea('evidence','凭证／文件位置说明（请勿填写密码或访问密钥）',r.evidence);
    openModal(id ? '编辑运营记录' : '新建运营记录',`<div class="form-grid">${fields}</div>`,async () => {
      const keys = kind === 'entities' ? ['name','legalName','city','state','status','details'] : kind === 'contacts' ? ['entityId','name','role','organization','phone','email','details'] : ['entityId','title','category','applicability','status','dueDate','reviewDate','reviewMonths','details','evidence'];
      const body = Object.fromEntries(keys.map(key=>[key,value(key)]));
      if (kind === 'tasks') { body.assignedUserIds = checks('staff'); body.contactIds = checks('contacts'); }
      if (id) body.version = r.version;
      await api(`/api/operations/${kind}${id ? '/'+id : ''}`,{ method:id?'PUT':'POST',body:JSON.stringify(body) });
      closeModal(); await load();
    });
  }
  function contactChoiceHtml(entityId, selected) { return data.contacts.filter(c=>c.entityId === entityId).map(c=>`<label class="op-check"><input type="checkbox" name="op-contacts" value="${e(c.id)}" ${selected.includes(c.id)?'checked':''}>${e(c.name)} · ${e(c.role)}</label>`).join('') || '<p>该档案暂无联系人，请先在通讯录中添加。</p>'; }
  function detail(id) {
    const t = byId('tasks',id), entity = byId('entities',t.entityId);
    const html = `<div class="op-detail"><p>${e(entity?.city)} · ${e(entity?.legalName || entity?.name)} ｜ ${e(statusNames[t.status])}</p><p>${e(applicabilityNames[t.applicability])} · ${e(t.category)}</p><p>办理截止：${e(t.dueDate || '未填写')} ｜ 下次复查：${e(t.reviewDate || '未设置')} ｜ 周期：${t.reviewMonths ? t.reviewMonths+'个月' : '一次性'}</p><h4>需做的事情与当前问题</h4><p class="op-pre">${e(t.details || '未填写')}</p><h4>凭证／文件位置</h4><p class="op-pre">${e(t.evidence || '未填写')}</p><div class="op-actions">${data.canManage ? button('编辑事项',`Operations.edit('tasks','${id}')`) : ''}${t.status !== 'archived' ? button('记录本次复查',`Operations.review('${id}')`,true) : ''}</div><h4>关联联系人</h4>${t.contactIds.map(id=>byId('contacts',id)).filter(Boolean).map(contactCard).join('') || '<p>未关联联系人</p>'}<h4>复查历史</h4>${[...t.history].reverse().map(h=>`<section class="op-card"><strong>${e(h.at.slice(0,10))} · ${e(h.userName)}</strong><p>${e(statusNames[h.previousStatus])} → ${e(statusNames[h.status])}</p><p class="op-pre">${e(h.note)}</p><p class="op-pre">${e(h.evidence)}</p></section>`).join('') || '<p>还没有复查记录</p>'}</div>`;
    openModal(t.title,html,closeModal); document.getElementById('modalSave').textContent = '关闭';
  }
  function review(id) {
    const t = byId('tasks',id), allowed = {...statusNames}; delete allowed.archived;
    openModal(`复查：${t.title}`,`<div class="form-grid">${select('status','本次核实后的状态',allowed,t.status)}${textarea('note','本次复查结果（必填）')}${textarea('evidence','本次凭证／文件位置说明')}</div><p>保存后保留历史，并按当前周期安排下次复查。办理截止日期不变，需要调整时请由老板编辑。</p>`,async()=>{
      await api(`/api/operations/tasks/${id}/review`,{method:'POST',body:JSON.stringify({version:t.version,status:value('status'),note:value('note'),evidence:value('evidence')})});
      closeModal(); await load();
    });
  }
  window.Operations = { view, edit, detail, review, async starter(id){ try { const result=await api(`/api/operations/entities/${id}/starter`,{method:'POST',body:'{}'}); await load(); showActionFeedback(`已添加 ${result.added} 项待核实事项，请分配负责人并核对日期`); } catch(err){alert(err.message);} }, refresh:load, tab(key){tab=key;repaint();}, contactChoices(id){document.getElementById('op-contactChoices').innerHTML=contactChoiceHtml(id,[]);}, filter(key,v){if(key==='company')company=v;if(key==='status')status=v;if(key==='search')search=v;if(key==='mine')onlyMine=v;if(key==='due')dueOnly=v;repaint();} };
})();
