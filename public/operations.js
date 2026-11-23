/* Operations records are fetched separately, scoped on the server to owners and assignees. */
(() => {
  'use strict';
  let data = null, identity = '', loading = false, error = '', tab = 'tasks';
  let company = '', status = '', search = '', onlyMine = false, dueOnly = false;
  const statusNames = { unverified:'待核实', pending:'待办理', in_progress:'办理中', waiting:'等待外部回复', completed:'已完成', not_applicable:'不适用', archived:'已归档' };
  const documentKinds = {document:'一般文件',license:'营业执照／证照',bill:'账单',receipt:'付款凭证',insurance:'保险文件',photo:'照片／扫描件',other:'其他'};
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
  function paymentDates(t) {
    const bills=t.bills || [];
    const next=bills.map(b=>b.nextDueDate).filter(Boolean).sort().at(-1) || '';
    const unpaid=bills.filter(b=>b.status!=='paid' && b.dueDate).map(b=>b.dueDate).sort()[0] || '';
    return {next,unpaid};
  }
  function flags(t) {
    const active = !['archived','not_applicable'].includes(t.status);
    const payment=paymentDates(t);
    return { late: active && Boolean((t.status !== 'completed' && t.dueDate && t.dueDate < data.today) || (payment.unpaid && payment.unpaid<data.today) || (payment.next && payment.next<data.today)),
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
      return `<tr><td>${e(entity?.city || '地点待核实')}<small>${e(entity?.legalName || entity?.name || '公司待核实')}</small></td><td><strong>${e(t.title)}</strong><small>${(t.attachments || []).length} 份文件 · ${(t.comments || []).length} 条留言 · ${(t.bills || []).length} 期缴费</small><small>${e(t.category)} · ${e(applicabilityNames[t.applicability])}</small></td><td>${e(t.assignedUserIds.map(id => byId('staff',id)?.name || '员工已停用／已分配').join('、') || '未分配')}</td><td>${e(statusNames[t.status])}</td><td class="${f.late ? 'op-danger' : ''}">${e(t.dueDate || '未填写')}${paymentDates(t).next ? `<small>下期缴费：${e(paymentDates(t).next)}</small>` : ''}${paymentDates(t).unpaid ? `<small>待付到期：${e(paymentDates(t).unpaid)}</small>` : ''}${f.late ? '<small>已逾期</small>' : ''}</td><td class="${f.review ? 'op-danger' : ''}">${e(t.reviewDate || '未设置')}${f.review ? '<small>需要复查</small>' : ''}</td><td>${e(t.contactIds.map(id => byId('contacts',id)?.name).filter(Boolean).join('、') || '未关联')}</td><td>${button('详情／复查',`Operations.detail('${t.id}')`)}</td></tr>`;
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
    else fields = `<label>所属公司／档案<select id="op-entityId" onchange="Operations.contactChoices(this.value)">${options(companyOptions(),entityId)}</select></label>` + input('title','事项名称',r.title) + input('category','分类（税务／员工／保险／房产等）',r.category) + select('applicability','是否必须办理',applicabilityNames,r.applicability || 'unverified') + select('status','办理状态',statusNames,r.status || 'unverified') + input('dueDate','办理截止日期',r.dueDate,'date') + input('reviewDate','下次复查日期',r.reviewDate || data.today,'date') + select('reviewMonths','复查周期（月）',{'0':'一次性／不自动重复','1':'每月','3':'每季度','6':'每半年','12':'每年'},r.reviewMonths ?? 1) + `<fieldset class="span-2"><legend>勾选跟踪负责人（可多选）</legend>${data.staff.map(u=>`<label class="op-check"><input type="checkbox" name="op-staff" value="${e(u.id)}" ${(r.assignedUserIds || []).includes(u.id) ? 'checked' : ''}>${e(u.name)}</label>`).join('')}</fieldset><fieldset class="span-2"><legend>关联外部联系人</legend><div id="op-contactChoices">${contactChoiceHtml(entityId,r.contactIds || [])}</div></fieldset>` + textarea('details','需办理内容、适用条件、当前问题和下一步',r.details) + textarea('billDetails','账单说明（账期、金额、到期日及缴费情况）',r.billDetails) + textarea('evidence','凭证／文件位置说明（请勿填写密码或访问密钥）',r.evidence);
    openModal(id ? '编辑运营记录' : '新建运营记录',`<div class="form-grid">${fields}</div>`,async () => {
      const keys = kind === 'entities' ? ['name','legalName','city','state','status','details'] : kind === 'contacts' ? ['entityId','name','role','organization','phone','email','details'] : ['entityId','title','category','applicability','status','dueDate','reviewDate','reviewMonths','details','billDetails','evidence'];
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
    const html = `<div class="op-detail"><p>${e(entity?.city)} · ${e(entity?.legalName || entity?.name)} ｜ ${e(statusNames[t.status])}</p><p>${e(applicabilityNames[t.applicability])} · ${e(t.category)}</p><p>办理截止：${e(t.dueDate || '未填写')} ｜ 下次复查：${e(t.reviewDate || '未设置')} ｜ 周期：${t.reviewMonths ? t.reviewMonths+'个月' : '一次性'}</p><h4>需做的事情与当前问题</h4><p class="op-pre">${e(t.details || '未填写')}</p><h4>账单说明</h4><p class="op-pre">${e(t.billDetails || '未填写')}</p><h4>凭证／文件位置</h4><p class="op-pre">${e(t.evidence || '未填写')}</p><div class="op-actions">${data.canManage ? button('编辑事项',`Operations.edit('tasks','${id}')`) : ''}${t.status !== 'archived' ? button('记录本次复查',`Operations.review('${id}')`,true) : ''}</div>${billsHtml(t)}${documentsHtml(t)}${commentsHtml(t)}<h4>关联联系人</h4>${t.contactIds.map(id=>byId('contacts',id)).filter(Boolean).map(contactCard).join('') || '<p>未关联联系人</p>'}<h4>复查历史</h4>${[...t.history].reverse().map(h=>`<section class="op-card"><strong>${e(h.at.slice(0,10))} · ${e(h.userName)}</strong><p>${e(statusNames[h.previousStatus])} → ${e(statusNames[h.status])}</p><p class="op-pre">${e(h.note)}</p><p class="op-pre">${e(h.evidence)}</p></section>`).join('') || '<p>还没有复查记录</p>'}</div>`;
    openModal(t.title,html,closeModal); document.getElementById('modalSave').textContent = '关闭';
  }
  const billStatuses={unverified:'待核实',unpaid:'未付款',paid:'已付款'};
  function billsHtml(t) {
    return `<h4>逐期账单与缴费（${(t.bills || []).length}期）</h4>${button('＋ 添加账单／缴费',`Operations.bill('${t.id}')`)}${[...(t.bills || [])].reverse().map(b=>`<section class="op-card"><strong>${e(b.label)} · ${e(billStatuses[b.status])}</strong><p>服务商：${e(b.provider || '待填写')} ｜ 金额：${e(b.amount || '待核实')} ${e(b.currency)}</p><p>账期：${e(b.periodStart || '未填写')} 至 ${e(b.periodEnd || '未填写')} ｜ 本期应付日期：${e(b.dueDate || '未填写')}</p><p>实际付款人：${e(b.paidBy || '未填写')} ｜ 付款日期：${e(b.paidDate || '未填写')}</p><p>付款方式：${e(b.paymentMethod || '未填写')} ｜ 交易参考号：${e(b.reference || '未填写')}</p><p><strong>已缴费覆盖至：${e(b.paidThroughDate || '待核实')} ｜ 下一期缴费日期：${e(b.nextDueDate || '待核实')}</strong></p><p class="op-pre">${e(b.note)}</p><p>关联凭证：${(b.attachmentIds || []).map(id=>(t.attachments || []).find(f=>f.id===id)).filter(Boolean).map(f=>button(f.name,`Operations.file('${t.id}','${f.id}',true)`)).join('') || '未关联'}</p><small>记录人：${e(b.userName)} · 更新：${e(b.updatedBy || b.userName)} · ${e((b.updatedAt || b.at).slice(0,10))}</small><div class="op-actions">${button('更新付款信息',`Operations.bill('${t.id}','${b.id}')`)}</div>${b.history?.length ? `<details><summary>修改历史（${b.history.length}次）</summary>${[...b.history].reverse().map(h=>`<p>${e(h.at.slice(0,10))} · ${e(h.userName)}：原状态 ${e(billStatuses[h.before.status])}，原金额 ${e(h.before.amount)} ${e(h.before.currency)}，原付款人 ${e(h.before.paidBy || '未填写')}，原下期日期 ${e(h.before.nextDueDate || '未填写')}</p>`).join('')}</details>` : ''}</section>`).join('') || '<p>按每一期分别保存，历史账单和付款记录会一直留在本事项。</p>'}`;
  }
  function bill(taskId,id='') {
    const t=byId('tasks',taskId),b=(t.bills || []).find(b=>b.id===id) || {},requestId=crypto.randomUUID();
    const fields=input('label','缴费项目（如：Starlink 2026年11月服务费）',b.label || t.title)+input('provider','服务商／收款机构',b.provider)+input('amount','金额',b.amount)+input('currency','币种',b.currency || 'USD')+select('billStatus','付款状态',billStatuses,b.status || 'unverified')+input('dueDate','本期应付款日期',b.dueDate,'date')+input('periodStart','账期开始',b.periodStart,'date')+input('periodEnd','账期结束',b.periodEnd,'date')+input('paidBy','实际付款人（与跟踪负责人分开）',b.paidBy)+input('paidDate','实际付款日期',b.paidDate,'date')+input('paymentMethod','付款方式（银行卡／支票等）',b.paymentMethod)+input('reference','交易参考号／支票号',b.reference)+input('paidThroughDate','已缴费覆盖至（含年份）',b.paidThroughDate,'date')+input('nextDueDate','下一期缴费日期（含年份）',b.nextDueDate,'date')+textarea('billNote','账单／付款说明',b.note)+`<fieldset class="span-2"><legend>关联本事项已上传的账单／付款凭证</legend>${(t.attachments || []).map(f=>`<label class="op-check"><input type="checkbox" name="op-billFiles" value="${e(f.id)}" ${(b.attachmentIds || []).includes(f.id)?'checked':''}>${e(f.name)}</label>`).join('') || '<p>可先上传文件，再关联到本期记录。</p>'}</fieldset>`;
    openModal(id?'更新缴费记录':'新增一期账单／缴费',`<div class="form-grid">${fields}</div>`,async()=>{
      const body=Object.fromEntries(['label','provider','amount','currency','dueDate','periodStart','periodEnd','paidBy','paidDate','paymentMethod','reference','paidThroughDate','nextDueDate'].map(k=>[k,value(k)]));
      Object.assign(body,{status:value('billStatus'),note:value('billNote'),attachmentIds:checks('billFiles'),requestId,version:b.version});
      await api(`/api/operations/tasks/${taskId}/bills${id?'/'+id:''}`,{method:id?'PUT':'POST',body:JSON.stringify(body)});
      await load();detail(taskId);
    });
  }
  function documentsHtml(t) {
    return `<h4>文件资料（${(t.attachments || []).length}份）</h4><p>支持PDF、JPG、PNG、WebP，单份不超过8MB。再次上传会保留旧文件。</p>${button('＋ 上传文件',`Operations.uploadDialog('${t.id}')`)}<div class="op-documents">${(t.attachments || []).map(f=>`<section class="op-card"><strong>${e(f.name)}</strong><p>${e(documentKinds[f.kind] || '文件')} · ${e(f.documentDate || '日期未填写')} · ${(f.size/1024).toFixed(0)} KB</p><p class="op-pre">${e(f.description)}</p><small>上传：${e(f.userName)} · ${e(f.at.slice(0,10))}</small><div class="op-actions">${button('预览',`Operations.file('${t.id}','${f.id}',true)`)}${button('下载',`Operations.file('${t.id}','${f.id}',false)`)}</div></section>`).join('') || '<p>还没有文件。可以上传营业执照、历史账单、保单和扫描件。</p>'}</div>`;
  }
  function commentsHtml(t) {
    return `<h4>留言（${(t.comments || []).length}条）</h4>${button('＋ 添加留言',`Operations.comment('${t.id}')`)}${[...(t.comments || [])].reverse().map(c=>`<section class="op-card"><strong>${e(c.userName)} · ${e(new Date(c.at).toLocaleString('zh-CN',{timeZone:'America/Los_Angeles'}))}（洛杉矶时间）</strong><p class="op-pre">${e(c.text)}</p></section>`).join('') || '<p>还没有留言。可记录沟通进展、问题及交接说明。</p>'}`;
  }
  function comment(id) {
    const requestId=crypto.randomUUID();
    openModal('添加事项留言',textarea('comment','留言内容'),async()=>{
      await api(`/api/operations/tasks/${id}/comments`,{method:'POST',body:JSON.stringify({text:value('comment'),requestId})});
      await load();detail(id);
    });
  }
  function uploadDialog(id) {
    const requestId=crypto.randomUUID();
    openModal('上传事项文件',`<div class="form-grid"><label class="span-2">选择文件<input id="op-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp"></label>${select('kind','文件分类',documentKinds,'document')}${input('documentDate','文件／账单日期','','date')}${textarea('fileDescription','文件说明（如：2026年11月账单、营业执照复印件）')}</div>`,async()=>{
      const file=document.getElementById('op-file').files[0];
      if(!file)throw new Error('请选择文件');
      if(file.size>8*1024*1024)throw new Error('单份文件不能超过8MB');
      const contentBase64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('文件读取失败'));reader.readAsDataURL(file);});
      const extension=file.name.split('.').pop().toLowerCase();
      const type=({pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'})[extension] || '';
      await api(`/api/operations/tasks/${id}/attachments`,{method:'POST',body:JSON.stringify({name:file.name,type,kind:value('kind'),documentDate:value('documentDate'),description:value('fileDescription'),contentBase64,requestId})});
      await load();detail(id);
    });
  }
  async function file(taskId,fileId,preview) {
    try {
      const meta=(byId('tasks',taskId).attachments || []).find(f=>f.id===fileId);
      const response=await fetch(`/api/operations/tasks/${taskId}/attachments/${fileId}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
      if(!response.ok)throw new Error((await response.json()).error || '读取文件失败');
      const url=URL.createObjectURL(await response.blob());
      if(preview){openModal(meta.name,meta.type==='application/pdf'?`<iframe class="op-file-preview" src="${e(url)}" title="${e(meta.name)}"></iframe>`:`<img class="op-image-preview" src="${e(url)}" alt="${e(meta.name)}">`,()=>detail(taskId));document.getElementById('modalSave').textContent='返回事项';}
      else {const a=document.createElement('a');a.href=url;a.download=meta.name;a.click();}
      setTimeout(()=>URL.revokeObjectURL(url),10*60*1000);
    }catch(err){alert(err.message);}
  }
  function review(id) {
    const t = byId('tasks',id), allowed = {...statusNames}; delete allowed.archived;
    openModal(`复查：${t.title}`,`<div class="form-grid">${select('status','本次核实后的状态',allowed,t.status)}${textarea('note','本次复查结果（必填）')}${textarea('evidence','本次凭证／文件位置说明')}</div><p>保存后保留历史，并按当前周期安排下次复查。办理截止日期不变，需要调整时请由老板编辑。</p>`,async()=>{
      await api(`/api/operations/tasks/${id}/review`,{method:'POST',body:JSON.stringify({version:t.version,status:value('status'),note:value('note'),evidence:value('evidence')})});
      closeModal(); await load();
    });
  }
  window.Operations = { view, edit, detail, review, bill, comment, uploadDialog, file, async starter(id){ try { const result=await api(`/api/operations/entities/${id}/starter`,{method:'POST',body:'{}'}); await load(); showActionFeedback(`已添加 ${result.added} 项待核实事项，请分配负责人并核对日期`); } catch(err){alert(err.message);} }, refresh:load, tab(key){tab=key;repaint();}, contactChoices(id){document.getElementById('op-contactChoices').innerHTML=contactChoiceHtml(id,[]);}, filter(key,v){if(key==='company')company=v;if(key==='status')status=v;if(key==='search')search=v;if(key==='mine')onlyMine=v;if(key==='due')dueOnly=v;repaint();} };
})();
