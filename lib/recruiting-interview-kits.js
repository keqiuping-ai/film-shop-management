'use strict';

const q = (id, zh, en, focus, strong, critical = false) => ({ id, zh, en, focus, strong, critical });

const installer = [
  q('work_sample', '请完整讲一台你亲手完成的贴膜车辆：车型、膜种、施工时间、最难的位置和最终结果。', 'Walk me through one vehicle you personally completed: vehicle, film, time, hardest area, and final result.', '核实真实施工经验与细节', '能说出车型、材料、工序、时间及可验证结果。'),
  q('prep', '从车辆进店到正式下刀之前，你会做哪些检查和清洁准备？', 'What inspections and preparation do you complete before making the first cut?', '施工准备与标准化', '包含车况记录、漆面/玻璃检查、清洁、无尘控制、拆装判断和风险告知。', true),
  q('contamination', '如果交车前发现灰尘点、毛发、翘边或水泡，你怎么判断是返工、修补还是等待？', 'If you find dust, hair, lifting, or bubbles before delivery, how do you decide whether to rework, repair, or wait?', '质量判断与责任心', '区分可消退水汽与污染/翘边，主动返工并解释复检标准。', true),
  q('damage_prevention', '怎样避免刀伤漆面、划伤玻璃、损坏胶条或内饰？请讲你的实际方法。', 'How do you prevent paint cuts, glass scratches, and damage to trim or interior?', '安全施工习惯', '说明刀具角度、无刀裁切、保护层、拆装规范和双人复核。', true),
  q('speed_quality', '赶工时你如何同时保证速度和质量？请给出你正常完成整车窗膜、PPF或改色膜的大致时间。', 'How do you balance speed and quality? Give your normal completion time for tint, PPF, or a full wrap.', '效率与质量平衡', '给出可信工时、分段计划和不牺牲关键工序的原则。'),
  q('redo_customer', '客户对边角、色差或小瑕疵不满意时，你会怎么检查和处理？', 'How would you handle a customer unhappy with edges, color, or a small defect?', '售后态度', '先检查和记录，再解释标准；该返工就返工，不推责。'),
  q('film_knowledge', '窗膜、透明PPF、彩色PPF和Vinyl Wrap在材料、拉伸、收边与养护上有什么不同？', 'How do tint, clear PPF, color PPF, and vinyl wrap differ in material, stretch, finishing, and care?', '材料知识', '能清楚区分热塑性、胶层、拉伸限制、收边和养护要求。'),
  q('complex_panel', '保险杠、后视镜、深凹槽或大曲面，你会怎样分区、预拉伸和控制回缩？', 'How do you section, pre-stretch, and control shrinkage on bumpers, mirrors, deep recesses, or large curves?', '复杂部位技术', '说明锚点、预拉伸方向、热定型、应力释放与必要时拼接。'),
  q('cutting', '请解释你在车身上裁膜的下刀方法，以及什么时候必须使用无刀线。', 'Explain how you cut film on a vehicle and when knifeless tape is required.', '裁切安全', '强调不在漆面深切、控制刀深、换刀片频率及无刀线场景。', true),
  q('disassembly', '哪些部件你会拆，哪些不会拆？拆装前后如何避免丢件、异响和故障码？', 'What parts do you remove or avoid removing, and how do you prevent missing hardware, rattles, or fault codes?', '拆装能力', '有拍照、分类、扭矩/卡扣检查、电器断连和复原测试流程。'),
  q('edge_finish', '你如何处理门边、轮眉、接缝和收边，怎样判断包边长度足够？', 'How do you finish door edges, arches, seams, and wraps, and decide the correct wrap length?', '收边耐久性', '依据膜材与部位保留合理余量，清洁背面、加热定型并复压。'),
  q('heat', '热枪或蒸汽使用不当会造成什么问题？你如何控制温度并完成post-heat？', 'What can go wrong with heat or steam, and how do you control temperature and post-heat?', '温度控制', '知道过热、胶印、失光、回缩风险，并使用测温和厂商标准。'),
  q('estimate_material', '拿到一台陌生车型，你如何估算膜用量、工时和施工风险？', 'How do you estimate film usage, labor time, and risk for an unfamiliar vehicle?', '计划与成本意识', '结合尺寸、曲面、拆装、膜宽、损耗与返工缓冲。'),
  q('tool_care', '你每天如何管理刮板、刀片、喷壶、烤枪和施工环境？', 'How do you manage squeegees, blades, bottles, heat tools, and the work area each day?', '工具与现场管理', '工具清洁分类、耗材更换、设备检查、地面与空气污染控制。'),
  q('teamwork', '如果上一位技师的准备工作不合格，或两个人对施工方法意见不同，你怎么处理？', 'How do you respond when another installer’s prep is poor or you disagree on the method?', '团队协作', '先停止风险工序，以标准和证据沟通，及时升级而非带情绪施工。'),
  q('warranty', '什么情况属于施工问题，什么可能是材料或车辆本身问题？你会留下哪些证据？', 'What is an installation issue versus a material or vehicle issue, and what evidence do you keep?', '质保判断', '交车前后照片、批次、环境、缺陷位置和客户确认记录完整。'),
  q('learning', '请讲一次你施工失败或返工的经历，你后来具体改了什么？', 'Tell me about an installation failure or redo and exactly what you changed afterward.', '复盘与成长', '承认责任，有具体原因、纠正动作和之后的验证结果。'),
  q('practical_test', '如果今天安排一块样板或真实车辆试工，你会选择展示什么，并如何让我们验收？', 'If we give you a sample panel or vehicle trial today, what would you demonstrate and how should we inspect it?', '实操可信度', '愿意实操，主动提出可量化验收点：清洁、边角、气泡、刀痕、时间。', true)
];

const wholesale = [
  q('pipeline', '请讲一个你从陌生客户开发到持续复购的真实案例，周期、金额和你的动作分别是什么？', 'Describe a real account you developed from cold prospect to repeat buyer, including timeline, revenue, and your actions.', '完整销售闭环', '有明确客户、步骤、周期、金额和复购证据。'),
  q('first_week', '如果第一周给你拉斯维加斯或洛杉矶的贴膜门店名单，你每天会怎么安排？', 'If we give you a list of film shops in Las Vegas or Los Angeles, how would you plan each day of week one?', '落地执行计划', '有分区、电话、拜访、样品、记录、复盘和数量目标。'),
  q('decision_maker', '到店后前台说老板不在、已经有供应商，你下一步怎么做？', 'What do you do when the front desk says the owner is away or they already have a supplier?', '找到决策人与突破异议', '礼貌获取决策人、采购周期、现供应商痛点和明确下一步。'),
  q('product_pitch', '请用两分钟把我们的窗膜、PPF或改色膜卖给一家专业贴膜店。', 'Give a two-minute pitch for our tint, PPF, or color film to a professional installation shop.', '产品表达', '不只说便宜，能讲性能、稳定供货、施工支持、利润和适配场景。'),
  q('qualification', '第一次沟通你必须问客户哪些问题，才能判断他是不是有效B2B客户？', 'What must you ask in the first conversation to qualify a B2B film-shop account?', '客户筛选', '门店规模、月用量、品牌、主做项目、采购人、痛点、付款和采购时间。'),
  q('follow_up', '客户说“把价格发给我”后，你如何跟进，避免报价发完就没有下文？', 'How do you follow up after a prospect says “send me pricing” so the quote does not disappear?', '跟进能力', '约定回访时间，发送针对性样品/阶梯价，提出下一步并持续记录。'),
  q('pricing', '客户只比较最低价，你会怎么守住利润又争取首单？', 'How do you protect margin and still win a first order when the buyer only compares lowest price?', '价格谈判', '用总成本、良率、售后、供货与试单方案换条件，不随意裸降。'),
  q('sample_close', '怎样把送样品转化为试单，再转成稳定月度采购？', 'How do you turn a sample into a trial order and then recurring monthly purchases?', '转化路径', '设定测试项目、验收日期、试单SKU/数量及复购触发点。'),
  q('crm', '你每天会在系统里记录哪些信息，如何保证其他同事能接着跟进？', 'What do you record in the CRM every day so another teammate can continue the account?', '记录与协作', '联系人、角色、需求、报价、异议、承诺、下次时间和附件完整。'),
  q('territory', '你如何给一个城市的贴膜店分级，并决定拜访顺序？', 'How would you tier film shops in a city and choose visit priority?', '区域经营', '按用量、项目匹配、信用、距离、成交概率与战略价值分层。'),
  q('competitor', '客户现在使用3M、XPEL、Llumar或其他品牌，你会怎样了解并切入？', 'How would you approach a shop currently using 3M, XPEL, Llumar, or another brand?', '竞品策略', '先问现有体验和缺口，以补充品类/试单切入，不贬低竞品。'),
  q('technical_question', '客户问到你不会的技术问题时，你怎么回答？', 'What do you do when a customer asks a technical question you cannot answer?', '诚信与内部协作', '明确不猜，记录问题，找技术人员，承诺准确回复时间。', true),
  q('payment_risk', '新客户要求赊账或大额折扣，你如何判断和处理？', 'How do you handle a new account asking for credit terms or a large discount?', '风险意识', '遵守审批、信用与付款政策，以小单/预付建立记录，不私自承诺。', true),
  q('target_math', '假设月目标是5万美元、平均订单2千美元，你会怎样拆解到周和每天？', 'If the monthly target is $50,000 and average order is $2,000, how do you break it into weekly and daily activity?', '目标拆解', '能计算25单，并反推机会数、拜访数、报价数和转化率。'),
  q('lost_account', '讲一次你丢掉客户或订单的经历，原因是什么，你后来怎么挽回或避免？', 'Tell me about a lost account or order, why it happened, and what you changed.', '复盘能力', '不甩锅，有原因分析、纠正动作和可验证结果。'),
  q('route_discipline', '连续两周跑店没有订单时，你会看哪些数据并调整什么？', 'After two weeks of field visits with no orders, what data do you review and what do you change?', '迭代能力', '检查客群、触达量、决策人率、样品率、报价率和跟进节奏。'),
  q('relationship', '客户下单后你还会做什么，才能提高复购和转介绍？', 'What do you do after an order to increase repeat purchases and referrals?', '客户经营', '确认交付、使用反馈、问题闭环、补货周期、培训与转介绍请求。'),
  q('role_play', '现在我是一家每月采购不稳定的小贴膜店老板，请现场完成开场、提问和约下一步。', 'Role-play: I own a small film shop with inconsistent purchasing. Open the conversation, qualify me, and secure a next step.', '现场销售能力', '开场简洁、提问占比高、复述需求、提出匹配方案并锁定具体下一步。', true)
];

const dealer = [
  q('street_plan', '面对一整条奔驰、宝马、奥迪等经销商集中的街区，你第一周如何排路线和优先级？', 'For a street full of Mercedes, BMW, Audi, and other dealers, how would you plan routes and priorities in week one?', '街区开发计划', '按品牌、店型、决策链、距离和机会分级，每天有拜访与复盘目标。'),
  q('entry', '没有预约进入4S店时，你怎么开场，怎样避免被前台直接挡回去？', 'How do you enter a dealership without an appointment and avoid being stopped at reception?', '陌生拜访开场', '尊重流程，说明客户价值，询问正确负责人并留下可信资料。'),
  q('stakeholders', '经销店里哪些人可能影响贴膜、PPF或外包合作决定？你会分别怎么沟通？', 'Who influences tint, PPF, or outsourcing decisions in a dealership, and how do you approach each person?', '决策链识别', '能识别GM、销售经理、固定运营、精品/F&I、服务经理和采购等角色。'),
  q('dealer_value', '为什么经销商要把新车贴膜、PPF或改色业务交给我们，而不是现有供应商？', 'Why should a dealer give us tint, PPF, or wrap work instead of its current vendor?', '价值主张', '围绕交付速度、质量一致、返工率、取送车、利润、质保与沟通。'),
  q('vehicle_flow', '如果经销商一天交来多台新车，你如何协调钥匙、车况、工单、进度和交车？', 'How would you coordinate keys, condition, work orders, status, and delivery for multiple dealer vehicles in one day?', '运营意识', '有交接清单、车况照片、VIN/钥匙管理、状态更新和验收。', true),
  q('pilot', '怎样设计一个低风险的试单，让经销商愿意给我们第一台车？', 'How would you design a low-risk pilot that earns the first dealer vehicle?', '首单设计', '明确车型/项目/价格/时限/验收/质保和试单后的评审时间。'),
  q('objection_vendor', '对方说“我们合作的师傅用了很多年”，你怎么继续？', 'How do you respond when they say, “We have used the same installer for years”?', '老供应商异议', '认可关系，寻找容量、速度、特殊项目或备用供应商切入口。'),
  q('followup_cadence', '第一次见到销售经理后，你会在24小时、3天和两周分别做什么？', 'What do you do at 24 hours, 3 days, and 2 weeks after first meeting a sales manager?', '跟进节奏', '及时总结、补资料、提出试单、提供案例，并按承诺节奏跟进。'),
  q('proof', '经销商最关心哪些证明材料？你会带什么去现场？', 'What proof matters most to a dealer, and what would you bring?', '可信度建立', '保险/执照、案例、质保、价目/套餐、周转时间、联系人和流程。'),
  q('brand_standard', '高端品牌门店对施工与客户体验要求更高，你如何确保我们不影响品牌形象？', 'Premium dealers expect higher installation and customer experience standards. How do you protect their brand?', '高端门店意识', '统一着装沟通、车辆保护、无损交接、准时、隐私和问题升级。'),
  q('margin_package', '怎样把单项贴膜变成经销商可销售的套餐，同时让双方都有利润？', 'How do you turn a single film service into a dealer package with margin for both sides?', '套餐与利润', '设计清晰层级、建议零售价、成本、交付范围和加购，不虚假承诺。'),
  q('complaint', '经销商客户投诉施工瑕疵并影响交车，你会如何处理？', 'How do you handle an installation complaint that threatens a dealer delivery?', '紧急问题处理', '立刻响应、确认事实、给临时与最终方案、同步负责人并复盘。', true),
  q('tracking', '你怎样在系统里记录每家店、每个联系人和下一步，避免只靠记忆？', 'How do you track each dealership, contact, and next step without relying on memory?', 'CRM纪律', '角色关系图、拜访内容、机会车辆、报价、承诺与明确跟进日期。'),
  q('daily_numbers', '你认为一天合理的有效拜访、找到决策人、获取试单机会分别是多少？为什么？', 'What are reasonable daily targets for visits, decision-maker conversations, and pilot opportunities, and why?', '活动量与现实性', '目标有依据，区分到店数、有效会谈与下一步，不只报虚高数字。'),
  q('network', '请列出你现在能联系的汽车经销商或行业资源，以及我们怎样核实。', 'List dealership or automotive contacts you can reach now and how we may verify them.', '真实资源', '不泄露隐私前提下说明角色、关系、近期联系和可验证路径。'),
  q('role_play_gm', '现场演练：我是忙碌的总经理，只给你90秒。请完成开场并争取下一步。', 'Role-play: I am a busy general manager and give you 90 seconds. Open and earn a next step.', '现场执行', '价值清晰、语言简短、先问需求、提出低风险下一步并确认时间。', true)
];

const remote = [
  q('intro', '请用两分钟介绍自己，并说明为什么你的经历适合这个岗位。', 'Introduce yourself in two minutes and explain why your experience fits this role.', '表达与岗位匹配', '结构清楚，有相关事实而不是泛泛自我评价。'),
  q('evidence', '请讲一个最能证明你能力的真实案例：目标、你的动作、结果和可核实证据。', 'Give one real example that best proves your ability: goal, actions, result, and verifiable evidence.', 'STAR证据', '明确情境、本人动作、量化结果和可核实来源。'),
  q('remote_setup', '请介绍你的网络、设备、安静工作环境和出现故障时的备用方案。', 'Describe your internet, equipment, quiet workspace, and backup plan for outages.', '远程工作条件', '设备与网络可用，有耳机、备用网络/设备和隐私环境。', true),
  q('communication', '远程工作时你如何汇报进度、提出问题并保证消息不会遗漏？', 'How do you report progress, ask questions, and prevent missed messages while working remotely?', '异步沟通', '固定节奏、明确状态/阻碍/下一步，使用系统记录并及时升级。'),
  q('self_management', '没有主管在旁边时，你如何安排一天并证明工作结果？', 'How do you plan your day and prove results without a supervisor beside you?', '自我管理', '按目标分块、保留活动与产出记录、定时复盘，不只强调在线时长。'),
  q('customer_call', '遇到情绪激动或表达不清楚的客户，你在视频或电话中如何处理？', 'How do you handle an upset or unclear customer by video or phone?', '远程客户沟通', '先倾听复述，确认事实，给出可执行下一步并记录。'),
  q('privacy', '在家处理客户电话、照片和资料时，你如何保护隐私？', 'How do you protect customer calls, photos, and records when working from home?', '数据安全', '不共用设备/账号，不私存或转发，锁屏、耳机、授权系统和安全网络。', true),
  q('learning', '如果系统或产品知识完全陌生，你前三天怎么学，怎样证明已经掌握？', 'If the system or product is new to you, how do you learn it in the first three days and prove mastery?', '学习能力', '阅读资料、实际操作、问题清单、模拟任务和验收结果。'),
  q('availability', '请确认你的工作时区、可工作时间、开始日期以及无法工作的固定时段。', 'Confirm your time zone, working hours, start date, and any fixed unavailable times.', '排班匹配', '回答具体、一致，能覆盖岗位时段并说明限制。'),
  q('feedback', '请讲一次你收到负面反馈后改变工作方法的经历。', 'Tell me about a time negative feedback changed how you worked.', '接受反馈', '不防御，有具体调整和后续效果。'),
  q('simulation', '现在请共享思路：你会如何处理一条新客户消息，从理解需求到安排下一步？', 'Think aloud: how would you handle a new customer message from understanding the need to arranging the next step?', '现场任务能力', '先确认客户与需求，再给准确答复、记录、约定下一步；不编造信息。'),
  q('questions', '你对岗位、目标、培训和考核有什么具体问题？', 'What specific questions do you have about the role, targets, training, and evaluation?', '准备程度与判断力', '问题与岗位实际相关，关注目标、流程、支持和成功标准。')
];

const byIds = (bank, ids) => ids.map(id => bank.find(item => item.id === id));
const kit = (id, role, size, titleZh, titleEn, descriptionZh, descriptionEn, questions) => ({ id, role, size, titleZh, titleEn, descriptionZh, descriptionEn, questions });

const INTERVIEW_KITS = [
  kit('installer_quick_6', 'installer', 'quick', '贴膜技师 · 6题快速版', 'Film installer · 6-question quick interview', '约20分钟，先判断真实施工、安全、质量和返工态度。', 'About 20 minutes: validate real installation, safety, quality, and redo ownership.', byIds(installer, ['work_sample', 'prep', 'contamination', 'damage_prevention', 'speed_quality', 'practical_test'])),
  kit('installer_full_18', 'installer', 'full', '贴膜技师 · 18题完整版', 'Film installer · 18-question full interview', '约60分钟，覆盖材料、施工、拆装、质量、效率与实操。', 'About 60 minutes: materials, installation, disassembly, quality, efficiency, and trial work.', installer),
  kit('wholesale_quick_6', 'wholesale', 'quick', '汽车膜B2B销售 · 6题快速版', 'Film wholesale B2B sales · 6-question quick interview', '约25分钟，判断开发门店、产品表达、跟进和成交基本功。', 'About 25 minutes: shop prospecting, product pitch, follow-up, and closing fundamentals.', byIds(wholesale, ['pipeline', 'first_week', 'decision_maker', 'product_pitch', 'follow_up', 'role_play'])),
  kit('wholesale_full_18', 'wholesale', 'full', '汽车膜B2B销售 · 18题完整版', 'Film wholesale B2B sales · 18-question full interview', '约60分钟，覆盖区域经营、报价、回款、复购与现场演练。', 'About 60 minutes: territory, pricing, payment risk, repeat business, and role-play.', wholesale),
  kit('dealer_quick_8', 'dealer', 'quick', '4S店外跑业务 · 8题快速版', 'Dealership field sales · 8-question quick interview', '约30分钟，判断进店、找决策人、价值表达、试单和跟进能力。', 'About 30 minutes: access, stakeholders, value pitch, pilot, and follow-up.', byIds(dealer, ['street_plan', 'entry', 'stakeholders', 'dealer_value', 'pilot', 'objection_vendor', 'followup_cadence', 'role_play_gm'])),
  kit('dealer_full_16', 'dealer', 'full', '4S店外跑业务 · 16题完整版', 'Dealership field sales · 16-question full interview', '约60分钟，针对奔驰、宝马、奥迪等经销商街区的完整业务面试。', 'About 60 minutes for field sales across Mercedes, BMW, Audi, and similar dealer corridors.', dealer),
  kit('remote_quick_6', 'remote', 'quick', '网络视频面试 · 6题快速版', 'Remote video interview · 6-question quick screen', '约20分钟，判断表达、证据、远程条件、自我管理与客户沟通。', 'About 20 minutes: communication, evidence, remote setup, self-management, and customer handling.', byIds(remote, ['intro', 'evidence', 'remote_setup', 'communication', 'self_management', 'customer_call'])),
  kit('remote_full_12', 'remote', 'full', '网络视频面试 · 12题完整版', 'Remote video interview · 12-question full interview', '约45分钟，覆盖远程工作条件、隐私、学习、排班和模拟任务。', 'About 45 minutes: setup, privacy, learning, availability, and a live simulation.', remote)
];

const INTERVIEW_KIT_MAP = new Map(INTERVIEW_KITS.map(item => [item.id, item]));

module.exports = { INTERVIEW_KITS, INTERVIEW_KIT_MAP };
