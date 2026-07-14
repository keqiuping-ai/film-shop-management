const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const APP_TIMEZONE = 'America/Los_Angeles';
const CUSTOM_PRINTED_FILM_SKU = 'CUSTOM-PRINTED-FILM';
const today = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const formatAppDateTime = value => {
  if (!value) return '';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T00:00:00` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = Object.fromEntries(new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
};
let token = localStorage.getItem('filmShopCloud.token') || '';
let state = null;
let user = null;
let current = 'modules';
let inventorySearch = '';
let jobSearch = '';
let jobDatePreset = 'month';
let jobStartDate = '';
let jobEndDate = '';
let jobSourceFilter = '';
let jobPersonFilter = '';
let scheduleMonth = today().slice(0, 7);
let jobMonth = today().slice(0, 7);
let auditDate = today();
let deferredInstall = null;
let lang = localStorage.getItem('filmShopCloud.lang') || 'zh';
let syncTimer = null;
let lastSyncAt = null;
let syncInFlight = false;
let eventSource = null;
let realtimeConnected = false;
let activeMessageUserId = '';
let activeProspectWorkspaceId = '';
let prospectWorkspaceSyncTimer = null;
let prospectPendingAttachment = null;
let replyTemplatePendingAttachment = null;
let replyTemplateLibraryType = 'text';
let replyTemplateCategoryFilter = 'all';
let preserveProspectWorkspaceRender = false;
let prospectReplyRevision = 0;
const prospectWorkspaceDrafts = new Map();
let messageRecorder = null;
let messageAudioChunks = [];
let knownUnreadMessageIds = null;
let messageAudioContext = null;
const AUTO_SYNC_MS = 5 * 60 * 1000;
const MAX_MESSAGE_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const replyTemplateCategories = [
  { id: 'uncategorized', zh: '未分类', en: 'Uncategorized' },
  { id: 'auto-window-film', zh: '汽车窗膜', en: 'Auto Window Tint' },
  { id: 'color-wrap', zh: '改色膜', en: 'Color Wrap' },
  { id: 'ppf', zh: 'PPF', en: 'PPF' },
  { id: 'architectural-film', zh: '建筑安全隔热膜', en: 'Architectural Film' },
  { id: 'shop-display', zh: '店面展示', en: 'Shop Display' },
  { id: 'brand-display', zh: '品牌展示', en: 'Brand Display' }
];
const vehicleClassOptions = () => [
  '小型轿车',
  '四门跑车',
  '中型SUV',
  '越野SUV',
  '皮卡',
  '超大型车'
];

const dict = {
  zh: {
    appTitle: '美国贴膜店管理系统',
    loginSub: '联网版 · 多电脑 · iPad · 实时共用',
    email: '邮箱',
    password: '密码',
    login: '登录',
    firstLoginNote: '首次登录后请到“设置”修改默认密码。',
    refreshSync: '刷新同步',
    autoSync: '自动同步',
    realtimeSync: '实时同步',
    lastSync: '上次同步',
    installDevice: '安装到桌面',
    addNew: '新增',
    modules: '功能模块',
    modulesSub: '每个业务模块独立入口，像桌面图标一样打开',
    dashboard: '仪表盘',
    dashboardSub: '收入、毛利、低库存和今日施工',
    jobs: '施工订单',
    jobsSub: '窗膜、TPU改色、PPF、建筑膜',
    installers: '师傅工费',
    installersSub: '不同师傅、不同项目的工费公式',
    pricing: '车型定价',
    pricingSub: '车型级别、套餐、材料成本和工时',
    inventory: '库存出入库',
    inventorySub: '卷料、零售品、批发库存和流水',
    workshopInventory: '贴膜间库存',
    workshopInventorySub: '从大仓领料到贴膜间，按米登记施工消耗',
    inventoryAlerts: '库存报警',
    inventoryAlertsSub: '低于最低数量的货物和补货建议',
    prospects: '高意向客户',
    prospectsSub: 'Mat、Yelp等平台邀约客户和预约到店时间',
    customerCenter: '客户交流中心',
    customerCenterSub: '集中查看所有客户聊天，达到到店意向后加入高意向客户',
    replyLibrary: '云端回复素材库',
    replyLibrarySub: '统一上传和维护客服常用文字、图片和短视频',
    leads: '客资提成',
    leadsSub: '互联网客资、到店率、成交率和客服提成',
    orders: '零售批发',
    ordersSub: '客户订单、出货、收款和物流',
    shipments: '在途货物',
    shipmentsSub: '中国海运、空运到拉斯维加斯的货物跟踪',
    schedules: '员工调休',
    schedulesSub: '周末补班、调休休息、月度出勤和邮件提醒',
    reports: '报表',
    reportsSub: '月度利润、工费、库存预警',
    audit: '操作记录',
    auditSub: '查询新增、修改、删除记录',
    expenses: '运营成本',
    expensesSub: '房租、水电、保险、广告、软件和其他费用',
    users: '账号权限',
    usersSub: '老板、店长、前台、销售、文员、仓库、师傅、财务',
    settings: '设置',
    settingsSub: '店名、密码、联网安装说明',
    tint: '窗膜',
    wrap: 'TPU改色',
    ppf: 'PPF',
    ceramic: '建筑膜',
    owner: '老板',
    manager: '店长',
    frontdesk: '前台',
    sales: '销售',
    clerk: '文员',
    warehouse: '仓库',
    installer: '师傅',
    finance: '财务',
    addFrontdesk: '新增前台账号',
    addClerk: '新增文员账号',
    jobRevenue: '施工收入',
    jobGross: '施工毛利',
    salesRevenue: '零售批发销售',
    totalRevenue: '总收入',
    lowStockSku: '低库存SKU',
    recentJobs: '今日和近期施工',
    viewAll: '查看全部',
    stockAlert: '库存预警',
    processInventory: '处理库存',
    searchInventory: '搜索库存',
    searchInventoryPlaceholder: '输入 SKU、名称、类别、规格、仓位...',
    searchJobs: '搜索施工单',
    searchJobsPlaceholder: '输入客户、电话、平台、车型、师傅、接待人、跟单员...',
    quickDate: '快捷时间',
    lastWeek: '本周',
    lastMonth: '本月',
    lastYear: '本年',
    customRange: '自定义',
    startDate: '开始日期',
    endDate: '结束日期',
    filterPlatform: '筛选平台',
    filterPerson: '筛选人员',
    allPlatforms: '全部平台',
    allPeople: '全部人员',
    clearSearch: '清空',
    date: '日期',
    scheduleDate: '施工日期',
    customer: '客户',
    salesRep: '跟单员/业务员',
    source: '来源平台',
    appointmentAt: '预约到店',
    appointmentDate: '预约日期',
    appointmentTime: '预约时间',
    intentLevel: '意向等级',
    prospectStatus: '跟进状态',
    vehicleNeed: '车型/需求',
    chatContext: '聊天上下文',
    contactOwner: '跟进人员',
    leadGroupRep: '客资组人员',
    receptionRep: '接待人员',
    leadType: '客资类型',
    customerType: '客户类型',
    saleType: '销售类型',
    commissionPlan: '提成方案',
    leadStatus: '客资状态',
    customerService: '客服',
    arrivalRate: '到店率',
    closeRate: '到店成交率',
    inviteCommission: '到店提成',
    closeCommission: '成交提成',
    totalCommission: '总提成',
    target: '目标',
    result: '结果',
    leadsCount: '客资数',
    arrivedCount: '到店数',
    closedCount: '成交数',
    soldAmount: '成交金额',
    commissionBase: '提成基数',
    vehicle: '车型',
    service: '项目',
    tech: '师傅',
    status: '状态',
    quote: '报价',
    labor: '工费',
    gross: '毛利',
    name: '姓名',
    city: '地区',
    skills: '技能',
    mode: '模式',
    basePay: '底薪',
    vehicleClass: '车型级别',
    package: '套餐',
    basePrice: '基础价',
    materialCost: '材料成本',
    hours: '预计工时',
    sku: 'SKU',
    productName: '名称',
    category: '类别',
    stock: '库存',
    minStock: '最低数量',
    reorderQty: '建议补货',
    location: '仓位',
    noStockAlerts: '目前没有低库存报警。',
    cost: '成本',
    retailPrice: '零售价',
    wholesalePrice: '批发价',
    minSalePrice: '最低售价',
    type: '类型',
    qty: '数量',
    qtyMeters: '数量（米）',
    meter: '米',
    relatedOrder: '关联订单',
    scheduleType: '排班类型',
    shift: '班次',
    workDays: '上班天数',
    makeupDays: '补班天数',
    adjustedRestDays: '调休天数',
    sendTomorrowReminder: '发送明天提醒',
    note: '备注',
    paid: '已收',
    paymentStatus: '付款情况',
    paymentMethod: '付款方式',
    balance: '欠款',
    item: '商品',
    shipping: '物流/自提',
    orderTrackingNo: '快递单号',
    orderSalesRep: '销售员',
    preparedBy: '制表人',
    formFilledBy: '填表人',
    shipmentMethod: '运输方式',
    importShipmentFile: '导入Excel/CSV',
    photoRecognize: '拍照识别',
    shipmentItems: '货物内容',
    supplier: '卖货方',
    trackingNo: '柜号/单号',
    shipFrom: '发出地点',
    departDate: '发出时间',
    etaPort: '预计到港/下船',
    etaLasVegas: '预计到拉斯维加斯',
    arrivedDate: '到货时间',
    role: '角色',
    active: '状态',
    enabled: '启用',
    disabled: '停用',
    edit: '编辑',
    delete: '删除',
    save: '保存',
    cancel: '取消',
    logout: '退出登录',
    shopName: '店名',
    taxRate: '销售税率 %',
    monthlyCost: '月固定成本 $',
    expenseCategory: '费用类别',
    adPlacement: '投放位置/平台',
    adStartDate: '广告开始日期',
    adEndDate: '广告结束日期',
    adPeriod: '广告时长',
    vendor: '供应商/收款方',
    amount: '金额',
    recurring: '每月固定',
    oldPassword: '旧密码',
    newPassword: '新密码',
    saveSettings: '保存设置',
    changePassword: '修改密码',
    showVersion: '查看系统版本',
    checkUpdate: '检查升级',
    unassigned: '未分配',
    percent: '百分比',
    fixed: '固定金额',
    basePlus: '底薪加超产',
    in: '入库',
    out: '出库',
    retail: '零售',
    wholesale: '批发',
    retailUs: '零售-美国',
    retailNonUs: '零售-非美国',
    wholesaleUs: '批发-美国',
    wholesaleNonUs: '批发-非美国',
    lowStock: '低库存',
    watch: '需关注',
    normal: '正常',
    currentStock: '当前库存',
    overStockOut: '出库数量不能超过当前库存',
    mainWarehouseStock: '大仓库存',
    workshopStock: '贴膜间库存',
    workshopLedger: '贴膜间流水',
    workshopTransfer: '领料到贴膜间',
    workshopConsume: '贴膜间消耗',
    workshopUsage: '施工车辆/用途',
    operator: '经手人',
    workshopCurrentStock: '贴膜间当前库存'
  },
  en: {
    appTitle: 'Film Shop Management System',
    loginSub: 'Cloud version · Mac · iPad · Shared data',
    email: 'Email',
    password: 'Password',
    login: 'Log In',
    firstLoginNote: 'After first login, change the default password in Settings.',
    refreshSync: 'Sync',
    autoSync: 'Auto Sync',
    realtimeSync: 'Realtime Sync',
    lastSync: 'Last Sync',
    installDevice: 'Install to Desktop',
    addNew: 'New',
    modules: 'Modules',
    modulesSub: 'Open each business area from a simple desktop-style grid',
    dashboard: 'Dashboard',
    dashboardSub: 'Revenue, gross profit, low stock, and today’s jobs',
    jobs: 'Job Orders',
    jobsSub: 'Window tint, TPU color change, PPF, and architectural film',
    installers: 'Installer Pay',
    installersSub: 'Different pay formulas by installer and service',
    pricing: 'Vehicle Pricing',
    pricingSub: 'Vehicle class, package, material cost, and labor hours',
    inventory: 'Inventory',
    inventorySub: 'Film rolls, retail items, wholesale stock, and movements',
    workshopInventory: 'Workshop Inventory',
    workshopInventorySub: 'Issue film from warehouse and track installer-room meter usage',
    inventoryAlerts: 'Stock Alerts',
    inventoryAlertsSub: 'Items below minimum stock and reorder suggestions',
    prospects: 'High-Intent Customers',
    prospectsSub: 'Mat, Yelp, and other appointment-ready customer leads',
    customerCenter: 'Customer Communication Center',
    customerCenterSub: 'Manage all customer conversations and promote qualified customers to high intent',
    replyLibrary: 'Cloud Reply Library',
    replyLibrarySub: 'Manage shared reply text, images, and short videos',
    leads: 'Lead Commissions',
    leadsSub: 'Internet leads, arrival rate, close rate, and staff commissions',
    orders: 'Retail / Wholesale',
    ordersSub: 'Customer orders, shipping, payment, and balance',
    shipments: 'Inbound Shipments',
    shipmentsSub: 'China ocean and air freight tracking to Las Vegas',
    schedules: 'Staff Schedule',
    schedulesSub: 'Weekend makeup shifts, adjusted rest, monthly attendance, and email reminders',
    reports: 'Reports',
    reportsSub: 'Monthly profit, installer pay, and stock alerts',
    audit: 'Activity Log',
    auditSub: 'Review create, edit, and delete history',
    expenses: 'Operating Costs',
    expensesSub: 'Rent, utilities, insurance, ads, software, and other expenses',
    users: 'Users & Roles',
    usersSub: 'Owner, manager, front desk, sales, clerk, warehouse, installer, finance',
    settings: 'Settings',
    settingsSub: 'Shop name, password, and installation notes',
    tint: 'Window Tint',
    wrap: 'TPU Color Change',
    ppf: 'PPF',
    ceramic: 'Architectural Film',
    owner: 'Owner',
    manager: 'Manager',
    frontdesk: 'Front Desk',
    sales: 'Sales',
    clerk: 'Clerk',
    warehouse: 'Warehouse',
    installer: 'Installer',
    finance: 'Finance',
    addFrontdesk: 'New Front Desk',
    addClerk: 'New Clerk',
    jobRevenue: 'Job Revenue',
    jobGross: 'Job Gross Profit',
    salesRevenue: 'Retail / Wholesale Sales',
    totalRevenue: 'Total Revenue',
    lowStockSku: 'Low Stock SKUs',
    recentJobs: 'Today & Recent Jobs',
    viewAll: 'View All',
    stockAlert: 'Stock Alerts',
    processInventory: 'Inventory',
    searchInventory: 'Search Inventory',
    searchInventoryPlaceholder: 'SKU, name, category, spec, location...',
    searchJobs: 'Search Jobs',
    searchJobsPlaceholder: 'Customer, phone, source, vehicle, installer, rep...',
    quickDate: 'Quick Date',
    lastWeek: 'This Week',
    lastMonth: 'This Month',
    lastYear: 'This Year',
    customRange: 'Custom',
    startDate: 'Start Date',
    endDate: 'End Date',
    filterPlatform: 'Platform',
    filterPerson: 'Person',
    allPlatforms: 'All Platforms',
    allPeople: 'All People',
    clearSearch: 'Clear',
    date: 'Date',
    scheduleDate: 'Install Date',
    customer: 'Customer',
    salesRep: 'Sales Rep',
    source: 'Source',
    appointmentAt: 'Appointment',
    appointmentDate: 'Appointment Date',
    appointmentTime: 'Appointment Time',
    intentLevel: 'Intent Level',
    prospectStatus: 'Follow-up Status',
    vehicleNeed: 'Vehicle / Need',
    chatContext: 'Chat Context',
    contactOwner: 'Owner',
    leadGroupRep: 'Lead Rep',
    receptionRep: 'Reception Rep',
    leadType: 'Lead Type',
    customerType: 'Customer Type',
    saleType: 'Sale Type',
    commissionPlan: 'Commission Plan',
    leadStatus: 'Lead Status',
    customerService: 'Rep',
    arrivalRate: 'Arrival Rate',
    closeRate: 'Close Rate',
    inviteCommission: 'Arrival Commission',
    closeCommission: 'Close Commission',
    totalCommission: 'Total Commission',
    target: 'Target',
    result: 'Result',
    leadsCount: 'Leads',
    arrivedCount: 'Arrived',
    closedCount: 'Closed',
    soldAmount: 'Sold Amount',
    commissionBase: 'Commission Base',
    vehicle: 'Vehicle',
    service: 'Service',
    tech: 'Installer',
    status: 'Status',
    quote: 'Quote',
    labor: 'Labor',
    gross: 'Gross',
    name: 'Name',
    city: 'Area',
    skills: 'Skills',
    mode: 'Mode',
    basePay: 'Base Pay',
    vehicleClass: 'Vehicle Class',
    package: 'Package',
    basePrice: 'Base Price',
    materialCost: 'Material Cost',
    hours: 'Hours',
    sku: 'SKU',
    productName: 'Name',
    category: 'Category',
    stock: 'Stock',
    minStock: 'Minimum',
    reorderQty: 'Reorder Qty',
    location: 'Location',
    noStockAlerts: 'No low stock alerts right now.',
    cost: 'Cost',
    retailPrice: 'Retail',
    wholesalePrice: 'Wholesale',
    minSalePrice: 'Minimum Sale Price',
    type: 'Type',
    qty: 'Qty',
    qtyMeters: 'Qty (m)',
    meter: 'm',
    relatedOrder: 'Related Order',
    scheduleType: 'Schedule Type',
    shift: 'Shift',
    workDays: 'Work Days',
    makeupDays: 'Makeup Days',
    adjustedRestDays: 'Adjusted Rest Days',
    sendTomorrowReminder: 'Send Tomorrow Reminder',
    note: 'Note',
    paid: 'Paid',
    paymentStatus: 'Payment',
    paymentMethod: 'Payment Method',
    balance: 'Balance',
    item: 'Item',
    shipping: 'Shipping / Pickup',
    orderTrackingNo: 'Tracking No.',
    orderSalesRep: 'Sales Rep',
    preparedBy: 'Prepared By',
    formFilledBy: 'Filled By',
    shipmentMethod: 'Shipping Method',
    importShipmentFile: 'Import Excel/CSV',
    photoRecognize: 'Photo OCR',
    shipmentItems: 'Items',
    supplier: 'Supplier',
    trackingNo: 'Container / Tracking No.',
    shipFrom: 'Ship From',
    departDate: 'Depart Date',
    etaPort: 'ETA Port / Arrival',
    etaLasVegas: 'ETA Las Vegas',
    arrivedDate: 'Arrived Date',
    role: 'Role',
    active: 'Status',
    enabled: 'Enabled',
    disabled: 'Disabled',
    edit: 'Edit',
    delete: 'Delete',
    save: 'Save',
    cancel: 'Cancel',
    logout: 'Log Out',
    shopName: 'Shop Name',
    taxRate: 'Sales Tax %',
    monthlyCost: 'Monthly Fixed Cost $',
    expenseCategory: 'Category',
    adPlacement: 'Ad Placement / Platform',
    adStartDate: 'Ad Start Date',
    adEndDate: 'Ad End Date',
    adPeriod: 'Ad Period',
    vendor: 'Vendor / Payee',
    amount: 'Amount',
    recurring: 'Monthly Recurring',
    oldPassword: 'Old Password',
    newPassword: 'New Password',
    saveSettings: 'Save Settings',
    changePassword: 'Change Password',
    showVersion: 'System Version',
    checkUpdate: 'Check Update',
    unassigned: 'Unassigned',
    percent: 'Percentage',
    fixed: 'Fixed Amount',
    basePlus: 'Base + Bonus',
    in: 'Stock In',
    out: 'Stock Out',
    retail: 'Retail',
    wholesale: 'Wholesale',
    retailUs: 'Retail - US',
    retailNonUs: 'Retail - Non-US',
    wholesaleUs: 'Wholesale - US',
    wholesaleNonUs: 'Wholesale - Non-US',
    lowStock: 'Low',
    watch: 'Watch',
    normal: 'Normal',
    currentStock: 'Current Stock',
    overStockOut: 'Stock out quantity cannot exceed current stock',
    mainWarehouseStock: 'Main Warehouse Stock',
    workshopStock: 'Workshop Stock',
    workshopLedger: 'Workshop Ledger',
    workshopTransfer: 'Issue to Workshop',
    workshopConsume: 'Workshop Usage',
    workshopUsage: 'Job / Usage',
    operator: 'Handled By',
    workshopCurrentStock: 'Workshop Current Stock'
  }
};

const t = key => dict[lang]?.[key] || dict.zh[key] || key;
const serviceNames = new Proxy({}, { get: (_, key) => t(key) });
const roleNames = new Proxy({}, { get: (_, key) => t(key) });
const pages = [
  ['dashboard', 'dashboard', 'dashboardSub'],
  ['jobs', 'jobs', 'jobsSub'],
  ['installers', 'installers', 'installersSub'],
  ['pricing', 'pricing', 'pricingSub'],
  ['inventory', 'inventory', 'inventorySub'],
  ['workshopInventory', 'workshopInventory', 'workshopInventorySub'],
  ['inventoryAlerts', 'inventoryAlerts', 'inventoryAlertsSub'],
  ['customerCenter', 'customerCenter', 'customerCenterSub'],
  ['replyLibrary', 'replyLibrary', 'replyLibrarySub'],
  ['prospects', 'prospects', 'prospectsSub'],
  ['leads', 'leads', 'leadsSub'],
  ['orders', 'orders', 'ordersSub'],
  ['shipments', 'shipments', 'shipmentsSub'],
  ['schedules', 'schedules', 'schedulesSub'],
  ['expenses', 'expenses', 'expensesSub'],
  ['reports', 'reports', 'reportsSub'],
  ['audit', 'audit', 'auditSub'],
  ['users', 'users', 'usersSub'],
  ['settings', 'settings', 'settingsSub']
];

const pagePermissions = {
  dashboard: 'jobsView',
  jobs: ['jobsView', 'jobsCreate', 'jobsEdit', 'jobsDelete'],
  installers: 'installerView',
  pricing: 'pricingView',
  inventory: 'inventoryView',
  workshopInventory: 'inventoryView',
  inventoryAlerts: 'inventoryView',
  customerCenter: 'prospectsView',
  replyLibrary: 'prospectsView',
  prospects: 'prospectsView',
  leads: 'leadsView',
  orders: 'ordersView',
  shipments: 'shipmentsView',
  schedules: 'schedulesView',
  expenses: 'expensesView',
  reports: 'reportsView',
  audit: ['reportsView', 'usersManage'],
  users: 'usersManage',
  settings: null
};

const writePermissions = {
  dashboard: 'jobsCreate',
  jobs: 'jobsCreate',
  installers: 'installerEdit',
  pricing: 'pricingEdit',
  inventory: 'inventoryEdit',
  workshopInventory: 'inventoryEdit',
  customerCenter: 'prospectsEdit',
  replyLibrary: 'prospectsEdit',
  prospects: 'prospectsEdit',
  leads: 'leadsEdit',
  orders: 'ordersEdit',
  shipments: 'shipmentsEdit',
  schedules: 'schedulesEdit',
  expenses: 'expensesEdit',
  users: 'usersManage'
};

const permissionLabels = [
  ['jobsView', '浏览施工订单', 'Browse job orders'],
  ['jobsCreate', '新增施工订单', 'Create job orders'],
  ['jobsEdit', '修改施工订单', 'Edit job orders'],
  ['jobsDelete', '删除施工订单', 'Delete job orders'],
  ['pricingView', '查看车型定价', 'View vehicle pricing'],
  ['pricingEdit', '编辑车型定价', 'Edit vehicle pricing'],
  ['installerView', '查看师傅资料', 'View installers'],
  ['installerPayView', '查看施工工费', 'View installer labor pay'],
  ['installerEdit', '编辑师傅和工费', 'Edit installers and pay rules'],
  ['inventoryView', '查看库存', 'View inventory'],
  ['inventoryEdit', '编辑库存/出入库', 'Edit inventory / movements'],
  ['ordersView', '查看零售批发订单', 'View retail / wholesale orders'],
  ['ordersEdit', '编辑零售批发订单', 'Edit retail / wholesale orders'],
  ['shipmentsView', '查看在途货物', 'View inbound shipments'],
  ['shipmentsEdit', '录入/编辑在途货物', 'Create / edit inbound shipments'],
  ['schedulesView', '查看员工调休表', 'View staff schedule'],
  ['schedulesEdit', '录入/编辑员工调休表/发送提醒', 'Create / edit staff schedule / send reminders'],
  ['prospectsView', '查看高意向客户', 'View high-intent customers'],
  ['prospectsEdit', '录入/编辑高意向客户', 'Create / edit high-intent customers'],
  ['leadsView', '查看客资', 'View leads'],
  ['leadsEdit', '录入/编辑客资', 'Create / edit leads'],
  ['commissionView', '查看客服提成', 'View customer service commissions'],
  ['commissionEdit', '编辑客服提成规则', 'Edit customer service commission rules'],
  ['expensesView', '查看运营成本', 'View operating costs'],
  ['expensesEdit', '编辑运营成本', 'Edit operating costs'],
  ['reportsView', '查看报表', 'View reports'],
  ['fullFinanceView', '查看完整财报/成本/利润', 'View full financials / costs / profit'],
  ['usersManage', '管理员工账号和权限', 'Manage users and permissions'],
  ['settingsEdit', '修改系统设置/检查升级', 'Edit settings / check updates']
];

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstall = event;
});

function setLanguage(nextLang) {
  lang = nextLang;
  localStorage.setItem('filmShopCloud.lang', lang);
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  applyStaticTranslations();
  render();
}

function toggleLanguage() {
  setLanguage(lang === 'zh' ? 'en' : 'zh');
}

function applyStaticTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  const langToggle = document.getElementById('langToggle');
  if (langToggle) langToggle.textContent = lang === 'zh' ? 'English' : '中文';
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
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
    if (res.status === 401) {
      token = '';
      localStorage.removeItem('filmShopCloud.token');
      stopAutoSync();
      stopRealtimeSync();
      state = null;
      user = null;
      renderAuth();
    }
    throw new Error(body.error || '请求失败');
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
    localStorage.setItem('filmShopCloud.lastEmail', body.user.email || document.getElementById('email').value.trim());
    await sync();
  } catch (err) {
    alert(err.message);
  }
}

async function logout() {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  token = '';
  localStorage.removeItem('filmShopCloud.token');
  state = null;
  user = null;
  stopAutoSync();
  stopRealtimeSync();
  renderAuth();
}

async function sync(options = {}) {
  if (syncInFlight) return;
  const replyInput = document.getElementById('prospectReplyInput');
  const replyDraft = replyInput?.value || '';
  const replyHadFocus = document.activeElement === replyInput;
  const replyRevisionBefore = prospectReplyRevision;
  const sidebarWasActive = Boolean(document.activeElement?.closest?.('.prospect-workspace-sidebar'));
  captureProspectWorkspaceDraft();
  const workspaceBefore = activeProspectWorkspaceId ? JSON.stringify(activeCustomerWorkspaceItem().item || {}) : '';
  try {
    syncInFlight = true;
    updateSyncStatus(lang === 'zh' ? '同步中...' : 'Syncing...');
    const body = await api('/api/bootstrap');
    const previousUnreadIds = knownUnreadMessageIds;
    user = body.user;
    state = body.data;
    const workspaceAfter = activeProspectWorkspaceId ? JSON.stringify(activeCustomerWorkspaceItem().item || {}) : '';
    preserveProspectWorkspaceRender = Boolean(activeProspectWorkspaceId && (workspaceBefore === workspaceAfter || sidebarWasActive));
    notifyNewUnreadMessages(previousUnreadIds);
    localStorage.setItem('filmShopCloud.lastEmail', user.email || '');
    lastSyncAt = new Date();
    renderAuth();
    render();
    const refreshedReplyInput = document.getElementById('prospectReplyInput');
    if (refreshedReplyInput && replyDraft && replyRevisionBefore === prospectReplyRevision) refreshedReplyInput.value = replyDraft;
    if (refreshedReplyInput && replyHadFocus && replyRevisionBefore === prospectReplyRevision) refreshedReplyInput.focus();
    startAutoSync();
    startRealtimeSync();
    updateSyncStatus();
  } catch (err) {
    if (options.silent) {
      updateSyncStatus(lang === 'zh' ? '同步失败' : 'Sync failed');
      return;
    }
    token = '';
    localStorage.removeItem('filmShopCloud.token');
    stopAutoSync();
    stopRealtimeSync();
    renderAuth();
  } finally {
    syncInFlight = false;
  }
}

function renderAuth() {
  const loggedIn = Boolean(state && user);
  document.getElementById('login').classList.toggle('hidden', loggedIn);
  document.getElementById('app').classList.toggle('hidden', !loggedIn);
  applyStaticTranslations();
  if (loggedIn) document.getElementById('userLine').textContent = `${user.name} · ${roleNames[user.role] || user.role}`;
}

function startAutoSync() {
  if (syncTimer || !token) return;
  syncTimer = setInterval(() => sync({ silent: true }), AUTO_SYNC_MS);
}

function stopAutoSync() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = null;
}

function startRealtimeSync() {
  if (eventSource || !token || !window.EventSource) return;
  eventSource = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
  eventSource.addEventListener('ready', () => {
    realtimeConnected = true;
    updateSyncStatus();
  });
  eventSource.addEventListener('data-changed', event => {
    try {
      const payload = JSON.parse(event.data || '{}');
      if (payload.action === 'import-prospects' && Number(payload.detail?.imported || 0) > 0 && current !== 'prospects') {
        playMessageSound();
      }
    } catch {}
    sync({ silent: true });
  });
  eventSource.onerror = () => {
    realtimeConnected = false;
    updateSyncStatus();
  };
}

function stopRealtimeSync() {
  realtimeConnected = false;
  if (eventSource) eventSource.close();
  eventSource = null;
}

function updateSyncStatus(message) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  if (message) {
    el.textContent = message;
    return;
  }
  if (!lastSyncAt) {
    el.textContent = realtimeConnected ? t('realtimeSync') : `${t('autoSync')}: 5 min`;
    return;
  }
  el.textContent = `${realtimeConnected ? t('realtimeSync') : t('lastSync')}: ${lastSyncAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function broadcastDataChange() {
  localStorage.setItem('filmShopCloud.dataChangedAt', String(Date.now()));
}

window.addEventListener('storage', event => {
  if (event.key === 'filmShopCloud.dataChangedAt' && token) sync({ silent: true });
});

['pointerdown', 'keydown'].forEach(eventName => {
  window.addEventListener(eventName, () => getMessageAudioContext(), { once: true });
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && token) sync({ silent: true });
});

function setPage(page) {
  current = page;
  render();
}

function setInventorySearch(value) {
  inventorySearch = value || '';
  const input = document.getElementById('inventorySearchInput');
  if (input && input.value !== inventorySearch) input.value = inventorySearch;
  const results = document.getElementById('inventorySearchResults');
  const count = document.getElementById('inventorySearchCount');
  if (results && current === 'inventory') {
    results.innerHTML = productTable(searchedProducts(), true);
    if (count) count.textContent = inventorySearchCountText(state.products);
    return;
  }
  if (results && current === 'inventoryAlerts') {
    const alertRows = stockAlertProducts();
    results.innerHTML = inventoryAlertTable(true, null, true);
    if (count) count.textContent = inventorySearchCountText(alertRows);
    return;
  }
  render();
}

function setJobSearch(value) {
  jobSearch = value || '';
  const input = document.getElementById('jobSearchInput');
  if (input && input.value !== jobSearch) input.value = jobSearch;
  refreshJobPreview();
}

function setJobDatePreset(value) {
  jobDatePreset = value || 'month';
  if (jobDatePreset !== 'custom') {
    const range = jobPresetRange(jobDatePreset);
    jobStartDate = range.start;
    jobEndDate = range.end;
  }
  render();
}

function setJobDateRange(field, value) {
  jobDatePreset = 'custom';
  if (field === 'start') jobStartDate = value || '';
  if (field === 'end') jobEndDate = value || '';
  render();
}

function setJobSourceFilter(value) {
  jobSourceFilter = value || '';
  refreshJobPreview();
}

function setJobPersonFilter(value) {
  jobPersonFilter = value || '';
  refreshJobPreview();
}

function clearJobFilters() {
  jobSearch = '';
  jobDatePreset = 'month';
  jobSourceFilter = '';
  jobPersonFilter = '';
  const range = jobPresetRange(jobDatePreset);
  jobStartDate = range.start;
  jobEndDate = range.end;
  render();
}

function refreshJobPreview() {
  const results = document.getElementById('jobSearchResults');
  const count = document.getElementById('jobSearchCount');
  const stats = document.getElementById('jobSourceStats');
  if (results && current === 'jobs') {
    const baseJobs = filteredJobs(false);
    const visibleJobs = filteredJobs(true);
    results.innerHTML = jobTable(visibleJobs, true);
    if (stats) stats.innerHTML = sourceStatsTable(baseJobs, jobFilterDateLabel());
    if (count) count.textContent = jobSearchCountText(baseJobs);
    return;
  }
  render();
}

function normalizeSearchText(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, '');
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthKeyFromDate(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}/.test(text) ? text.slice(0, 7) : '';
}

function calendarMonthsInRange(range, fallbackJobs = []) {
  const months = new Set();
  const startMonth = monthKeyFromDate(range?.start);
  const endMonth = monthKeyFromDate(range?.end);
  if (startMonth && endMonth) {
    const cursor = new Date(`${startMonth}-01T00:00:00`);
    let guard = 0;
    while (localDateString(cursor).slice(0, 7) <= endMonth && guard < 240) {
      months.add(localDateString(cursor).slice(0, 7));
      cursor.setMonth(cursor.getMonth() + 1);
      guard += 1;
    }
  } else {
    if (startMonth) months.add(startMonth);
    if (endMonth) months.add(endMonth);
  }
  if (!months.size) fallbackJobs.forEach(job => {
    const month = monthKeyFromDate(job.date) || currentMonth();
    months.add(month);
  });
  return [...months];
}

function dateOffset(days) {
  const date = new Date(`${today()}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

function weekRange() {
  const date = new Date(`${today()}T00:00:00`);
  const startDate = new Date(date);
  startDate.setDate(date.getDate() - date.getDay());
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  return { start: localDateString(startDate), end: localDateString(endDate) };
}

function yearRange() {
  const year = today().slice(0, 4);
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function jobPresetRange(preset = jobDatePreset) {
  if (preset === 'week') return weekRange();
  if (preset === 'year') return yearRange();
  return monthRange(currentMonth());
}

function activeJobDateRange() {
  if (jobDatePreset !== 'custom') {
    const range = jobPresetRange(jobDatePreset);
    if (!jobStartDate || !jobEndDate) {
      jobStartDate = range.start;
      jobEndDate = range.end;
    }
    return range;
  }
  return { start: jobStartDate || '', end: jobEndDate || '' };
}

function jobFilterDateLabel() {
  const range = activeJobDateRange();
  const label = {
    week: t('lastWeek'),
    month: t('lastMonth'),
    year: t('lastYear'),
    custom: t('customRange')
  }[jobDatePreset] || t('lastMonth');
  if (range.start && range.end) return `${label} ${range.start} - ${range.end}`;
  if (range.start) return `${label} ${range.start}+`;
  if (range.end) return `${label} <= ${range.end}`;
  return label;
}

function productSearchText(product) {
  return Object.values(product || {}).map(normalizeSearchText).join('|');
}

function searchedProducts(rows = state.products) {
  const query = normalizeSearchText(inventorySearch);
  if (!query) return rows;
  return rows.filter(product => productSearchText(product).includes(query));
}

function inventorySearchCountText(rows = state.products) {
  const total = rows.length;
  const matched = searchedProducts(rows).length;
  return lang === 'zh' ? `显示 ${matched} / ${total} 条` : `Showing ${matched} / ${total}`;
}

function inventorySearchBox(rows = state.products) {
  return `<div class="search-row" role="search" aria-label="${t('searchInventory')}">
    <input id="inventorySearchInput" value="${escapeHtml(inventorySearch)}" placeholder="${t('searchInventoryPlaceholder')}" oninput="setInventorySearch(this.value)" autocomplete="off" />
    <button class="btn" onclick="setInventorySearch('')">${t('clearSearch')}</button>
    <span id="inventorySearchCount" class="note">${inventorySearchCountText(rows)}</span>
  </div>`;
}

function jobSearchText(job) {
  return [
    job.date,
    job.scheduleDate,
    job.customer,
    job.phone,
    job.source,
    job.vehicle,
    job.vin,
    repName(job.leadRepId),
    repName(job.receptionRepId),
    job.salesRep,
    job.preparedBy,
    serviceLabelList(job),
    job.package,
    jobInstallerNames(job),
    job.status,
    job.paymentStatus,
    job.paymentMethod,
    job.price
  ].map(normalizeSearchText).join('|');
}

function jobMatchesDate(job) {
  const date = String(job.date || '').slice(0, 10);
  const range = activeJobDateRange();
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
}

function jobMatchesSource(job) {
  if (!jobSourceFilter) return true;
  return normalizeSourceKey(job.source) === jobSourceFilter;
}

function jobPersonText(job) {
  return [
    repName(job.leadRepId),
    repName(job.receptionRepId),
    job.salesRep,
    job.preparedBy,
    jobInstallerNames(job)
  ].map(normalizeSearchText).join('|');
}

function jobMatchesPerson(job) {
  if (!jobPersonFilter) return true;
  return jobPersonText(job).includes(jobPersonFilter);
}

function filteredJobs(includeSearch = true) {
  const rows = sortByDateDesc(state.jobs || [])
    .filter(jobMatchesDate)
    .filter(jobMatchesSource)
    .filter(jobMatchesPerson);
  return includeSearch ? searchedJobs(rows) : rows;
}

function orderMatchesDate(order) {
  const date = String(order.date || '').slice(0, 10);
  const range = activeJobDateRange();
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
}

function orderMatchesPerson(order) {
  if (!jobPersonFilter) return true;
  return [order.salesRep, order.preparedBy].map(normalizeSearchText).join('|').includes(jobPersonFilter);
}

function filteredSalesOrders() {
  return (state.salesOrders || [])
    .filter(orderMatchesDate)
    .filter(orderMatchesPerson);
}

function filteredExpenses(range = activeJobDateRange()) {
  return (state.expenses || []).filter(expense => expenseAppliesToDateRange(expense, range));
}

function searchedJobs(rows) {
  const query = normalizeSearchText(jobSearch);
  if (!query) return rows;
  return rows.filter(job => jobSearchText(job).includes(query));
}

function jobSearchCountText(rows) {
  const total = rows.length;
  const matched = searchedJobs(rows).length;
  return lang === 'zh' ? `显示 ${matched} / ${total} 条` : `Showing ${matched} / ${total}`;
}

function jobSearchBox(rows) {
  return `<div class="search-row" role="search" aria-label="${t('searchJobs')}">
    <input id="jobSearchInput" value="${escapeHtml(jobSearch)}" placeholder="${t('searchJobsPlaceholder')}" oninput="setJobSearch(this.value)" autocomplete="off" />
    <button class="btn" onclick="clearJobFilters()">${t('clearSearch')}</button>
    <span id="jobSearchCount" class="note">${jobSearchCountText(rows)}</span>
  </div>`;
}

function jobSourceOptions() {
  const sources = new Map();
  (state.jobs || []).forEach(job => {
    const label = canonicalSourceLabel(job.source);
    const key = normalizeSourceKey(label);
    if (key) sources.set(key, label);
  });
  return [['', t('allPlatforms')], ...[...sources.entries()].sort((a, b) => a[1].localeCompare(b[1]))];
}

function addJobPersonOption(map, value) {
  const label = String(value || '').trim();
  const key = normalizeSearchText(label);
  if (key && !map.has(key)) map.set(key, label);
}

function jobPersonOptions() {
  const people = new Map();
  (state.customerServiceReps || []).forEach(rep => addJobPersonOption(people, rep.name));
  (state.installers || []).forEach(installer => addJobPersonOption(people, installer.name));
  (state.users || []).forEach(employee => addJobPersonOption(people, employee.name));
  (state.jobs || []).forEach(job => {
    addJobPersonOption(people, repName(job.leadRepId));
    addJobPersonOption(people, repName(job.receptionRepId));
    addJobPersonOption(people, job.salesRep);
    addJobPersonOption(people, job.preparedBy);
    jobInstallerNames(job).split(/[,/，、]+/).forEach(name => addJobPersonOption(people, name));
  });
  return [['', t('allPeople')], ...[...people.entries()].sort((a, b) => a[1].localeCompare(b[1]))];
}

function render() {
  if (!state) return;
  const availablePages = pages.filter(([id]) => !pagePermissions[id] || hasAnyPerm(pagePermissions[id]));
  if (current !== 'modules' && !availablePages.some(([id]) => id === current)) current = 'modules';
  document.body.classList.toggle('modules-home', current === 'modules');
  const currentPage = availablePages.find(([id]) => id === current);
  document.getElementById('nav').innerHTML = `
    <button class="nav-btn ${current === 'modules' ? 'active' : ''}" onclick="setPage('modules')">
      <span>${navIcon('modules')}</span><span>${t('modules')}</span>
    </button>
    ${currentPage ? `<button class="nav-btn active" onclick="setPage('${currentPage[0]}')">
      <span>${navIcon(currentPage[0])}</span><span>${t(currentPage[1])}</span>
    </button>` : ''}
  `;
  const page = current === 'modules' ? ['modules', 'modules', 'modulesSub'] : currentPage;
  const pageTitle = document.getElementById('pageTitle');
  if (current === 'modules') {
    pageTitle.innerHTML = `<span class="home-title"><img class="home-title-mark" src="/quad-film-icon.png" alt="Quad Film" /><span>${lang === 'zh' ? 'QUAD 贴膜店管理系统' : 'QUAD Film Shop Management'}</span></span>`;
  } else {
    pageTitle.textContent = t(page[1]);
  }
  document.getElementById('pageSub').textContent = t(page[2]);
  document.getElementById('view').innerHTML = current === 'modules' ? moduleGrid(availablePages) : views[current]();
  const quickAdd = document.querySelector('.toolbar .btn.primary');
  if (quickAdd) quickAdd.style.display = current !== 'modules' && writePermissions[current] && hasPerm(writePermissions[current]) ? '' : 'none';
  applyStaticTranslations();
  updateMessageBadge();
  enhanceExpandablePanels();
  enhanceEditableTableRows(document.getElementById('view'));
  if (activeProspectWorkspaceId && !preserveProspectWorkspaceRender) renderProspectWorkspace();
  preserveProspectWorkspaceRender = false;
}

function messageUsers() {
  return (state.messageUsers || state.users || []).filter(item => item.id !== user?.id && item.active !== false);
}

function unreadMessages() {
  return (state.messages || []).filter(message => message.toUserId === user?.id && !message.readAt);
}

function unreadMessageIds() {
  return unreadMessages().map(message => message.id).filter(Boolean);
}

function notifyNewUnreadMessages(previousUnreadIds) {
  const currentIds = unreadMessageIds();
  const previousSet = new Set(previousUnreadIds || []);
  knownUnreadMessageIds = currentIds;
  if (!previousUnreadIds) return;
  const hasNewUnread = currentIds.some(id => !previousSet.has(id));
  if (hasNewUnread) playMessageSound();
}

function getMessageAudioContext() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!messageAudioContext) messageAudioContext = new AudioCtor();
  if (messageAudioContext.state === 'suspended') {
    messageAudioContext.resume().catch(() => {});
  }
  return messageAudioContext;
}

function playTone(ctx, startAt, frequency) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.16);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + 0.18);
}

function playMessageSound() {
  const ctx = getMessageAudioContext();
  if (!ctx || ctx.state === 'suspended') return;
  const start = ctx.currentTime + 0.02;
  playTone(ctx, start, 880);
  playTone(ctx, start + 0.22, 1175);
}

function unreadCountFromUser(userId) {
  return unreadMessages().filter(message => message.fromUserId === userId).length;
}

function updateMessageBadge() {
  const badge = document.getElementById('messageBadge');
  if (!badge) return;
  const count = unreadMessages().length;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('hidden', count <= 0);
}

function openMessages(selectedUserId = '') {
  const users = messageUsers();
  activeMessageUserId = selectedUserId || activeMessageUserId || unreadMessages()[0]?.fromUserId || users[0]?.id || '';
  const title = lang === 'zh' ? '站内留言' : 'Messages';
  renderMessageModal(title);
  if (activeMessageUserId) markMessagesRead(activeMessageUserId);
}

function renderMessageModal(title = (lang === 'zh' ? '站内留言' : 'Messages')) {
  const users = messageUsers();
  if (!activeMessageUserId && users[0]) activeMessageUserId = users[0].id;
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = messageModalHtml(users);
  document.getElementById('modalSave').textContent = lang === 'zh' ? '关闭' : 'Close';
  document.getElementById('modalSave').onclick = closeModal;
  document.getElementById('modal').classList.add('open', 'message-modal-open');
  document.body.classList.add('modal-lock');
  setTimeout(() => {
    const list = document.getElementById('messageThread');
    if (list) list.scrollTop = list.scrollHeight;
  }, 0);
}

function messageModalHtml(users) {
  if (!users.length) return `<p class="note">${lang === 'zh' ? '还没有可留言的员工账号。' : 'No staff accounts available.'}</p>`;
  const thread = conversationMessages(activeMessageUserId);
  const activeUser = users.find(item => item.id === activeMessageUserId) || users[0];
  activeMessageUserId = activeUser.id;
  return `<div class="message-layout">
    <div class="message-people">
      ${users.map(item => {
        const unread = unreadCountFromUser(item.id);
        return `<button class="message-person ${item.id === activeMessageUserId ? 'active' : ''}" onclick="selectMessageUser('${item.id}')">
          <span>${escapeHtml(item.name || item.email)}</span>
          ${unread ? `<strong>${unread > 99 ? '99+' : unread}</strong>` : ''}
        </button>`;
      }).join('')}
    </div>
    <div class="message-chat">
      <div class="message-chat-head">${escapeHtml(activeUser.name || activeUser.email)}</div>
      <div class="message-thread" id="messageThread">
        ${thread.length ? thread.map(messageBubbleHtml).join('') : `<div class="note">${lang === 'zh' ? '还没有留言。' : 'No messages yet.'}</div>`}
      </div>
      <div class="message-compose">
        <div class="message-tools">
          <button class="btn" onclick="document.getElementById('messageImageInput').click()">${lang === 'zh' ? '图片' : 'Image'}</button>
          <button class="btn" onclick="document.getElementById('messageFileInput').click()">${lang === 'zh' ? '文件' : 'File'}</button>
          <button class="btn" id="messageVoiceBtn" onclick="toggleVoiceMessage()">${lang === 'zh' ? '语音' : 'Voice'}</button>
          <input class="hidden" id="messageImageInput" type="file" accept="image/*" onchange="sendMessageFile(this.files[0], 'image'); this.value='';" />
          <input class="hidden" id="messageFileInput" type="file" onchange="sendMessageFile(this.files[0], 'file'); this.value='';" />
        </div>
        <textarea id="messageText" placeholder="${lang === 'zh' ? '输入留言内容...' : 'Type a message...'}"></textarea>
        <button class="btn primary" onclick="sendInternalMessage()">${lang === 'zh' ? '发送' : 'Send'}</button>
      </div>
    </div>
  </div>`;
}

function conversationMessages(otherUserId) {
  return (state.messages || []).filter(message =>
    (message.fromUserId === user?.id && message.toUserId === otherUserId) ||
    (message.fromUserId === otherUserId && message.toUserId === user?.id)
  ).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

function messageBubbleHtml(message) {
  const mine = message.fromUserId === user?.id;
  const time = message.createdAt ? new Date(message.createdAt).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const attachmentOnly = !String(message.text || '').trim() && message.attachment;
  const readStatus = mine
    ? ` · <span class="message-read-status ${message.readAt ? 'read' : 'unread'}">${message.readAt ? (lang === 'zh' ? '已读' : 'Read') : (lang === 'zh' ? '未读' : 'Unread')}</span>`
    : '';
  return `<div class="message-bubble ${mine ? 'mine' : 'theirs'} ${attachmentOnly ? 'attachment-only' : ''}">
    <button class="message-delete" type="button" title="${lang === 'zh' ? '删除/撤销' : 'Delete'}" onclick="deleteMessage('${message.id}')">×</button>
    ${message.text ? `<div class="message-text">${escapeHtml(message.text || '')}</div>` : ''}
    ${messageAttachmentHtml(message.attachment)}
    <small>${escapeHtml(mine ? (lang === 'zh' ? '我' : 'Me') : (message.fromName || ''))} · ${escapeHtml(time)}${readStatus}</small>
  </div>`;
}

function messageAttachmentHtml(attachment) {
  if (!attachment?.dataUrl) return '';
  const name = escapeHtml(attachment.name || 'attachment');
  if (attachment.kind === 'image') {
    return `<img class="message-image" src="${attachment.dataUrl}" alt="${name}" title="${lang === 'zh' ? '双击查看大图' : 'Double-click to view'}" ondblclick="openImagePreview(this.src, this.alt)" />`;
  }
  if (attachment.kind === 'audio') {
    const audioId = `audio-${Math.random().toString(36).slice(2)}`;
    return `<div class="message-audio-player">
      <button class="message-audio-play" onclick="toggleMessageAudio('${audioId}', this)" type="button">▶</button>
      <span>${lang === 'zh' ? '语音留言' : 'Voice message'}</span>
      <audio id="${audioId}" preload="metadata" src="${attachment.dataUrl}" onended="resetMessageAudioButton(this)"></audio>
    </div>`;
  }
  return `<a class="message-file" href="${attachment.dataUrl}" download="${name}">📎 ${name}</a>`;
}

function toggleMessageAudio(audioId, button) {
  const audio = document.getElementById(audioId);
  if (!audio) return;
  document.querySelectorAll('.message-audio-player audio').forEach(item => {
    if (item !== audio) {
      item.pause();
      item.currentTime = item.currentTime || 0;
      const otherButton = item.closest('.message-audio-player')?.querySelector('.message-audio-play');
      if (otherButton) otherButton.textContent = '▶';
    }
  });
  if (audio.paused) {
    audio.play().then(() => { button.textContent = '❚❚'; }).catch(() => {});
  } else {
    audio.pause();
    button.textContent = '▶';
  }
}

function resetMessageAudioButton(audio) {
  const button = audio.closest('.message-audio-player')?.querySelector('.message-audio-play');
  if (button) button.textContent = '▶';
}

async function deleteMessage(messageId) {
  const ok = confirm(lang === 'zh' ? '确定删除/撤销这条留言吗？删除后双方都会看不到。' : 'Delete this message? It will disappear for both sides.');
  if (!ok) return;
  try {
    state = await api(`/api/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' });
    broadcastDataChange();
    renderMessageModal();
    updateMessageBadge();
  } catch (err) {
    alert(err.message);
  }
}

async function selectMessageUser(id) {
  activeMessageUserId = id;
  renderMessageModal();
  await markMessagesRead(id);
}

async function markMessagesRead(fromUserId) {
  if (!fromUserId) return;
  if (!unreadCountFromUser(fromUserId)) return;
  try {
    state = await api('/api/messages/read', {
      method: 'PUT',
      body: JSON.stringify({ fromUserId })
    });
    updateMessageBadge();
    if (document.getElementById('modal')?.classList.contains('open')) renderMessageModal();
  } catch (err) {
    console.warn(err);
  }
}

async function sendInternalMessage() {
  const input = document.getElementById('messageText');
  const text = String(input?.value || '').trim();
  if (!activeMessageUserId || !text) return;
  await postInternalMessage({ text });
}

async function postInternalMessage({ text = '', attachment = null }) {
  if (!activeMessageUserId || (!String(text || '').trim() && !attachment)) return;
  try {
    state = await api('/api/messages', {
      method: 'POST',
      body: JSON.stringify({ toUserId: activeMessageUserId, text: String(text || '').trim(), attachment })
    });
    broadcastDataChange();
    renderMessageModal();
    updateMessageBadge();
  } catch (err) {
    alert(err.message);
  }
}

async function sendMessageFile(file, kind) {
  if (!file || !activeMessageUserId) return;
  if (file.size > MAX_MESSAGE_ATTACHMENT_BYTES) {
    alert(lang === 'zh' ? '附件不能超过 8MB。' : 'Attachment must be 8MB or smaller.');
    return;
  }
  if (kind === 'image' && !String(file.type || '').startsWith('image/')) {
    alert(lang === 'zh' ? '请选择图片文件。' : 'Please choose an image file.');
    return;
  }
  const dataUrl = await readFileAsDataUrl(file);
  await postInternalMessage({
    attachment: {
      kind,
      name: file.name || (kind === 'image' ? 'image' : 'file'),
      type: file.type || 'application/octet-stream',
      size: file.size,
      dataUrl
    }
  });
}

async function toggleVoiceMessage() {
  if (messageRecorder && messageRecorder.state === 'recording') {
    messageRecorder.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    alert(lang === 'zh' ? '这个浏览器不支持语音录制。' : 'This browser does not support voice recording.');
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
      updateVoiceButton(false);
      if (!blob.size) return;
      if (blob.size > MAX_MESSAGE_ATTACHMENT_BYTES) {
        alert(lang === 'zh' ? '语音不能超过 8MB。' : 'Voice message must be 8MB or smaller.');
        return;
      }
      const dataUrl = await readBlobAsDataUrl(blob);
      await postInternalMessage({
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
    updateVoiceButton(true);
  } catch (err) {
    alert(lang === 'zh' ? '无法打开麦克风，请检查浏览器权限。' : 'Could not access the microphone. Check browser permissions.');
  }
}

function updateVoiceButton(recording) {
  const button = document.getElementById('messageVoiceBtn');
  if (!button) return;
  button.textContent = recording ? (lang === 'zh' ? '停止' : 'Stop') : (lang === 'zh' ? '语音' : 'Voice');
  button.classList.toggle('recording', recording);
}

function navIcon(id) {
  return { modules:'▦', dashboard:'⌂', jobs:'▣', installers:'◉', pricing:'$', inventory:'▤', workshopInventory:'▥', inventoryAlerts:'!', customerCenter:'💬', replyLibrary:'☁', prospects:'★', leads:'☎', orders:'⇄', shipments:'✈', schedules:'◫', expenses:'◇', reports:'◌', audit:'◷', users:'◎', settings:'⚙' }[id] || '□';
}

function moduleGrid(availablePages) {
  return `<div class="module-grid">
    ${availablePages.map(([id, name, sub]) => `
      <button class="module-tile" data-module="${id}" onclick="setPage('${id}')">
        <span class="module-icon">${navIcon(id)}</span>
        <strong>${t(name)}</strong>
        <small>${t(sub)}</small>
      </button>
    `).join('')}
  </div>`;
}

function jobCalc(job) {
  const installer = state.installers.find(x => x.id === primaryInstallerId(job));
  const price = Number(job.price || 0);
  const material = Number(job.materialCost || 0);
  let labor = 0;
  const services = jobServices(job);
  if (installer) {
    const rates = services.map(service => Number(installer[service] || 0));
    if (installer.mode === 'percent') labor = price * Math.max(0, ...rates) / 100;
    if (installer.mode === 'fixed') labor = rates.reduce((sum, rate) => sum + rate, 0);
    if (installer.mode === 'basePlus') labor = 0;
  }
  return { price, material, labor, gross: price - material - labor };
}

function isStartedRevenueJob(job) {
  const status = String(job?.status || '').trim().toLowerCase();
  const nonRevenueStatuses = new Set([
    '排期',
    '预约',
    '待施工',
    '返工',
    '取消',
    '无效',
    'scheduled',
    'appointment',
    'pending',
    'rework',
    'cancel',
    'canceled',
    'cancelled',
    'invalid'
  ]);
  if (nonRevenueStatuses.has(status)) return false;
  return Number(job?.price || 0) !== 0;
}

function revenueJobs(jobs = []) {
  return (jobs || []).filter(isStartedRevenueJob);
}

function servicePoint(service, installer = {}) {
  const defaults = { tint: 1, ppf: 3, wrap: 3, ceramic: 1 };
  const key = `${service}Point`;
  return Number(installer[key] || defaults[service] || 1);
}

function jobPointValue(job, installer = {}) {
  return jobServices(job).reduce((sum, service) => sum + servicePoint(service, installer), 0);
}

function jobFixedPay(job, installer = {}) {
  return jobServices(job).reduce((sum, service) => sum + Number(installer[service] || 0), 0);
}

function jobPaidAmount(job) {
  return Number(job.paidAmount ?? job.deposit ?? 0);
}

function jobPaymentStatusValue(job) {
  if (job.paymentStatus) return job.paymentStatus;
  const price = Number(job.price || 0);
  const paid = jobPaidAmount(job);
  if (price > 0 && paid >= price) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

function paymentStatusLabel(value) {
  const labels = {
    paid: lang === 'zh' ? '已付款' : 'Paid',
    unpaid: lang === 'zh' ? '未付款' : 'Unpaid',
    partial: lang === 'zh' ? '部分付款' : 'Partial'
  };
  return labels[value] || value || '';
}

function paymentStatusPill(job) {
  const value = jobPaymentStatusValue(job);
  const cls = value === 'paid' ? 'good' : value === 'partial' ? 'warn' : 'bad';
  return `<span class="pill ${cls}">${escapeHtml(paymentStatusLabel(value))}</span>`;
}

function paymentMethodOptions() {
  return [
    ['', lang === 'zh' ? '未填写' : 'Not Set'],
    ['cash', lang === 'zh' ? '现金' : 'Cash'],
    ['visa', 'Visa'],
    ['card', lang === 'zh' ? '刷卡' : 'Card'],
    ['zelle', 'Zelle'],
    ['check', lang === 'zh' ? '支票' : 'Check'],
    ['other', lang === 'zh' ? '其他' : 'Other']
  ];
}

function paymentMethodName(value) {
  return Object.fromEntries(paymentMethodOptions())[value] || value || '';
}

function paymentStatusOptions() {
  return [['unpaid', paymentStatusLabel('unpaid')], ['partial', paymentStatusLabel('partial')], ['paid', paymentStatusLabel('paid')]];
}

function basePlusMonthlyPay(installer, jobs) {
  const quota = Number(installer.baseQuota || 20);
  const base = Number(installer.base || 0);
  const rows = sortByDateDesc(jobs).reverse();
  let usedPoints = 0;
  let overagePay = 0;
  rows.forEach(job => {
    const points = jobPointValue(job, installer);
    const pay = jobFixedPay(job, installer);
    usedPoints += points;
    if (usedPoints <= quota || points <= 0) return;
    const overPoints = Math.min(usedPoints - quota, points);
    overagePay += pay * (overPoints / points);
  });
  return { base, quota, points: usedPoints, overagePay, total: base + overagePay };
}

function installerPaySummary(installer, jobs, range = null) {
  const installerJobs = jobs.filter(job => primaryInstallerId(job) === installer.id);
  const base = Number(installer.base || 0);
  const baseMonths = base > 0 ? calendarMonthsInRange(range, installerJobs).length : 0;
  const baseTotal = base * baseMonths;
  if (installer.mode !== 'basePlus') {
    const total = installerJobs.reduce((sum, job) => sum + jobCalc(job).labor, 0);
    return { name: installer.name, count: installerJobs.length, points: null, base: baseTotal, overagePay: total, total: baseTotal + total };
  }
  const byMonth = new Map();
  installerJobs.forEach(job => {
    const month = String(job.date || '').slice(0, 7) || currentMonth();
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(job);
  });
  if (range) {
    calendarMonthsInRange(range, installerJobs).forEach(month => {
      if (!byMonth.has(month)) byMonth.set(month, []);
    });
  }
  const result = [...byMonth.entries()].reduce((sum, [, monthJobs]) => {
    const monthPay = basePlusMonthlyPay(installer, monthJobs);
    return {
      count: sum.count + monthJobs.length,
      points: sum.points + monthPay.points,
      base: sum.base + monthPay.base,
      overagePay: sum.overagePay + monthPay.overagePay,
      total: sum.total + monthPay.total
    };
  }, { count: 0, points: 0, base: 0, overagePay: 0, total: 0 });
  return { name: installer.name, ...result };
}

function totalLaborForJobs(jobs, range = null) {
  return state.installers.reduce((sum, installer) => sum + installerPaySummary(installer, jobs, range).total, 0);
}

function jobServices(job) {
  const values = Array.isArray(job.services) ? job.services : String(job.service || '').split(',');
  const allowed = new Set(serviceOptions().map(option => option[0]));
  const selected = values.map(value => String(value || '').trim()).filter(value => allowed.has(value));
  return selected.length ? [...new Set(selected)] : ['tint'];
}

function serviceLabelList(job) {
  return jobServices(job).map(service => serviceNames[service] || service).join(' + ');
}

function jobInstallerIds(job) {
  const ids = Array.isArray(job.installerIds) ? job.installerIds : String(job.installerIds || job.installerId || '').split(',');
  const cleaned = ids.map(value => String(value || '').trim()).filter(Boolean);
  if (!cleaned.length && job.installerId) cleaned.push(job.installerId);
  return [...new Set(cleaned)];
}

function primaryInstallerId(job) {
  return jobInstallerIds(job)[0] || job.installerId || '';
}

function jobInstallerNames(job) {
  const ids = jobInstallerIds(job);
  if (!ids.length) return t('unassigned');
  const names = ids.map(id => state.installers.find(x => x.id === id)?.name).filter(Boolean);
  return names.length ? names.join(' / ') : t('unassigned');
}

function repById(id) {
  return (state.customerServiceReps || []).find(rep => rep.id === id);
}

function repName(id) {
  return repById(id)?.name || '';
}

function isCommissionableJob(job) {
  return !['取消', '无效'].includes(job.status) && Number(job.price || 0) !== 0;
}

function jobCommissionLead(job) {
  return {
    status: isCommissionableJob(job) ? '已成交' : '未成交',
    soldAmount: Number(job.price || 0),
    quote: Number(job.price || 0),
    leadType: job.leadType || (job.source === 'Walk-in' ? 'walkin' : 'online'),
    customerType: job.customerType || 'toc',
    saleType: job.saleType || 'install'
  };
}

function jobRepCommission(job, rep) {
  if (!rep) return 0;
  return leadCommission(jobCommissionLead(job), rep).amount;
}

function hasPerm(permission) {
  return Boolean(state?.permissions?.[permission] || user?.permissions?.[permission]);
}

function hasAnyPerm(permissions) {
  if (!Array.isArray(permissions)) return hasPerm(permissions);
  return permissions.some(permission => hasPerm(permission));
}

function canSeeLabor() {
  return hasPerm('installerPayView') || hasPerm('fullFinanceView');
}

function canSeeFinance() {
  return user?.role === 'owner';
}

function canSeeCommission() {
  return hasPerm('commissionView') || hasPerm('fullFinanceView');
}

function isValidLead(lead) {
  return lead.status !== '无效';
}

function isArrivedLead(lead) {
  return ['已到店', '已成交'].includes(lead.status);
}

function isClosedLead(lead) {
  return lead.status === '已成交';
}

function percentText(rate) {
  return `${Math.round(Number(rate || 0) * 100)}%`;
}

function ratePill(rate, target) {
  const ok = Number(rate || 0) >= target;
  return `<span class="pill ${ok ? 'good' : 'bad'}">${percentText(rate)}</span>`;
}

function tierAmount(amount, tiers) {
  const value = Number(amount || 0);
  const tier = tiers.find(row => value > row.min && value <= row.max) || tiers.find(row => value > row.min && row.max === Infinity);
  return tier ? tier.pay : 0;
}

function leadCommission(lead, rep) {
  if (!isClosedLead(lead)) return { amount: 0, reason: 'not closed' };
  const amount = Number(lead.soldAmount || lead.quote || 0);
  const plan = rep.plan || 'onlineTier';
  const customerType = lead.customerType || 'toc';
  const saleType = lead.saleType || 'install';
  const leadType = lead.leadType || 'online';
  const judyTiers = [{ min: -Infinity, max: 2000, pay: 20 }, { min: 2000, max: 4000, pay: 30 }, { min: 4000, max: 6000, pay: 50 }, { min: 6000, max: Infinity, pay: 100 }];
  const onlineTiers = [{ min: -Infinity, max: 1000, pay: 20 }, { min: 1000, max: 2000, pay: 30 }, { min: 2000, max: 3000, pay: 50 }, { min: 3000, max: 4000, pay: 100 }, { min: 4000, max: Infinity, pay: 100 }];
  const operationTiers = [{ min: -Infinity, max: 1000, pay: 20 }, { min: 1000, max: 2000, pay: 30 }, { min: 2000, max: 3000, pay: 50 }, { min: 3000, max: 4000, pay: 100 }, { min: 4000, max: 5000, pay: 200 }, { min: 5000, max: Infinity, pay: 200 }];
  if (plan === 'salesPercent30') return { amount: amount * 0.3, reason: 'sales 30 percent' };
  if (plan === 'foreignTrade6') return { amount: amount * 0.06, reason: 'foreign trade 6 percent' };
  if (plan === 'foreignTrade20') return { amount: amount * 0.2, reason: 'foreign trade 20 percent' };
  if (plan === 'operationTier') return { amount: tierAmount(amount, operationTiers), reason: 'operation tier' };
  if (plan === 'managerTier') return { amount: tierAmount(amount, onlineTiers), reason: 'manager reception tier' };
  if (customerType === 'tob' || plan === 'judy') {
    if (saleType === 'materialOnly') return { amount: amount * (leadType === 'relationship' ? 0.06 : 0.03), reason: 'material percent' };
    return { amount: tierAmount(amount, judyTiers), reason: 'judy/tob tier' };
  }
  if (plan === 'couple') {
    if (amount < Number(rep.minCloseAmount || 10000)) return { amount: 0, reason: 'below threshold' };
    return { amount: tierAmount(amount, judyTiers), reason: 'couple threshold tier' };
  }
  return { amount: tierAmount(amount, onlineTiers), reason: 'online toc tier' };
}

function orderCalc(order) {
  const total = Number(order.qty || 0) * Number(order.unitPrice || 0);
  const product = state.products.find(x => x.sku === order.item);
  const cost = product ? Number(product.cost || 0) * Number(order.qty || 0) : 0;
  return { total, cost, gross: total - cost, balance: total - Number(order.paid || 0) };
}

function isCustomPrintedFilmSku(sku) {
  return String(sku || '') === CUSTOM_PRINTED_FILM_SKU;
}

function customPrintedFilmLabel() {
  return lang === 'zh' ? '定制喷绘膜' : 'Custom Printed Film';
}

function salesOrderItemOptions() {
  return [[CUSTOM_PRINTED_FILM_SKU, customPrintedFilmLabel()], ...state.products.map(p => [p.sku, p.sku])];
}

function salesOrderItemLabel(sku) {
  return isCustomPrintedFilmSku(sku) ? customPrintedFilmLabel() : sku;
}

function salesOrderSkuSearchOptions() {
  return [
    salesOrderVirtualProduct(CUSTOM_PRINTED_FILM_SKU),
    ...state.products
  ].filter(Boolean);
}

function salesOrderSkuSearchLabel(sku) {
  const product = salesOrderVirtualProduct(sku) || state.products.find(item => item.sku === sku);
  if (!product) return salesOrderItemLabel(sku);
  const parts = [product.sku];
  if (product.name) parts.push(product.name);
  return parts.join(' - ');
}

function salesOrderSkuSearchText(product) {
  return [
    product.sku,
    product.name,
    product.category,
    product.unit
  ].filter(Boolean).join(' ').toLowerCase();
}

function salesOrderSkuSearchHtml(id, label, value, cls) {
  return `<label class="${cls || ''} sku-search-field">${label}
    <div class="sku-search" data-sku-search>
      <input id="${id}" type="hidden" value="${escapeHtml(value ?? '')}" />
      <input id="${id}Search" type="text" value="${escapeHtml(salesOrderSkuSearchLabel(value))}" autocomplete="off" placeholder="${lang === 'zh' ? '输入 SKU / 名称 / 关键词搜索' : 'Search SKU / name / keyword'}" />
      <div class="sku-search-results" id="${id}Results"></div>
    </div>
  </label>`;
}

function renderSalesOrderSkuSearchResults(query = '') {
  const results = document.getElementById('itemResults');
  if (!results) return;
  const value = query.trim().toLowerCase();
  const options = salesOrderSkuSearchOptions()
    .filter(product => !value || salesOrderSkuSearchText(product).includes(value))
    .slice(0, 40);
  if (!options.length) {
    results.innerHTML = `<div class="sku-result-empty">${lang === 'zh' ? '没有找到匹配商品' : 'No matching item'}</div>`;
    results.classList.add('open');
    return;
  }
  results.innerHTML = options.map(product => `
    <button type="button" class="sku-result" data-sku="${escapeHtml(product.sku)}">
      <strong>${escapeHtml(product.sku)}</strong>
      <span>${escapeHtml(product.name || '')}</span>
      <small>${escapeHtml(product.category || product.unit || '')}</small>
    </button>
  `).join('');
  results.classList.add('open');
}

function selectSalesOrderSku(sku) {
  const hidden = document.getElementById('item');
  const search = document.getElementById('itemSearch');
  const results = document.getElementById('itemResults');
  if (hidden) {
    hidden.value = sku;
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (search) search.value = salesOrderSkuSearchLabel(sku);
  results?.classList.remove('open');
}

function setupSalesOrderSkuSearch() {
  const search = document.getElementById('itemSearch');
  const results = document.getElementById('itemResults');
  if (!search || !results) return;
  search.addEventListener('input', () => renderSalesOrderSkuSearchResults(search.value));
  search.addEventListener('focus', () => renderSalesOrderSkuSearchResults(search.value));
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape') results.classList.remove('open');
  });
  search.addEventListener('blur', () => setTimeout(() => results.classList.remove('open'), 120));
  results.addEventListener('mousedown', event => {
    const button = event.target.closest('[data-sku]');
    if (!button) return;
    event.preventDefault();
    selectSalesOrderSku(button.dataset.sku);
  });
}

function workshopSkuSearchLabel(sku) {
  const product = state.products.find(item => item.sku === sku);
  if (!product) return sku || '';
  const parts = [product.sku];
  if (product.name) parts.push(product.name);
  return parts.join(' - ');
}

function workshopSkuSearchHtml(id, label, value, cls) {
  return `<label class="${cls || ''} sku-search-field">${label}
    <div class="sku-search" data-sku-search>
      <input id="${id}" type="hidden" value="${escapeHtml(value ?? '')}" />
      <input id="${id}Search" type="text" value="${escapeHtml(workshopSkuSearchLabel(value))}" autocomplete="off" placeholder="${lang === 'zh' ? '输入 SKU / 名称 / 关键词搜索' : 'Search SKU / name / keyword'}" />
      <div class="sku-search-results" id="${id}Results"></div>
    </div>
  </label>`;
}

function renderWorkshopSkuSearchResults(query = '') {
  const results = document.getElementById('skuResults');
  if (!results) return;
  const value = query.trim().toLowerCase();
  const options = (state.products || [])
    .filter(product => !value || salesOrderSkuSearchText(product).includes(value))
    .slice(0, 40);
  if (!options.length) {
    results.innerHTML = `<div class="sku-result-empty">${lang === 'zh' ? '没有找到匹配商品' : 'No matching item'}</div>`;
    results.classList.add('open');
    return;
  }
  results.innerHTML = options.map(product => `
    <button type="button" class="sku-result" data-sku="${escapeHtml(product.sku)}">
      <strong>${escapeHtml(product.sku)}</strong>
      <span>${escapeHtml(product.name || '')}</span>
      <small>${escapeHtml(product.category || product.unit || '')}</small>
    </button>
  `).join('');
  results.classList.add('open');
}

function selectWorkshopSku(sku) {
  const hidden = document.getElementById('sku');
  const search = document.getElementById('skuSearch');
  const results = document.getElementById('skuResults');
  if (hidden) {
    hidden.value = sku;
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (search) search.value = workshopSkuSearchLabel(sku);
  results?.classList.remove('open');
}

function setupWorkshopSkuSearch() {
  const search = document.getElementById('skuSearch');
  const results = document.getElementById('skuResults');
  if (!search || !results) return;
  search.addEventListener('input', () => renderWorkshopSkuSearchResults(search.value));
  search.addEventListener('focus', () => renderWorkshopSkuSearchResults(search.value));
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape') results.classList.remove('open');
  });
  search.addEventListener('blur', () => setTimeout(() => results.classList.remove('open'), 120));
  results.addEventListener('mousedown', event => {
    const button = event.target.closest('[data-sku]');
    if (!button) return;
    event.preventDefault();
    selectWorkshopSku(button.dataset.sku);
  });
}

function salesOrderVirtualProduct(sku) {
  if (!isCustomPrintedFilmSku(sku)) return null;
  return {
    sku: CUSTOM_PRINTED_FILM_SKU,
    name: customPrintedFilmLabel(),
    unit: 'roll',
    cost: 0,
    price: 0,
    wholesale: 0,
    minPrice: 0,
    virtual: true
  };
}

function productMinimumSalePrice(product) {
  return Number(product?.minPrice || product?.wholesale || 0);
}

function selectedSalesOrderProduct() {
  const sku = document.getElementById('item')?.value;
  return salesOrderVirtualProduct(sku) || state.products.find(product => product.sku === sku);
}

function updateSalesOrderMinimumHint() {
  const hint = document.getElementById('salesOrderMinHint');
  const unitPriceInput = document.getElementById('unitPrice');
  const product = selectedSalesOrderProduct();
  if (!hint || !unitPriceInput || !product) return;
  const minPrice = productMinimumSalePrice(product);
  unitPriceInput.min = String(minPrice);
  hint.textContent = product.virtual
    ? (lang === 'zh' ? '定制喷绘膜：不校验库存，不自动扣库存；喷绘底膜由仓库领料出库。' : 'Custom printed film: no inventory validation or automatic stock deduction. Base film is handled by warehouse material issue.')
    : `${t('minSalePrice')}：${currency.format(minPrice)} / ${product.unit || ''}`;
}

function validateSalesOrderFormData(data) {
  const product = salesOrderVirtualProduct(data.item) || state.products.find(item => item.sku === data.item);
  if (!product) return lang === 'zh' ? '找不到这个商品 SKU。' : 'Cannot find this SKU.';
  const minPrice = productMinimumSalePrice(product);
  if (minPrice > 0 && Number(data.unitPrice || 0) < minPrice) {
    return lang === 'zh'
      ? `${product.sku} 最低售价是 ${currency.format(minPrice)}，不能低于最低售价保存订单。`
      : `${product.sku} minimum sale price is ${currency.format(minPrice)}. The order cannot be saved below that price.`;
  }
  return '';
}

function kpis(jobs = state.jobs.filter(j => isDateInMonth(j.date, currentMonth())), salesOrders = state.salesOrders.filter(o => isDateInMonth(o.date, currentMonth()))) {
  const incomeJobs = revenueJobs(jobs);
  const jobRevenue = incomeJobs.reduce((a, j) => a + jobCalc(j).price, 0);
  const jobMaterial = incomeJobs.reduce((a, j) => a + jobCalc(j).material, 0);
  const jobGross = canSeeFinance() ? jobRevenue - jobMaterial - totalLaborForJobs(incomeJobs) : 0;
  const orderRevenue = salesOrders.reduce((a, o) => a + orderCalc(o).total, 0);
  const totalRevenue = jobRevenue + orderRevenue;
  const lowStock = state.products.filter(p => Number(p.reorder || 0) > 0 && Number(p.qty || 0) <= Number(p.reorder || 0)).length;
  return { jobRevenue, jobGross, orderRevenue, totalRevenue, lowStock };
}

function currentMonth() {
  return today().slice(0, 7);
}

function isDateInMonth(date, month = currentMonth()) {
  return String(date || '').slice(0, 7) === month;
}

function validateTodayEntryDate(value) {
  const selected = String(value || '').slice(0, 10);
  const current = today();
  if (!selected) return lang === 'zh' ? '日期不能为空。' : 'Date is required.';
  if (selected < current) return lang === 'zh' ? `不能补录过去日期。今天是 ${current}，不允许录入 ${selected} 的单据。` : `Backdated entries are not allowed. Today is ${current}; ${selected} cannot be entered.`;
  if (selected > current) return lang === 'zh' ? `不能录入未来日期。今天是 ${current}，不允许录入 ${selected} 的单据。` : `Future-dated entries are not allowed. Today is ${current}; ${selected} cannot be entered.`;
  return '';
}

function validateNotPastEntryDate(value) {
  const selected = String(value || '').slice(0, 10);
  const current = today();
  if (!selected) return lang === 'zh' ? '日期不能为空。' : 'Date is required.';
  if (selected < current) return lang === 'zh' ? `不能补录过去日期。今天是 ${current}，不允许录入 ${selected} 的施工单。` : `Backdated job orders are not allowed. Today is ${current}; ${selected} cannot be entered.`;
  return '';
}

function setJobMonth(value) {
  jobMonth = value || currentMonth();
  render();
}

function monthRange(month = currentMonth()) {
  const [year, monthIndex] = String(month).split('-').map(Number);
  const start = `${month}-01`;
  const end = localDateString(new Date(year, monthIndex, 0));
  return { start, end };
}

function expenseAppliesToMonth(expense, month = currentMonth()) {
  if (!expense) return false;
  const { start, end } = monthRange(month);
  const adStart = String(expense.adStartDate || '').trim();
  const adEnd = String(expense.adEndDate || '').trim();
  if (adStart || adEnd) {
    const rangeStart = adStart || adEnd;
    const rangeEnd = adEnd || adStart;
    return rangeStart <= end && rangeEnd >= start;
  }
  return isDateInMonth(expense.date, month);
}

function operatingCostTotal(range = null) {
  const expenses = state.expenses || [];
  if (expenses.length) {
    const rows = range ? expenses.filter(expense => expenseAppliesToDateRange(expense, range)) : expenses;
    return rows.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  }
  return Number(state.settings.monthlyFixedCost || 0);
}

function sortByDateDesc(rows) {
  return [...(rows || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function sortByDateFieldDesc(rows, field) {
  return [...(rows || [])].sort((a, b) => String(b[field] || '').localeCompare(String(a[field] || '')));
}

const views = {
  dashboard() {
    const dashboardJobs = filteredJobs(false);
    const dashboardOrders = filteredSalesOrders();
    const k = kpis(dashboardJobs, dashboardOrders);
    return `
      ${jobFilterControls()}
      <div class="grid stats">
        <div class="stat"><span>${t('jobRevenue')}</span><strong>${currency.format(k.jobRevenue)}</strong></div>
        <div class="stat"><span>${t('jobGross')}</span><strong>${canSeeFinance() ? currency.format(k.jobGross) : hiddenValue()}</strong></div>
        <div class="stat"><span>${t('salesRevenue')}</span><strong>${currency.format(k.orderRevenue)}</strong></div>
        <div class="stat"><span>${t('totalRevenue')}</span><strong>${currency.format(k.totalRevenue)}</strong></div>
        <div class="stat"><span>${t('lowStockSku')}</span><strong>${k.lowStock}</strong></div>
      </div>
      <div class="panel" style="margin-top:14px">
        <div class="panel-head"><h3>${lang === 'zh' ? '施工收入来源明细' : 'Job Revenue Detail'}</h3></div>
        ${jobRevenueDetailTable(dashboardJobs)}
      </div>
      <div class="split" style="margin-top:14px">
        <div class="panel">
          <div class="panel-head"><h3>${t('recentJobs')}</h3><button class="btn" onclick="setPage('jobs')">${t('viewAll')}</button></div>
          ${jobTable(dashboardJobs.slice(0, 7))}
        </div>
        ${hasPerm('inventoryView') ? `<div class="panel">
          <div class="panel-head"><h3>${t('stockAlert')}</h3><button class="btn" onclick="setPage('inventoryAlerts')">${t('viewAll')}</button></div>
          ${inventoryAlertTable(false, 8)}
          <p class="note">${lang === 'zh' ? '低于 SKU 里设置的最低数量，会自动进入库存报警表。' : 'Items below the minimum quantity set on each SKU appear here automatically.'}</p>
        </div>` : ''}
      </div>`;
  },
  jobs() {
    const canListJobs = hasAnyPerm(['jobsView', 'jobsEdit', 'jobsDelete']);
    const baseJobs = filteredJobs(false);
    const visibleJobs = filteredJobs(true);
    const content = canListJobs
      ? jobFilterControls() + `<div id="jobSourceStats">${sourceStatsTable(baseJobs, jobFilterDateLabel())}</div>` + `<div style="margin-top:14px">${jobSearchBox(baseJobs)}<div id="jobSearchResults">${jobTable(visibleJobs, true)}</div></div>`
      : `<p class="note">${lang === 'zh' ? '这个账号只有新增施工单权限，不能浏览已有施工订单。' : 'This account can create job orders but cannot browse existing job orders.'}</p>`;
    return panel(t('jobs'), hasPerm('jobsCreate') ? `<button class="btn primary" onclick="openJob()">${t('addNew')}</button>` : '', content);
  },
  installers() {
    return panel(t('installers'), hasPerm('installerEdit') ? `<button class="btn primary" onclick="openInstaller()">${t('addNew')}</button>` : '', installerTable() + `<p class="note">${lang === 'zh' ? '百分比适合分包师傅，固定金额适合单项计件。底薪加超产会按月计算任务积分：默认窗膜 1 分，TPU改色/PPF 3 分；达到月任务积分后，超出部分才按对应项目金额计算超产提成。' : 'Percentage works for subcontractors and fixed pay works for piece-rate jobs. Base plus bonus is calculated monthly by quota points: tint defaults to 1 point, TPU color change and PPF default to 3 points, and bonus pay starts only after the monthly quota is reached.'}</p>`);
  },
  pricing() {
    return panel(t('pricing'), hasPerm('pricingEdit') ? `<button class="btn primary" onclick="openPriceRule()">${t('addNew')}</button>` : '', priceRuleTable());
  },
  inventory() {
    return `${panel(t('inventoryAlerts'), `<button class="btn" onclick="setPage('inventoryAlerts')">${t('viewAll')}</button>`, inventoryAlertTable(false, 8))}
    <div class="split" style="margin-top:14px">
      <div class="panel"><div class="panel-head"><h3>${t('inventory')}</h3>${hasPerm('inventoryEdit') ? `<button class="btn primary" onclick="openProduct()">${t('addNew')}</button>` : ''}</div>${inventorySearchBox()}<div id="inventorySearchResults">${productTable(searchedProducts(), true)}</div></div>
      <div class="panel"><div class="panel-head"><h3>${lang === 'zh' ? '出入库流水' : 'Inventory Movements'}</h3>${hasPerm('inventoryEdit') ? `<button class="btn primary" onclick="openMovement()">${t('addNew')}</button>` : ''}</div>${movementTable()}</div>
    </div>`;
  },
  workshopInventory() {
    const actions = hasPerm('inventoryEdit')
      ? `<button class="btn" onclick="openWorkshopMovement('transfer')">${t('workshopTransfer')}</button><button class="btn primary" onclick="openWorkshopMovement('consume')">${t('workshopConsume')}</button>`
      : '';
    return `<div class="split">
      <div class="panel"><div class="panel-head"><h3>${t('workshopStock')}</h3>${actions}</div>${workshopStockTable()}<p class="note">${lang === 'zh' ? '领料到贴膜间会立刻减少大仓库存；登记贴车用料只减少贴膜间库存。' : 'Issuing to workshop immediately reduces main warehouse stock. Workshop usage only reduces workshop stock.'}</p></div>
      <div class="panel"><div class="panel-head"><h3>${t('workshopLedger')}</h3></div>${workshopMovementTable()}</div>
    </div>`;
  },
  inventoryAlerts() {
    const alertRows = stockAlertProducts();
    return panel(t('inventoryAlerts'), hasPerm('inventoryEdit') ? `<button class="btn" onclick="setPage('inventory')">${t('processInventory')}</button>` : '', inventorySearchBox(alertRows) + `<div id="inventorySearchResults">${inventoryAlertTable(true, null, true)}</div>` + `<p class="note">${lang === 'zh' ? '在库存商品里设置“预警库存/最低数量”。当当前库存小于或等于这个数量时，这里会自动生成补货报警。' : 'Set the reorder level on each SKU. When current stock is less than or equal to that number, the item appears here for replenishment.'}</p>`);
  },
  customerCenter() {
    return panel(t('customerCenter'), hasPerm('prospectsEdit') ? `<button class="btn primary" onclick="openProspect(null,'customerConversations')">${lang === 'zh' ? '新增客户交流' : 'New conversation'}</button>` : '', customerCenterTable() + `<p class="note">${lang === 'zh' ? '这里集中查看所有客户交流。已进入高意向客户表的客户会显示“高意向”标记；普通客户达到到店意向后可加入高意向客户。' : 'All customer conversations appear here. Qualified customers can be promoted to the high-intent list.'}</p>`);
  },
  replyLibrary() {
    return panel(t('replyLibrary'), hasPerm('prospectsEdit') ? `<button class="btn primary" onclick="openReplyTemplateEditor('text')">${lang === 'zh' ? '新增回复素材' : 'New reply'}</button>` : '', replyLibraryPageHtml());
  },
  prospects() {
    return panel(t('prospects'), hasPerm('prospectsEdit') ? `<button class="btn primary" onclick="openProspect()">${t('addNew')}</button>` : '', prospectTable() + `<p class="note">${lang === 'zh' ? '这里记录 Mat、Yelp、Meta、Google 等平台上已经有明确意向、已经邀约或已经预约到店的客户。聊天上下文可以直接粘贴客户沟通内容，方便店长和接待人员提前跟进。' : 'Use this area for customers from Mat, Yelp, Meta, Google, and other channels who show clear intent, are invited, or have appointments. Paste conversation context so managers and reception staff can follow up.'}</p>`);
  },
  leads() {
    const actions = hasPerm('leadsEdit') ? `<button class="btn primary" onclick="openLead()">${t('addNew')}</button>` : '';
    const repAction = hasPerm('commissionEdit') ? `<button class="btn primary" onclick="openCustomerServiceRep()">${t('addNew')}</button>` : '';
    return `<div class="grid stats">
      ${leadKpiCards()}
    </div>
    <div class="split" style="margin-top:14px">
      <div class="panel"><div class="panel-head"><h3>${lang === 'zh' ? '客服业绩报表' : 'Rep Performance'}</h3></div>${leadReportTable()}</div>
      <div class="panel"><div class="panel-head"><h3>${lang === 'zh' ? '客服提成规则' : 'Commission Rules'}</h3>${repAction}</div>${customerServiceRepTable()}</div>
    </div>
    <div style="margin-top:14px">${panel(t('leads'), actions, leadTable())}</div>`;
  },
  orders() {
    return panel(t('orders'), hasPerm('ordersEdit') ? `<button class="btn primary" onclick="openSalesOrder()">${t('addNew')}</button>` : '', salesOrderTable());
  },
  shipments() {
    const actions = hasPerm('shipmentsEdit') ? `<div class="mini-actions">
      <button class="btn" onclick="document.getElementById('shipmentImportFile')?.click()">${t('importShipmentFile')}</button>
      <button class="btn" onclick="document.getElementById('shipmentPhotoFile')?.click()">${t('photoRecognize')}</button>
      <button class="btn primary" onclick="openShipment()">${t('addNew')}</button>
    </div>` : '';
    const importInputs = hasPerm('shipmentsEdit') ? `
      <input id="shipmentImportFile" class="hidden" type="file" accept=".xlsx,.csv,.tsv" onchange="importShipmentFile(this.files?.[0]); this.value=''" />
      <input id="shipmentPhotoFile" class="hidden" type="file" accept="image/*" capture="environment" onchange="handleShipmentPhotoUpload(this.files?.[0]); this.value=''" />
    ` : '';
    return panel(t('shipments'), actions, importInputs + shipmentTable() + `<p class="note">${lang === 'zh' ? '这里专门记录从中国发往美国的在途货物。海运可填预计到港/下船和到拉斯维加斯时间；空运可填发出、到港和到拉斯维加斯时间。Excel/CSV 第一行请放表头，例如：运输方式、货物内容、数量、卖货方、柜号/单号、发出时间、预计到港/下船、预计到拉斯维加斯、状态、备注。拍照识别端口已预留，自动 OCR 需要后续配置识别服务。' : 'Track goods moving from China to the US here. Excel/CSV imports use the first row as headers, such as method, items, qty, supplier, tracking no, depart date, port ETA, Las Vegas ETA, status, and notes. Photo OCR is reserved and requires an OCR service to be configured.'}</p>`);
  },
  schedules() {
    const actions = hasPerm('schedulesEdit') ? `<div class="mini-actions"><button class="btn primary" onclick="openSchedule()">${t('addNew')}</button><button class="btn" onclick="sendTomorrowScheduleReminder()">${t('sendTomorrowReminder')}</button></div>` : '';
    return panel(t('schedules'), actions, scheduleControls() + scheduleStatsTable() + `<div style="margin-top:14px">${scheduleTable()}</div>` + `<div style="margin-top:14px">${scheduleReminderTable()}</div><p class="note">${lang === 'zh' ? '邮件提醒会在前一天发送。云端需要配置 RESEND_API_KEY 和 REMINDER_FROM_EMAIL 后才能真正自动发邮件；未配置时系统会提示。' : 'Email reminders are sent one day ahead. Cloud email requires RESEND_API_KEY and REMINDER_FROM_EMAIL to be configured.'}</p>`);
  },
  expenses() {
    return panel(t('expenses'), hasPerm('expensesEdit') ? `<button class="btn primary" onclick="openExpense()">${t('addNew')}</button>` : '', expenseTable() + `<p class="note">${lang === 'zh' ? '这里录入房租、水电费、保险、广告、软件订阅等运营成本。报表会自动扣除这些费用。' : 'Enter rent, utilities, insurance, advertising, software subscriptions, and other operating costs here. Reports deduct these costs automatically.'}</p>`);
  },
  reports() {
    const reportRange = activeJobDateRange();
    const reportJobs = filteredJobs(false);
    const reportRevenueJobs = revenueJobs(reportJobs);
    const reportOrders = filteredSalesOrders();
    const reportExpenses = filteredExpenses(reportRange);
    const reportKpis = kpis(reportRevenueJobs, reportOrders);
    const labor = totalLaborForJobs(reportRevenueJobs, reportRange);
    const material = reportRevenueJobs.reduce((a, j) => a + jobCalc(j).material, 0);
    const orderGross = reportOrders.reduce((a, o) => a + orderCalc(o).gross, 0);
    const operatingCost = operatingCostTotal(reportRange);
    const serviceCommission = leadReportRows(reportRevenueJobs).reduce((sum, row) => sum + row.commission, 0);
    const net = reportKpis.jobGross + orderGross - operatingCost - serviceCommission;
    return `${jobFilterControls()}<div class="grid stats" style="margin-top:14px">
      <div class="stat"><span>${t('materialCost')}</span><strong>${canSeeFinance() ? currency.format(material) : hiddenValue()}</strong></div>
      <div class="stat"><span>${t('labor')}</span><strong>${currency.format(labor)}</strong></div>
      <div class="stat"><span>${t('totalCommission')}</span><strong>${canSeeCommission() ? currency.format(serviceCommission) : hiddenValue()}</strong></div>
      <div class="stat"><span>${lang === 'zh' ? '运营成本' : 'Operating Costs'}</span><strong>${currency.format(operatingCost)}</strong></div>
      <div class="stat"><span>${lang === 'zh' ? '扣固定成本后利润' : 'Net After Fixed Cost'}</span><strong>${canSeeFinance() ? currency.format(net) : hiddenValue()}</strong></div>
    </div><div class="split" style="margin-top:14px">
      <div class="panel"><div class="panel-head"><h3>${lang === 'zh' ? '师傅工费汇总' : 'Installer Pay Summary'}</h3></div>${laborReport(reportRevenueJobs, reportRange)}<div class="panel-head subhead"><h3>${lang === 'zh' ? '客服提成汇总' : 'Customer Service Commission Summary'}</h3></div>${leadReportTable(reportRevenueJobs)}</div>
      <div class="panel"><div class="panel-head"><h3>${t('expenses')}</h3><button class="btn" onclick="setPage('expenses')">${t('viewAll')}</button></div>${expenseTable(false, reportExpenses)}</div>
    </div>`;
  },
  audit() {
    return panel(t('audit'), '', auditControls() + auditTable() + `<p class="note">${lang === 'zh' ? '这里记录系统内新增、修改、删除。可以按日期查询，防止重要数据被恶意修改或删除。' : 'This records create, edit, and delete actions. Filter by date to review system changes.'}</p>`);
  },
  users() {
    const actions = hasPerm('usersManage') ? `
      <div class="mini-actions">
        <button class="btn primary" onclick="openUser(null,'frontdesk')">${t('addFrontdesk')}</button>
        <button class="btn" onclick="openUser(null,'clerk')">${t('addClerk')}</button>
        <button class="btn" onclick="openUser()">${t('addNew')}</button>
      </div>` : '';
    return panel(t('users'), actions, userTable() + `<p class="note">${lang === 'zh' ? '入口：老板登录后点左侧“账号权限”，新增前台或文员账号，输入姓名、邮箱、临时密码，再勾选权限。建议每个人用自己的账号登录，不要共用老板账号。' : 'Entry point: owner logs in, opens Users & Roles, adds front desk or clerk accounts, enters name, email, temporary password, then selects permissions. Each employee should use their own login.'}</p>`);
  },
  settings() {
    return `<div class="panel">
      <div class="panel-head"><h3>${t('settings')}</h3><button class="btn" onclick="logout()">${t('logout')}</button></div>
      <div class="panel" style="box-shadow:none;margin-bottom:14px">
        <div class="panel-head"><h3>${lang === 'zh' ? '我的账号' : 'My Account'}</h3></div>
        <div class="form-grid">
          ${profileAvatarEditor(user, 'myAvatarDataUrl', 'myAvatarPreview', 'handleMyAvatarUpload(event)', 'clearMyAvatar()')}
          <label>${t('name')}<input id="myName" value="${escapeHtml(user.name || '')}" /></label>
          <label>${t('email')}<input id="myEmail" value="${escapeHtml(user.email || '')}" /></label>
          <div class="wide"><button class="btn primary" onclick="saveMyProfile()">${lang === 'zh' ? '保存我的账号' : 'Save My Account'}</button></div>
        </div>
      </div>
      <div class="form-grid">
        <label>${t('shopName')}<input id="shopName" value="${escapeHtml(state.settings.shopName)}" /></label>
        <label>${t('taxRate')}<input id="taxRate" type="number" value="${state.settings.taxRate}" /></label>
        <label>${t('monthlyCost')}<input id="monthlyFixedCost" type="number" value="${state.settings.monthlyFixedCost}" /></label>
        <label>${t('oldPassword')}<input id="oldPassword" type="password" /></label>
        <label>${t('newPassword')}<input id="newPassword" type="password" /></label>
        <div class="wide">
          <button class="btn primary" onclick="saveSettings()">${t('saveSettings')}</button>
          <button class="btn" onclick="changePassword()">${t('changePassword')}</button>
        </div>
      </div>
      <p class="note">${lang === 'zh' ? 'Mac/iPad 使用方式：浏览器打开系统网址后，Mac 可添加到 Dock，iPad 可点分享按钮后添加到主屏幕。系统会每天自动备份数据库，并保留最近 60 天。' : 'Mac/iPad: open the system URL in a browser. On Mac, add it to Dock. On iPad, use Share -> Add to Home Screen. The system creates a daily database backup and keeps the latest 60 days.'}</p>
      <div style="margin-top:14px">
        <button class="btn" onclick="showSystemInfo()">${t('showVersion')}</button>
        <button class="btn" onclick="checkUpdate()">${t('checkUpdate')}</button>
        <button class="btn" onclick="createManualBackup()">${lang === 'zh' ? '立即备份' : 'Backup Now'}</button>
        <button class="btn" onclick="showBackups()">${lang === 'zh' ? '查看/下载备份' : 'View Backups'}</button>
      </div>
    </div>`;
  }
};

function panel(title, action, content) {
  return `<div class="panel"><div class="panel-head"><h3>${title}</h3>${action}</div>${content}</div>`;
}

function userAvatarHtml(person, size = 'small') {
  const avatar = person?.avatarDataUrl || '';
  const name = person?.name || person?.email || '';
  const initial = String(name || '?').trim().charAt(0).toUpperCase() || '?';
  if (avatar) return `<img class="employee-avatar ${size}" src="${escapeHtml(avatar)}" alt="${escapeHtml(name)}" />`;
  return `<span class="employee-avatar ${size} fallback">${escapeHtml(initial)}</span>`;
}

function profileAvatarEditor(person, hiddenId, previewId, uploadHandler, clearHandler) {
  const label = lang === 'zh' ? '员工头像/工作照' : 'Employee Avatar / Work Photo';
  const upload = lang === 'zh' ? '上传头像' : 'Upload Photo';
  const clear = lang === 'zh' ? '清除头像' : 'Clear Photo';
  const note = lang === 'zh'
    ? '建议上传正脸清晰工作照，保存后会同步到云端，所有电脑和 iPad 都能看到。'
    : 'Use a clear work photo. After saving, it syncs to the cloud for all computers and iPads.';
  return `<div class="wide employee-avatar-field">
    <span>${label}</span>
    <div class="employee-avatar-editor">
      <div id="${previewId}" class="avatar-preview-wrap">${userAvatarHtml(person, 'large')}</div>
      <input id="${hiddenId}" type="hidden" value="${escapeHtml(person?.avatarDataUrl || '')}" />
      <label class="btn avatar-upload-btn">${upload}<input type="file" accept="image/png,image/jpeg,image/webp" onchange="${uploadHandler}" /></label>
      <button type="button" class="btn" onclick="${clearHandler}">${clear}</button>
    </div>
    <p class="note">${note}</p>
  </div>`;
}

function handleEmployeeAvatarUpload(event) {
  handleAvatarUpload(event, 'employeeAvatarDataUrl', 'employeeAvatarPreview');
}

function handleMyAvatarUpload(event) {
  handleAvatarUpload(event, 'myAvatarDataUrl', 'myAvatarPreview');
}

function clearEmployeeAvatar() {
  clearAvatar('employeeAvatarDataUrl', 'employeeAvatarPreview');
}

function clearMyAvatar() {
  clearAvatar('myAvatarDataUrl', 'myAvatarPreview');
}

function clearAvatar(hiddenId, previewId) {
  const hidden = document.getElementById(hiddenId);
  const preview = document.getElementById(previewId);
  if (hidden) hidden.value = '';
  if (preview) preview.innerHTML = userAvatarHtml({}, 'large');
}

function handleAvatarUpload(event, hiddenId, previewId) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
    alert(lang === 'zh' ? '请上传 JPG、PNG 或 WebP 图片。' : 'Please upload a JPG, PNG, or WebP image.');
    event.target.value = '';
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    alert(lang === 'zh' ? '原图太大，请上传 8MB 以内的照片。' : 'The original photo is too large. Please upload an image under 8MB.');
    event.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => compressAvatarDataUrl(String(reader.result || ''), 512, 0.82)
    .then(dataUrl => {
      if (dataUrl.length > 2 * 1024 * 1024) {
        alert(lang === 'zh' ? '头像压缩后仍然太大，请换一张更小的照片。' : 'The photo is still too large after compression. Please choose a smaller image.');
        return;
      }
      const hidden = document.getElementById(hiddenId);
      const preview = document.getElementById(previewId);
      if (hidden) hidden.value = dataUrl;
      if (preview) preview.innerHTML = userAvatarHtml({ avatarDataUrl: dataUrl }, 'large');
    })
    .catch(() => alert(lang === 'zh' ? '头像读取失败，请换一张照片。' : 'Could not read the photo. Please choose another image.'));
  reader.readAsDataURL(file);
}

function compressAvatarDataUrl(dataUrl, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(image.width || 1, image.height || 1));
      const width = Math.max(1, Math.round((image.width || maxSize) * scale));
      const height = Math.max(1, Math.round((image.height || maxSize) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function enhanceExpandablePanels() {
  document.querySelectorAll('#view .panel').forEach(panelEl => {
    const head = panelEl.querySelector(':scope > .panel-head');
    if (!head || head.classList.contains('subhead') || head.querySelector('.panel-expand')) return;
    const actionNodes = [...head.children].filter(child => child.tagName !== 'H3');
    let actions = head.querySelector(':scope > .panel-head-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'panel-head-actions';
      actionNodes.forEach(node => actions.appendChild(node));
      head.appendChild(actions);
    }
    const button = document.createElement('button');
    button.className = 'btn panel-expand';
    button.type = 'button';
    button.textContent = lang === 'zh' ? '放大' : 'Expand';
    button.onclick = () => openPanelZoom(panelEl);
    actions.prepend(button);
  });
}

function enhanceEditableTableRows(root = document) {
  if (!root) return;
  root.querySelectorAll('table tbody tr').forEach(row => {
    if (row.classList.contains('click-row') || row.classList.contains('editable-row')) return;
    const editButton = [...row.querySelectorAll('button.icon-btn')].find(button => button.textContent.trim() === '✎');
    if (!editButton) return;
    row.classList.add('editable-row');
    row.tabIndex = 0;
    row.addEventListener('click', event => {
      if (event.target.closest('button, a, input, select, textarea, label, [role="button"]')) return;
      editButton.click();
    });
    row.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.target !== row) return;
      event.preventDefault();
      editButton.click();
    });
  });
}

function openPanelZoom(panelEl) {
  const title = panelEl.querySelector(':scope > .panel-head h3')?.textContent || (lang === 'zh' ? '查看详情' : 'Details');
  const clone = panelEl.cloneNode(true);
  clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  document.getElementById('panelZoomTitle').textContent = title;
  const body = document.getElementById('panelZoomBody');
  body.innerHTML = '';
  body.appendChild(clone);
  enhanceEditableTableRows(clone);
  document.getElementById('panelZoom').classList.add('open');
}

function openImagePreview(src, title = '') {
  document.getElementById('panelZoomTitle').textContent = title || (lang === 'zh' ? '查看图片' : 'Image');
  const body = document.getElementById('panelZoomBody');
  body.innerHTML = `<div class="image-preview-wrap"><img src="${src}" alt="${escapeHtml(title || 'image')}" /></div>`;
  document.getElementById('panelZoom').classList.add('open', 'image-preview-open');
}

function closePanelZoom() {
  const modal = document.getElementById('panelZoom');
  if (!modal) return;
  modal.classList.remove('open', 'image-preview-open');
  document.getElementById('panelZoomBody').innerHTML = '';
}

function jobFilterControls() {
  const range = activeJobDateRange();
  return `<div class="search-row">
    <label style="margin:0">${t('quickDate')}<select onchange="setJobDatePreset(this.value)">
      ${[['week', t('lastWeek')], ['month', t('lastMonth')], ['year', t('lastYear')], ['custom', t('customRange')]].map(option => `<option value="${option[0]}" ${jobDatePreset === option[0] ? 'selected' : ''}>${option[1]}</option>`).join('')}
    </select></label>
    <label style="margin:0">${t('startDate')}<input type="date" value="${escapeHtml(range.start)}" onchange="setJobDateRange('start', this.value)" /></label>
    <label style="margin:0">${t('endDate')}<input type="date" value="${escapeHtml(range.end)}" onchange="setJobDateRange('end', this.value)" /></label>
    <label style="margin:0">${t('filterPlatform')}<select onchange="setJobSourceFilter(this.value)">${jobSourceOptions().map(option => `<option value="${escapeHtml(option[0])}" ${jobSourceFilter === option[0] ? 'selected' : ''}>${escapeHtml(option[1])}</option>`).join('')}</select></label>
    <label style="margin:0">${t('filterPerson')}<select onchange="setJobPersonFilter(this.value)">${jobPersonOptions().map(option => `<option value="${escapeHtml(option[0])}" ${jobPersonFilter === option[0] ? 'selected' : ''}>${escapeHtml(option[1])}</option>`).join('')}</select></label>
  </div>`;
}

function expenseAppliesToDateRange(expense, range = activeJobDateRange()) {
  if (!expense) return false;
  const start = range.start || '0000-00-00';
  const end = range.end || '9999-99-99';
  const adStart = String(expense.adStartDate || '').trim();
  const adEnd = String(expense.adEndDate || '').trim();
  if (adStart || adEnd) {
    const rangeStart = adStart || adEnd;
    const rangeEnd = adEnd || adStart;
    return rangeStart <= end && rangeEnd >= start;
  }
  const date = String(expense.date || '').slice(0, 10);
  return (!range.start || date >= range.start) && (!range.end || date <= range.end);
}

function sourceStatsTable(jobs, label = jobFilterDateLabel()) {
  const rowsByKey = new Map();
  revenueJobs(jobs).forEach(job => {
    const label = canonicalSourceLabel(job.source);
    const key = normalizeSourceKey(label);
    if (!rowsByKey.has(key)) rowsByKey.set(key, { source: label, count: 0, revenue: 0, adSpend: 0 });
    const row = rowsByKey.get(key);
    row.count += 1;
    row.revenue += Number(job.price || 0);
  });
  (state.expenses || []).filter(expense => {
    if (expense.category !== '广告投放') return false;
    const key = normalizeSourceKey(canonicalSourceLabel(expense.adPlacement || expense.vendor || expense.note || ''));
    if (jobSourceFilter && key !== jobSourceFilter) return false;
    return expenseAppliesToDateRange(expense);
  }).forEach(expense => {
    const label = canonicalSourceLabel(expense.adPlacement || expense.vendor || expense.note || '');
    const key = normalizeSourceKey(label);
    if (!rowsByKey.has(key)) rowsByKey.set(key, { source: label || (lang === 'zh' ? '未填写' : 'Unspecified'), count: 0, revenue: 0, adSpend: 0 });
    rowsByKey.get(key).adSpend += Number(expense.amount || 0);
  });
  const rows = [...rowsByKey.values()].sort((a, b) => b.revenue - a.revenue || b.adSpend - a.adSpend || a.source.localeCompare(b.source));
  const total = rows.reduce((sum, row) => ({
    count: sum.count + row.count,
    revenue: sum.revenue + row.revenue,
    adSpend: sum.adSpend + row.adSpend
  }), { count: 0, revenue: 0, adSpend: 0 });
  const title = lang === 'zh' ? `${label} 来源渠道统计` : `${label} Source Channel Summary`;
  return `<div class="mini-section"><h4>${title}</h4><div class="table-wrap"><table><thead><tr><th>${t('source')}</th><th>${lang === 'zh' ? '订单数' : 'Jobs'}</th><th>${lang === 'zh' ? '施工收入' : 'Job Revenue'}</th><th>${lang === 'zh' ? '收入占比' : 'Revenue Share'}</th><th>${lang === 'zh' ? '广告投入' : 'Ad Spend'}</th><th>${lang === 'zh' ? '收益/投入比' : 'Revenue / Spend'}</th></tr></thead><tbody>
    ${rows.map(row => `<tr><td>${escapeHtml(row.source)}</td><td>${row.count}</td><td>${currency.format(row.revenue)}</td><td>${percentText(total.revenue ? row.revenue / total.revenue : 0)}</td><td>${currency.format(row.adSpend)}</td><td>${sourceRoiText(row)}</td></tr>`).join('')}
    ${rows.length ? `<tr class="total-row"><td>${lang === 'zh' ? '总计' : 'Total'}</td><td>${total.count}</td><td>${currency.format(total.revenue)}</td><td>${percentText(total.revenue ? 1 : 0)}</td><td>${currency.format(total.adSpend)}</td><td>${sourceRoiText(total)}</td></tr>` : `<tr><td colspan="6" class="note">${lang === 'zh' ? '还没有来源数据。' : 'No source data yet.'}</td></tr>`}
  </tbody></table></div></div>`;
}

function jobRevenueDetailTable(jobs) {
  const rows = sortByDateFieldDesc(revenueJobs(jobs), 'date');
  const totalPrice = rows.reduce((sum, job) => sum + Number(job.price || 0), 0);
  const totalPaid = rows.reduce((sum, job) => sum + jobPaidAmount(job), 0);
  const noData = lang === 'zh' ? '当前筛选范围内没有已开始施工的收入。' : 'No started job revenue in the current filter.';
  const note = lang === 'zh'
    ? '统计口径：只算施工中、待质检、已交车等已经开始施工的订单；排期、返工、取消、无效不计入施工收入。'
    : 'Rule: counts started jobs only. Scheduled, rework, canceled, and invalid jobs are excluded from job revenue.';
  return `<div class="table-wrap"><table><thead><tr>
    <th>${t('date')}</th>
    <th>${lang === 'zh' ? '施工日期' : 'Install Date'}</th>
    <th>${t('customer')}</th>
    <th>${t('source')}</th>
    <th>${t('status')}</th>
    <th>${lang === 'zh' ? '施工收入' : 'Job Revenue'}</th>
    <th>${lang === 'zh' ? '已收' : 'Paid'}</th>
    <th>${lang === 'zh' ? '付款情况' : 'Payment Status'}</th>
    <th>${lang === 'zh' ? '付款方式' : 'Payment Method'}</th>
  </tr></thead><tbody>
    ${rows.map(job => `<tr>
      <td>${escapeHtml(job.date || '')}</td>
      <td>${escapeHtml(job.scheduleDate || '-')}</td>
      <td>${escapeHtml(job.customer || '')}<br><small>${escapeHtml(job.phone || '')}</small></td>
      <td>${escapeHtml(canonicalSourceLabel(job.source))}</td>
      <td>${statusPill(job.status)}</td>
      <td>${currency.format(Number(job.price || 0))}</td>
      <td>${currency.format(jobPaidAmount(job))}</td>
      <td>${paymentStatusPill(job)}</td>
      <td>${escapeHtml(paymentMethodName(job.paymentMethod) || (lang === 'zh' ? '未填写' : 'Not Set'))}</td>
    </tr>`).join('')}
    ${rows.length ? `<tr class="total-row">
      <td colspan="5">${lang === 'zh' ? '总计' : 'Total'}</td>
      <td>${currency.format(totalPrice)}</td>
      <td>${currency.format(totalPaid)}</td>
      <td colspan="2"></td>
    </tr>` : `<tr><td colspan="9" class="note">${noData}</td></tr>`}
  </tbody></table></div><p class="note">${note}</p>`;
}

function sourceRoiText(row) {
  if (!Number(row.adSpend || 0)) return Number(row.revenue || 0) ? (lang === 'zh' ? '未填写投入' : 'No spend') : '-';
  return `${(Number(row.revenue || 0) / Number(row.adSpend || 0)).toFixed(2)}x`;
}

function canonicalSourceLabel(value) {
  const raw = String(value || '').trim();
  const key = normalizeSourceKey(raw);
  if (!key) return lang === 'zh' ? '未填写' : 'Unspecified';
  const labels = {
    yelp: 'Yelp',
    google: 'Google',
    meta: 'Meta / Facebook',
    instagram: 'Instagram',
    website: 'Website',
    phone: 'Phone Call',
    walkin: 'Walk-in',
    referral: 'Referral'
  };
  return labels[key] || raw;
}

function normalizeSourceKey(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  if (text.includes('yelp')) return 'yelp';
  if (text.includes('google')) return 'google';
  if (text.includes('meta') || text.includes('facebook') || text === 'fb') return 'meta';
  if (text.includes('instagram') || text === 'ig') return 'instagram';
  if (text.includes('website') || text.includes('web') || text.includes('官网')) return 'website';
  if (text.includes('phone') || text.includes('电话')) return 'phone';
  if (text.includes('walk') || text.includes('自然') || text.includes('到店')) return 'walkin';
  if (text.includes('referral') || text.includes('介绍') || text.includes('转介绍')) return 'referral';
  return text;
}

function jobTable(rows, actions = false) {
  const financeCols = `<th>${t('paymentStatus')}</th>${canSeeFinance() ? `<th>${t('gross')}</th>` : ''}`;
  const colSpan = 14 + (canSeeFinance() ? 1 : 0) + (actions ? 1 : 0);
  return `<div class="table-wrap"><table><thead><tr><th>${t('date')}</th><th>${t('scheduleDate')}</th><th>${t('customer')}</th><th>${t('source')}</th><th>${t('vehicle')}</th><th>${t('leadGroupRep')}</th><th>${t('receptionRep')}</th><th>${t('salesRep')}</th><th>${t('formFilledBy')}</th><th>${t('service')}</th><th>${t('tech')}</th><th>${t('status')}</th><th>${t('quote')}</th>${financeCols}${actions ? '<th></th>' : ''}</tr></thead><tbody>
  ${rows.map(j => {
    const c = jobCalc(j);
    const financeCells = `<td>${paymentStatusPill(j)}</td>${canSeeFinance() ? `<td>${currency.format(c.gross)}</td>` : ''}`;
    const rowClick = actions && hasPerm('jobsEdit') ? ` onclick="openJob('${j.id}')" class="click-row"` : '';
    return `<tr${rowClick}><td>${j.date}</td><td>${escapeHtml(j.scheduleDate || '')}</td><td>${escapeHtml(j.customer)}<br><span class="note">${escapeHtml(j.phone || '')}</span></td><td>${escapeHtml(j.source || '')}</td><td>${escapeHtml(j.vehicle)}</td><td>${escapeHtml(repName(j.leadRepId))}</td><td>${escapeHtml(repName(j.receptionRepId))}</td><td>${escapeHtml(j.salesRep || '')}</td><td>${escapeHtml(j.preparedBy || '')}</td><td>${escapeHtml(serviceLabelList(j))} · ${escapeHtml(j.package)}</td><td>${escapeHtml(jobInstallerNames(j))}</td><td>${statusPill(j.status)}</td><td>${currency.format(c.price)}</td>${financeCells}${actions ? actionCell('Job', 'jobs', j.id) : ''}</tr>`;
  }).join('')}
  ${rows.length ? '' : `<tr><td colspan="${colSpan}" class="note">${lang === 'zh' ? '没有匹配的施工单。' : 'No matching job orders.'}</td></tr>`}
  </tbody></table></div>`;
}

function installerTable() {
  const payCols = canSeeLabor() ? `<th>${t('mode')}</th><th>${t('tint')}</th><th>${t('ppf')}</th><th>${t('wrap')}</th><th>${t('basePay')}</th><th>${lang === 'zh' ? '月任务积分' : 'Monthly Quota'}</th>` : '';
  return `<div class="table-wrap"><table><thead><tr><th>${t('name')}</th><th>${t('city')}</th><th>${t('skills')}</th>${payCols}<th></th></tr></thead><tbody>
  ${state.installers.map(x => {
    const payCells = canSeeLabor() ? `<td>${modeName(x.mode)}</td><td>${feeText(x, 'tint')}</td><td>${feeText(x, 'ppf')}</td><td>${feeText(x, 'wrap')}</td><td>${currency.format(Number(x.base || 0))}</td><td>${x.mode === 'basePlus' ? Number(x.baseQuota || 20) : '-'}</td>` : '';
    return `<tr><td>${escapeHtml(x.name)}<br><span class="note">${escapeHtml(x.phone || '')}</span></td><td>${escapeHtml(x.city || '')}</td><td>${escapeHtml(x.skills || '')}</td>${payCells}${actionCell('Installer','installers',x.id)}</tr>`;
  }).join('')}
  </tbody></table></div>`;
}

function priceRuleTable() {
  const costHead = canSeeFinance() ? `<th>${t('materialCost')}</th>` : '';
  return `<div class="table-wrap"><table><thead><tr><th>${t('service')}</th><th>${t('vehicleClass')}</th><th>${t('package')}</th><th>${t('basePrice')}</th>${costHead}<th>${t('hours')}</th><th></th></tr></thead><tbody>
  ${state.priceRules.map(x => `<tr><td>${serviceNames[x.service]}</td><td>${escapeHtml(x.vehicleClass)}</td><td>${escapeHtml(x.package)}</td><td>${currency.format(Number(x.base || 0))}</td>${canSeeFinance() ? `<td>${currency.format(Number(x.materialCost || 0))}</td>` : ''}<td>${x.hours || 0} h</td>${actionCell('PriceRule','priceRules',x.id)}</tr>`).join('')}
  </tbody></table></div>`;
}

function productTable(rows, actions = false) {
  const costHead = canSeeFinance() ? `<th>${t('cost')}</th>` : '';
  return `<div class="table-wrap"><table><thead><tr><th>${t('sku')}</th><th>${t('productName')}</th><th>${t('category')}</th><th>${t('stock')}</th>${costHead}<th>${t('retailPrice')}</th><th>${t('wholesalePrice')}</th><th>${t('minSalePrice')}</th>${actions ? '<th></th>' : ''}</tr></thead><tbody>
  ${rows.map(p => `<tr><td>${escapeHtml(p.sku)}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.category)}</td><td>${stockPill(p)} ${Number(p.qty || 0).toLocaleString()} ${escapeHtml(p.unit)}</td>${canSeeFinance() ? `<td>${currency.format(Number(p.cost || 0))}</td>` : ''}<td>${currency.format(Number(p.price || 0))}</td><td>${currency.format(Number(p.wholesale || 0))}</td><td>${currency.format(productMinimumSalePrice(p))}</td>${actions ? actionCell('Product','products',p.id) : ''}</tr>`).join('')}
  ${rows.length ? '' : `<tr><td colspan="${actions ? (canSeeFinance() ? 9 : 8) : (canSeeFinance() ? 8 : 7)}" class="note">${lang === 'zh' ? '没有库存商品。' : 'No inventory items.'}</td></tr>`}
  </tbody></table></div>`;
}

function stockAlertProducts() {
  return state.products
    .filter(p => Number(p.reorder || 0) > 0 && Number(p.qty || 0) <= Number(p.reorder || 0))
    .sort((a, b) => (Number(a.qty || 0) - Number(a.reorder || 0)) - (Number(b.qty || 0) - Number(b.reorder || 0)));
}

function inventoryAlertTable(actions = true, limit = null, useSearch = false) {
  const rows = (useSearch ? searchedProducts(stockAlertProducts()) : stockAlertProducts()).slice(0, limit || undefined);
  const actionHead = actions && hasPerm('inventoryEdit') ? '<th></th>' : '';
  return `<div class="table-wrap"><table><thead><tr><th>${t('sku')}</th><th>${t('productName')}</th><th>${t('category')}</th><th>${t('stock')}</th><th>${t('minStock')}</th><th>${t('reorderQty')}</th><th>${t('location')}</th>${actionHead}</tr></thead><tbody>
  ${rows.map(p => {
    const qty = Number(p.qty || 0);
    const reorder = Number(p.reorder || 0);
    const reorderQty = Math.max(reorder - qty, 0);
    const action = actions && hasPerm('inventoryEdit') ? `<td><button class="btn" onclick="openMovementForSku('${escapeJs(p.sku)}','in',${reorderQty || 1})">${lang === 'zh' ? '补货入库' : 'Restock'}</button></td>` : '';
    return `<tr><td>${escapeHtml(p.sku)}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.category)}</td><td>${stockPill(p)} ${qty.toLocaleString()} ${escapeHtml(p.unit || '')}</td><td>${reorder.toLocaleString()} ${escapeHtml(p.unit || '')}</td><td>${reorderQty.toLocaleString()} ${escapeHtml(p.unit || '')}</td><td>${escapeHtml(p.location || '')}</td>${action}</tr>`;
  }).join('')}
  ${rows.length ? '' : `<tr><td colspan="${actions && hasPerm('inventoryEdit') ? 8 : 7}" class="note">${t('noStockAlerts')}</td></tr>`}
  </tbody></table></div>`;
}

function movementTable() {
  const rows = sortByDateDesc(state.movements || []).slice(0, 60);
  return `<div class="table-wrap"><table><thead><tr><th>${t('date')}</th><th>${t('sku')}</th><th>${t('type')}</th><th>${t('qty')}</th><th>${t('note')}</th></tr></thead><tbody>
  ${rows.map(m => `<tr><td>${m.date}</td><td>${escapeHtml(m.sku)}</td><td>${m.type === 'in' ? `<span class="pill good">${t('in')}</span>` : `<span class="pill warn">${t('out')}</span>`}</td><td>${Number(m.qty || 0).toLocaleString()}</td><td>${escapeHtml(m.note || '')}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function workshopStockQty(sku) {
  return (state.workshopMovements || [])
    .filter(movement => String(movement.sku || '') === String(sku || ''))
    .reduce((sum, movement) => {
      const qty = Number(movement.qty || 0);
      if (movement.type === 'transfer') return sum + qty;
      if (movement.type === 'consume') return sum - qty;
      return sum;
    }, 0);
}

function workshopStockRows() {
  const touched = new Set((state.workshopMovements || []).map(movement => movement.sku).filter(Boolean));
  return (state.products || [])
    .map(product => ({ product, workshopQty: workshopStockQty(product.sku), touched: touched.has(product.sku) }))
    .filter(row => row.workshopQty > 0 || row.touched)
    .sort((a, b) => b.workshopQty - a.workshopQty || String(a.product.sku).localeCompare(String(b.product.sku)));
}

function workshopStockTable() {
  const rows = workshopStockRows();
  return `<div class="table-wrap"><table><thead><tr><th>${t('sku')}</th><th>${t('productName')}</th><th>${t('category')}</th><th>${t('mainWarehouseStock')}</th><th>${t('workshopCurrentStock')}</th></tr></thead><tbody>
  ${rows.map(row => `<tr><td>${escapeHtml(row.product.sku)}</td><td>${escapeHtml(row.product.name || '')}</td><td>${escapeHtml(row.product.category || '')}</td><td>${Number(row.product.qty || 0).toLocaleString()} ${escapeHtml(row.product.unit || '')}</td><td><span class="pill ${row.workshopQty > 0 ? 'good' : 'warn'}">${Number(row.workshopQty || 0).toLocaleString()} ${t('meter')}</span></td></tr>`).join('')}
  ${rows.length ? '' : `<tr><td colspan="5" class="note">${lang === 'zh' ? '贴膜间还没有库存。点击“领料到贴膜间”开始登记。' : 'No workshop stock yet. Use Issue to Workshop to start.'}</td></tr>`}
  </tbody></table></div>`;
}

function workshopMovementTypeName(type) {
  if (type === 'transfer') return `<span class="pill good">${t('workshopTransfer')}</span>`;
  if (type === 'consume') return `<span class="pill warn">${t('workshopConsume')}</span>`;
  return escapeHtml(type || '');
}

function workshopMovementTable() {
  const rows = sortByDateDesc(state.workshopMovements || []).slice(0, 80);
  return `<div class="table-wrap"><table><thead><tr><th>${t('date')}</th><th>${t('sku')}</th><th>${t('type')}</th><th>${t('qtyMeters')}</th><th>${t('operator')}</th><th>${t('workshopUsage')}</th><th>${t('note')}</th></tr></thead><tbody>
  ${rows.map(movement => `<tr><td>${escapeHtml(movement.date || '')}</td><td>${escapeHtml(movement.sku || '')}</td><td>${workshopMovementTypeName(movement.type)}</td><td>${Number(movement.qty || 0).toLocaleString()} ${t('meter')}</td><td>${escapeHtml(movement.operator || movement.createdBy || '')}</td><td>${escapeHtml(movement.jobCustomer || '')}</td><td>${escapeHtml(movement.note || '')}</td></tr>`).join('')}
  ${rows.length ? '' : `<tr><td colspan="7" class="note">${lang === 'zh' ? '还没有贴膜间库存流水。' : 'No workshop inventory movements yet.'}</td></tr>`}
  </tbody></table></div>`;
}

function salesOrderTable() {
  const rows = sortByDateDesc(state.salesOrders || []);
  return `<div class="table-wrap"><table><thead><tr><th>${t('date')}</th><th>${t('type')}</th><th>${t('customer')}</th><th>${t('orderSalesRep')}</th><th>${t('preparedBy')}</th><th>${t('item')}</th><th>${t('qty')}</th><th>${lang === 'zh' ? '总额' : 'Total'}</th><th>${t('paid')}</th><th>${t('paymentMethod')}</th><th>${t('orderTrackingNo')}</th><th>${t('balance')}</th><th>${t('status')}</th><th></th></tr></thead><tbody>
  ${rows.map(o => { const c = orderCalc(o); return `<tr><td>${o.date}</td><td>${salesOrderTypeName(o.type)}</td><td>${escapeHtml(o.customer)}</td><td>${escapeHtml(o.salesRep || '')}</td><td>${escapeHtml(o.preparedBy || '')}</td><td>${escapeHtml(salesOrderItemLabel(o.item))}</td><td>${Number(o.qty || 0)}</td><td>${currency.format(c.total)}</td><td>${currency.format(Number(o.paid || 0))}</td><td>${escapeHtml(paymentMethodName(o.paymentMethod || ''))}</td><td>${escapeHtml(o.trackingNo || '')}</td><td>${currency.format(c.balance)}</td><td>${statusPill(o.status)}</td>${actionCell('SalesOrder','salesOrders',o.id)}</tr>`; }).join('')}
  </tbody></table></div>`;
}

function shipmentTable() {
  const rows = [...(state.shipments || [])].sort((a, b) => String(b.etaLasVegas || b.etaPort || b.departDate || '').localeCompare(String(a.etaLasVegas || a.etaPort || a.departDate || '')));
  return `<div class="table-wrap"><table><thead><tr><th>${t('shipmentMethod')}</th><th>${t('shipmentItems')}</th><th>${t('qty')}</th><th>${t('supplier')}</th><th>${t('trackingNo')}</th><th>${t('departDate')}</th><th>${t('etaPort')}</th><th>${t('etaLasVegas')}</th><th>${t('status')}</th><th>${t('note')}</th><th></th></tr></thead><tbody>
  ${rows.map(s => `<tr><td>${shipmentMethodName(s.method)}</td><td>${escapeHtml(s.items || '')}</td><td>${escapeHtml(s.qty || '')}</td><td>${escapeHtml(s.supplier || '')}<br><span class="note">${escapeHtml(s.contact || '')}</span></td><td>${escapeHtml(s.trackingNo || '')}<br><span class="note">${escapeHtml(s.shipFrom || '')}</span></td><td>${escapeHtml(s.departDate || '')}</td><td>${escapeHtml(s.etaPort || '')}</td><td>${escapeHtml(s.etaLasVegas || '')}</td><td>${statusPill(s.status || '在途')}</td><td>${escapeHtml(s.note || '')}</td>${actionCell('Shipment','shipments',s.id)}</tr>`).join('')}
  ${rows.length ? '' : `<tr><td colspan="11" class="note">${lang === 'zh' ? '目前没有在途货物。' : 'No inbound shipments right now.'}</td></tr>`}
  </tbody></table></div>`;
}

function scheduleControls() {
  return `<div class="search-row">
    <label style="margin:0">${lang === 'zh' ? '统计月份' : 'Month'}<input type="month" value="${escapeHtml(scheduleMonth)}" onchange="setScheduleMonth(this.value)" /></label>
  </div>`;
}

function setScheduleMonth(value) {
  scheduleMonth = value || today().slice(0, 7);
  render();
}

function scheduleTypeName(type) {
  return {
    work: lang === 'zh' ? '上班' : 'Work',
    makeup: lang === 'zh' ? '补班' : 'Makeup Work',
    off: lang === 'zh' ? '休息' : 'Off',
    adjustedRest: lang === 'zh' ? '调休' : 'Adjusted Rest'
  }[type] || type || '';
}

function scheduleTypePill(type) {
  const cls = type === 'work' || type === 'makeup' ? 'good' : type === 'adjustedRest' ? 'warn' : '';
  return `<span class="pill ${cls}">${scheduleTypeName(type)}</span>`;
}

function scheduleMonthRows() {
  return (state.schedules || []).filter(row => String(row.date || '').startsWith(scheduleMonth)).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function scheduleStatsRows() {
  const employees = (state.users || []).filter(user => user.active && user.role !== 'owner');
  return employees.map(employee => {
    const rows = scheduleMonthRows().filter(row => row.employeeId === employee.id);
    return {
      employee,
      work: rows.filter(row => row.type === 'work' || row.type === 'makeup').length,
      makeup: rows.filter(row => row.type === 'makeup').length,
      adjustedRest: rows.filter(row => row.type === 'adjustedRest').length,
      off: rows.filter(row => row.type === 'off').length
    };
  }).filter(row => row.work || row.makeup || row.adjustedRest || row.off);
}

function scheduleStatsTable() {
  const rows = scheduleStatsRows();
  return `<div class="table-wrap"><table><thead><tr><th>${t('name')}</th><th>${t('email')}</th><th>${t('workDays')}</th><th>${t('makeupDays')}</th><th>${t('adjustedRestDays')}</th><th>${lang === 'zh' ? '休息天数' : 'Off Days'}</th></tr></thead><tbody>
  ${rows.map(row => `<tr><td>${escapeHtml(row.employee.name)}</td><td>${escapeHtml(row.employee.email || '')}</td><td>${row.work}</td><td>${row.makeup}</td><td>${row.adjustedRest}</td><td>${row.off}</td></tr>`).join('')}
  ${rows.length ? '' : `<tr><td colspan="6" class="note">${lang === 'zh' ? '这个月份还没有排班/调休记录。' : 'No schedule records for this month.'}</td></tr>`}
  </tbody></table></div>`;
}

function scheduleTable() {
  const rows = scheduleMonthRows();
  return `<div class="table-wrap"><table><thead><tr><th>${t('date')}</th><th>${t('name')}</th><th>${t('email')}</th><th>${t('scheduleType')}</th><th>${t('shift')}</th><th>${lang === 'zh' ? '原因' : 'Reason'}</th><th>${t('note')}</th><th></th></tr></thead><tbody>
  ${rows.map(row => `<tr><td>${escapeHtml(row.date || '')}</td><td>${escapeHtml(row.employeeName || '')}</td><td>${escapeHtml(row.email || '')}</td><td>${scheduleTypePill(row.type)}</td><td>${escapeHtml(row.shift || '')}</td><td>${escapeHtml(row.reason || '')}</td><td>${escapeHtml(row.note || '')}</td>${actionCell('Schedule','schedules',row.id)}</tr>`).join('')}
  ${rows.length ? '' : `<tr><td colspan="8" class="note">${lang === 'zh' ? '还没有排班/调休记录。' : 'No schedule records yet.'}</td></tr>`}
  </tbody></table></div>`;
}

function scheduleReminderTable() {
  const rows = [...(state.scheduleReminderLogs || [])].sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 20);
  return `<div class="table-wrap"><table><thead><tr><th>${lang === 'zh' ? '发送时间' : 'Sent At'}</th><th>${t('date')}</th><th>${t('name')}</th><th>${t('email')}</th><th>${t('status')}</th><th>${t('note')}</th></tr></thead><tbody>
  ${rows.map(row => `<tr><td>${row.at ? new Date(row.at).toLocaleString() : ''}</td><td>${escapeHtml(row.date || '')}</td><td>${escapeHtml(row.employeeName || '')}</td><td>${escapeHtml(row.email || '')}</td><td>${statusPill(row.status || '')}</td><td>${escapeHtml(row.error || row.providerId || '')}</td></tr>`).join('')}
  ${rows.length ? '' : `<tr><td colspan="6" class="note">${lang === 'zh' ? '还没有邮件提醒记录。' : 'No reminder logs yet.'}</td></tr>`}
  </tbody></table></div>`;
}

function expenseTable(actions = true, sourceRows = state.expenses || []) {
  const rows = sortByDateDesc(sourceRows);
  const total = rows.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  return `<div class="table-wrap"><table><thead><tr><th>${t('date')}</th><th>${t('expenseCategory')}</th><th>${t('vendor')}</th><th>${t('adPlacement')}</th><th>${t('adPeriod')}</th><th>${t('amount')}</th><th>${t('recurring')}</th><th>${t('note')}</th>${actions ? '<th></th>' : ''}</tr></thead><tbody>
  ${rows.map(e => `<tr><td>${escapeHtml(e.date || '')}</td><td>${escapeHtml(e.category || '')}</td><td>${escapeHtml(e.vendor || '')}</td><td>${escapeHtml(e.adPlacement || '')}</td><td>${escapeHtml(expenseAdPeriod(e))}</td><td>${currency.format(Number(e.amount || 0))}</td><td>${e.recurring ? `<span class="pill good">${lang === 'zh' ? '是' : 'Yes'}</span>` : `<span class="pill">${lang === 'zh' ? '否' : 'No'}</span>`}</td><td>${escapeHtml(e.note || '')}</td>${actions ? actionCell('Expense','expenses',e.id) : ''}</tr>`).join('')}
  ${rows.length ? `<tr class="total-row"><td colspan="5">${lang === 'zh' ? '总计' : 'Total'}</td><td>${currency.format(total)}</td><td></td><td></td>${actions ? '<td></td>' : ''}</tr>` : ''}
  ${rows.length ? '' : `<tr><td colspan="${actions ? 9 : 8}" class="note">${lang === 'zh' ? '还没有运营成本记录。' : 'No operating cost records yet.'}</td></tr>`}
  </tbody></table></div>`;
}

function expenseAdPeriod(expense) {
  if (!expense.adStartDate && !expense.adEndDate) return '';
  if (expense.adStartDate && expense.adEndDate) return `${expense.adStartDate} - ${expense.adEndDate}`;
  return expense.adStartDate || expense.adEndDate || '';
}

function leadKpiCards() {
  const total = (state.leads || []).filter(isValidLead).length;
  const arrived = (state.leads || []).filter(isArrivedLead).length;
  const closed = (state.leads || []).filter(isClosedLead).length;
  const arrivalRate = total ? arrived / total : 0;
  const closeRate = arrived ? closed / arrived : 0;
  return `
    <div class="stat"><span>${t('leadsCount')}</span><strong>${total}</strong></div>
    <div class="stat"><span>${t('arrivalRate')} ${t('target')} 30%</span><strong>${percentText(arrivalRate)}</strong></div>
    <div class="stat"><span>${t('closeRate')} ${t('target')} 50%</span><strong>${percentText(closeRate)}</strong></div>
    <div class="stat"><span>${t('totalCommission')}</span><strong>${canSeeCommission() ? currency.format(leadReportRows().reduce((sum, row) => sum + row.commission, 0)) : hiddenValue()}</strong></div>`;
}

function leadReportRows(jobsSource = state.jobs || []) {
  return (state.customerServiceReps || []).map(rep => {
    const jobs = (jobsSource || []).filter(job => job.leadRepId === rep.id || job.receptionRepId === rep.id);
    const closedJobs = jobs.filter(isCommissionableJob);
    const leadJobs = jobs.filter(job => job.leadRepId === rep.id);
    const receptionJobs = jobs.filter(job => job.receptionRepId === rep.id);
    const leadCommissionTotal = leadJobs.reduce((sum, job) => sum + jobRepCommission(job, rep), 0);
    const receptionCommissionTotal = receptionJobs.reduce((sum, job) => sum + jobRepCommission(job, rep), 0);
    const arrivalRate = jobs.length ? closedJobs.length / jobs.length : 0;
    const closeRate = arrivalRate;
    return { rep, total: jobs.length, arrived: closedJobs.length, closed: closedJobs.length, arrivalRate, closeRate, leadCommissionTotal, receptionCommissionTotal, commission: leadCommissionTotal + receptionCommissionTotal };
  });
}

function leadReportTable(jobsSource = state.jobs || []) {
  const rows = leadReportRows(jobsSource);
  const payHead = canSeeCommission() ? `<th>${t('leadGroupRep')}</th><th>${t('receptionRep')}</th><th>${t('totalCommission')}</th>` : '';
  const total = rows.reduce((sum, row) => ({
    total: sum.total + row.total,
    arrived: sum.arrived + row.arrived,
    closed: sum.closed + row.closed,
    leadCommissionTotal: sum.leadCommissionTotal + row.leadCommissionTotal,
    receptionCommissionTotal: sum.receptionCommissionTotal + row.receptionCommissionTotal,
    commission: sum.commission + row.commission
  }), { total: 0, arrived: 0, closed: 0, leadCommissionTotal: 0, receptionCommissionTotal: 0, commission: 0 });
  const totalArrivalRate = total.total ? total.arrived / total.total : 0;
  const totalCloseRate = total.total ? total.closed / total.total : 0;
  return `<div class="table-wrap"><table><thead><tr><th>${t('customerService')}</th><th>${t('leadsCount')}</th><th>${t('arrivedCount')}</th><th>${t('closedCount')}</th><th>${t('arrivalRate')}</th><th>${t('closeRate')}</th>${payHead}</tr></thead><tbody>
  ${rows.map(row => `<tr><td>${escapeHtml(row.rep.name)}</td><td>${row.total}</td><td>${row.arrived}</td><td>${row.closed}</td><td>${ratePill(row.arrivalRate, Number(row.rep.arrivalTarget || 30) / 100)}</td><td>${ratePill(row.closeRate, Number(row.rep.closeTarget || 50) / 100)}</td>${canSeeCommission() ? `<td>${currency.format(row.leadCommissionTotal)}</td><td>${currency.format(row.receptionCommissionTotal)}</td><td>${currency.format(row.commission)}</td>` : ''}</tr>`).join('')}
  ${rows.length ? `<tr class="total-row"><td>${lang === 'zh' ? '总计' : 'Total'}</td><td>${total.total}</td><td>${total.arrived}</td><td>${total.closed}</td><td>${percentText(totalArrivalRate)}</td><td>${percentText(totalCloseRate)}</td>${canSeeCommission() ? `<td>${currency.format(total.leadCommissionTotal)}</td><td>${currency.format(total.receptionCommissionTotal)}</td><td>${currency.format(total.commission)}</td>` : ''}</tr>` : ''}
  ${rows.length ? '' : `<tr><td colspan="${canSeeCommission() ? 9 : 6}" class="note">${lang === 'zh' ? '还没有客服提成规则。' : 'No commission rules yet.'}</td></tr>`}
  </tbody></table></div>`;
}

function customerServiceRepTable() {
  const payHead = canSeeCommission() ? `<th>${t('inviteCommission')}</th><th>${t('closeCommission')}</th>` : '';
  const detailHead = canSeeCommission() ? `<th>${lang === 'zh' ? '规则细则' : 'Rule Detail'}</th><th>${t('note')}</th>` : '';
  return `<div class="table-wrap"><table><thead><tr><th>${t('name')}</th><th>${t('role')}</th><th>${t('commissionPlan')}</th>${payHead}${detailHead}<th>${t('active')}</th><th></th></tr></thead><tbody>
  ${(state.customerServiceReps || []).map(rep => `<tr><td>${escapeHtml(rep.name)}</td><td>${escapeHtml(rep.role || '')}</td><td>${commissionPlanName(rep.plan)}</td>${canSeeCommission() ? `<td>${currency.format(Number(rep.invitePay || 0))}</td><td>${currency.format(Number(rep.closePay || 0))}</td><td>${escapeHtml(rep.ruleDetail || '')}</td><td>${escapeHtml(rep.note || '')}</td>` : ''}<td>${rep.active !== false ? `<span class="pill good">${t('enabled')}</span>` : `<span class="pill bad">${t('disabled')}</span>`}</td>${actionCell('CustomerServiceRep','customerServiceReps',rep.id)}</tr>`).join('')}
  ${(state.customerServiceReps || []).length ? '' : `<tr><td colspan="${canSeeCommission() ? 8 : 4}" class="note">${lang === 'zh' ? '还没有客服人员。' : 'No reps yet.'}</td></tr>`}
  </tbody></table></div>`;
}

function prospectAppointmentValue(item) {
  return `${item.appointmentDate || ''} ${item.appointmentTime || ''}`.trim();
}

function cleanConversationText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\|\s*/g, ' | ')
    .trim();
}

const PROSPECT_UI_SHOP_SPEAKERS = [
  'shop', 'store', 'us', 'we', 'our', 'ours', 'agent', 'business', 'staff', 'employee',
  'owner', 'admin', 'seller', 'sales', 'me', 'mine',
  'quad', 'quad film', 'quadfilm', 'quad films', 'qd', 'qd auto', 'qd auto image',
  'qdautoimage', 'qdautoimage.com', 'quadfilmus', 'quadfilmus.com',
  '客服', '我们', '店铺', '店里', '商家', '销售', '前台', '店员', '业务员'
];

const PROSPECT_UI_SYSTEM_SPEAKERS = [
  'system', 'note', 'notes', 'record', 'log', 'robot', 'bot', 'automation', 'auto',
  '系统', '记录', '备注', '机器人', '自动'
];

function prospectSpeakerNameMatches(list, value) {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return false;
  return list.some((name) => {
    const isCjk = /[^\x00-\x7F]/.test(name);
    const minLength = isCjk ? 2 : 3;
    return name.length >= minLength && key.includes(name);
  });
}

function prospectSpeakerRole(value, fallbackName = '') {
  const key = String(value || '').trim().toLowerCase();
  if (['customer', 'client', 'buyer', 'inbound', '客户', '顾客'].includes(key)) return 'customer';
  if (PROSPECT_UI_SHOP_SPEAKERS.includes(key)) return 'shop';
  if (PROSPECT_UI_SYSTEM_SPEAKERS.includes(key)) return 'system';
  if (PROSPECT_UI_SYSTEM_SPEAKERS.includes(key) || prospectSpeakerNameMatches(PROSPECT_UI_SYSTEM_SPEAKERS, fallbackName)) return 'system';
  if (PROSPECT_UI_SHOP_SPEAKERS.includes(key) || prospectSpeakerNameMatches(PROSPECT_UI_SHOP_SPEAKERS, fallbackName)) return 'shop';
  return 'customer';
}

function pushConversationSegment(segments, role, title, text, meta = '', attachment = null, messageId = '', status = '') {
  const value = cleanConversationText(text).replace(/^[:|-]+/, '').trim();
  if (!value && !attachment?.url) return;
  const normalizedRole = prospectSpeakerRole(role, title || meta);
  const key = `${normalizedRole}|${cleanConversationText(meta)}|${value}`.toLowerCase();
  if (segments.some(item => item.key === key)) return;
  segments.push({ key, role: normalizedRole, title, text: value, meta, attachment, messageId, status });
}

function structuredProspectMessages(item) {
  const rows = Array.isArray(item?.conversationMessages) ? item.conversationMessages : [];
  return rows.map((message, index) => {
    const speakerName = cleanConversationText(message.speakerName || message.name || message.sender || '');
    const role = prospectSpeakerRole(
      message.speaker || message.role || message.type || message.side || message.from || message.senderType,
      speakerName
    );
    const title = role === 'shop'
      ? `${lang === 'zh' ? '我们说' : 'Us'}${speakerName ? ` - ${speakerName}` : ''}`
      : role === 'system'
        ? (lang === 'zh' ? '系统记录' : 'System')
        : `${lang === 'zh' ? '客户说' : 'Customer'}${speakerName ? ` - ${speakerName}` : ''}`;
    return {
      role,
      title,
      text: cleanConversationText(message.text || message.message || message.content || ''),
      attachment: message.attachment || null,
      messageId: String(message.id || ''),
      status: String(message.status || ''),
      meta: [formatAppDateTime(message.timestamp || message.time || message.createdAt || '') || cleanConversationText(message.timestamp || ''), message.channel === 'sms' && message.status ? `SMS · ${message.status}` : ''].filter(Boolean).join(' · '),
      order: Number.isFinite(Number(message.order)) ? Number(message.order) : index
    };
  }).filter(message => message.text || message.attachment?.url);
}

function prospectConversationSegments(input) {
  const item = typeof input === 'object' && input ? input : null;
  if (item) {
    let structured = structuredProspectMessages(item);
    if (structured.length) {
      const hasMaterializedLegacy = (item.conversationMessages || []).some(message => message.source === 'legacy-conversation');
      if (item.chatContext && !hasMaterializedLegacy) structured = [...prospectConversationSegments(item.chatContext), ...structured];
      const segments = [];
      structured
        .sort((a, b) => a.order - b.order)
        .forEach(message => pushConversationSegment(segments, message.role, message.title, message.text, message.meta, message.attachment, message.messageId, message.status));
      return segments;
    }
  }
  const raw = cleanConversationText(item ? item.chatContext : input);
  if (!raw) return [];
  const segments = [];
  const leadMatch = raw.match(/Lead created:\s*([^|]+)/i);
  if (leadMatch) pushConversationSegment(segments, 'system', lang === 'zh' ? '线索创建时间' : 'Lead Created', leadMatch[1]);
  const customerRequest = raw.match(/Customer request:\s*([\s\S]*?)(?=\s+\|\s+(Conversation:|Delivered|Sent|Received|My Leads|Contacted Lead Details)\b|$)/i);
  if (customerRequest) pushConversationSegment(segments, 'customer', lang === 'zh' ? '客户说' : 'Customer', customerRequest[1]);
  const messagePattern = /\|\s*(Delivered|Sent|Received)\s*\|\s*([^|]{1,40})\s*\|\s*([\s\S]*?)(?=\s+\|\s*(Delivered|Sent|Received)\s*\||$)/gi;
  let match;
  while ((match = messagePattern.exec(raw))) {
    const role = /received/i.test(match[1]) ? 'customer' : 'shop';
    const title = role === 'customer' ? `${lang === 'zh' ? '客户回复' : 'Customer Reply'} ${match[2].trim()}` : `${lang === 'zh' ? '我们回复' : 'Our Reply'} ${match[2].trim()}`;
    pushConversationSegment(segments, role, title, match[3]);
  }
  if (!segments.length) {
    raw.split(/\n{2,}/).filter(Boolean).slice(0, 12).forEach((line, index) => {
      pushConversationSegment(segments, index % 2 ? 'shop' : 'customer', index % 2 ? (lang === 'zh' ? '我们回复' : 'Our Reply') : (lang === 'zh' ? '客户说' : 'Customer'), line);
    });
  }
  return segments;
}

function prospectConversationPreview(input) {
  const item = typeof input === 'object' && input ? input : {};
  const segments = prospectConversationSegments(input);
  const translation = cleanConversationText(item.chatTranslation || '');
  const reason = cleanConversationText(item.intentReason || '');
  if (!segments.length && !translation && !reason) {
    return `<div class="prospect-conversation empty">${lang === 'zh' ? '还没有聊天上下文。自动导入后，这里会按“客户说 / 我们说”展示完整沟通过程。' : 'No conversation context yet.'}</div>`;
  }
  return `<div class="prospect-conversation">
    <div class="conversation-title">${lang === 'zh' ? '客户沟通过程' : 'Conversation Flow'}<span>${segments.length} ${lang === 'zh' ? '段记录' : 'items'}</span></div>
    ${segments.length ? `<div class="conversation-flow">
      ${segments.map(segment => `<div class="conversation-segment ${segment.role}">
        <div class="conversation-role">${escapeHtml(segment.title)}</div>
        <div class="conversation-content">${escapeHtml(segment.text)}</div>
        ${segment.meta ? `<div class="conversation-meta">${escapeHtml(segment.meta)}</div>` : ''}
      </div>`).join('')}
    </div>` : ''}
    ${translation || reason ? `<div class="conversation-translation">
      ${translation ? `<div><strong>${lang === 'zh' ? '中文整理' : 'Chinese Summary'}</strong><p>${escapeHtml(translation)}</p></div>` : ''}
      ${reason ? `<div><strong>${lang === 'zh' ? '意向判断' : 'Intent Reason'}</strong><p>${escapeHtml(reason)}</p></div>` : ''}
    </div>` : ''}
  </div>`;
}

function prospectConversationSummary(input) {
  const item = typeof input === 'object' && input ? input : {};
  const segments = prospectConversationSegments(input);
  const customer = [...segments].reverse().find(item => item.role === 'customer');
  const shop = [...segments].reverse().find(item => item.role === 'shop');
  if (customer && shop) return `${lang === 'zh' ? '客户：' : 'Customer: '}${shortText(customer.text, 42)} / ${lang === 'zh' ? '我们：' : 'Us: '}${shortText(shop.text, 42)}`;
  if (customer) return `${lang === 'zh' ? '客户：' : 'Customer: '}${shortText(customer.text, 90)}`;
  if (shop) return `${lang === 'zh' ? '我们：' : 'Us: '}${shortText(shop.text, 90)}`;
  if (item.chatTranslation) return shortText(item.chatTranslation, 90);
  return shortText((item.chatContext || input || ''), 90);
}

function prospectActivityTime(item) {
  return item.updatedAt || item.importedAt || item.createdAt || item.date || '';
}

function prospectAddedTime(item) {
  return item.createdAt || item.importedAt || item.date || '';
}

function prospectCompactTime(value) {
  return formatAppDateTime(value).replace(/^\d{4}-/, '');
}

function prospectTimeCell(item) {
  const added = prospectCompactTime(prospectAddedTime(item));
  const updatedSource = item.updatedAt || item.importedAt || '';
  const updated = updatedSource && updatedSource !== prospectAddedTime(item) ? prospectCompactTime(updatedSource) : '';
  if (!added && !updated) return '';
  if (!updated || updated === added) return `<span class="prospect-time-line">${escapeHtml(added)}</span>`;
  return `<span class="prospect-time-line">${lang === 'zh' ? '加入' : 'Added'} ${escapeHtml(added)}</span><span class="note prospect-time-line">${lang === 'zh' ? '更新' : 'Updated'} ${escapeHtml(updated)}</span>`;
}

function prospectTable() {
  const rows = [...(state.prospects || [])].sort((a, b) => {
    const activityDiff = new Date(prospectActivityTime(b)).getTime() - new Date(prospectActivityTime(a)).getTime();
    if (Number.isFinite(activityDiff) && activityDiff) return activityDiff;
    return String(b.date || '').localeCompare(String(a.date || ''));
  });
  const addedLabel = lang === 'zh' ? '加入/更新' : 'Added / Updated';
  return `<div class="table-wrap prospect-table-wrap"><table class="prospect-table"><thead><tr><th>${t('date')}</th><th>${addedLabel}</th><th>${t('source')}</th><th>${t('customer')}</th><th>${t('vehicleNeed')}</th><th>${t('appointmentAt')}</th><th>${t('contactOwner')}</th><th>${t('intentLevel')}</th><th>${t('prospectStatus')}</th><th>${t('chatContext')}</th><th>${t('note')}</th><th></th></tr></thead><tbody>
  ${rows.map(item => {
    const rep = (state.customerServiceReps || []).find(x => x.id === item.ownerId);
    const appointment = item.appointmentDate || item.appointmentTime ? `${escapeHtml(item.appointmentDate || '')}<br><span class="note">${escapeHtml(item.appointmentTime || '')}</span>` : '';
    return `<tr><td class="prospect-nowrap">${escapeHtml(item.date || '')}</td><td class="prospect-time">${prospectTimeCell(item)}</td><td><div class="prospect-clamp prospect-clamp-2">${escapeHtml(item.source || '')}</div></td><td><div class="prospect-clamp">${escapeHtml(item.customer || '')}</div><span class="note prospect-nowrap">${escapeHtml(item.phone || '')}</span></td><td><div class="prospect-clamp">${escapeHtml(item.vehicle || '')}</div><div class="note prospect-clamp prospect-clamp-2">${escapeHtml(item.need || '')}</div></td><td class="prospect-time">${appointment}</td><td><div class="prospect-clamp prospect-clamp-2">${rep ? escapeHtml(rep.name) : escapeHtml(item.ownerName || '') || t('unassigned')}</div></td><td>${prospectIntentPill(item.intentLevel)}</td><td>${prospectStatusPill(item.status)}</td><td><div class="prospect-clamp prospect-clamp-2" title="${escapeHtml(prospectConversationSummary(item))}">${escapeHtml(shortText(prospectConversationSummary(item), 48))}</div></td><td><div class="prospect-clamp prospect-clamp-2" title="${escapeHtml(item.note || '')}">${escapeHtml(shortText(item.note || '', 48))}</div></td>${actionCell('Prospect','prospects',item.id)}</tr>`;
  }).join('')}
  ${rows.length ? '' : `<tr><td colspan="12" class="note">${lang === 'zh' ? '还没有高意向客户。' : 'No high-intent customers yet.'}</td></tr>`}
  </tbody></table></div>`;
}

function customerCenterRows() {
  const promotedIds = new Set((state.prospects || []).map(item => item.id));
  const regular = (state.customerConversations || [])
    .filter(item => !item.promotedProspectId || !promotedIds.has(item.promotedProspectId))
    .map(item => ({ ...item, _collection: 'customerConversations', _highIntent: false }));
  const highIntent = (state.prospects || []).map(item => ({ ...item, _collection: 'prospects', _highIntent: true }));
  return [...regular, ...highIntent].sort((a, b) => new Date(prospectActivityTime(b)).getTime() - new Date(prospectActivityTime(a)).getTime());
}

function customerCenterTable() {
  const rows = customerCenterRows();
  const addedLabel = lang === 'zh' ? '加入/更新' : 'Added / Updated';
  return `<div class="table-wrap customer-center-table"><table><thead><tr><th>${t('date')}</th><th>${addedLabel}</th><th>${t('source')}</th><th>${t('customer')}</th><th>${t('vehicleNeed')}</th><th>${t('appointmentAt')}</th><th>${t('contactOwner')}</th><th>${t('intentLevel')}</th><th>${t('prospectStatus')}</th></tr></thead><tbody>
    ${rows.map(item => {
      const rep = (state.customerServiceReps || []).find(row => row.id === item.ownerId);
      const appointment = item.appointmentDate || item.appointmentTime ? `${escapeHtml(item.appointmentDate || '')}<br><span class="note">${escapeHtml(item.appointmentTime || '')}</span>` : '';
      return `<tr class="click-row" onclick="openProspectWorkspace('${item._collection}','${item.id}')"><td class="prospect-nowrap">${escapeHtml(item.date || '')}</td><td class="prospect-time">${prospectTimeCell(item)}</td><td><div class="prospect-clamp prospect-clamp-2">${escapeHtml(item.source || '')}</div></td><td><div class="prospect-clamp prospect-clamp-2">${escapeHtml(item.customer || (lang === 'zh' ? '未命名客户' : 'Unnamed'))}</div><span class="note prospect-nowrap">${escapeHtml(item.phone || '')}</span></td><td><div class="prospect-clamp prospect-clamp-2">${escapeHtml(item.vehicle || '')}</div><div class="note prospect-clamp prospect-clamp-2">${escapeHtml(item.need || '')}</div></td><td class="prospect-time">${appointment}</td><td><div class="prospect-clamp prospect-clamp-2">${rep ? escapeHtml(rep.name) : escapeHtml(item.ownerName || '') || t('unassigned')}</div></td><td>${prospectIntentPill(item.intentLevel)}</td><td>${prospectStatusPill(item.status)}</td></tr>`;
    }).join('')}
    ${rows.length ? '' : `<tr><td colspan="9" class="note">${lang === 'zh' ? '还没有客户交流记录。' : 'No customer conversations yet.'}</td></tr>`}
  </tbody></table></div>`;
}

function ensureProspectWorkspace() {
  let workspace = document.getElementById('prospectWorkspace');
  if (workspace) return workspace;
  workspace = document.createElement('section');
  workspace.id = 'prospectWorkspace';
  workspace.className = 'prospect-workspace';
  document.body.appendChild(workspace);
  return workspace;
}

function activeCustomerWorkspaceItem() {
  const [collection, id] = String(activeProspectWorkspaceId || '').split(':');
  return { collection, item: (state[collection] || []).find(row => row.id === id) };
}

function openProspectWorkspace(collection, id) {
  activeProspectWorkspaceId = `${collection}:${id}`;
  document.body.classList.add('prospect-workspace-open');
  renderProspectWorkspace();
  startProspectWorkspaceSync();
}

const prospectWorkspaceFieldIds = [
  'workspaceDate', 'workspaceSource', 'workspaceCustomer', 'workspacePhone', 'workspaceVehicle',
  'workspaceNeed', 'workspaceService', 'workspaceAppointmentDate', 'workspaceAppointmentTime',
  'workspaceOwnerId', 'workspaceIntentLevel', 'workspaceStatus'
];

function captureProspectWorkspaceDraft(markDirty = false) {
  if (!activeProspectWorkspaceId) return;
  const fields = prospectWorkspaceFieldIds.map(id => document.getElementById(id));
  if (!fields.some(Boolean)) return;
  const existing = prospectWorkspaceDrafts.get(activeProspectWorkspaceId) || { values: {}, dirty: false };
  fields.forEach(field => { if (field) existing.values[field.id] = field.value; });
  if (markDirty) existing.dirty = true;
  prospectWorkspaceDrafts.set(activeProspectWorkspaceId, existing);
}

function restoreProspectWorkspaceDraft() {
  const draft = prospectWorkspaceDrafts.get(activeProspectWorkspaceId);
  if (!draft?.dirty) return;
  prospectWorkspaceFieldIds.forEach(id => {
    const field = document.getElementById(id);
    if (field && Object.hasOwn(draft.values, id)) field.value = draft.values[id];
  });
}

function closeProspectWorkspace() {
  prospectWorkspaceDrafts.delete(activeProspectWorkspaceId);
  activeProspectWorkspaceId = '';
  stopProspectWorkspaceSync();
  document.body.classList.remove('prospect-workspace-open');
  const workspace = document.getElementById('prospectWorkspace');
  if (workspace) workspace.classList.remove('open');
}

function startProspectWorkspaceSync() {
  if (prospectWorkspaceSyncTimer || !token) return;
  prospectWorkspaceSyncTimer = setInterval(() => {
    if (activeProspectWorkspaceId && !document.hidden) sync({ silent: true });
  }, 5000);
}

function stopProspectWorkspaceSync() {
  if (prospectWorkspaceSyncTimer) clearInterval(prospectWorkspaceSyncTimer);
  prospectWorkspaceSyncTimer = null;
}

function renderProspectWorkspace() {
  const { collection, item } = activeCustomerWorkspaceItem();
  if (!item) return closeProspectWorkspace();
  const segments = prospectConversationSegments(item);
  const workspace = ensureProspectWorkspace();
  const conversationKey = `${collection}:${item.id}`;
  const previousChat = workspace.querySelector('.prospect-workspace-chat');
  const sameConversation = workspace.dataset.conversationKey === conversationKey;
  const previousScrollTop = sameConversation && previousChat ? previousChat.scrollTop : 0;
  const previousDistanceFromBottom = sameConversation && previousChat
    ? previousChat.scrollHeight - previousChat.clientHeight - previousChat.scrollTop
    : 0;
  const shouldFollowLatest = !sameConversation || previousDistanceFromBottom < 80;
  const field = (label, control) => `<label class="prospect-sidebar-field"><span>${label}</span>${control}</label>`;
  const select = (id, value, options) => `<select id="${id}" ${hasPerm('prospectsEdit') ? '' : 'disabled'}>${options.map(option => {
    const pair = Array.isArray(option) ? option : [option, option];
    return `<option value="${escapeHtml(pair[0])}" ${String(pair[0]) === String(value || '') ? 'selected' : ''}>${escapeHtml(pair[1])}</option>`;
  }).join('')}</select>`;
  const sources = leadSourceOptions();
  const services = serviceOptions();
  const owners = customerServiceOptions();
  const intents = prospectIntentOptions();
  const statuses = prospectStatusOptions();
  workspace.innerHTML = `
    <header class="prospect-workspace-header">
      <div class="prospect-workspace-customer">
        <strong>${escapeHtml(item.customer || (lang === 'zh' ? '未命名客户' : 'Unnamed customer'))}</strong>
        <span>${escapeHtml(item.phone || (lang === 'zh' ? '未填写电话' : 'No phone'))}</span>
        ${prospectIntentPill(item.intentLevel)} ${prospectStatusPill(item.status)}
      </div>
      <div class="prospect-workspace-actions">
        ${collection === 'customerConversations' && item.promotedProspectId ? `<span class="pill good">${lang === 'zh' ? '已转入高意向客户' : 'Promoted to high intent'}</span>` : ''}
        <button class="prospect-workspace-close" onclick="closeProspectWorkspace()" aria-label="${lang === 'zh' ? '关闭聊天工作台' : 'Close chat workspace'}">×</button>
      </div>
    </header>
    <div class="prospect-workspace-body">
      <aside class="prospect-workspace-sidebar">
        <h3>${lang === 'zh' ? '客户资料' : 'Customer details'}</h3>
        ${field(t('date'), `<input id="workspaceDate" type="date" value="${escapeHtml(item.date || '')}" ${hasPerm('prospectsEdit') ? '' : 'disabled'}>`)}
        ${field(t('source'), select('workspaceSource', item.source || 'Yelp', sources))}
        ${field(t('customer'), `<input id="workspaceCustomer" value="${escapeHtml(item.customer || '')}" ${hasPerm('prospectsEdit') ? '' : 'disabled'}>`)}
        ${field(lang === 'zh' ? '电话' : 'Phone', `<input id="workspacePhone" value="${escapeHtml(item.phone || '')}" ${hasPerm('prospectsEdit') ? '' : 'disabled'}>`)}
        ${field(t('vehicle'), `<input id="workspaceVehicle" value="${escapeHtml(item.vehicle || '')}" ${hasPerm('prospectsEdit') ? '' : 'disabled'}>`)}
        ${field(t('vehicleNeed'), `<textarea id="workspaceNeed" ${hasPerm('prospectsEdit') ? '' : 'disabled'}>${escapeHtml(item.need || '')}</textarea>`)}
        ${field(t('service'), select('workspaceService', item.service || 'tint', services))}
        <div class="prospect-sidebar-pair">
          ${field(t('appointmentDate'), `<input id="workspaceAppointmentDate" type="date" value="${escapeHtml(item.appointmentDate || '')}" ${hasPerm('prospectsEdit') ? '' : 'disabled'}>`)}
          ${field(t('appointmentTime'), `<input id="workspaceAppointmentTime" type="time" value="${escapeHtml(item.appointmentTime || '')}" ${hasPerm('prospectsEdit') ? '' : 'disabled'}>`)}
        </div>
        ${field(t('contactOwner'), select('workspaceOwnerId', item.ownerId || '', owners))}
        ${field(t('intentLevel'), select('workspaceIntentLevel', normalizeProspectIntentValue(item.intentLevel || '高意向'), intents))}
        ${field(t('prospectStatus'), select('workspaceStatus', item.status || '新意向', statuses))}
        ${hasPerm('prospectsEdit') ? `<button id="workspaceSaveDetailsButton" class="btn primary prospect-sidebar-save" onclick="saveProspectWorkspaceDetails()">${lang === 'zh' ? '保存客户资料' : 'Save customer details'}</button>` : ''}
      </aside>
      <section class="prospect-workspace-conversation">
        <main class="prospect-workspace-chat">
          ${segments.length ? segments.map(segment => `<article class="prospect-chat-message ${segment.role} ${segment.messageId && segment.role === 'shop' ? 'has-delete' : ''}">
            ${segment.messageId && segment.role === 'shop' ? `<button class="prospect-message-delete" type="button" onclick="deleteProspectMessage('${escapeHtml(segment.messageId)}')" title="${lang === 'zh' ? '删除这条记录' : 'Delete this message'}">×</button>` : ''}
            <div class="prospect-chat-role">${escapeHtml(segment.title)}</div>
            ${segment.text ? `<div class="prospect-chat-text">${escapeHtml(segment.text)}</div>` : ''}
            ${prospectAttachmentHtml(segment.attachment)}
            ${segment.meta ? `<time>${escapeHtml(segment.meta)}</time>` : ''}
          </article>`).join('') : `<div class="prospect-chat-empty">${lang === 'zh' ? '还没有聊天记录。' : 'No conversation yet.'}</div>`}
        </main>
        <footer class="prospect-workspace-composer">
          <div class="prospect-sms-status">${lang === 'zh' ? '通过 Twilio 发送和接收短信 · 发送号码：+1 725-241-2586' : 'Send and receive SMS through Twilio · Sender: +1 725-241-2586'}</div>
          <div class="prospect-attachment-tools">
            <button type="button" onclick="document.getElementById('prospectImageInput').click()">🖼️ ${lang === 'zh' ? '图片' : 'Image'}</button>
            <button type="button" onclick="document.getElementById('prospectVideoInput').click()">🎬 ${lang === 'zh' ? '视频' : 'Video'}</button>
            <button type="button" onclick="document.getElementById('prospectFileInput').click()">📎 ${lang === 'zh' ? '文件' : 'File'}</button>
            <button type="button" onclick="insertProspectAddress()">📍 ${lang === 'zh' ? '地址' : 'Address'}</button>
            <span class="prospect-tool-divider"></span>
            <button class="reply-reference-button" type="button" onclick="openReplyReferenceLibrary('text')">💬 ${lang === 'zh' ? '回复文字' : 'Reply text'}</button>
            <button class="reply-reference-button" type="button" onclick="openReplyReferenceLibrary('image')">🖼 ${lang === 'zh' ? '回复图片' : 'Reply image'}</button>
            <button class="reply-reference-button" type="button" onclick="openReplyReferenceLibrary('video')">▶ ${lang === 'zh' ? '回复视频' : 'Reply video'}</button>
            <span id="prospectAttachmentPreview">${prospectPendingAttachment ? `${escapeHtml(prospectPendingAttachment.name)} <button type="button" onclick="clearProspectAttachment()">×</button>` : ''}</span>
            <input class="hidden" id="prospectImageInput" type="file" accept="image/*" onchange="uploadProspectAttachment(this.files[0]); this.value=''">
            <input class="hidden" id="prospectVideoInput" type="file" accept="video/*" onchange="uploadProspectAttachment(this.files[0]); this.value=''">
            <input class="hidden" id="prospectFileInput" type="file" onchange="uploadProspectAttachment(this.files[0]); this.value=''">
          </div>
          <div class="prospect-compose-row">
            <textarea id="prospectReplyInput" placeholder="${lang === 'zh' ? '输入给该客户的回复内容…' : 'Write a reply…'}"></textarea>
            <button id="prospectSendSmsButton" class="btn primary" onclick="sendProspectSms()" ${hasPerm('prospectsEdit') ? '' : 'disabled'}>${lang === 'zh' ? '发送短信' : 'Send SMS'}</button>
          </div>
        </footer>
      </section>
    </div>`;
  workspace.dataset.conversationKey = conversationKey;
  workspace.classList.add('open');
  restoreProspectWorkspaceDraft();
  workspace.querySelectorAll('.prospect-workspace-sidebar input, .prospect-workspace-sidebar textarea, .prospect-workspace-sidebar select')
    .forEach(control => {
      control.addEventListener('input', () => captureProspectWorkspaceDraft(true));
      control.addEventListener('change', () => captureProspectWorkspaceDraft(true));
    });
  const conversation = workspace.querySelector('.prospect-workspace-conversation');
  const chat = workspace.querySelector('.prospect-workspace-chat');
  if (conversation && chat) {
    conversation.addEventListener('wheel', event => {
      if (event.target.closest('.prospect-workspace-composer, input, textarea, select, button, a, video')) return;
      if (chat.scrollHeight <= chat.clientHeight) return;
      chat.scrollTop += event.deltaY;
      event.preventDefault();
    }, { passive: false });
  }
  requestAnimationFrame(() => {
    if (!chat) return;
    chat.scrollTop = shouldFollowLatest ? chat.scrollHeight : previousScrollTop;
  });
}

function prospectAttachmentHtml(attachment) {
  if (!attachment?.url) return '';
  const url = escapeHtml(attachment.url);
  const name = escapeHtml(attachment.name || '附件');
  if (attachment.kind === 'image' || String(attachment.type || '').startsWith('image/')) {
    return `<a href="${url}" target="_blank" rel="noopener"><img class="prospect-chat-media" src="${url}" alt="${name}"></a>`;
  }
  if (attachment.kind === 'video' || String(attachment.type || '').startsWith('video/')) {
    return `<button class="prospect-chat-video-placeholder" type="button" onclick="playProspectVideo(this, '${encodeURIComponent(attachment.url)}')" aria-label="${lang === 'zh' ? '点击播放视频' : 'Play video'}"><span>▶</span><strong>${lang === 'zh' ? '点击播放视频' : 'Play video'}</strong></button>`;
  }
  return `<a class="prospect-chat-file" href="${url}" target="_blank" rel="noopener">📎 ${name}</a>`;
}

function playProspectVideo(button, encodedUrl) {
  if (!button) return;
  const video = document.createElement('video');
  video.className = 'prospect-chat-media';
  video.controls = true;
  video.preload = 'metadata';
  video.autoplay = true;
  video.src = decodeURIComponent(encodedUrl);
  button.replaceWith(video);
  video.play().catch(() => {});
}

async function deleteProspectMessage(messageId) {
  const { collection, item } = activeCustomerWorkspaceItem();
  if (!item || !messageId) return;
  if (!confirm(lang === 'zh' ? '确定删除这条失败的消息和附件吗？' : 'Delete this failed message and its attachment?')) return;
  try {
    state = await api(`/api/customer-messages/${encodeURIComponent(collection)}/${encodeURIComponent(item.id)}/${encodeURIComponent(messageId)}`, { method: 'DELETE' });
    broadcastDataChange();
    render();
  } catch (err) {
    alert(err.message);
  }
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(lang === 'zh' ? '读取附件失败' : 'Could not read the attachment'));
    reader.readAsDataURL(file);
  });
}

async function optimizeProspectImage(file) {
  if (!file || !String(file.type || '').startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 1280;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    let quality = .82;
    let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    while (blob && blob.size > 700 * 1024 && quality > .42) {
      quality -= .1;
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    }
    if (!blob) return file;
    const baseName = String(file.name || '图片').replace(/\.[^.]+$/, '').slice(0, 40);
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

async function uploadProspectAttachment(file) {
  if (!file) return;
  file = await optimizeProspectImage(file);
  const isVideo = String(file.type || '').startsWith('video/');
  const maxBytes = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
  if (file.size > maxBytes) return alert(isVideo ? (lang === 'zh' ? '原始视频不能超过 50MB，请先缩短视频。' : 'Source video must be 50MB or smaller.') : (lang === 'zh' ? '附件不能超过 5MB。' : 'Attachments must be 5MB or smaller.'));
  const preview = document.getElementById('prospectAttachmentPreview');
  if (preview) preview.textContent = isVideo && file.size > 5 * 1024 * 1024 ? (lang === 'zh' ? '正在上传并自动压缩视频…' : 'Uploading and compressing video…') : (lang === 'zh' ? '正在上传…' : 'Uploading…');
  try {
    const uploaded = await api('/api/customer-media/upload', {
      method: 'POST',
      body: JSON.stringify({ name: file.name, type: file.type || 'application/octet-stream', dataUrl: await fileAsDataUrl(file) })
    });
    prospectPendingAttachment = { name: uploaded.name, type: uploaded.type, size: uploaded.size, url: uploaded.url };
    renderProspectWorkspace();
  } catch (err) {
    prospectPendingAttachment = null;
    alert(err.message);
    renderProspectWorkspace();
  }
}

function clearProspectAttachment() {
  prospectPendingAttachment = null;
  renderProspectWorkspace();
}

function insertProspectAddress() {
  const address = prompt(lang === 'zh' ? '输入要发给客户的地址：' : 'Enter the address to send:', '3359 W Oquendo Rd, Las Vegas, NV');
  if (!address?.trim()) return;
  const input = document.getElementById('prospectReplyInput');
  if (!input) return;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
  input.value = [input.value.trim(), `📍 ${address.trim()}\n${mapUrl}`].filter(Boolean).join('\n');
  input.focus();
}

function replyTypeLabel(type) {
  const labels = lang === 'zh'
    ? { text: '文字回复', image: '图片回复', video: '视频回复' }
    : { text: 'Text reply', image: 'Image reply', video: 'Video reply' };
  return labels[type] || labels.text;
}

function normalizeReplyTemplateCategory(category) {
  const value = String(category || '').trim();
  return replyTemplateCategories.some(item => item.id === value) ? value : 'uncategorized';
}

function replyTemplateCategoryLabel(category) {
  const item = replyTemplateCategories.find(row => row.id === category) || replyTemplateCategories.find(row => row.id === 'uncategorized');
  return item ? item[lang === 'zh' ? 'zh' : 'en'] : '';
}

function replyTemplateCategoryOptions(selected) {
  const currentCategory = normalizeReplyTemplateCategory(selected);
  return replyTemplateCategories.map(item => `<option value="${item.id}" ${item.id === currentCategory ? 'selected' : ''}>${lang === 'zh' ? item.zh : item.en}</option>`).join('');
}

function replyTemplateCategoryFilters(activeCategory, handler) {
  const currentCategory = activeCategory === 'all' ? 'all' : normalizeReplyTemplateCategory(activeCategory);
  const allLabel = lang === 'zh' ? '全部分类' : 'All categories';
  return `<div class="reply-category-tabs">
    <button class="btn ${currentCategory === 'all' ? 'primary' : ''}" type="button" onclick="${handler}('${replyTemplateLibraryType}','all')">${allLabel}</button>
    ${replyTemplateCategories.map(item => `<button class="btn ${currentCategory === item.id ? 'primary' : ''}" type="button" onclick="${handler}('${replyTemplateLibraryType}','${item.id}')">${lang === 'zh' ? item.zh : item.en}</button>`).join('')}
  </div>`;
}

function replyTemplateCards(type, selectable = false, category = replyTemplateCategoryFilter) {
  const rows = [...(state.replyTemplates || [])]
    .filter(item => item.type === type)
    .filter(item => category === 'all' || normalizeReplyTemplateCategory(item.category) === category)
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
  if (!rows.length) return `<div class="reply-library-empty">${lang === 'zh' ? '这个分类还没有素材，请点击“新增素材”上传。' : 'No items yet. Use “New item” to add one.'}</div>`;
  return `<div class="reply-library-grid">${rows.map(item => {
    const action = selectable ? `useReplyTemplate('${escapeHtml(item.id)}')` : `openReplyTemplateEditor('${escapeHtml(type)}','${escapeHtml(item.id)}')`;
    const preview = type === 'text'
      ? `<p>${escapeHtml(item.content || '')}</p>`
      : type === 'image'
        ? `<img src="${escapeHtml(item.attachment?.url || '')}" alt="${escapeHtml(item.title || '')}">`
        : `<button class="reply-template-video reply-template-video-preview" type="button" onclick="event.stopPropagation();previewReplyTemplateVideo('${escapeHtml(item.id)}')" title="${lang === 'zh' ? '点击预览视频' : 'Preview video'}"><span>▶</span><small>${lang === 'zh' ? '点击预览视频' : 'Preview video'}</small></button>`;
    return `<article class="reply-library-card" onclick="${action}">
      <div class="reply-library-card-preview">${preview}</div>
      <div class="reply-library-card-info"><strong>${escapeHtml(item.title || replyTypeLabel(type))}</strong><small>${escapeHtml(item.createdBy || '')}</small></div>
      <div class="reply-library-card-meta"><span>${escapeHtml(replyTemplateCategoryLabel(normalizeReplyTemplateCategory(item.category)))}</span></div>
      <div class="reply-library-card-actions">
        <button class="btn primary" type="button" onclick="event.stopPropagation();${action}">${selectable ? (lang === 'zh' ? '选用' : 'Use') : (lang === 'zh' ? '编辑' : 'Edit')}</button>
        ${hasPerm('prospectsEdit') ? `<button class="btn danger" type="button" onclick="event.stopPropagation();deleteReplyTemplate('${escapeHtml(item.id)}','${escapeHtml(type)}',${selectable})">${lang === 'zh' ? '删除' : 'Delete'}</button>` : ''}
      </div>
    </article>`;
  }).join('')}</div>`;
}

function replyLibraryTabs(activeType, handler) {
  return `<div class="reply-library-tabs">
    ${['text', 'image', 'video'].map(type => `<button class="btn ${activeType === type ? 'primary' : ''}" type="button" onclick="${handler}('${type}')">${type === 'text' ? '💬' : type === 'image' ? '🖼' : '▶'} ${replyTypeLabel(type)}</button>`).join('')}
  </div>`;
}

function replyLibraryPageHtml(type = replyTemplateLibraryType) {
  replyTemplateLibraryType = ['text', 'image', 'video'].includes(type) ? type : 'text';
  replyTemplateCategoryFilter = replyTemplateCategoryFilter === 'all' ? 'all' : normalizeReplyTemplateCategory(replyTemplateCategoryFilter);
  return `<div class="reply-library-page">
    ${replyLibraryTabs(replyTemplateLibraryType, 'showReplyLibraryPageType')}
    ${replyTemplateCategoryFilters(replyTemplateCategoryFilter, 'showReplyLibraryPageType')}
    <div class="reply-library-help">${lang === 'zh' ? '素材保存在 Railway 云端，店内所有已授权电脑会同步看到。点击素材可编辑。' : 'Items are stored in Railway and shared across authorized devices.'}</div>
    ${replyTemplateCards(replyTemplateLibraryType, false, replyTemplateCategoryFilter)}
  </div>`;
}

function showReplyLibraryPageType(type, category = replyTemplateCategoryFilter) {
  replyTemplateLibraryType = type;
  replyTemplateCategoryFilter = category === 'all' ? 'all' : normalizeReplyTemplateCategory(category);
  render();
}

function openReplyReferenceLibrary(type = 'text', category = replyTemplateCategoryFilter) {
  replyTemplateLibraryType = ['text', 'image', 'video'].includes(type) ? type : 'text';
  replyTemplateCategoryFilter = category === 'all' ? 'all' : normalizeReplyTemplateCategory(category);
  openModal(lang === 'zh' ? '选择云端回复素材' : 'Choose cloud reply', `
    <div class="reply-library-picker">
      ${replyLibraryTabs(replyTemplateLibraryType, 'openReplyReferenceLibrary')}
      ${replyTemplateCategoryFilters(replyTemplateCategoryFilter, 'openReplyReferenceLibrary')}
      <p class="reply-library-help">${lang === 'zh' ? '点击“选用”后只会放入下面的待发送区，确认无误后再点发送短信。' : 'Choosing an item stages it in the composer. It will not send automatically.'}</p>
      ${replyTemplateCards(replyTemplateLibraryType, true, replyTemplateCategoryFilter)}
    </div>`, closeModal);
  document.getElementById('modal').classList.add('reply-library-open');
  const save = document.getElementById('modalSave');
  if (save) save.textContent = lang === 'zh' ? '关闭' : 'Close';
  const action = document.getElementById('modalHeaderAction');
  if (action && hasPerm('prospectsEdit')) {
    action.hidden = false;
    action.textContent = lang === 'zh' ? '＋ 新增素材' : '+ New item';
    action.onclick = () => openReplyTemplateEditor(replyTemplateLibraryType, '', true);
  }
}

function useReplyTemplate(id) {
  const item = (state.replyTemplates || []).find(row => row.id === id);
  if (!item) return;
  const draft = String(document.getElementById('prospectReplyInput')?.value || '');
  if (item.type === 'text') {
    closeModal();
    const input = document.getElementById('prospectReplyInput');
    if (input) {
      input.value = [draft.trim(), item.content].filter(Boolean).join(draft.trim() ? '\n' : '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    }
    return;
  }
  prospectPendingAttachment = item.attachment ? { ...item.attachment } : null;
  closeModal();
  renderProspectWorkspace();
  const input = document.getElementById('prospectReplyInput');
  if (input) {
    input.value = draft;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }
}

function previewReplyTemplateVideo(id) {
  const item = (state.replyTemplates || []).find(row => row.id === id && row.type === 'video');
  if (!item?.attachment?.url) return alert(lang === 'zh' ? '找不到这个视频文件。' : 'Video file not found.');
  document.getElementById('replyVideoPreviewOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'replyVideoPreviewOverlay';
  overlay.className = 'reply-video-preview-overlay';
  overlay.innerHTML = `<div class="reply-video-preview-dialog" role="dialog" aria-modal="true" aria-label="${lang === 'zh' ? '视频预览' : 'Video preview'}">
    <header><div><strong>${escapeHtml(item.title || (lang === 'zh' ? '视频预览' : 'Video preview'))}</strong><small>${lang === 'zh' ? '仅供预览，不会发送给客户' : 'Preview only — nothing will be sent'}</small></div><button class="icon-btn" type="button" onclick="closeReplyTemplateVideoPreview()">×</button></header>
    <div class="reply-video-preview-stage">
      <video src="${escapeHtml(item.attachment.url)}" controls playsinline preload="metadata" onloadedmetadata="handleReplyTemplateVideoLoaded(this)" onerror="handleReplyTemplateVideoError(this)"></video>
      <div class="reply-video-preview-status" hidden></div>
    </div>
    <footer><button class="btn primary" type="button" onclick="closeReplyTemplateVideoPreview()">${lang === 'zh' ? '看完了，返回选择' : 'Done — return'}</button></footer>
  </div>`;
  overlay.addEventListener('click', event => { if (event.target === overlay) closeReplyTemplateVideoPreview(); });
  document.body.appendChild(overlay);
}

function handleReplyTemplateVideoLoaded(video) {
  const status = video.closest('.reply-video-preview-stage')?.querySelector('.reply-video-preview-status');
  if (status) status.hidden = true;
}

function handleReplyTemplateVideoError(video) {
  const status = video.closest('.reply-video-preview-stage')?.querySelector('.reply-video-preview-status');
  if (!status) return;
  status.textContent = lang === 'zh'
    ? '这个云端视频文件已丢失或无法读取，请删除该素材后重新上传视频。'
    : 'This cloud video is missing or unreadable. Delete the item and upload the video again.';
  status.hidden = false;
}

function closeReplyTemplateVideoPreview() {
  const overlay = document.getElementById('replyVideoPreviewOverlay');
  const video = overlay?.querySelector('video');
  if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
  overlay?.remove();
}

function replyTemplatePreviewHtml(type, attachment) {
  if (!attachment?.url) return `<span>${lang === 'zh' ? '尚未上传文件' : 'No file uploaded'}</span>`;
  if (type === 'image') return `<img src="${escapeHtml(attachment.url)}" alt="${escapeHtml(attachment.name || '')}">`;
  return `<div class="reply-template-video"><span>▶</span><strong>${escapeHtml(attachment.name || (lang === 'zh' ? '短视频' : 'Video'))}</strong></div>`;
}

function openReplyTemplateEditor(type = 'text', id = '', returnToPicker = false) {
  type = ['text', 'image', 'video'].includes(type) ? type : 'text';
  const item = (state.replyTemplates || []).find(row => row.id === id);
  const category = normalizeReplyTemplateCategory(item?.category || (replyTemplateCategoryFilter === 'all' ? 'auto-window-film' : replyTemplateCategoryFilter));
  replyTemplatePendingAttachment = item?.attachment ? { ...item.attachment } : null;
  openModal(item ? (lang === 'zh' ? '编辑云端回复素材' : 'Edit cloud reply') : (lang === 'zh' ? '新增云端回复素材' : 'New cloud reply'), `
    <div class="reply-template-editor" data-return-picker="${returnToPicker ? '1' : '0'}">
      <label><span>${lang === 'zh' ? '素材类型' : 'Type'}</span><select id="replyTemplateType" ${item ? 'disabled' : ''} onchange="openReplyTemplateEditor(this.value,'',${returnToPicker})">
        ${['text','image','video'].map(value => `<option value="${value}" ${value === type ? 'selected' : ''}>${replyTypeLabel(value)}</option>`).join('')}
      </select></label>
      <label><span>${lang === 'zh' ? '业务分类' : 'Business category'}</span><select id="replyTemplateCategory">
        ${replyTemplateCategoryOptions(category)}
      </select></label>
      <label><span>${lang === 'zh' ? '标题（方便查找）' : 'Title'}</span><input id="replyTemplateTitle" value="${escapeHtml(item?.title || '')}" placeholder="${lang === 'zh' ? '例如：询问车型、到店地址、窗膜效果图' : 'Example: Ask vehicle, shop address'}"></label>
      ${type === 'text' ? `<label class="reply-template-content"><span>${lang === 'zh' ? '回复文字' : 'Reply text'}</span><textarea id="replyTemplateContent" placeholder="${lang === 'zh' ? '输入以后可以一键选用的完整回复内容…' : 'Enter reusable reply text…'}">${escapeHtml(item?.content || '')}</textarea></label>` : `
        <label class="reply-template-content"><span>${lang === 'zh' ? '附带说明文字（可不填）' : 'Optional caption'}</span><textarea id="replyTemplateContent" placeholder="${lang === 'zh' ? '可选：选择素材时同时带入的说明' : 'Optional caption'}">${escapeHtml(item?.content || '')}</textarea></label>
        <div class="reply-template-upload">
          <button class="btn primary" type="button" onclick="document.getElementById('replyTemplateFile').click()">${type === 'image' ? '🖼 ' + (lang === 'zh' ? '上传图片' : 'Upload image') : '▶ ' + (lang === 'zh' ? '上传短视频' : 'Upload video')}</button>
          <input class="hidden" id="replyTemplateFile" type="file" accept="${type === 'image' ? 'image/*' : 'video/*'}" onchange="uploadReplyTemplateMedia(this.files[0]);this.value=''">
          <div id="replyTemplateUploadStatus" class="reply-template-preview">${replyTemplatePreviewHtml(type, replyTemplatePendingAttachment)}</div>
        </div>`}
    </div>`, () => saveReplyTemplate(id, type, returnToPicker));
  document.getElementById('modal').classList.add('reply-library-open');
}

async function uploadReplyTemplateMedia(file) {
  if (!file) return;
  file = await optimizeProspectImage(file);
  const isVideo = String(file.type || '').startsWith('video/');
  const maxBytes = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
  if (file.size > maxBytes) return alert(isVideo ? (lang === 'zh' ? '原始视频不能超过 50MB，请先缩短视频。' : 'Source video must be 50MB or smaller.') : (lang === 'zh' ? '素材不能超过 5MB。' : 'File must be 5MB or smaller.'));
  const status = document.getElementById('replyTemplateUploadStatus');
  if (status) status.textContent = isVideo && file.size > 5 * 1024 * 1024 ? (lang === 'zh' ? '视频超过 5MB，正在上传并自动压缩…' : 'Video exceeds 5MB. Uploading and compressing…') : (lang === 'zh' ? '正在上传并处理…' : 'Uploading…');
  try {
    const uploaded = await api('/api/customer-media/upload', { method: 'POST', body: JSON.stringify({ name: file.name, type: file.type || 'application/octet-stream', dataUrl: await fileAsDataUrl(file) }) });
    replyTemplatePendingAttachment = { name: uploaded.name, type: uploaded.type, size: uploaded.size, url: uploaded.url, kind: uploaded.type?.startsWith('image/') ? 'image' : 'video' };
    if (status) status.innerHTML = replyTemplatePreviewHtml(replyTemplatePendingAttachment.kind, replyTemplatePendingAttachment);
  } catch (err) {
    replyTemplatePendingAttachment = null;
    if (status) status.textContent = lang === 'zh' ? '上传失败' : 'Upload failed';
    alert(err.message);
  }
}

async function saveReplyTemplate(id, type, returnToPicker = false) {
  const title = String(document.getElementById('replyTemplateTitle')?.value || '').trim();
  const category = normalizeReplyTemplateCategory(document.getElementById('replyTemplateCategory')?.value || '');
  const content = String(document.getElementById('replyTemplateContent')?.value || '').trim();
  if (type === 'text' && !content) return alert(lang === 'zh' ? '请填写回复文字。' : 'Enter reply text.');
  if (type !== 'text' && !replyTemplatePendingAttachment?.url) return alert(lang === 'zh' ? '请先上传素材文件。' : 'Upload a file first.');
  try {
    state = await api(`/api/replyTemplates${id ? `/${encodeURIComponent(id)}` : ''}`, {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify({ type, category, title, content, attachment: type === 'text' ? null : replyTemplatePendingAttachment })
    });
    broadcastDataChange();
    replyTemplatePendingAttachment = null;
    replyTemplateCategoryFilter = category;
    if (returnToPicker) openReplyReferenceLibrary(type);
    else { closeModal(); replyTemplateLibraryType = type; render(); }
  } catch (err) { alert(err.message); }
}

async function deleteReplyTemplate(id, type, returnToPicker = false) {
  if (!confirm(lang === 'zh' ? '确定删除这个云端回复素材吗？' : 'Delete this cloud reply item?')) return;
  try {
    state = await api(`/api/replyTemplates/${encodeURIComponent(id)}`, { method: 'DELETE' });
    broadcastDataChange();
    if (returnToPicker) openReplyReferenceLibrary(type);
    else { closeModal(); replyTemplateLibraryType = type; render(); }
  } catch (err) { alert(err.message); }
}

async function saveProspectWorkspaceDetails() {
  const { collection, item } = activeCustomerWorkspaceItem();
  if (!item || !hasPerm('prospectsEdit')) return;
  const value = id => String(document.getElementById(id)?.value || '').trim();
  const button = document.getElementById('workspaceSaveDetailsButton');
  const ownerId = value('workspaceOwnerId');
  const rep = (state.customerServiceReps || []).find(row => row.id === ownerId);
  const updated = {
    ...item,
    date: value('workspaceDate'), source: value('workspaceSource'), customer: value('workspaceCustomer'),
    phone: value('workspacePhone'), vehicle: value('workspaceVehicle'), need: value('workspaceNeed'),
    service: value('workspaceService'), appointmentDate: value('workspaceAppointmentDate'),
    appointmentTime: value('workspaceAppointmentTime'), ownerId, ownerName: rep?.name || '',
    intentLevel: value('workspaceIntentLevel'), status: value('workspaceStatus')
  };
  if (!updated.customer && !updated.phone) return alert(lang === 'zh' ? '客户姓名或电话至少填写一个。' : 'Please enter at least a customer name or phone.');
  if (button) { button.disabled = true; button.textContent = lang === 'zh' ? '保存中…' : 'Saving…'; }
  try {
    state = await api(`/api/${collection}/${item.id}`, { method: 'PUT', body: JSON.stringify(updated) });
    prospectWorkspaceDrafts.delete(activeProspectWorkspaceId);
    broadcastDataChange();
    const savedConversation = collection === 'customerConversations'
      ? (state.customerConversations || []).find(row => row.id === item.id)
      : null;
    if (savedConversation?.promotedProspectId) {
      closeProspectWorkspace();
      current = 'prospects';
    }
    render();
  } catch (err) {
    alert(err.message);
    if (button) { button.disabled = false; button.textContent = lang === 'zh' ? '保存客户资料' : 'Save customer details'; }
  }
}

async function sendProspectSms() {
  const { collection, item } = activeCustomerWorkspaceItem();
  const input = document.getElementById('prospectReplyInput');
  const button = document.getElementById('prospectSendSmsButton');
  const text = String(input?.value || '').trim();
  if (!item || (!text && !prospectPendingAttachment)) return;
  if (button) {
    button.disabled = true;
    button.textContent = lang === 'zh' ? '发送中…' : 'Sending…';
  }
  try {
    const result = await api('/api/twilio/send', {
      method: 'POST',
      body: JSON.stringify({ collection, id: item.id, text, attachment: prospectPendingAttachment })
    });
    prospectReplyRevision += 1;
    if (input) input.value = '';
    prospectPendingAttachment = null;
    state = result.data;
    broadcastDataChange();
    preserveProspectWorkspaceRender = false;
    render();
  } catch (err) {
    alert(err.message);
    if (button) {
      button.disabled = false;
      button.textContent = lang === 'zh' ? '发送短信' : 'Send SMS';
    }
  }
}

function leadTable() {
  const rows = sortByDateDesc(state.leads || []);
  return `<div class="table-wrap"><table><thead><tr><th>${t('date')}</th><th>${t('source')}</th><th>${t('leadType')}</th><th>${t('customer')}</th><th>${t('service')}</th><th>${t('customerService')}</th><th>${t('leadStatus')}</th><th>${t('quote')}</th>${canSeeCommission() ? `<th>${t('soldAmount')}</th>` : ''}<th>${t('note')}</th><th></th></tr></thead><tbody>
  ${rows.map(lead => {
    const rep = (state.customerServiceReps || []).find(x => x.id === lead.repId);
    return `<tr><td>${escapeHtml(lead.date || '')}</td><td>${escapeHtml(lead.source || '')}</td><td>${leadTypeName(lead.leadType)}</td><td>${escapeHtml(lead.customer || '')}<br><span class="note">${escapeHtml(lead.phone || '')}</span></td><td>${serviceNames[lead.service] || escapeHtml(lead.service || '')}</td><td>${rep ? escapeHtml(rep.name) : t('unassigned')}</td><td>${leadStatusPill(lead.status)}</td><td>${currency.format(Number(lead.quote || 0))}</td>${canSeeCommission() ? `<td>${currency.format(Number(lead.soldAmount || 0))}</td>` : ''}<td>${escapeHtml(lead.note || '')}</td>${actionCell('Lead','leads',lead.id)}</tr>`;
  }).join('')}
  ${rows.length ? '' : `<tr><td colspan="${canSeeCommission() ? 11 : 10}" class="note">${lang === 'zh' ? '还没有客资记录。' : 'No leads yet.'}</td></tr>`}
  </tbody></table></div>`;
}

function userTable() {
  const avatarLabel = lang === 'zh' ? '头像' : 'Photo';
  return `<div class="table-wrap"><table><thead><tr><th>${avatarLabel}</th><th>${t('name')}</th><th>${t('email')}</th><th>${t('role')}</th><th>${t('active')}</th><th></th></tr></thead><tbody>
  ${state.users.map(u => `<tr><td class="employee-avatar-cell">${userAvatarHtml(u)}</td><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td>${roleNames[u.role] || u.role}</td><td>${u.active ? `<span class="pill good">${t('enabled')}</span>` : `<span class="pill bad">${t('disabled')}</span>`}</td>${userActionCell(u)}</tr>`).join('')}
  </tbody></table></div>`;
}

function laborReport(jobsSource = state.jobs || [], range = null) {
  const rows = state.installers.map(i => installerPaySummary(i, jobsSource, range));
  const grand = rows.reduce((sum, row) => ({
    count: sum.count + row.count,
    points: sum.points + Number(row.points || 0),
    base: sum.base + Number(row.base || 0),
    overagePay: sum.overagePay + Number(row.overagePay || 0),
    total: sum.total + row.total
  }), { count: 0, points: 0, base: 0, overagePay: 0, total: 0 });
  return `<div class="table-wrap"><table><thead><tr><th>${t('tech')}</th><th>${lang === 'zh' ? '订单数' : 'Jobs'}</th><th>${lang === 'zh' ? '任务积分' : 'Points'}</th><th>${t('basePay')}</th><th>${lang === 'zh' ? '超产提成' : 'Bonus'}</th><th>${t('labor')}</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${r.count}</td><td>${r.points === null ? '-' : Number(r.points || 0).toFixed(1).replace(/\\.0$/, '')}</td><td>${currency.format(Number(r.base || 0))}</td><td>${currency.format(Number(r.overagePay || 0))}</td><td>${currency.format(r.total)}</td></tr>`).join('')}${rows.length ? `<tr class="total-row"><td>${lang === 'zh' ? '总计' : 'Total'}</td><td>${grand.count}</td><td>${grand.points.toFixed(1).replace(/\\.0$/, '')}</td><td>${currency.format(grand.base)}</td><td>${currency.format(grand.overagePay)}</td><td>${currency.format(grand.total)}</td></tr>` : ''}</tbody></table></div>`;
}

function auditControls() {
  return `<div class="search-row">
    <label style="margin:0">${lang === 'zh' ? '查询日期' : 'Date'}<input type="date" value="${escapeHtml(auditDate || '')}" onchange="setAuditDate(this.value)" /></label>
    <button class="btn" onclick="setAuditDate(today())">${lang === 'zh' ? '今天' : 'Today'}</button>
    <button class="btn" onclick="setAuditDate('')">${lang === 'zh' ? '全部' : 'All'}</button>
  </div>`;
}

function setAuditDate(value) {
  auditDate = value || '';
  render();
}

function auditTable() {
  const rows = [...(state.auditLogs || [])]
    .filter(row => !auditDate || String(row.at || '').slice(0, 10) === auditDate)
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  return `<div class="table-wrap"><table><thead><tr><th>${lang === 'zh' ? '时间' : 'Time'}</th><th>${lang === 'zh' ? '人员' : 'User'}</th><th>${lang === 'zh' ? '动作' : 'Action'}</th><th>${lang === 'zh' ? '表格' : 'Table'}</th><th>${lang === 'zh' ? '数据' : 'Record'}</th><th>${lang === 'zh' ? '改动内容' : 'Changes'}</th></tr></thead><tbody>
  ${rows.map(a => `<tr><td>${a.at ? new Date(a.at).toLocaleString() : ''}</td><td>${escapeHtml(a.userName || '')}</td><td>${escapeHtml(auditActionName(a.action))}</td><td>${escapeHtml(collectionName(a.collection))}</td><td>${escapeHtml(a.recordLabel || a.recordId || '')}</td><td>${auditChangeText(a)}</td></tr>`).join('')}
  ${rows.length ? '' : `<tr><td colspan="6" class="note">${lang === 'zh' ? '没有找到操作记录。' : 'No activity records found.'}</td></tr>`}
  </tbody></table></div>`;
}

function auditActionName(action) {
  const text = String(action || '');
  if (text.startsWith('create-')) return lang === 'zh' ? '新增' : 'Create';
  if (text.startsWith('update-')) return lang === 'zh' ? '修改' : 'Update';
  if (text.startsWith('delete-')) return lang === 'zh' ? '删除' : 'Delete';
  return text;
}

function auditChangeText(row) {
  if (Array.isArray(row.changedFields) && row.changedFields.length) {
    return row.changedFields.map(change => `<div><strong>${escapeHtml(fieldName(change.field))}</strong>: ${escapeHtml(formatAuditValue(change.before))} → ${escapeHtml(formatAuditValue(change.after))}</div>`).join('');
  }
  if (row.snapshot) return `<span class="note">${lang === 'zh' ? '删除前已记录完整数据快照' : 'Deleted record snapshot saved'}</span>`;
  return escapeHtml(row.detail || '');
}

function formatAuditValue(value) {
  if (value === undefined || value === null || value === '') return lang === 'zh' ? '空' : 'blank';
  return String(value);
}

function collectionName(collection) {
  const names = {
    jobs: t('jobs'),
    installers: t('installers'),
    products: t('inventory'),
    movements: lang === 'zh' ? '出入库流水' : 'Inventory Movements',
    workshopMovements: t('workshopLedger'),
    priceRules: t('pricing'),
    salesOrders: t('orders'),
    shipments: t('shipments'),
    schedules: t('schedules'),
    prospects: t('prospects'),
    leads: t('leads'),
    customerServiceReps: lang === 'zh' ? '客服提成规则' : 'Commission Rules',
    expenses: t('expenses'),
    users: t('users')
  };
  return names[collection] || collection || '';
}

function fieldName(field) {
  const names = {
    date: t('date'),
    scheduleDate: t('scheduleDate'),
    customer: t('customer'),
    phone: lang === 'zh' ? '电话' : 'Phone',
    source: t('source'),
    vehicle: t('vehicle'),
    salesRep: t('salesRep'),
    preparedBy: t('formFilledBy'),
    status: t('status'),
    price: t('quote'),
    materialCost: t('materialCost'),
    deposit: lang === 'zh' ? '订金' : 'Deposit',
    notes: t('note'),
    name: t('name'),
    email: t('email'),
    sku: t('sku'),
    type: t('type'),
    qty: t('qty'),
    operator: t('operator'),
    jobCustomer: t('workshopUsage'),
    amount: t('amount'),
    cost: t('cost')
  };
  return names[field] || field;
}

function actionCell(prefix, collection, id) {
  const editPerm = collectionPermission(collection, 'edit');
  const deletePerm = collectionPermission(collection, 'delete');
  const edit = editPerm && hasPerm(editPerm) ? `<button class="icon-btn" title="${t('edit')}" onclick="event.stopPropagation(); open${prefix}('${id}')">✎</button>` : '';
  const del = deletePerm && hasPerm(deletePerm) ? `<button class="icon-btn" title="${t('delete')}" onclick="event.stopPropagation(); removeItem('${collection}','${id}')">×</button>` : '';
  return `<td><div class="mini-actions">${edit}${del}</div></td>`;
}

function userActionCell(row) {
  if (row.role === 'owner') {
    return `<td><span class="pill info">${lang === 'zh' ? '老板受保护' : 'Owner protected'}</span></td>`;
  }
  return actionCell('User', 'users', row.id);
}

function collectionPermission(collection, action) {
  const map = {
    jobs: { edit: 'jobsEdit', delete: 'jobsDelete' },
    installers: { edit: 'installerEdit', delete: 'installerEdit' },
    products: { edit: 'inventoryEdit', delete: 'inventoryEdit' },
    priceRules: { edit: 'pricingEdit', delete: 'pricingEdit' },
    salesOrders: { edit: 'ordersEdit', delete: 'ordersEdit' },
    shipments: { edit: 'shipmentsEdit', delete: 'shipmentsEdit' },
    schedules: { edit: 'schedulesEdit', delete: 'schedulesEdit' },
    prospects: { edit: 'prospectsEdit', delete: 'prospectsEdit' },
    leads: { edit: 'leadsEdit', delete: 'leadsEdit' },
    customerServiceReps: { edit: 'commissionEdit', delete: 'commissionEdit' },
    expenses: { edit: 'expensesEdit', delete: 'expensesEdit' },
    users: { edit: 'usersManage', delete: 'usersManage' }
  };
  return map[collection]?.[action];
}

function openQuickAdd() {
  if ((current === 'jobs' || current === 'dashboard') && hasPerm('jobsCreate')) return openJob();
  if (current === 'installers' && hasPerm('installerEdit')) return openInstaller();
  if (current === 'pricing' && hasPerm('pricingEdit')) return openPriceRule();
  if (current === 'inventory' && hasPerm('inventoryEdit')) return openProduct();
  if (current === 'workshopInventory' && hasPerm('inventoryEdit')) return openWorkshopMovement('transfer');
  if (current === 'customerCenter' && hasPerm('prospectsEdit')) return openProspect(null, 'customerConversations');
  if (current === 'prospects' && hasPerm('prospectsEdit')) return openProspect();
  if (current === 'leads' && hasPerm('leadsEdit')) return openLead();
  if (current === 'orders' && hasPerm('ordersEdit')) return openSalesOrder();
  if (current === 'shipments' && hasPerm('shipmentsEdit')) return openShipment();
  if (current === 'schedules' && hasPerm('schedulesEdit')) return openSchedule();
  if (current === 'expenses' && hasPerm('expensesEdit')) return openExpense();
  if (current === 'users' && hasPerm('usersManage')) return openUser();
  alert(lang === 'zh' ? '你没有新增权限。' : 'You do not have create permission.');
}

function openJob(id, preset = {}) {
  const item = state.jobs.find(x => x.id === id) || { date: today(), scheduleDate: '', customer: '', phone: '', source: 'Walk-in', leadRepId: '', receptionRepId: '', vehicle: '', vin: '', salesRep: '', service: 'tint', vehicleClass: '小型轿车', package: '基本款', installerId: '', status: '排期', price: 0, materialCost: 0, deposit: 0, paidAmount: 0, paymentStatus: 'unpaid', paymentMethod: '', notes: '', ...preset };
  const selectedServices = jobServices(item);
  const selectedInstallers = jobInstallerIds(item);
  const fields = [
    ['date',t('date'),'date',item.date], ['scheduleDate',t('scheduleDate'),'date',item.scheduleDate || ''], ['customer',lang === 'zh' ? '客户姓名' : 'Customer Name','text',item.customer], ['phone',lang === 'zh' ? '电话' : 'Phone','text',item.phone],
    ['source',t('source'),'select',item.source || 'Walk-in', leadSourceOptions()],
    ['leadRepId',t('leadGroupRep'),'select',item.leadRepId || '', customerServiceOptions()],
    ['receptionRepId',t('receptionRep'),'select',item.receptionRepId || '', customerServiceOptions()],
    ['vehicle',lang === 'zh' ? '车型 年份品牌型号' : 'Vehicle Year / Make / Model','text',item.vehicle], ['salesRep',t('salesRep'),'text',item.salesRep || ''], ['vin','VIN / Plate','text',item.vin], ['services',t('service'),'multi',selectedServices, serviceOptions()],
    ['vehicleClass',t('vehicleClass'),'select',item.vehicleClass, vehicleClassOptions()], ['package',t('package'),'text',item.package], ['installerIds',lang === 'zh' ? '参与师傅（工费按一台车算一次）' : 'Installers (pay counted once per car)','multi',selectedInstallers, installerMultiOptions()],
    ['preparedBy',t('formFilledBy'),'readonly',item.preparedBy || user?.name || ''],
    ['status',t('status'),'select',item.status, statusOptions()], ['price',`${t('quote')} $`,'number',item.price],
    ...(canSeeFinance() ? [['materialCost',`${t('materialCost')} $`,'number',item.materialCost]] : []),
    ['deposit',lang === 'zh' ? '订金 $' : 'Deposit $','number',item.deposit],
    ['paidAmount',`${t('paid')} $`,'number',jobPaidAmount(item)],
    ['paymentStatus',t('paymentStatus'),'select',jobPaymentStatusValue(item), paymentStatusOptions()],
    ['paymentMethod',t('paymentMethod'),'select',item.paymentMethod || '', paymentMethodOptions()],
    ['notes',t('note'),'textarea',item.notes, null, 'wide']
  ];
  const ids = ['date','scheduleDate','customer','phone','source','leadRepId','receptionRepId','vehicle','salesRep','vin','services','vehicleClass','package','installerIds','status','price', ...(canSeeFinance() ? ['materialCost'] : []), 'deposit','paidAmount','paymentStatus','paymentMethod','notes'];
  openModal(id ? (lang === 'zh' ? '编辑施工单' : 'Edit Job') : (lang === 'zh' ? '新增施工单' : 'New Job'), formHtml(fields), () => {
    const data = numeric(readForm(ids), ['price', ...(canSeeFinance() ? ['materialCost'] : []), 'deposit','paidAmount']);
    if (!id) {
      const dateError = validateNotPastEntryDate(data.date);
      if (dateError) return alert(dateError);
    }
    data.service = data.services[0] || 'tint';
    data.installerId = data.installerIds[0] || '';
    if (item.sourceProspectId) data.sourceProspectId = item.sourceProspectId;
    return saveRecord('jobs', id, data);
  });
}

function openJobFromProspect(prospectId) {
  const prospect = (state.prospects || []).find(row => row.id === prospectId);
  if (!prospect) return alert(lang === 'zh' ? '找不到这位高意向客户。' : 'High-intent customer not found.');
  const existing = (state.jobs || []).find(job => job.id === prospect.convertedJobId || job.sourceProspectId === prospect.id);
  closeModal();
  if (existing) return openJob(existing.id);
  const appointment = [
    prospect.appointmentTime ? `${lang === 'zh' ? '预约时间' : 'Appointment time'}：${prospect.appointmentTime}` : '',
    prospect.need || '',
    `${lang === 'zh' ? '由高意向客户自动带入' : 'Created from high-intent customer'}：${prospect.customer || prospect.phone || prospect.id}`
  ].filter(Boolean).join('\n');
  return openJob(null, {
    date: today(),
    scheduleDate: prospect.appointmentDate || '',
    customer: prospect.customer || '',
    phone: prospect.phone || '',
    source: prospect.source || 'Walk-in',
    leadRepId: prospect.ownerId || '',
    receptionRepId: prospect.ownerId || '',
    vehicle: prospect.vehicle || '',
    service: prospect.service || 'tint',
    services: [prospect.service || 'tint'],
    package: '',
    status: '排期',
    notes: appointment,
    sourceProspectId: prospect.id
  });
}

function openInstaller(id) {
  const item = state.installers.find(x => x.id === id) || { name: '', city: '', phone: '', skills: '', mode: 'percent', tint: 25, ppf: 25, wrap: 25, ceramic: 20, base: 0, baseQuota: 20, tintPoint: 1, ppfPoint: 3, wrapPoint: 3, ceramicPoint: 1, active: true };
  openModal(id ? (lang === 'zh' ? '编辑师傅' : 'Edit Installer') : (lang === 'zh' ? '新增师傅' : 'New Installer'), formHtml([
    ['name',t('name'),'text',item.name], ['city',t('city'),'text',item.city], ['phone',lang === 'zh' ? '联系方式' : 'Contact','text',item.phone],
    ['skills',t('skills'),'text',item.skills], ['mode',lang === 'zh' ? '工费模式' : 'Pay Mode','select',item.mode, [['percent',t('percent')],['fixed',t('fixed')],['basePlus',t('basePlus')]]],
    ['tint',`${t('tint')} ${lang === 'zh' ? '超产金额' : 'Bonus Amount'}`,'number',item.tint],
    ['ppf',`${t('ppf')} ${lang === 'zh' ? '超产金额' : 'Bonus Amount'}`,'number',item.ppf],
    ['wrap',`${t('wrap')} ${lang === 'zh' ? '超产金额' : 'Bonus Amount'}`,'number',item.wrap],
    ['ceramic',`${t('ceramic')} ${lang === 'zh' ? '超产金额' : 'Bonus Amount'}`,'number',item.ceramic],
    ['base',lang === 'zh' ? '月保底/底薪' : 'Monthly Base Pay','number',item.base],
    ['baseQuota',lang === 'zh' ? '月任务积分' : 'Monthly Quota Points','number',item.baseQuota || 20],
    ['tintPoint',lang === 'zh' ? '窗膜积分' : 'Tint Points','number',item.tintPoint || 1],
    ['ppfPoint',lang === 'zh' ? 'PPF积分' : 'PPF Points','number',item.ppfPoint || 3],
    ['wrapPoint',lang === 'zh' ? 'TPU改色积分' : 'TPU Color Change Points','number',item.wrapPoint || 3],
    ['ceramicPoint',lang === 'zh' ? '建筑膜积分' : 'Architectural Film Points','number',item.ceramicPoint || 1]
  ]), () => saveRecord('installers', id, numeric(readForm(['name','city','phone','skills','mode','tint','ppf','wrap','ceramic','base','baseQuota','tintPoint','ppfPoint','wrapPoint','ceramicPoint']), ['tint','ppf','wrap','ceramic','base','baseQuota','tintPoint','ppfPoint','wrapPoint','ceramicPoint'])));
}

function openPriceRule(id) {
  const item = state.priceRules.find(x => x.id === id) || { service: 'tint', vehicleClass: '小型轿车', package: '', base: 0, materialCost: 0, hours: 0 };
  const fields = [
    ['service',t('service'),'select',item.service, serviceOptions()], ['vehicleClass',t('vehicleClass'),'select',item.vehicleClass, vehicleClassOptions()], ['package',t('package'),'text',item.package],
    ['base',`${t('basePrice')} $`,'number',item.base], ...(canSeeFinance() ? [['materialCost',`${t('materialCost')} $`,'number',item.materialCost]] : []), ['hours',t('hours'),'number',item.hours]
  ];
  const ids = ['service','vehicleClass','package','base', ...(canSeeFinance() ? ['materialCost'] : []), 'hours'];
  openModal(id ? (lang === 'zh' ? '编辑定价规则' : 'Edit Pricing Rule') : (lang === 'zh' ? '新增定价规则' : 'New Pricing Rule'), formHtml(fields), () => saveRecord('priceRules', id, numeric(readForm(ids), ['base', ...(canSeeFinance() ? ['materialCost'] : []), 'hours'])));
}

function openProduct(id) {
  const item = state.products.find(x => x.id === id) || { sku: '', name: '', category: '窗膜卷料', unit: 'm', cost: 0, price: 0, wholesale: 0, minPrice: 0, qty: 0, reorder: 0, location: '' };
  const fields = [
    ['sku','SKU','text',item.sku], ['name',t('productName'),'text',item.name], ['category',t('category'),'select',item.category, productCategories()],
    ['unit',lang === 'zh' ? '单位' : 'Unit','text',item.unit], ...(canSeeFinance() ? [['cost',`${t('cost')} $`,'number',item.cost]] : []), ['price',`${t('retailPrice')} $`,'number',item.price],
    ['wholesale',`${t('wholesalePrice')} $`,'number',item.wholesale],
    ['minPrice',`${t('minSalePrice')} $`,'number',item.minPrice || item.wholesale || 0],
    ['qty',lang === 'zh' ? '当前库存' : 'Current Stock','number',item.qty], ['reorder',lang === 'zh' ? '预警库存' : 'Reorder Level','number',item.reorder], ['location',lang === 'zh' ? '仓位' : 'Location','text',item.location]
  ];
  const ids = ['sku','name','category','unit', ...(canSeeFinance() ? ['cost'] : []), 'price','wholesale','minPrice','qty','reorder','location'];
  openModal(id ? (lang === 'zh' ? '编辑库存商品' : 'Edit SKU') : (lang === 'zh' ? '新增库存商品' : 'New SKU'), formHtml(fields), () => saveRecord('products', id, numeric(readForm(ids), [...(canSeeFinance() ? ['cost'] : []), 'price','wholesale','minPrice','qty','reorder'])));
}

function openMovement(preset = {}) {
  openModal(lang === 'zh' ? '新增出入库流水' : 'New Inventory Movement', formHtml([
    ['date',t('date'),'date',today()], ['sku','SKU','select',preset.sku || state.products[0]?.sku || '', state.products.map(p => p.sku)], ['type',t('type'),'select',preset.type || 'out', [['in',t('in')],['out',t('out')]]],
    ['qty',t('qty'),'number',preset.qty || 0], ['salesOrderId',t('relatedOrder'),'select',preset.salesOrderId || '', salesOrderMovementOptions(preset.sku)], ['note',t('note'),'text',preset.note || '']
  ]) + `<div class="wide stock-hint" id="movementStockHint"></div>`, () => {
    const data = numeric(readForm(['date','sku','type','qty','salesOrderId','note']), ['qty']);
    const dateError = validateTodayEntryDate(data.date);
    if (dateError) return alert(dateError);
    if (data.type !== 'out') data.salesOrderId = '';
    const product = state.products.find(p => p.sku === data.sku);
    const currentQty = Number(product?.qty || 0);
    if (data.qty <= 0) return alert(lang === 'zh' ? '数量必须大于 0。' : 'Quantity must be greater than 0.');
    if (data.type === 'out' && !data.salesOrderId) return alert(lang === 'zh' ? '出库必须关联零售/批发订单。没有订单不允许出货。' : 'Stock-out must be linked to a retail / wholesale order.');
    if (data.type === 'out' && data.qty > currentQty) {
      return alert(`${t('overStockOut')}：${data.sku} ${t('currentStock')} ${currentQty}，${t('out')} ${data.qty}`);
    }
    saveRecord('movements', null, data);
  });
  setupMovementStockGuard();
}

function openMovementForSku(sku, type = 'in', qty = 1) {
  openMovement({
    sku,
    type,
    qty,
    note: type === 'in' ? (lang === 'zh' ? '库存报警补货' : 'Stock alert restock') : ''
  });
}

function openWorkshopMovement(type = 'transfer') {
  const movementType = type === 'consume' ? 'consume' : 'transfer';
  openModal(
    movementType === 'transfer' ? t('workshopTransfer') : t('workshopConsume'),
    formHtml([
      ['date',t('date'),'date',today()],
      ['sku','SKU','workshopSkuSearch',''],
      ['type',t('type'),'select',movementType,[['transfer',t('workshopTransfer')],['consume',t('workshopConsume')]]],
      ['qty',t('qtyMeters'),'number',0],
      ['operator',t('operator'),'text',user?.name || ''],
      ['jobCustomer',t('workshopUsage'),'text',''],
      ['note',t('note'),'textarea','', null, 'wide']
    ]) + `<div class="wide stock-hint" id="workshopStockHint"></div>`,
    () => {
      const data = numeric(readForm(['date','sku','type','qty','operator','jobCustomer','note']), ['qty']);
      const dateError = validateTodayEntryDate(data.date);
      if (dateError) return alert(dateError);
      if (!data.sku) return alert(lang === 'zh' ? '请先选择 SKU。' : 'Choose a SKU first.');
      const product = state.products.find(p => p.sku === data.sku);
      if (!product) return alert(lang === 'zh' ? '找不到这个 SKU。' : 'Cannot find this SKU.');
      if (data.qty <= 0) return alert(lang === 'zh' ? '数量必须大于 0。' : 'Quantity must be greater than 0.');
      const availableQty = data.type === 'transfer' ? Number(product.qty || 0) : workshopStockQty(data.sku);
      if (data.qty > availableQty) {
        const label = data.type === 'transfer' ? t('mainWarehouseStock') : t('workshopCurrentStock');
        const availableUnit = data.type === 'transfer' ? (product.unit || '') : t('meter');
        return alert(`${label} ${availableQty} ${availableUnit}，${t('qtyMeters')} ${data.qty} ${t('meter')}`);
      }
      return saveRecord('workshopMovements', null, data);
    }
  );
  setupWorkshopSkuSearch();
  setupWorkshopStockGuard();
}

function openProspect(id, collection = 'prospects') {
  const item = (state[collection] || []).find(x => x.id === id) || {
    date: today(),
    source: 'Yelp',
    customer: '',
    phone: '',
    vehicle: '',
    need: '',
    service: 'tint',
    appointmentDate: '',
    appointmentTime: '',
    ownerId: (state.customerServiceReps || [])[0]?.id || '',
    ownerName: '',
    intentLevel: '高意向',
    status: '新意向',
    chatContext: '',
    chatTranslation: '',
    intentReason: '',
    conversationMessages: [],
    note: ''
  };
  const mainFields = [
    ['date',t('date'),'date',item.date],
    ['source',t('source'),'select',item.source || 'Yelp', leadSourceOptions()],
    ['customer',t('customer'),'text',item.customer],
    ['phone',lang === 'zh' ? '电话' : 'Phone','text',item.phone],
    ['vehicle',t('vehicle'),'text',item.vehicle],
    ['need',t('vehicleNeed'),'text',item.need],
    ['service',t('service'),'select',item.service || 'tint', serviceOptions()],
    ['appointmentDate',t('appointmentDate'),'date',item.appointmentDate || ''],
    ['appointmentTime',t('appointmentTime'),'time',item.appointmentTime || ''],
    ['ownerId',t('contactOwner'),'select',item.ownerId || '', customerServiceOptions()],
    ['intentLevel',t('intentLevel'),'select',normalizeProspectIntentValue(item.intentLevel || '高意向'), prospectIntentOptions()],
    ['status',t('prospectStatus'),'select',item.status || '新意向', prospectStatusOptions()]
  ];
  const detailFields = [
    ['intentReason',lang === 'zh' ? '意向判断' : 'Intent Reason','textarea',item.intentReason || '', null, 'wide raw-conversation-field'],
    ['chatContext',lang === 'zh' ? '原始聊天记录' : 'Raw Conversation','textarea',item.chatContext || '', null, 'wide raw-conversation-field'],
    ['chatTranslation',lang === 'zh' ? '中文整理' : 'Chinese Summary','textarea',item.chatTranslation || '', null, 'wide raw-conversation-field'],
    ['note',t('note'),'textarea',item.note || '', null, 'wide']
  ];
  const conversationPanel = `<div class="wide prospect-dialog-section">${prospectConversationPreview(item)}</div>`;
  const recordLabel = collection === 'customerConversations' ? (lang === 'zh' ? '客户交流' : 'Customer Conversation') : (lang === 'zh' ? '高意向客户' : 'High-Intent Customer');
  openModal(id ? `${lang === 'zh' ? '编辑' : 'Edit'} ${recordLabel}` : `${lang === 'zh' ? '新增' : 'New'} ${recordLabel}`, formHtml(mainFields) + conversationPanel + formHtml(detailFields), () => {
    const data = readForm(['date','source','customer','phone','vehicle','need','service','appointmentDate','appointmentTime','ownerId','intentLevel','status','intentReason','chatContext','chatTranslation','note']);
    const rep = (state.customerServiceReps || []).find(x => x.id === data.ownerId);
    data.ownerName = rep ? rep.name : '';
    data.conversationMessages = item.conversationMessages || [];
    ['importSource','sourceDevice','externalId','profileUrl','createdAt','importedAt'].forEach(key => {
      if (item[key]) data[key] = item[key];
    });
    if (!data.customer && !data.phone) return alert(lang === 'zh' ? '客户姓名或电话至少填写一个。' : 'Please enter at least a customer name or phone.');
    return saveRecord(collection, id, data);
  });
  const jobAction = document.getElementById('modalHeaderAction');
  const existingJob = collection === 'prospects' && id
    ? (state.jobs || []).find(job => job.id === item.convertedJobId || job.sourceProspectId === item.id)
    : null;
  const canOpenJob = existingJob ? hasPerm('jobsEdit') : hasPerm('jobsCreate');
  if (jobAction && collection === 'prospects' && id && canOpenJob) {
    jobAction.hidden = false;
    jobAction.textContent = existingJob
      ? (lang === 'zh' ? '编辑施工单' : 'Edit job')
      : (lang === 'zh' ? '创建施工单' : 'Create job');
    jobAction.onclick = () => openJobFromProspect(item.id);
  }
}

function openLead(id) {
  const item = (state.leads || []).find(x => x.id === id) || {
    date: today(),
    source: 'Yelp',
    leadType: 'online',
    customerType: 'toc',
    saleType: 'install',
    customer: '',
    phone: '',
    service: 'tint',
    repId: (state.customerServiceReps || [])[0]?.id || '',
    status: '新客资',
    quote: 0,
    soldAmount: 0,
    note: ''
  };
  openModal(id ? (lang === 'zh' ? '编辑客资' : 'Edit Lead') : (lang === 'zh' ? '新增客资' : 'New Lead'), formHtml([
    ['date',t('date'),'date',item.date],
    ['source',t('source'),'select',item.source, leadSourceOptions()],
    ['leadType',t('leadType'),'select',item.leadType || 'online', leadTypeOptions()],
    ['customerType',t('customerType'),'select',item.customerType || 'toc', customerTypeOptions()],
    ['saleType',t('saleType'),'select',item.saleType || 'install', saleTypeOptions()],
    ['customer',t('customer'),'text',item.customer],
    ['phone',lang === 'zh' ? '电话' : 'Phone','text',item.phone],
    ['service',t('service'),'select',item.service, serviceOptions()],
    ['repId',t('customerService'),'select',item.repId || '', customerServiceOptions()],
    ['status',t('leadStatus'),'select',item.status, leadStatusOptions()],
    ['quote',`${t('quote')} $`,'number',item.quote],
    ['soldAmount',`${t('soldAmount')} $`,'number',item.soldAmount],
    ['note',t('note'),'textarea',item.note, null, 'wide']
  ]), () => {
    const data = numeric(readForm(['date','source','leadType','customerType','saleType','customer','phone','service','repId','status','quote','soldAmount','note']), ['quote','soldAmount']);
    if (!id) {
      const dateError = validateTodayEntryDate(data.date);
      if (dateError) return alert(dateError);
    }
    return saveRecord('leads', id, data);
  });
}

function openCustomerServiceRep(id) {
  const item = (state.customerServiceReps || []).find(x => x.id === id) || { name: '', role: '前台', plan: 'onlineTier', invitePay: 0, closePay: 0, arrivalTarget: 20, closeTarget: 50, minCloseAmount: 10000, ruleDetail: '', note: '', active: true };
  openModal(id ? (lang === 'zh' ? '编辑客服提成' : 'Edit Rep Commission') : (lang === 'zh' ? '新增客服提成' : 'New Rep Commission'), formHtml([
    ['name',t('name'),'text',item.name],
    ['role',t('role'),'text',item.role],
    ['plan',t('commissionPlan'),'select',item.plan || 'onlineTier', commissionPlanOptions()],
    ['invitePay',`${t('inviteCommission')} $`,'number',item.invitePay],
    ['closePay',`${t('closeCommission')} $`,'number',item.closePay],
    ['arrivalTarget',`${t('arrivalRate')} ${t('target')} %`,'number',item.arrivalTarget || 20],
    ['closeTarget',`${t('closeRate')} ${t('target')} %`,'number',item.closeTarget || 50],
    ['minCloseAmount',`${lang === 'zh' ? '最低成交金额' : 'Minimum Sold Amount'} $`,'number',item.minCloseAmount || 10000],
    ['active',t('status'),'select',String(item.active !== false), [['true',t('enabled')],['false',t('disabled')]]],
    ['ruleDetail',lang === 'zh' ? '规则细则' : 'Rule Detail','textarea',item.ruleDetail || '', null, 'wide'],
    ['note',t('note'),'textarea',item.note || '', null, 'wide']
  ]), () => {
    const data = numeric(readForm(['name','role','plan','invitePay','closePay','arrivalTarget','closeTarget','minCloseAmount','active','ruleDetail','note']), ['invitePay','closePay','arrivalTarget','closeTarget','minCloseAmount']);
    data.active = data.active === 'true';
    saveRecord('customerServiceReps', id, data);
  });
}

function openSalesOrder(id) {
  const item = state.salesOrders.find(x => x.id === id) || { date: today(), type: 'retail-us', customer: '', salesRep: '', preparedBy: user?.name || '', item: '', qty: 1, unitPrice: 0, status: '待收款', shipping: '', trackingNo: '', paid: 0, paymentMethod: '' };
  const fields = [
    ['date',t('date'),'date',item.date], ['type',t('type'),'select',item.type, salesOrderTypeOptions()], ['customer',t('customer'),'text',item.customer],
    ['salesRep',t('orderSalesRep'),'text',item.salesRep || ''],
    ['item',lang === 'zh' ? '商品SKU' : 'Item SKU','skuSearch',item.item], ['qty',t('qty'),'number',item.qty], ['unitPrice',lang === 'zh' ? '单价 $' : 'Unit Price $','number',item.unitPrice],
    ['status',t('status'),'select',item.status, salesStatusOptions()], ['paid',`${t('paid')} $`,'number',item.paid], ['paymentMethod',t('paymentMethod'),'select',item.paymentMethod || '', paymentMethodOptions()], ['shipping',t('shipping'),'text',item.shipping],
    ['trackingNo',t('orderTrackingNo'),'text',item.trackingNo || ''], ['preparedBy',t('preparedBy'),'text',item.preparedBy || user?.name || '']
  ];
  openModal(
    id ? (lang === 'zh' ? '编辑零售/批发订单' : 'Edit Sales Order') : (lang === 'zh' ? '新增零售/批发订单' : 'New Sales Order'),
    formHtml(fields) + `<p class="stock-hint wide" id="salesOrderMinHint"></p>`,
    () => {
      const data = numeric(readForm(['date','type','customer','salesRep','item','qty','unitPrice','status','paid','paymentMethod','shipping','trackingNo','preparedBy']), ['qty','unitPrice','paid']);
      if (!id) {
        const dateError = validateTodayEntryDate(data.date);
        if (dateError) return alert(dateError);
      }
      const error = validateSalesOrderFormData(data);
      if (error) return alert(error);
      return saveRecord('salesOrders', id, data);
    }
  );
  setupSalesOrderSkuSearch();
  document.getElementById('item')?.addEventListener('change', updateSalesOrderMinimumHint);
  document.getElementById('unitPrice')?.addEventListener('input', updateSalesOrderMinimumHint);
  updateSalesOrderMinimumHint();
}

function openShipment(id) {
  const item = (state.shipments || []).find(x => x.id === id) || {
    method: 'ocean',
    items: '',
    qty: '',
    supplier: '',
    contact: '',
    trackingNo: '',
    shipFrom: 'China',
    departDate: today(),
    etaPort: '',
    etaLasVegas: '',
    arrivedDate: '',
    status: '在途',
    note: ''
  };
  openModal(id ? (lang === 'zh' ? '编辑在途货物' : 'Edit Inbound Shipment') : (lang === 'zh' ? '新增在途货物' : 'New Inbound Shipment'), formHtml([
    ['method',t('shipmentMethod'),'select',item.method, shipmentMethodOptions()],
    ['items',t('shipmentItems'),'text',item.items],
    ['qty',t('qty'),'text',item.qty],
    ['supplier',t('supplier'),'text',item.supplier],
    ['contact',lang === 'zh' ? '联系人/电话' : 'Contact / Phone','text',item.contact],
    ['trackingNo',t('trackingNo'),'text',item.trackingNo],
    ['shipFrom',t('shipFrom'),'text',item.shipFrom],
    ['departDate',t('departDate'),'date',item.departDate],
    ['etaPort',t('etaPort'),'date',item.etaPort],
    ['etaLasVegas',t('etaLasVegas'),'date',item.etaLasVegas],
    ['arrivedDate',t('arrivedDate'),'date',item.arrivedDate],
    ['status',t('status'),'select',item.status, shipmentStatusOptions()],
    ['note',t('note'),'textarea',item.note, null, 'wide']
  ]), () => {
    const data = readForm(['method','items','qty','supplier','contact','trackingNo','shipFrom','departDate','etaPort','etaLasVegas','arrivedDate','status','note']);
    if (!data.items.trim()) return alert(lang === 'zh' ? '货物内容不能为空。' : 'Items are required.');
    saveRecord('shipments', id, data);
  });
}

function openSchedule(id) {
  const item = (state.schedules || []).find(x => x.id === id) || { date: today(), employeeId: activeEmployeeOptions()[0]?.[0] || '', type: 'work', shift: '10:00-18:00', reason: '', note: '' };
  openModal(id ? (lang === 'zh' ? '编辑调休/排班' : 'Edit Schedule') : (lang === 'zh' ? '新增调休/排班' : 'New Schedule'), formHtml([
    ['date',t('date'),'date',item.date],
    ['employeeId',t('name'),'select',item.employeeId || '', activeEmployeeOptions()],
    ['type',t('scheduleType'),'select',item.type || 'work', scheduleTypeOptions()],
    ['shift',t('shift'),'text',item.shift || ''],
    ['reason',lang === 'zh' ? '原因' : 'Reason','text',item.reason || ''],
    ['note',t('note'),'textarea',item.note || '', null, 'wide']
  ]), () => {
    const data = readForm(['date','employeeId','type','shift','reason','note']);
    saveRecord('schedules', id, data);
  });
}

function openExpense(id) {
  const item = (state.expenses || []).find(x => x.id === id) || { date: today(), category: '房屋租金', vendor: '', adPlacement: '', adStartDate: '', adEndDate: '', amount: 0, recurring: true, note: '' };
  openModal(id ? (lang === 'zh' ? '编辑运营成本' : 'Edit Operating Cost') : (lang === 'zh' ? '新增运营成本' : 'New Operating Cost'), formHtml([
    ['date',t('date'),'date',item.date],
    ['category',t('expenseCategory'),'select',item.category, expenseCategories()],
    ['vendor',t('vendor'),'text',item.vendor],
    ['adPlacement',t('adPlacement'),'text',item.adPlacement || ''],
    ['adStartDate',t('adStartDate'),'date',item.adStartDate || ''],
    ['adEndDate',t('adEndDate'),'date',item.adEndDate || ''],
    ['amount',`${t('amount')} $`,'number',item.amount],
    ['recurring',t('recurring'),'select',String(Boolean(item.recurring)), [['true',lang === 'zh' ? '是' : 'Yes'],['false',lang === 'zh' ? '否' : 'No']]],
    ['note',t('note'),'text',item.note]
  ]), () => {
    const data = readForm(['date','category','vendor','adPlacement','adStartDate','adEndDate','amount','recurring','note']);
    data.amount = Number(data.amount || 0);
    data.recurring = data.recurring === 'true';
    saveRecord('expenses', id, data);
  });
}

function openUser(id, presetRole = 'frontdesk') {
  const item = state.users.find(x => x.id === id) || { name: '', email: '', role: presetRole, active: true };
  const permissions = { ...roleDefaultPermissions(item.role), ...(item.permissions || {}) };
  openModal(id ? (lang === 'zh' ? '编辑账号' : 'Edit User') : (lang === 'zh' ? '新增账号' : 'New User'), formHtml([
    ['employeeAvatarDataUrl', '', 'avatar', item.avatarDataUrl || '', null, 'wide'],
    ['employeeAccountName',t('name'),'text',item.name],
    ['employeeAccountLogin',t('email'),'text',item.email],
    ['employeeAccountRole',t('role'),'select',item.role, roleOptions()],
    ['employeeAccountActive',t('status'),'select',String(item.active), [['true',t('enabled')],['false',t('disabled')]]],
    ['employeeAccountSecret',id ? t('newPassword') : (lang === 'zh' ? '临时密码' : 'Temporary Password'),'password','']
  ]) + permissionEditor(permissions), () => {
    const raw = readForm(['employeeAccountName','employeeAccountLogin','employeeAccountRole','employeeAccountActive','employeeAccountSecret']);
    const data = {
      name: raw.employeeAccountName,
      email: raw.employeeAccountLogin,
      role: raw.employeeAccountRole,
      active: raw.employeeAccountActive,
      password: raw.employeeAccountSecret,
      avatarDataUrl: document.getElementById('employeeAvatarDataUrl')?.value || ''
    };
    data.active = data.active === 'true';
    data.permissions = readPermissions();
    if (!data.password) delete data.password;
    if (!data.name.trim()) return alert(lang === 'zh' ? '员工姓名不能为空。' : 'Employee name is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) return alert(lang === 'zh' ? '员工邮箱格式不正确。' : 'Employee email is invalid.');
    if (!id && !data.password) return alert(lang === 'zh' ? '新增员工必须设置临时密码。' : 'A temporary password is required for new employees.');
    if (data.password && data.password.length < 8) return alert(lang === 'zh' ? '密码至少 8 位。' : 'Password must be at least 8 characters.');
    saveRecord('users', id, data);
  });
  prepareEmployeeAccountForm(Boolean(id), item);
  const roleSelect = document.getElementById('employeeAccountRole');
  if (roleSelect) roleSelect.addEventListener('change', () => applyRolePermissions(roleSelect.value));
}

function prepareEmployeeAccountForm(isEdit, item) {
  const fields = ['employeeAccountName', 'employeeAccountLogin', 'employeeAccountSecret'];
  fields.forEach(fieldId => {
    const input = document.getElementById(fieldId);
    if (!input) return;
    input.setAttribute('autocomplete', fieldId === 'employeeAccountSecret' ? 'new-password' : 'off');
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('spellcheck', 'false');
  });
  if (isEdit) return;
  const clearNewEmployeeFields = () => {
    const name = document.getElementById('employeeAccountName');
    const email = document.getElementById('employeeAccountLogin');
    const password = document.getElementById('employeeAccountSecret');
    if (name) name.value = item.name || '';
    if (email) email.value = item.email || '';
    if (password) password.value = '';
  };
  clearNewEmployeeFields();
  setTimeout(clearNewEmployeeFields, 50);
  setTimeout(clearNewEmployeeFields, 250);
}

async function saveRecord(collection, id, data) {
  try {
    const body = await api(`/api/${collection}${id ? `/${id}` : ''}`, {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(data)
    });
    state = body;
    broadcastDataChange();
    closeModal();
    render();
  } catch (err) {
    alert(err.message);
  }
}

async function removeItem(collection, id) {
  if (!confirm('确定删除这条记录吗？')) return;
  try {
    state = await api(`/api/${collection}/${id}`, { method: 'DELETE' });
    broadcastDataChange();
    render();
  } catch (err) {
    alert(err.message);
  }
}

async function saveSettings() {
  const next = {
    ...state.settings,
    shopName: document.getElementById('shopName').value,
    taxRate: Number(document.getElementById('taxRate').value || 0),
    monthlyFixedCost: Number(document.getElementById('monthlyFixedCost').value || 0)
  };
  try {
    state = await api('/api/settings', { method: 'PUT', body: JSON.stringify(next) });
    broadcastDataChange();
    render();
    alert('设置已保存到服务器。');
  } catch (err) {
    alert(err.message);
  }
}

async function saveMyProfile() {
  try {
    const body = await api('/api/me', {
      method: 'PUT',
      body: JSON.stringify({
        name: document.getElementById('myName').value,
        email: document.getElementById('myEmail').value,
        avatarDataUrl: document.getElementById('myAvatarDataUrl')?.value || ''
      })
    });
    user = body.user;
    state = body.data;
    localStorage.setItem('filmShopCloud.lastEmail', user.email || '');
    broadcastDataChange();
    renderAuth();
    render();
    alert(lang === 'zh' ? '账号邮箱已保存。下次请用新邮箱登录。' : 'Account email saved. Please use the new email next time you log in.');
  } catch (err) {
    alert(err.message);
  }
}

async function changePassword() {
  try {
    await api('/api/change-password', {
      method: 'POST',
      body: JSON.stringify({
        oldPassword: document.getElementById('oldPassword').value,
        newPassword: document.getElementById('newPassword').value
      })
    });
    alert(lang === 'zh' ? '密码已修改。请用新密码重新登录。' : 'Password changed. Please log in again with the new password.');
    token = '';
    localStorage.removeItem('filmShopCloud.token');
    state = null;
    user = null;
    stopAutoSync();
    stopRealtimeSync();
    renderAuth();
  } catch (err) {
    alert(err.message);
  }
}

async function sendTomorrowScheduleReminder() {
  try {
    const result = await api('/api/schedules/send-reminders', {
      method: 'POST',
      body: JSON.stringify({})
    });
    await sync({ silent: true });
    if (result.message) return alert(result.message);
    alert(lang === 'zh'
      ? `明天提醒处理完成：发送 ${result.sent}，跳过 ${result.skipped}，失败 ${result.failed}`
      : `Reminder complete: sent ${result.sent}, skipped ${result.skipped}, failed ${result.failed}`);
  } catch (err) {
    alert(err.message);
  }
}

async function showSystemInfo() {
  try {
    const info = await api('/api/system/info');
    alert(`当前版本：${info.app.version}\n构建号：${info.app.build}\n升级通道：${info.update.channel}\n远程升级：${info.update.allowRemoteUpgrade ? '已开启' : '未开启'}`);
  } catch (err) {
    alert(err.message);
  }
}

async function checkUpdate() {
  try {
    const info = await api('/api/system/check-update');
    alert(info.message || '当前没有可用升级。');
  } catch (err) {
    alert(err.message);
  }
}

async function createManualBackup() {
  try {
    const result = await api('/api/backups', { method: 'POST', body: JSON.stringify({}) });
    alert(lang === 'zh' ? `备份已创建：${result.fileName}` : `Backup created: ${result.fileName}`);
  } catch (err) {
    alert(err.message);
  }
}

async function showBackups() {
  try {
    const result = await api('/api/backups');
    const rows = result.backups || [];
    const html = `<div class="table-wrap"><table><thead><tr><th>${lang === 'zh' ? '文件' : 'File'}</th><th>${lang === 'zh' ? '类型' : 'Type'}</th><th>${lang === 'zh' ? '时间' : 'Time'}</th><th>${lang === 'zh' ? '大小' : 'Size'}</th><th></th></tr></thead><tbody>
      ${rows.map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${backupTypeName(item.type)}</td><td>${escapeHtml(new Date(item.createdAt).toLocaleString())}</td><td>${Math.ceil(Number(item.size || 0) / 1024)} KB</td><td><button class="btn" onclick="downloadBackup('${escapeHtml(item.name)}')">${lang === 'zh' ? '下载' : 'Download'}</button></td></tr>`).join('')}
      ${rows.length ? '' : `<tr><td colspan="5" class="note">${lang === 'zh' ? '还没有备份。' : 'No backups yet.'}</td></tr>`}
    </tbody></table></div>`;
    openModal(lang === 'zh' ? '数据库备份' : 'Database Backups', html, closeModal);
    document.getElementById('modalSave').textContent = lang === 'zh' ? '关闭' : 'Close';
  } catch (err) {
    alert(err.message);
  }
}

function backupTypeName(type) {
  return {
    daily: lang === 'zh' ? '每日自动' : 'Daily',
    manual: lang === 'zh' ? '手动' : 'Manual',
    system: lang === 'zh' ? '系统' : 'System'
  }[type] || type || '';
}

async function downloadBackup(fileName) {
  try {
    const res = await fetch(`/api/backups/${encodeURIComponent(fileName)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || '下载失败');
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert(err.message);
  }
}

function readFileAsDataUrl(file) {
  return readBlobAsDataUrl(file);
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsDataURL(blob);
  });
}

async function importShipmentFile(file) {
  if (!file) return;
  try {
    const fileBase64 = await readFileAsDataUrl(file);
    const result = await api('/api/shipments/import', {
      method: 'POST',
      body: JSON.stringify({ fileName: file.name, fileBase64 })
    });
    state = result.data;
    render();
    broadcastDataChange();
    alert(lang === 'zh' ? `已导入 ${result.imported} 条在途货物。` : `Imported ${result.imported} inbound shipments.`);
  } catch (err) {
    alert(err.message || (lang === 'zh' ? '导入失败。' : 'Import failed.'));
  }
}

function handleShipmentPhotoUpload(file) {
  if (!file) return;
  alert(lang === 'zh'
    ? '拍照上传端口已经打开。图片自动识别需要后续配置 OCR 服务；目前请先用 Excel/CSV 导入，或手动新增在途货物。'
    : 'Photo upload is reserved. Automatic recognition requires an OCR service; for now, use Excel/CSV import or add the shipment manually.');
}

function installPrompt() {
  if (deferredInstall) {
    deferredInstall.prompt();
    deferredInstall.userChoice.finally(() => {
      deferredInstall = null;
    });
    return;
  }
  const url = window.location.origin;
  const content = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>URL</key>\n  <string>${url}</string>\n</dict>\n</plist>\n`;
  const blob = new Blob([content], { type: 'application/xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = lang === 'zh' ? '美国贴膜店管理系统.webloc' : 'Film Shop Management.webloc';
  a.click();
  URL.revokeObjectURL(a.href);
  alert(lang === 'zh'
    ? '如果浏览器弹出安装窗口，请选择安装，这样桌面图标会使用 QUAD FILM 品牌标。若没有弹窗，已下载备用快捷方式。'
    : 'If the browser shows an install prompt, choose Install so the desktop icon uses the QUAD FILM brand icon. If no prompt appears, a fallback shortcut was downloaded.');
}

function formHtml(fields) {
  return `<div class="form-grid">${fields.map(f => {
    const [id, label, type, value, options, cls] = f;
    if (type === 'textarea') return `<label class="${cls || ''}">${label}<textarea id="${id}">${escapeHtml(value || '')}</textarea></label>`;
    if (type === 'select') return `<label class="${cls || ''}">${label}<select id="${id}">${options.map(o => Array.isArray(o) ? `<option value="${o[0]}" ${String(value) === String(o[0]) ? 'selected' : ''}>${o[1]}</option>` : `<option value="${o}" ${String(value) === String(o) ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
    if (type === 'skuSearch') return salesOrderSkuSearchHtml(id, label, value, cls);
    if (type === 'workshopSkuSearch') return workshopSkuSearchHtml(id, label, value, cls);
    if (type === 'avatar') return profileAvatarEditor({ name: document.getElementById('myName')?.value || '', avatarDataUrl: value || '' }, id, 'employeeAvatarPreview', 'handleEmployeeAvatarUpload(event)', 'clearEmployeeAvatar()');
    if (type === 'readonly') return `<label class="${cls || ''}">${label}<input id="${id}" type="text" value="${escapeHtml(value ?? '')}" readonly /></label>`;
    if (type === 'multi') {
      const values = new Set(Array.isArray(value) ? value.map(String) : String(value || '').split(','));
      return `<div class="${cls || ''} field-block"><span>${label}</span><div class="check-list" id="${id}" data-multi-field="${id}">
        ${options.map(o => {
          const optionValue = Array.isArray(o) ? String(o[0]) : String(o);
          const optionLabel = Array.isArray(o) ? o[1] : o;
          return `<label class="check-row"><input type="checkbox" value="${escapeHtml(optionValue)}" ${values.has(optionValue) ? 'checked' : ''} /><span>${escapeHtml(optionLabel)}</span></label>`;
        }).join('')}
      </div></div>`;
    }
    return `<label class="${cls || ''}">${label}<input id="${id}" type="${type}" value="${escapeHtml(value ?? '')}" /></label>`;
  }).join('')}</div>`;
}

function permissionEditor(permissions) {
  return `<div class="wide" style="margin-top:16px">
    <h4 style="margin:0 0 10px">${lang === 'zh' ? '权限设置' : 'Permissions'}</h4>
    <div class="permission-grid">
      ${permissionLabels.map(([key, zh, en]) => `
        <label class="check-row">
          <input type="checkbox" data-permission="${key}" ${permissions[key] ? 'checked' : ''} />
          <span>${lang === 'zh' ? zh : en}</span>
        </label>
      `).join('')}
    </div>
    <p class="note">${lang === 'zh' ? '角色会提供默认权限，这里可以单独开关。老板账号始终拥有全部权限。' : 'Roles provide default permissions. You can override them here. Owner accounts always keep all permissions.'}</p>
  </div>`;
}

function readPermissions() {
  return Object.fromEntries([...document.querySelectorAll('[data-permission]')].map(input => [input.dataset.permission, input.checked]));
}

function applyRolePermissions(role) {
  const permissions = roleDefaultPermissions(role);
  document.querySelectorAll('[data-permission]').forEach(input => {
    input.checked = Boolean(permissions[input.dataset.permission]);
  });
}

function roleDefaultPermissions(role) {
  const none = Object.fromEntries(permissionLabels.map(([key]) => [key, false]));
  const all = Object.fromEntries(permissionLabels.map(([key]) => [key, true]));
  const byRole = {
    owner: all,
    manager: all,
    frontdesk: { ...none, jobsView: true, jobsCreate: true, pricingView: true, ordersView: true, ordersEdit: true, shipmentsView: true, schedulesView: true, leadsView: true, leadsEdit: true, prospectsView: true, prospectsEdit: true },
    sales: { ...none, jobsView: true, jobsCreate: true, pricingView: true, ordersView: true, ordersEdit: true, shipmentsView: true, schedulesView: true, leadsView: true, leadsEdit: true, prospectsView: true, prospectsEdit: true },
    clerk: { ...none, jobsView: true, jobsCreate: true, jobsEdit: true, pricingView: true, inventoryView: true, ordersView: true, ordersEdit: true, shipmentsView: true, shipmentsEdit: true, schedulesView: true, schedulesEdit: true, leadsView: true, leadsEdit: true, prospectsView: true, prospectsEdit: true, expensesView: true, expensesEdit: true },
    warehouse: { ...none, inventoryView: true, inventoryEdit: true, ordersView: true, shipmentsView: true, shipmentsEdit: true, schedulesView: true },
    installer: { ...none, jobsView: true },
    finance: { ...none, jobsView: true, ordersView: true, shipmentsView: true, schedulesView: true, leadsView: true, prospectsView: true, commissionView: true, reportsView: true, fullFinanceView: true, expensesView: true, expensesEdit: true, inventoryView: true, settingsEdit: true }
  };
  return byRole[role] || none;
}

function openModal(title, html, onSave) {
  document.getElementById('modal').classList.remove('message-modal-open');
  document.body.classList.add('modal-lock');
  const workspace = document.getElementById('prospectWorkspace');
  if (workspace) workspace.style.pointerEvents = 'none';
  document.getElementById('modalTitle').textContent = title;
  const headerAction = document.getElementById('modalHeaderAction');
  if (headerAction) {
    headerAction.hidden = true;
    headerAction.textContent = '';
    headerAction.onclick = null;
  }
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('modalSave').onclick = onSave;
  document.getElementById('modalSave').textContent = t('save');
  const cancel = document.querySelector('.dialog footer .btn');
  if (cancel) cancel.textContent = t('cancel');
  document.getElementById('modal').classList.add('open');
}
function closeModal() {
  closeReplyTemplateVideoPreview();
  if (messageRecorder && messageRecorder.state === 'recording') messageRecorder.stop();
  document.getElementById('modal').classList.remove('open', 'message-modal-open');
  document.getElementById('modal').classList.remove('reply-library-open');
  document.body.classList.remove('modal-lock');
  const workspace = document.getElementById('prospectWorkspace');
  if (workspace) workspace.style.pointerEvents = '';
}
function readForm(ids) {
  return Object.fromEntries(ids.map(id => {
    const multi = document.querySelector(`[data-multi-field="${id}"]`);
    if (multi) return [id, [...multi.querySelectorAll('input:checked')].map(input => input.value)];
    return [id, document.getElementById(id).value];
  }));
}
function numeric(data, keys) { keys.forEach(k => data[k] = Number(data[k] || 0)); return data; }
function serviceOptions() { return [['tint',t('tint')], ['wrap',t('wrap')], ['ppf',t('ppf')], ['ceramic',t('ceramic')]]; }
function installerOptions() { return [['',t('unassigned')], ...state.installers.map(i => [i.id, i.name])]; }
function installerMultiOptions() { return state.installers.map(i => [i.id, i.name]); }
function customerServiceOptions() { return [['',t('unassigned')], ...(state.customerServiceReps || []).filter(rep => rep.active !== false).map(rep => [rep.id, rep.name])]; }
function activeEmployeeOptions() {
  return (state.users || []).filter(employee => employee.active && employee.role !== 'owner').map(employee => [employee.id, `${employee.name} · ${employee.email || ''}`]);
}
function scheduleTypeOptions() {
  return [['work', scheduleTypeName('work')], ['makeup', scheduleTypeName('makeup')], ['adjustedRest', scheduleTypeName('adjustedRest')], ['off', scheduleTypeName('off')]];
}
function salesOrderMovementOptions(sku = '') {
  const pendingOrders = (state.salesOrders || []).filter(order => order.status === '待出库' && !isCustomPrintedFilmSku(order.item) && (!sku || order.item === sku));
  return [['', lang === 'zh' ? '不关联订单' : 'No related order'], ...pendingOrders.map(order => [
    order.id,
    `${order.date} · ${order.customer || ''} · ${order.item} · ${Number(order.qty || 0)}`
  ])];
}
function leadSourceOptions() { return ['Yelp','Google Maps','Meta / Facebook','Instagram','Website','Phone Call','Walk-in','Referral','Other']; }
function prospectStatusOptions() {
  return lang === 'zh'
    ? ['新意向','已邀约','已预约','已到店','已转施工单','未接通','无效']
    : [['新意向','New Intent'],['已邀约','Invited'],['已预约','Appointment Set'],['已到店','Arrived'],['已转施工单','Converted to Job'],['未接通','No Answer'],['无效','Invalid']];
}
function normalizeProspectIntentValue(value) {
  const text = String(value || '').trim();
  const key = text.toLowerCase();
  if (['高','高意向','hot','high','high intent'].includes(key)) return '高意向';
  if (['中','优质','qualified','good','medium'].includes(key)) return '优质';
  if (['低','low'].includes(key)) return '低';
  return text || '普通';
}
function prospectIntentOptions() {
  return lang === 'zh'
    ? ['高意向','优质','普通','低']
    : [['高意向','High Intent'],['优质','Qualified'],['普通','Normal'],['低','Low']];
}
function leadTypeOptions() {
  return [['online', lang === 'zh' ? '线上引流' : 'Online Lead'], ['walkin', lang === 'zh' ? '自然到店' : 'Walk-in'], ['phone', lang === 'zh' ? '电话询问' : 'Phone Inquiry'], ['relationship', lang === 'zh' ? '自己关系' : 'Own Relationship']];
}
function customerTypeOptions() { return [['toc','TOC'], ['tob','TOB']]; }
function saleTypeOptions() { return [['install', lang === 'zh' ? '包工包料贴膜' : 'Install + Material'], ['materialOnly', lang === 'zh' ? '只卖膜' : 'Film Only']]; }
function salesOrderTypeOptions() {
  return [
    ['retail-us', t('retailUs')],
    ['retail-non-us', t('retailNonUs')],
    ['wholesale-us', t('wholesaleUs')],
    ['wholesale-non-us', t('wholesaleNonUs')]
  ];
}
function salesOrderTypeName(type) {
  const names = Object.fromEntries(salesOrderTypeOptions());
  return names[type] || (type === 'wholesale' ? t('wholesale') : type === 'retail' ? t('retail') : escapeHtml(type || ''));
}
function commissionPlanOptions() {
  return [
    ['judy','Judy / 自然到店 / TOB'],
    ['onlineTier',lang === 'zh' ? '线上TOC阶梯' : 'Online TOC Tier'],
    ['managerTier',lang === 'zh' ? '店长接待阶梯' : 'Manager Reception Tier'],
    ['operationTier',lang === 'zh' ? '杭州运营阶梯' : 'Operations Tier'],
    ['couple',lang === 'zh' ? 'Angelina/Jackson 阶梯' : 'Angelina/Jackson Tier'],
    ['salesPercent30',lang === 'zh' ? '美国销售 30%' : 'US Sales 30%'],
    ['foreignTrade6',lang === 'zh' ? '外贸引荐 6%' : 'Referral 6%'],
    ['foreignTrade20',lang === 'zh' ? '外贸1099 20%' : '1099 Foreign Trade 20%']
  ];
}
function leadTypeName(value) { return Object.fromEntries(leadTypeOptions())[value] || value || ''; }
function commissionPlanName(value) { return Object.fromEntries(commissionPlanOptions())[value || 'onlineTier'] || value || ''; }
function prospectStatusName(value) { return Object.fromEntries(prospectStatusOptions().map(option => Array.isArray(option) ? option : [option, option]))[value] || value || ''; }
function prospectIntentName(value) { return Object.fromEntries(prospectIntentOptions().map(option => Array.isArray(option) ? option : [option, option]))[value] || value || ''; }
function leadStatusOptions() {
  return lang === 'zh'
    ? ['新客资','已邀约','已到店','已成交','未成交','无效']
    : [['新客资','New'],['已邀约','Invited'],['已到店','Arrived'],['已成交','Closed'],['未成交','Not Closed'],['无效','Invalid']];
}
function roleOptions() { return ['manager','frontdesk','sales','clerk','warehouse','installer','finance'].map(k => [k, t(k)]); }

function setupMovementStockGuard() {
  const skuInput = document.getElementById('sku');
  const typeInput = document.getElementById('type');
  const qtyInput = document.getElementById('qty');
  const orderInput = document.getElementById('salesOrderId');
  const hint = document.getElementById('movementStockHint');
  if (!skuInput || !typeInput || !qtyInput || !hint) return;
  const refreshOrderOptions = () => {
    if (!orderInput) return;
    const previous = orderInput.value;
    const options = typeInput.value === 'out' ? salesOrderMovementOptions(skuInput.value) : [['', lang === 'zh' ? '不关联订单' : 'No related order']];
    orderInput.innerHTML = options.map(option => `<option value="${escapeHtml(option[0])}" ${String(previous) === String(option[0]) ? 'selected' : ''}>${escapeHtml(option[1])}</option>`).join('');
    if (![...orderInput.options].some(option => option.value === previous)) orderInput.value = '';
    orderInput.disabled = typeInput.value !== 'out';
  };
  const applySelectedOrder = () => {
    if (!orderInput?.value) return;
    const order = (state.salesOrders || []).find(item => item.id === orderInput.value);
    if (!order) return;
    skuInput.value = order.item || skuInput.value;
    qtyInput.value = Number(order.qty || 0);
  };
  const update = () => {
    const product = state.products.find(p => p.sku === skuInput.value);
    const currentQty = Number(product?.qty || 0);
    const unit = product?.unit || '';
    hint.textContent = typeInput.value === 'out'
      ? `${t('currentStock')}：${currentQty.toLocaleString()} ${unit}。${lang === 'zh' ? '出库必须选择待出库订单。' : 'Stock-out requires a ready-to-ship order.'}`
      : `${t('currentStock')}：${currentQty.toLocaleString()} ${unit}`;
    refreshOrderOptions();
    qtyInput.min = '1';
    if (typeInput.value === 'out') {
      qtyInput.max = String(currentQty);
      if (Number(qtyInput.value || 0) > currentQty) qtyInput.value = currentQty;
    } else {
      qtyInput.removeAttribute('max');
    }
  };
  skuInput.addEventListener('change', update);
  typeInput.addEventListener('change', update);
  orderInput?.addEventListener('change', () => {
    applySelectedOrder();
    update();
  });
  qtyInput.addEventListener('input', () => {
    if (typeInput.value === 'out') {
      const currentQty = Number(state.products.find(p => p.sku === skuInput.value)?.qty || 0);
      if (Number(qtyInput.value || 0) > currentQty) qtyInput.value = currentQty;
    }
  });
  update();
}

function setupWorkshopStockGuard() {
  const skuInput = document.getElementById('sku');
  const typeInput = document.getElementById('type');
  const qtyInput = document.getElementById('qty');
  const hint = document.getElementById('workshopStockHint');
  if (!skuInput || !typeInput || !qtyInput || !hint) return;
  const update = () => {
    const product = state.products.find(p => p.sku === skuInput.value);
    if (!product) {
      hint.textContent = lang === 'zh' ? '请先选择 SKU。' : 'Choose a SKU first.';
      qtyInput.removeAttribute('max');
      return;
    }
    const mainQty = Number(product.qty || 0);
    const workshopQty = workshopStockQty(product.sku);
    const mainUnit = product.unit || '';
    const workshopUnit = t('meter');
    const available = typeInput.value === 'transfer' ? mainQty : workshopQty;
    hint.textContent = typeInput.value === 'transfer'
      ? `${t('mainWarehouseStock')}：${mainQty.toLocaleString()} ${mainUnit}；${t('workshopCurrentStock')}：${workshopQty.toLocaleString()} ${workshopUnit}。${lang === 'zh' ? '保存后会扣大仓、加贴膜间。' : 'Saving subtracts main warehouse stock and adds workshop stock.'}`
      : `${t('workshopCurrentStock')}：${workshopQty.toLocaleString()} ${workshopUnit}。${lang === 'zh' ? '保存后只扣贴膜间库存。' : 'Saving only subtracts workshop stock.'}`;
    qtyInput.min = '1';
    qtyInput.step = '0.1';
    qtyInput.max = String(available);
    if (Number(qtyInput.value || 0) > available) qtyInput.value = available;
  };
  skuInput.addEventListener('change', update);
  typeInput.addEventListener('change', update);
  qtyInput.addEventListener('input', () => {
    const product = state.products.find(p => p.sku === skuInput.value);
    if (!product) return;
    const available = typeInput.value === 'transfer' ? Number(product.qty || 0) : workshopStockQty(product.sku);
    if (Number(qtyInput.value || 0) > available) qtyInput.value = available;
  });
  update();
}

function productCategories() {
  return lang === 'zh'
    ? ['窗膜卷料','TPU车衣','改色膜','工具耗材','零售商品']
    : ['Window Tint Rolls','PPF','Color Wrap','Tools & Supplies','Retail Product'];
}
function expenseCategories() {
  return lang === 'zh'
    ? ['房屋租金','水电费','网络电话','保险','广告投放','软件订阅','办公耗材','清洁维护','设备折旧','员工固定工资','其他']
    : ['Rent','Utilities','Internet / Phone','Insurance','Advertising','Software Subscription','Office Supplies','Cleaning / Maintenance','Equipment Depreciation','Fixed Payroll','Other'];
}
function statusOptions() {
  return lang === 'zh'
    ? ['排期','施工中','待质检','已交车','返工','取消']
    : [['排期','Scheduled'],['施工中','In Progress'],['待质检','QC Pending'],['已交车','Delivered'],['返工','Rework'],['取消','Canceled']];
}
function salesStatusOptions() {
  return lang === 'zh'
    ? ['待收款','待出库','已出库','已付款','已取消']
    : [['待收款','Payment Pending'],['待出库','Ready to Ship'],['已出库','Shipped'],['已付款','Paid'],['已取消','Canceled']];
}
function shipmentMethodOptions() {
  return [['ocean', lang === 'zh' ? '海运' : 'Ocean'], ['air', lang === 'zh' ? '空运' : 'Air']];
}
function shipmentStatusOptions() {
  return lang === 'zh'
    ? ['备货中','已发出','在途','已到港','已清关','送往拉斯维加斯','已到货']
    : [['备货中','Preparing'],['已发出','Departed'],['在途','In Transit'],['已到港','Arrived at Port'],['已清关','Customs Cleared'],['送往拉斯维加斯','To Las Vegas'],['已到货','Arrived']];
}
function shipmentMethodName(method) {
  return method === 'air'
    ? `<span class="pill info">${lang === 'zh' ? '空运' : 'Air'}</span>`
    : `<span class="pill">${lang === 'zh' ? '海运' : 'Ocean'}</span>`;
}
function modeName(mode) { return { percent: t('percent'), fixed: t('fixed'), basePlus: t('basePlus') }[mode] || mode; }
function feeText(installer, key) { const v = Number(installer[key] || 0); return installer.mode === 'percent' ? `${v}%` : currency.format(v); }
function stockPill(p) {
  const qty = Number(p.qty || 0), reorder = Number(p.reorder || 0);
  if (qty <= reorder) return '<span class="pill bad">低库存</span>';
  if (qty <= reorder * 2) return '<span class="pill warn">需关注</span>';
  return '<span class="pill good">正常</span>';
}

function shortText(value, max = 80) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function hiddenValue() {
  return lang === 'zh' ? '无权限' : 'No access';
}
function statusPill(status) {
  const s = String(status || '');
  const cls = s.includes('已') ? 'good' : s.includes('待') || s.includes('排期') ? 'warn' : s.includes('取消') || s.includes('返工') ? 'bad' : 'info';
  return `<span class="pill ${cls}">${escapeHtml(translateStatus(s))}</span>`;
}
function leadStatusPill(status) {
  const s = String(status || '');
  const cls = s === '已成交' || s === '已到店' ? 'good' : s === '无效' || s === '未成交' ? 'bad' : 'warn';
  return `<span class="pill ${cls}">${escapeHtml(translateStatus(s))}</span>`;
}
function prospectStatusPill(status) {
  const s = String(status || '');
  const cls = s === '已预约' || s === '已到店' || s === '已转施工单' ? 'good' : s === '无效' || s === '未接通' ? 'bad' : 'warn';
  return `<span class="pill ${cls}">${escapeHtml(prospectStatusName(s))}</span>`;
}
function prospectIntentPill(level) {
  const value = String(level || '高');
  const cls = value === '高' ? 'good' : value === '低' ? 'bad' : 'info';
  return `<span class="pill ${cls}">${escapeHtml(prospectIntentName(value))}</span>`;
}
function translateStatus(status) {
  if (lang === 'zh') return status;
  return {
    '排期': 'Scheduled',
    '施工中': 'In Progress',
    '待质检': 'QC Pending',
    '已交车': 'Delivered',
    '返工': 'Rework',
    '取消': 'Canceled',
    '待收款': 'Payment Pending',
    '待出库': 'Ready to Ship',
    '已出库': 'Shipped',
    '已付款': 'Paid',
    '已取消': 'Canceled',
    '备货中': 'Preparing',
    '已发出': 'Departed',
    '在途': 'In Transit',
    '已到港': 'Arrived at Port',
    '已清关': 'Customs Cleared',
    '送往拉斯维加斯': 'To Las Vegas',
    '已到货': 'Arrived',
    '新客资': 'New',
    '已邀约': 'Invited',
    '已到店': 'Arrived',
    '已成交': 'Closed',
    '未成交': 'Not Closed',
    '无效': 'Invalid'
  }[status] || status;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}
function escapeJs(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
document.getElementById('email').value = localStorage.getItem('filmShopCloud.lastEmail') || document.getElementById('email').value;
applyStaticTranslations();
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closePanelZoom();
});
if (token) sync(); else renderAuth();
