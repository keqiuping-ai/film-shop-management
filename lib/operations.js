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
function mergeInternetTasks(db) {
  if (!db.operations?.tasks) return false;
  const tasks=db.operations.tasks; let changed=false;
  for (const source of [...tasks].filter(t=>t.templateKey==='starlink')) {
    const target=tasks.find(t=>t.entityId===source.entityId && t.templateKey==='internet');
    if (!target) { source.templateKey='internet'; source.title='互联网／宽带缴费'; source.version+=1; changed=true; continue; }
    for (const key of ['attachments','comments','bills','history']) {
      const seen=new Set((target[key] || []).map(r=>r.id));
      target[key]=[...(target[key] || []),...(source[key] || []).filter(r=>!seen.has(r.id))];
    }
    for (const key of ['assignedUserIds','contactIds']) target[key]=[...new Set([...(target[key] || []),...(source[key] || [])])];
    for (const key of ['details','billDetails','evidence']) if(source[key] && source[key]!==target[key]) target[key]=[target[key],source[key]].filter(Boolean).join('\n\n');
    target.mergeHistory=[...(target.mergeHistory || []),{sourceId:source.id,title:source.title,status:source.status,dueDate:source.dueDate,reviewDate:source.reviewDate,reviewMonths:source.reviewMonths,at:new Date().toISOString()}];
    target.mergedFromTaskIds=[...(target.mergedFromTaskIds || []),source.id,...(source.mergedFromTaskIds || [])];
    if(target.status==='unverified' && source.status!=='unverified')target.status=source.status;
    for(const key of ['dueDate','reviewDate'])target[key]=[target[key],source[key]].filter(Boolean).sort()[0] || '';
    target.title='互联网／宽带缴费'; target.version+=1; target.updatedAt=new Date().toISOString();
    tasks.splice(tasks.indexOf(source),1);changed=true;
  }
  for(const t of tasks)if(t.templateKey==='internet' && t.title==='门店互联网／宽带缴费'){t.title='互联网／宽带缴费';t.version+=1;changed=true;}
  return changed;
}
module.exports = function operations({ readDb, writeDb, readBody, send, audit, notifyDataChanged }) {
  const owner = u => u?.role === 'owner';
  const canFinance=(task,user)=>owner(user) || (task.exhibition?.financeUserIds || []).includes(user?.id);
  const bankKeys=['beneficiaryName','bankName','payeeAccount','swiftRouting','payerContact','payeeContact'];
  const publicTask = (task,user) => ({ ...task,canFinance:canFinance(task,user), attachments: (task.attachments || []).map(({ contentBase64, ...meta }) => meta), comments: task.comments || [], bills: (task.bills || []).map(b=>{if(canFinance(task,user))return b;const safe={...b};for(const key of bankKeys)delete safe[key];safe.history=(b.history || []).map(h=>{const before={...h.before};for(const key of bankKeys)delete before[key];return {...h,before};});return safe;}) });
  const contactCategories=['courier','courier_company','mover','electrician','plumber','installer','truck','accounting','insurance','property','advertising','email_admin','other'];
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
    const staffIds = new Set(tasks.flatMap(t=>t.assignedUserIds || []));
    const entityIds = new Set(tasks.map(t => t.entityId));
    const contactIds = new Set(tasks.flatMap(t => t.contactIds));
    return { today: today(), canManage: owner(user),
      accountDirectory:s.tasks.filter(t=>t.recordType==='account' && t.account?.directoryVisible && t.status!=='archived').map(t=>({id:t.id,entityId:t.entityId,title:t.title,company:s.entities.find(e=>e.id===t.entityId)?.name || '',platform:t.account.platform,department:t.account.department,requestContact:t.account.requestContact,requestEmail:t.account.requestEmail,requestPhone:t.account.requestPhone,applicationNotes:t.account.applicationNotes})),
      formerStaff:owner(user)?(db.users || []).map(u=>({id:u.id,name:u.name || u.email,active:u.active!==false})):[],
      entities: s.entities.filter(e => owner(user) || entityIds.has(e.id)),
      contacts: s.contacts.filter(c => owner(user) || contactIds.has(c.id) || c.directoryVisible===true).map(c=>{
        const companyName=s.entities.find(e=>e.id===c.entityId)?.name || '';
        if(owner(user) || contactIds.has(c.id))return {...c,companyName};
        return {id:c.id,entityId:c.entityId,name:c.name,role:c.role,organization:c.organization,phone:c.phone,email:c.email,serviceCategory:c.serviceCategory || 'other',serviceArea:c.serviceArea || '',availability:c.availability || '',serviceNotes:c.serviceNotes || '',companyName,directoryVisible:true};
      }), tasks: tasks.map(t=>publicTask(t,user)),
      staff: (db.users || []).filter(u => u.active !== false && (owner(user) || u.id === user.id || staffIds.has(u.id))).map(u => ({ id: u.id, name: u.name || u.email })) };
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
      const serviceCategory=body.serviceCategory ?? existing?.serviceCategory ?? 'other';
      if(!contactCategories.includes(serviceCategory))throw new Error('服务联系人分类无效');
      return { serviceCategory,serviceArea:text(body.serviceArea ?? existing?.serviceArea,300),availability:text(body.availability ?? existing?.availability,500),serviceNotes:text(body.serviceNotes ?? existing?.serviceNotes),directoryVisible:(body.directoryVisible ?? existing?.directoryVisible)===true,entityId, name, role: text(body.role, 120), organization: text(body.organization, 200), phone: text(body.phone, 100), email: text(body.email, 200), details: text(body.details) };
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
    const recordType=body.recordType ?? existing?.recordType ?? 'general';
    if(!['general','account','handover','sales_handover','exhibition'].includes(recordType))throw new Error('档案类型无效');
    const accountSource=body.account ?? existing?.account ?? {},handoverSource=body.handover ?? existing?.handover ?? {};
    const account={};
    for(const key of ['platform','identifier','registeredEmail','department','requestContact','requestEmail','requestPhone'])account[key]=text(accountSource[key],300);
    account.applicationNotes=text(accountSource.applicationNotes);
    account.loginUrl=text(accountSource.loginUrl,2000);
    if(account.loginUrl){let url;try{url=new URL(account.loginUrl);}catch{throw new Error('登录入口网址无效');}if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash)throw new Error('登录入口请填写不含访问令牌的HTTPS主页地址');}
    account.directoryVisible=recordType==='account' && accountSource.directoryVisible===true;
    if(account.directoryVisible && (!account.requestContact || !(account.requestEmail || account.requestPhone)))throw new Error('公开申请入口需填写申请联系人和联系方式');
    const handover={};
    for(const key of ['department','outgoingName','receiverName'])handover[key]=text(handoverSource[key],200);
    handover.outgoingUserId=text(handoverSource.outgoingUserId,100);handover.receiverUserId=text(handoverSource.receiverUserId,100);
    if(handover.outgoingUserId && !db.users.some(u=>u.id===handover.outgoingUserId))throw new Error('原员工不存在');
    if(handover.receiverUserId && !db.users.some(u=>u.id===handover.receiverUserId && u.active!==false))throw new Error('接收员工不存在或已停用');
    handover.lastDay=date(handoverSource.lastDay);handover.scope=text(handoverSource.scope);
    handover.accountTaskIds=ids(handoverSource.accountTaskIds || [],id=>s.tasks.some(t=>t.id===id && t.entityId===entityId && t.recordType==='account'));
    if(['handover','sales_handover'].includes(recordType) && handover.receiverUserId && !assignedUserIds.includes(handover.receiverUserId))assignedUserIds.push(handover.receiverUserId);
    if(recordType==='exhibition' && body.status==='completed' && (existing?.expoItems || []).some(i=>!['accepted','not_applicable'].includes(i.status)))throw new Error('仍有未完成展会任务，不能标记整个展会已完成');
    const source=body.exhibition ?? existing?.exhibition ?? {},exhibition={};
    for(const key of ['edition','country','city','venue','booth','boothArea'])exhibition[key]=text(source[key],300);
    for(const key of ['startDate','endDate','moveInDate','moveOutDate'])exhibition[key]=date(source[key]);
    if(exhibition.startDate && exhibition.endDate && exhibition.startDate>exhibition.endDate)throw new Error('展会结束日期不能早于开始日期');
    exhibition.stage=source.stage || 'planning';if(exhibition.stage==='closed' && (existing?.expoItems || []).some(i=>!['accepted','not_applicable'].includes(i.status)))throw new Error('展会仍有未完成的检查项');if(!expoStages.includes(exhibition.stage))throw new Error('展会阶段无效');
    for(const key of ['nextAction','risks','sourceNotes'])exhibition[key]=text(source[key]);
    exhibition.financeUserIds=ids(source.financeUserIds || [],id=>db.users.some(u=>u.id===id && u.active!==false));
    for(const id of exhibition.financeUserIds)if(recordType==='exhibition' && !assignedUserIds.includes(id))assignedUserIds.push(id);
    return { recordType,account,handover,exhibition,entityId, title, category: text(body.category, 80), applicability: body.applicability, status: body.status,
      assignedUserIds, contactIds, dueDate: date(body.dueDate), reviewDate, reviewMonths, details: text(body.details),
      billDetails: text(body.billDetails ?? existing?.billDetails), evidence: text(body.evidence, 2000), history: existing?.history || [] };
  }
  function billInput(body, task, user, existing) {
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
    const bank={};
    if(bankKeys.some(key=>Object.prototype.hasOwnProperty.call(body,key)) && !canFinance(task,user))throw new Error('只有老板和指定展会财务人员能维护汇款账号');
    for(const key of bankKeys)bank[key]=text(body[key] ?? existing?.[key],500);
    return {...bank,label,provider:text(body.provider,200),amount,currency,status:body.status,paidBy,paidDate,
      periodStart,periodEnd,dueDate:date(body.dueDate),paidThroughDate:date(body.paidThroughDate),nextDueDate:date(body.nextDueDate),
      paymentMethod:text(body.paymentMethod,120),reference:text(body.reference,200),note:text(body.note),attachmentIds};
  }
  const expoStages=['planning','booked','design','production','shipping','building','exhibiting','dismantling','closed'];
  const expoGroups=['organizer','build','logistics','materials','advertising','travel','payment','closeout'];
  const expoRoles=['organizer','builder','forwarder','truck_driver','mover','payment_contact','advertising','installer','other'];
  const expoStatuses=['pending','in_progress','ready','shipped','arrived','accepted','blocked','not_applicable'];
  const expoTemplates=[
    ['booking','organizer','展位预订、合同及展览方联系人'],['plan','build','搭建方案、尺寸和设计图审批'],['height','build','搭建高度及悬挂审批'],
    ['power','build','电源、灯光、插头及排插'],['build','build','搭建商制作、进场及工时预约'],['freight','logistics','物料发运计划、货代及运输单号'],
    ['customs','logistics','跨境运输及报关适用性核实'],['truck','logistics','货车、司机及现场卸货预约'],['weighing','logistics','过磅、叉车及搬运工'],
    ['samples','materials','展会样品准备与到场清点'],['furniture','materials','桌椅、屏幕和自备搭建物料'],['ads','advertising','广告位预订、设计、投放验收'],
    ['shirts','advertising','宣传衬衫制作、发出、到场和派发'],['print','advertising','宣传册、礼品和其他宣传品'],['vehicle','logistics','展车租赁及车辆入场申请'],
    ['acceptance','build','现场搭建验收和照片记录'],['return','closeout','撤展、回运和仓储安排'],['settlement','payment','订金、尾款、汇款凭证与结算']
  ];
  function expoItem(body,task,s){
    const name=text(body.name,200);if(!name)throw new Error('请填写展会任务名称');
    if(!expoGroups.includes(body.group) || !expoStatuses.includes(body.status))throw new Error('展会环节或状态无效');
    const responsibleUserId=text(body.responsibleUserId,100);if(responsibleUserId && !task.assignedUserIds.includes(responsibleUserId))throw new Error('负责人需先加入本展会跟踪团队');
    const contactId=text(body.contactId,100);if(contactId && !(task.expoContacts || []).some(c=>c.id===contactId))throw new Error('请选择本展会联系人');
    const physicalDelivery=body.physicalDelivery===true || body.group==='materials';
    const quantity={};for(const key of ['quantityExpected','quantityShipped','quantityArrived']){quantity[key]=text(body[key],30);if(quantity[key] && !/^\d{1,7}(?:\.\d{1,3})?$/.test(quantity[key]))throw new Error('物料数量格式无效');}
    if(['shipped','arrived','accepted'].includes(body.status) && physicalDelivery && !date(body.shippedDate))throw new Error('物料已发出时需填写实际发运日期');
    if(['arrived','accepted'].includes(body.status) && physicalDelivery && (!date(body.arrivedDate) || !text(body.receivedBy,160)))throw new Error('物料到场需填写到场日期和收货人');
    if(body.status==='accepted' && (!text(body.acceptanceNote) || (physicalDelivery && quantity.quantityExpected && (!quantity.quantityArrived || Number(quantity.quantityArrived)<Number(quantity.quantityExpected)))))throw new Error('验收需填写验收说明，且物料到场数量不能少于计划数量');
    const attachmentIds=[...new Set(Array.isArray(body.attachmentIds)?body.attachmentIds.map(String):[])];if(attachmentIds.some(id=>!(task.attachments || []).some(f=>f.id===id)))throw new Error('请关联本展会已上传文件');
    return {...quantity,physicalDelivery,name,group:body.group,status:body.status,responsibleUserId,contactId,dueDate:date(body.dueDate),shippedDate:date(body.shippedDate),arrivedDate:date(body.arrivedDate),
      details:text(body.details),nextAction:text(body.nextAction),blocker:text(body.blocker),trackingNumber:text(body.trackingNumber,200),destination:text(body.destination,1000),receivedBy:text(body.receivedBy,160),acceptanceNote:text(body.acceptanceNote),attachmentIds};
  }
  return async function handle(req, res, url, user) {
    if (url.pathname !== '/api/operations' && !url.pathname.startsWith('/api/operations/')) return false;
    try {
      const currentDb=readDb();
      if(mergeInternetTasks(currentDb)){audit(currentDb,user,'operations-merge-internet',{collection:'operations.tasks',detail:'Consolidated Starlink into internet register; retained documents, bills, comments and assignees'});writeDb(currentDb);notifyDataChanged('operations-updated','internet');}
      if (req.method === 'GET' && url.pathname === '/api/operations') { send(res, 200, snapshot(readDb(), user)); return true; }
      const expoRoute=url.pathname.match(/^\/api\/operations\/tasks\/([a-zA-Z0-9-]+)\/(expo-items|expo-contacts|expo-starter|expo-progress)(?:\/([a-zA-Z0-9-]+))?$/);
      if(expoRoute){
        const [,taskId,action,itemId]=expoRoute;
        if(!(req.method==='POST' && !itemId) && !(req.method==='PUT' && itemId && ['expo-items','expo-contacts'].includes(action))){send(res,405,{error:'不支持此操作'});return true;}
        const body=await readBody(req),db=readDb(),s=structuredClone(store(db)),task=s.tasks.find(t=>t.id===taskId);
        if(!task || !visible(task,user)){send(res,404,{error:'展会不存在或没有权限'});return true;}if(task.recordType!=='exhibition')throw new Error('请先设置为展会档案');
        const at=new Date().toISOString();let added=0;
        if(action==='expo-starter'){
          if(!owner(user)){send(res,403,{error:'只有老板可添加展会检查清单'});return true;}
          for(const [templateKey,group,name] of expoTemplates){if((task.expoItems || []).some(i=>i.templateKey===templateKey))continue;(task.expoItems ||= []).push({id:randomUUID(),templateKey,group,name,physicalDelivery:['samples','furniture','shirts','print'].includes(templateKey),status:'pending',responsibleUserId:'',contactId:'',dueDate:'',details:'待核实适用性、负责人、截止日期及执行情况。',nextAction:'',attachmentIds:[],version:1,at,userId:user.id,history:[]});added++;}
        }else if(action==='expo-progress'){
          if(body.version!==task.version){send(res,409,{error:'展会已更新，请刷新后重试'});return true;}
          if(!expoStages.includes(body.stage))throw new Error('展会阶段无效');
          if(body.stage==='closed' && (task.expoItems || []).some(i=>!['accepted','not_applicable'].includes(i.status)))throw new Error('仍有未验收或未明确不适用的任务，暂不能结案');
          (task.expoProgressHistory ||= []).push({at,userId:user.id,userName:user.name || user.email,before:{...task.exhibition},stage:body.stage,nextAction:text(body.nextAction),risks:text(body.risks)});
          task.exhibition={...task.exhibition,stage:body.stage,nextAction:text(body.nextAction),risks:text(body.risks)};
        }else{
          const list=action==='expo-items'?(task.expoItems ||= []):(task.expoContacts ||= []),existing=itemId?list.find(i=>i.id===itemId):null;
          if(itemId && !existing){send(res,404,{error:'展会记录不存在'});return true;}
          const requestId=text(body.requestId,100);if(!requestId)throw new Error('缺少提交编号');
          if(existing?.requestId===requestId && existing.updatedById===user.id){send(res,200,{item:publicTask(task,user)});return true;}
          if(existing && body.version!==existing.version){send(res,409,{error:'展会记录已更新，请刷新后重试'});return true;}
          if(!existing && list.some(i=>i.requestId===requestId && i.updatedById===user.id)){send(res,200,{item:publicTask(task,user)});return true;}
          let fields;
          if(action==='expo-items')fields=expoItem({...body,physicalDelivery:body.physicalDelivery ?? existing?.physicalDelivery},task,s);
          else {if(!expoRoles.includes(body.role))throw new Error('展会联系人角色无效');const name=text(body.name,160);if(!name)throw new Error('请填写联系人');fields={role:body.role,name,organization:text(body.organization,300),phone:text(body.phone,100),email:text(body.email,200),responsibilities:text(body.responsibilities),details:text(body.details)};}
          const before=existing?{...existing}:null;if(before)delete before.history;
          const record={...existing,...fields,id:existing?.id || randomUUID(),version:(existing?.version || 0)+1,requestId,at:existing?.at || at,updatedAt:at,updatedById:user.id,updatedBy:user.name || user.email,
            history:existing?[...(existing.history || []),{at,userId:user.id,userName:user.name || user.email,before}]:[]};
          if(record.status==='accepted'){record.acceptedBy=user.id;record.acceptedAt=at;}else{record.acceptedBy='';record.acceptedAt='';}
          if(existing)list[list.findIndex(i=>i.id===itemId)]=record;else list.push(record);
        }
        task.version+=1;task.updatedAt=at;db.operations=s;audit(db,user,`operations-${action}`,{collection:'operations.tasks',recordId:task.id,recordLabel:task.title});writeDb(db);notifyDataChanged('operations-updated',task.id);send(res,200,{item:publicTask(task,user),added});return true;
      }
      const handoverRoute=url.pathname.match(/^\/api\/operations\/tasks\/([a-zA-Z0-9-]+)\/(handover-items|import-sales-customers)(?:\/([a-zA-Z0-9-]+))?$/);
      if(handoverRoute){
        const [,taskId,action,itemId]=handoverRoute;
        if(!(req.method==='POST' && !itemId) && !(action==='handover-items' && req.method==='PUT' && itemId)){send(res,405,{error:'不支持此操作'});return true;}
        const body=await readBody(req),db=readDb(),s=structuredClone(store(db)),task=s.tasks.find(t=>t.id===taskId);
        if(!task || !visible(task,user)){send(res,404,{error:'事项不存在或没有权限'});return true;}
        if(!['handover','sales_handover'].includes(task.recordType))throw new Error('请先将事项类型设为离职交接');
        const at=new Date().toISOString();let added=0;
        if(action==='import-sales-customers'){
          if(!owner(user)){send(res,403,{error:'只有老板可以导入原业务员的客户'});return true;}
          if(task.recordType!=='sales_handover' || !task.handover?.outgoingUserId)throw new Error('请先选择原业务员账号');
          for(const customer of (db.salesAccounts || []).filter(c=>c.assignedUserId===task.handover.outgoingUserId)){
            if((task.handoverItems || []).some(i=>i.sourceId===customer.id && i.sourceCollection==='salesAccounts'))continue;
            (task.handoverItems ||= []).push({id:randomUUID(),kind:'customer',name:text(customer.businessName,200),contact:text([customer.contactName,customer.phone,customer.email].filter(Boolean).join(' · '),1000),
              situation:text([customer.stage,customer.discussionSummary].filter(Boolean).join('\n')),nextAction:text(customer.nextAction),pending:'待核实：报价、订单、回款及售后未完成事项',
              sourceId:customer.id,sourceCollection:'salesAccounts',sourceCapturedAt:at,sourceOwnerUserId:customer.assignedUserId,
              status:'pending',version:1,at,userId:user.id,userName:user.name || user.email,history:[]});added++;
          }
        }else{
          const existing=itemId?(task.handoverItems || []).find(i=>i.id===itemId):null;
          if(itemId && !existing){send(res,404,{error:'交接项目不存在'});return true;}
          if(existing?.status==='received' && user.id!==task.handover?.receiverUserId)throw new Error('已确认项目仅可由指定接收员工更新');
          if(existing && existing.version!==body.version){send(res,409,{error:'交接项目已更新，请刷新后重试'});return true;}
          if(!['customer','account','document','equipment','access','other'].includes(body.kind))throw new Error('交接类别无效');
          if(!['pending','handed_over','received','not_applicable'].includes(body.status))throw new Error('交接状态无效');
          if(body.status==='received' && user.id!==task.handover?.receiverUserId)throw new Error('接收确认必须由指定接收员工本人提交');
          const name=text(body.name,200);if(!name)throw new Error('请填写交接项目名称');
          const requestId=text(body.requestId,100);if(!requestId)throw new Error('缺少提交编号');
          if(!existing && (task.handoverItems || []).some(i=>i.requestId===requestId && i.userId===user.id)){send(res,200,{item:publicTask(task,user)});return true;}
          const before=existing?{...existing}:null;if(before)delete before.history;
          const record={...existing,id:existing?.id || randomUUID(),kind:body.kind,name,contact:text(body.contact,1000),situation:text(body.situation),pending:text(body.pending),nextAction:text(body.nextAction),status:body.status,
            receiverName:task.handover?.receiverName || (db.users || []).find(u=>u.id===task.handover?.receiverUserId)?.name || '',
            version:(existing?.version || 0)+1,requestId,at:existing?.at || at,userId:existing?.userId || user.id,userName:existing?.userName || user.name || user.email,
            updatedAt:at,updatedBy:user.name || user.email,confirmedAt:body.status==='received'?at:'',confirmedBy:body.status==='received'?user.id:'',
            history:existing?[...(existing.history || []),{at,userId:user.id,userName:user.name || user.email,before}]:[]};
          if(existing)task.handoverItems[task.handoverItems.findIndex(i=>i.id===itemId)]=record;else(task.handoverItems ||= []).push(record);
        }
        task.version+=1;task.updatedAt=at;db.operations=s;
        audit(db,user,`operations-${action}`,{collection:'operations.tasks',recordId:task.id,recordLabel:task.title});writeDb(db);notifyDataChanged('operations-updated',task.id);
        send(res,200,{item:publicTask(task,user),added});return true;
      }
      const resource = url.pathname.match(/^\/api\/operations\/tasks\/([a-zA-Z0-9-]+)\/(attachments|comments|bills)(?:\/([a-zA-Z0-9-]+))?$/);
      if (resource) {
        const [, taskId, kind, resourceId] = resource;
        const download = req.method === 'GET' && kind === 'attachments' && resourceId;
        const billUpdate = kind === 'bills' && req.method === 'PUT' && resourceId;
        if (!download && !billUpdate && !(req.method === 'POST' && !resourceId)) { send(res,405,{error:'不支持此操作'}); return true; }
        // Authorize before accepting a potentially large upload, and re-check after the body read.
        let db = readDb(), task = store(db).tasks.find(t => t.id === taskId || (t.mergedFromTaskIds || []).includes(taskId));
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
        db = readDb(); const s = structuredClone(store(db)); task = s.tasks.find(t => t.id === taskId || (t.mergedFromTaskIds || []).includes(taskId));
        const actor = (db.users || []).find(u => u.id === user.id && u.active !== false);
        if (!task || !actor || !visible(task,actor)) { send(res,404,{error:'事项不存在或没有访问权限'}); return true; }
        const at = new Date().toISOString();
        const requestId = text(body.requestId,100);
        if (!requestId) throw new Error('缺少提交编号，请刷新后重试');
        const collection = task[kind] ||= [];
        const previous = collection.find(r => r.requestId === requestId && (r.requestUserId || r.userId) === actor.id);
        if (previous) { send(res,200,{item:publicTask(task,user)}); return true; }
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
          const fields=billInput(body,task,actor,previousBill);
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
        writeDb(db); notifyDataChanged('operations-updated',task.id); send(res,billUpdate ? 200 : 201,{item:publicTask(task,user)}); return true;
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
          ['internet','互联网／宽带缴费','网络','统一管理普通宽带、Starlink（星链）等互联网服务。核实服务商、套餐、负责人及联系人；逐期记录账期、金额、实际付款人、凭证、覆盖截止日期和下一缴费日。'],
          ['vehicle-registration','车辆上牌、注册及续牌','车辆','核实车辆所属主体、所在州、到期日、内部负责人及上牌代办联系人，保存注册文件与回执。'],
          ['vehicle-insurance','车辆保险及续保','车辆','核实保险用途、保障范围、续保日期、内部负责人及保险经纪，保存保单与付款记录。'],
          ['vehicle-inspection','车辆年检／排放检测适用性与办理','车辆','按车辆和注册地核实是否需要检测及办理日期，记录负责人、检测机构或代办联系人。'],
          ['ad-accounts','广告推广账号与推广联系人','账号','核实广告平台、账号标识、注册邮箱、负责人员和推广联系人；每个账号可单独建立账号档案并保存资料。'],
          ['company-email','公司邮箱管理与新员工邮箱申请','账号','记录邮箱服务商、管理人、注册邮箱和申请流程，可设置员工可查询的申请联系人。'],
          ['offboarding','员工离职交接与账号资料清点','交接','按员工新建交接档案，列明部门、交出人、接收人、资料和账号清点、设备及访问权限的处理情况。'],
          ['sales-offboarding','业务员离职与客户交接','交接','按业务员新建离职交接档案，逐客户记录资料、现状、未完成事项和后续动作，由接收人确认。'],
          ['contacts','会计、保险及物业联系人核实','联系人','补齐姓名、机构、联系方式和具体负责范围。']
        ];
        let added = 0; const at = new Date().toISOString();
        for (const [key,title,category,details] of templates) {
          if (s.tasks.some(t => t.entityId === starter[1] && t.templateKey === key)) continue;
          s.tasks.push({ id:randomUUID(), entityId:starter[1], title, category, details,
            recordType:({'ad-accounts':'account','company-email':'account','offboarding':'handover','sales-offboarding':'sales_handover'})[key] || 'general', applicability:'unverified', status:'unverified', assignedUserIds:[], contactIds:[], dueDate:'',
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
        if(existing.recordType==='exhibition' && body.status==='completed' && (existing.expoItems || []).some(i=>!['accepted','not_applicable'].includes(i.status)))throw new Error('仍有未完成展会任务，不能标记整个展会已完成');
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
      send(res, existing ? 200 : 201, { item: kind === 'tasks' ? publicTask(record,user) : record }); return true;
    } catch (error) { send(res, 400, { error: error.message || '保存失败' }); return true; }
  };
};
module.exports.nextReview = nextReview;
module.exports.today = today;

module.exports.mergeInternetTasks = mergeInternetTasks;
