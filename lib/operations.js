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
  const publicTask = task => ({ ...task, attachments: (task.attachments || []).map(({ contentBase64, ...meta }) => meta), comments: task.comments || [], bills: task.bills || [] });
  const documentKinds = ['document', 'license', 'bill', 'receipt', 'insurance', 'photo', 'other'];
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  function documentInput(body) {
    const name = text(body.name, 180).replace(/[\\/\x00-\x1f\x7f]/g, '_');
    if (!name) throw new Error('请填写文件名称');
    const encoded = String(body.contentBase64 || '');
    if (!encoded || encoded.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('文件内容无效或超过8MB');
    const bytes = Buffer.from(encoded, 'base64');
    if (!bytes.length || bytes.length > MAX_FILE_BYTES || bytes.toString('base64') !== encoded) throw new Error('文件内容无效或超过8MB');
    const types = {
      'application/pdf': ['.pdf', bytes.subarray(0,5).toString() === '%PDF-'],
      'image/png': ['.png', bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))],
      'image/jpeg': ['.jpg', bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255],
      'image/webp': ['.webp', bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP']
    };
    const type = String(body.type || ''); const format = types[type];
    if (!format || !format[1] || !(type === 'image/jpeg' ? /\.jpe?g$/i.test(name) : name.toLowerCase().endsWith(format[0]))) throw new Error('仅支持内容与扩展名一致的PDF、JPG、PNG和WebP文件');
    if (!documentKinds.includes(body.kind)) throw new Error('文件分类无效');
    return { name, type, size:bytes.length, contentBase64:encoded, kind:body.kind, description:text(body.description,2000), documentDate:date(body.documentDate) };
  }
  function store(db) { return db.operations || { entities: [], contacts: [], tasks: [] }; }
  const visible = (t, u) => owner(u) || t.assignedUserIds.includes(u.id);
  function snapshot(db, user) {
    const s = store(db), tasks = s.tasks.filter(t => visible(t, user));
    const entityIds = new Set(tasks.map(t => t.entityId));
    const contactIds = new Set(tasks.flatMap(t => t.contactIds));
    return { today: today(), canManage: owner(user),
      entities: s.entities.filter(e => owner(user) || entityIds.has(e.id)),
      contacts: s.contacts.filter(c => owner(user) || contactIds.has(c.id)), tasks: tasks.map(publicTask),
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
      billDetails: text(body.billDetails ?? existing?.billDetails), evidence: text(body.evidence, 2000), history: existing?.history || [] };
  }
  function billInput(body, task) {
    const label=text(body.label,200); if(!label)throw new Error('请填写缴费项目');
    const amount=text(body.amount,30); if(amount && !/^\d{1,10}(?:\.\d{1,2})?$/.test(amount))throw new Error('金额格式无效，请填写非负金额，最多两位小数');
    const currency=text(body.currency || 'USD',3).toUpperCase(); if(!/^[A-Z]{3}$/.test(currency))throw new Error('请填写三位币种代码');
    if(!['unverified','unpaid','paid'].includes(body.status))throw new Error('付款状态无效');
    const paidBy=text(body.paidBy,160),paidDate=date(body.paidDate);
    if(body.status==='paid' && (!paidBy || !paidDate || !amount))throw new Error('已付款记录需填写金额、付款人和付款日期');
    const periodStart=date(body.periodStart),periodEnd=date(body.periodEnd);
    if(periodStart && periodEnd && periodStart>periodEnd)throw new Error('账期结束日期不能早于开始日期');
    const attachmentIds=[...new Set(Array.isArray(body.attachmentIds)?body.attachmentIds.map(String):[])];
    if(attachmentIds.some(id=>!(task.attachments || []).some(f=>f.id===id)))throw new Error('账单凭证必须来自本事项');
    return {label,provider:text(body.provider,200),amount,currency,status:body.status,paidBy,paidDate,
      periodStart,periodEnd,dueDate:date(body.dueDate),paidThroughDate:date(body.paidThroughDate),nextDueDate:date(body.nextDueDate),
      paymentMethod:text(body.paymentMethod,120),reference:text(body.reference,200),note:text(body.note),attachmentIds};
  }
  return async function handle(req, res, url, user) {
    if (url.pathname !== '/api/operations' && !url.pathname.startsWith('/api/operations/')) return false;
    try {
      if (req.method === 'GET' && url.pathname === '/api/operations') { send(res, 200, snapshot(readDb(), user)); return true; }
      const resource = url.pathname.match(/^\/api\/operations\/tasks\/([a-zA-Z0-9-]+)\/(attachments|comments|bills)(?:\/([a-zA-Z0-9-]+))?$/);
      if (resource) {
        const [, taskId, kind, resourceId] = resource;
        const download = req.method === 'GET' && kind === 'attachments' && resourceId;
        const billUpdate = kind === 'bills' && req.method === 'PUT' && resourceId;
        if (!download && !billUpdate && !(req.method === 'POST' && !resourceId)) { send(res,405,{error:'不支持此操作'}); return true; }
        // Authorize before accepting a potentially large upload, and re-check after the body read.
        let db = readDb(), task = store(db).tasks.find(t => t.id === taskId);
        if (!task || !visible(task,user)) { send(res,404,{error:'事项不存在或没有访问权限'}); return true; }
        if (download) {
          const file = (task.attachments || []).find(f => f.id === resourceId);
          if (!file) { send(res,404,{error:'文件不存在'}); return true; }
          const bytes = Buffer.from(file.contentBase64,'base64');
          res.writeHead(200, { 'Content-Type':file.type, 'Content-Length':bytes.length,
            'Content-Disposition':`attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g,'%27')}`,
            'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff' });
          res.end(bytes); return true;
        }
        const body = await readBody(req);
        db = readDb(); const s = structuredClone(store(db)); task = s.tasks.find(t => t.id === taskId);
        const actor = (db.users || []).find(u => u.id === user.id && u.active !== false);
        if (!task || !actor || !visible(task,actor)) { send(res,404,{error:'事项不存在或没有访问权限'}); return true; }
        const at = new Date().toISOString();
        const requestId = text(body.requestId,100);
        if (!requestId) throw new Error('缺少提交编号，请刷新后重试');
        const collection = task[kind] ||= [];
        const previous = collection.find(r => r.requestId === requestId && (r.requestUserId || r.userId) === actor.id);
        if (previous) { send(res,200,{item:publicTask(task)}); return true; }
        if (kind === 'attachments') {
          const file = documentInput(body);
          if (collection.length >= 40 || collection.reduce((n,f)=>n+f.size,0)+file.size > 64*1024*1024) throw new Error('该事项文件已达容量上限（40份／64MB）');
          const total = s.tasks.reduce((n,t)=>n+(t.attachments || []).reduce((m,f)=>m+f.size,0),0);
          if (total+file.size > 256*1024*1024) throw new Error('文件总容量已达256MB，请联系管理员扩容');
          collection.push({ ...file, id:randomUUID(), at, userId:actor.id, userName:actor.name || actor.email, requestId });
        } else if (kind === 'bills') {
          const previousBill = billUpdate ? collection.find(b=>b.id===resourceId) : null;
          if(billUpdate && !previousBill){send(res,404,{error:'缴费记录不存在'});return true;}
          if(previousBill && body.version!==previousBill.version){send(res,409,{error:'缴费记录已更新，请刷新后重试'});return true;}
          const fields=billInput(body,task);
          const before=previousBill ? {...previousBill} : null; if(before)delete before.history;
          const record={...fields,id:previousBill?.id || randomUUID(),at:previousBill?.at || at,
            userId:previousBill?.userId || actor.id,userName:previousBill?.userName || actor.name || actor.email,
            updatedAt:at,updatedBy:actor.name || actor.email,version:(previousBill?.version || 0)+1,requestId,requestUserId:actor.id,
            history:previousBill ? [...(previousBill.history || []),{at,userId:actor.id,userName:actor.name || actor.email,before}] : []};
          if(previousBill)collection[collection.findIndex(b=>b.id===resourceId)]=record;else collection.push(record);
        } else {
          const message = text(body.text); if (!message) throw new Error('请填写留言内容');
          collection.push({id:randomUUID(),at,userId:actor.id,userName:actor.name || actor.email,text:message,requestId});
        }
        task.version += 1; task.updatedAt = at; db.operations = s;
        audit(db,actor,`operations-add-${kind}`,{collection:'operations.tasks',recordId:task.id,recordLabel:task.title});
        writeDb(db); notifyDataChanged('operations-updated',task.id); send(res,billUpdate ? 200 : 201,{item:publicTask(task)}); return true;
      }
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
          ['internet','门店互联网／宽带缴费','网络','核实服务商、套餐、内部负责人及客服联系人；逐期记录账期、金额、实际付款人、凭证、已覆盖日期和下一缴费日。'],
          ['starlink','Starlink（星链）互联网缴费与续费','网络','核实Starlink服务及缴费情况，逐期记录付款信息、覆盖截止日、下次缴费完整日期及负责人和服务联系人。'],
          ['vehicle-registration','车辆上牌、注册及续牌','车辆','核实车辆所属主体、所在州、到期日、内部负责人及上牌代办联系人，保存注册文件与回执。'],
          ['vehicle-insurance','车辆保险及续保','车辆','核实保险用途、保障范围、续保日期、内部负责人及保险经纪，保存保单与付款记录。'],
          ['vehicle-inspection','车辆年检／排放检测适用性与办理','车辆','按车辆和注册地核实是否需要检测及办理日期，记录负责人、检测机构或代办联系人。'],
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
      send(res, existing ? 200 : 201, { item: kind === 'tasks' ? publicTask(record) : record }); return true;
    } catch (error) { send(res, 400, { error: error.message || '保存失败' }); return true; }
  };
};
module.exports.nextReview = nextReview;
module.exports.today = today;
