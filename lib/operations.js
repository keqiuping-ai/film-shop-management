'use strict';
const { randomUUID } = require('crypto');
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const statuses = ['unverified', 'pending', 'in_progress', 'waiting', 'completed', 'not_applicable', 'archived'];
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function date(value) {
  if (!value) return '';
  const s = String(value);
  if (!DATE.test(s) || new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) !== s) throw new Error('日期无效');
  return s;
}
function nextReview(from, months, now = today()) {
  if (!months) return '';
  let result = date(from) || now;
  const day = Number(result.slice(8));
  while (result <= now) {
    const d = new Date(`${result}T12:00:00Z`);
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last)); result = d.toISOString().slice(0, 10);
  }
  return result;
}
module.exports = function operations({ readDb, writeDb, readBody, send, audit, notifyDataChanged }) {
  const owner = u => u?.role === 'owner';
  function store(db) { return db.operations || { entities: [], contacts: [], tasks: [] }; }
  const visible = (t, u) => owner(u) || t.assignedUserIds.includes(u.id);
  function snapshot(db, user) {
    const s = store(db), tasks = s.tasks.filter(t => visible(t, user));
    const entityIds = new Set(tasks.map(t => t.entityId));
    const contactIds = new Set(tasks.flatMap(t => t.contactIds));
    return { today: today(), canManage: owner(user),
      entities: s.entities.filter(e => owner(user) || entityIds.has(e.id)),
      contacts: s.contacts.filter(c => owner(user) || contactIds.has(c.id)), tasks,
      staff: (db.users || []).filter(u => u.active !== false && (owner(user) || u.id === user.id)).map(u => ({ id: u.id, name: u.name || u.email })) };
  }
  const text = (v, max = 6000) => String(v ?? '').trim().slice(0, max);
  function normalize(kind, body, s, db, existing) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('内容格式无效');
    if (kind === 'entities') {
      const name = text(body.name, 160); if (!name) throw new Error('请填写公司／档案名称');
      return { name, legalName: text(body.legalName, 200), city: text(body.city, 100), state: text(body.state, 40),
        status: text(body.status, 120), details: text(body.details) };
    }
    const entityId = text(body.entityId, 100);
    if (!s.entities.some(e => e.id === entityId)) throw new Error('请选择所属公司／档案');
    if (kind === 'contacts') {
      const name = text(body.name, 160); if (!name) throw new Error('请填写联系人姓名');
      if (existing && existing.entityId !== entityId && s.tasks.some(t => t.contactIds.includes(existing.id))) throw new Error('该联系人已关联事项，请先解除关联再更改所属档案');
      return { entityId, name, role: text(body.role, 120), organization: text(body.organization, 200), phone: text(body.phone, 100), email: text(body.email, 200), details: text(body.details) };
    }
    const title = text(body.title, 200); if (!title) throw new Error('请填写事项名称');
    if (!statuses.includes(body.status)) throw new Error('事项状态无效');
    if (!['unverified', 'required', 'conditional', 'recommended', 'not_applicable'].includes(body.applicability)) throw new Error('适用性无效');
    const ids = (value, valid) => { if (!Array.isArray(value)) throw new Error('人员／联系人格式无效'); const ids = [...new Set(value.map(String))]; if (ids.some(id => !valid(id))) throw new Error('负责人或联系人不存在／不属于该档案'); return ids; };
    const assignedUserIds = ids(body.assignedUserIds, id => db.users.some(u => u.id === id && u.active !== false));
    const contactIds = ids(body.contactIds, id => s.contacts.some(c => c.id === id && c.entityId === entityId));
    const reviewMonths = Number(body.reviewMonths);
    if (![0, 1, 3, 6, 12].includes(reviewMonths)) throw new Error('复查周期无效');
    const reviewDate = date(body.reviewDate);
    if (reviewMonths && !reviewDate) throw new Error('请填写首次／下次复查日期');
    return { entityId, title, category: text(body.category, 80), applicability: body.applicability, status: body.status,
      assignedUserIds, contactIds, dueDate: date(body.dueDate), reviewDate, reviewMonths, details: text(body.details),
      evidence: text(body.evidence, 2000), history: existing?.history || [] };
  }
  return async function handle(req, res, url, user) {
    if (url.pathname !== '/api/operations' && !url.pathname.startsWith('/api/operations/')) return false;
    try {
      if (req.method === 'GET' && url.pathname === '/api/operations') { send(res, 200, snapshot(readDb(), user)); return true; }
      const starter = url.pathname.match(/^\/api\/operations\/entities\/([a-zA-Z0-9-]+)\/starter$/);
      if (starter && req.method === 'POST') {
        if (!owner(user)) { send(res, 403, { error: '只有老板可以添加检查清单' }); return true; }
        await readBody(req);
        const db = readDb(), s = structuredClone(store(db));
        if (!s.entities.some(e => e.id === starter[1])) { send(res, 404, { error: '档案不存在' }); return true; }
        const templates = [
          ['company','公司法定名称、注册状态与营业执照','公司','核实法定名称、经营州、公司存续、年报及营业执照。'],
          ['tax','公司税务申报与缴纳','税务','请会计确认联邦、州及地方适用税种、申报周期和付款回执。'],
          ['payroll','员工工资税与社保','员工','核对员工身份、工资税代扣、雇主部分、存缴和申报回执。'],
          ['workers','工伤保险及销售人员保障','保险','请保险经纪按实际工作州、岗位和人员核实保单及续保日期。'],
          ['health','员工及老板医疗保险安排','保险','核实保障、公司福利安排和股东保费的税务处理。'],
          ['property-tax','房产税与补充税单','房产','核对地块、欠款、代缴账户及实际入账；租赁场所核查合同责任。'],
          ['property-insurance','房产及经营保险','保险','核对用途、被保险人、保障范围、客户车辆风险及续保日期。'],
          ['property-fees','物业费、HOA、CAM及NNN结算','房产','按产权文件和租约确认收费、特别摊派及年度补差。'],
          ['utilities','垃圾、污水和水电燃气费','费用','确认独立账单与税单、物业费内包含的项目，防止漏交或重复支付。'],
          ['lease','房贷、租金与合同续期','合同','核对支付状态、租金调整、续约及通知期限。'],
          ['contacts','会计、保险及物业联系人核实','联系人','补齐姓名、机构、联系方式和具体负责范围。']
        ];
        let added = 0; const at = new Date().toISOString();
        for (const [key,title,category,details] of templates) {
          if (s.tasks.some(t => t.entityId === starter[1] && t.templateKey === key)) continue;
          s.tasks.push({ id:randomUUID(), entityId:starter[1], title, category, details,
            applicability:'unverified', status:'unverified', assignedUserIds:[], contactIds:[], dueDate:'',
            reviewDate:today(), reviewMonths:1, evidence:'', history:[], templateKey:key, version:1, createdAt:at, updatedAt:at }); added++;
        }
        db.operations = s; audit(db,user,'operations-starter',{collection:'operations.tasks',recordId:starter[1],detail:`Added ${added} unverified checklist items`});
        writeDb(db); notifyDataChanged('operations-updated',starter[1]); send(res,200,{added}); return true;
      }
      const match = url.pathname.match(/^\/api\/operations\/(entities|contacts|tasks)(?:\/([a-zA-Z0-9-]+))?(\/review)?$/);
      if (!match) { send(res, 404, { error: '找不到运营事务接口' }); return true; }
      const [, kind, id, review] = match;
      if (!['POST', 'PUT'].includes(req.method) || (review && (kind !== 'tasks' || req.method !== 'POST')) || (!review && ((req.method === 'POST' && id) || (req.method === 'PUT' && !id)))) { send(res, 405, { error: '不支持此操作' }); return true; }
      // Read after the asynchronous body read so concurrent edits cannot overwrite a stale database snapshot.
      const body = await readBody(req);
      const db = readDb(), s = structuredClone(store(db));
      const existing = id ? s[kind].find(r => r.id === id) : null;
      if ((!review && !owner(user)) || (review && existing && !visible(existing, user))) { send(res, 403, { error: '只有老板可以维护档案；负责人只能复查自己的事项' }); return true; }
      if (id && !existing) { send(res, 404, { error: '记录不存在' }); return true; }
      if (existing && body.version !== existing.version) { send(res, 409, { error: '记录已被其他人更新，请刷新后重试' }); return true; }
      const now = new Date().toISOString();
      let record;
      if (review) {
        if (existing.status === 'archived') throw new Error('已归档事项不能复查');
        if (!statuses.includes(body.status) || body.status === 'archived') throw new Error('复查状态无效');
        const note = text(body.note); if (!note) throw new Error('请填写本次复查结果');
        const entry = { id: randomUUID(), at: now, userId: user.id, userName: user.name || user.email, note,
          evidence: text(body.evidence, 2000), previousStatus: existing.status, status: body.status, scheduledReviewDate: existing.reviewDate };
        record = { ...existing, status: body.status, evidence: entry.evidence || existing.evidence,
          lastReviewedAt: now, reviewDate: existing.reviewMonths ? nextReview(existing.reviewDate, existing.reviewMonths) : '',
          history: [...existing.history, entry] };
      } else record = { ...existing, ...normalize(kind, body, s, db, existing) };
      record.id = existing?.id || randomUUID(); record.createdAt = existing?.createdAt || now;
      record.updatedAt = now; record.version = (existing?.version || 0) + 1;
      if (existing) s[kind][s[kind].findIndex(r => r.id === id)] = record; else s[kind].push(record);
      db.operations = s;
      audit(db, user, review ? 'operations-review' : `operations-${existing ? 'update' : 'create'}`, { collection: `operations.${kind}`, recordId: record.id, recordLabel: record.title || record.name });
      writeDb(db); notifyDataChanged('operations-updated', record.id);
      send(res, existing ? 200 : 201, { item: record }); return true;
    } catch (error) { send(res, 400, { error: error.message || '保存失败' }); return true; }
  };
};
module.exports.nextReview = nextReview;
module.exports.today = today;
