# QUAD AI Voice Agent MVP

当前实现：门店软件业务员手机端“业务 → AI查找与电话”，复用现有服务器OpenAI密钥、Twilio账号和主叫号码；另附独立部署版。真实通话验收尚未进行，不应把模拟结果视作业务成果。

## 已实现

- 业务员中文AI联网查找，显示可点击网页来源；查找要求可转成电话任务草稿。
- 中文任务解析、英文问题清单、缺失资料提醒、人工审批、美国号码校验。
- Twilio真实外呼接口、接听方AI披露及按1同意后建立双向Media Streams。
- OpenAI Realtime英文自然对话、VAD打断、清除电话积压音频及截断未播放内容。
- 挂断工具、老板及业务员停止通话、服务商TimeLimit、状态签名校验。
- 持久化英文转写、中文事实报告及原文依据；价格数字必须出现在对应原文引用中。
- 业务员只能访问自己的任务、通话与搜索；老板可查看全部、授权号码和控制全局外呼。
- 已审批的单次定时任务；每10秒扫描，错过超过15分钟撤销审批，不补拨。
- 防重复点击、每任务一次真实拨号、同号码30分钟冷却、结果未知时停止新拨号。
- 默认单通180秒、每日最多10次、每天预算预留5美元；每分钟预留1美元，故默认预算实际只容纳一通满额3分钟任务。预留不回退，采用保守限制。
- 模拟记录单独标注；不调用电话服务。Twilio电话费可查询，AI usage保留供对账。

## 首选：接入现有门店服务器

接入代码通过 `openAiCustomerReplyKey(readDb())` 及 `twilioConfig()` 读取现有配置，密钥只在服务器内存使用。不导出、不复制现有密钥，不修改Twilio来电Webhook或原有转接。

业务员打开手机员工端 `/mobile.html`，进入“业务”，点击“AI查找与电话”。入口采用同源嵌入页面，共用现有登录令牌，无须注册新账号。需要既有 `canUseFieldSales` 权限。只有老板可授权真实接听号码、开启全局外呼。

安装到隔离的门店仓库副本：

```sh
node scripts/install-film-shop.js /ABSOLUTE/PATH/TO/film-shop-management
cd /ABSOLUTE/PATH/TO/film-shop-management
npm install
node --check server.js
node --test scripts/test-voice-agent-host.js
```

安装器只复制代码及修改入口，不复制生产数据库。`test-voice-agent-host.js` 随接入补丁提供，位于门店仓库 scripts 目录。请审阅补丁后部署。安装器遇到入口结构变化会停止，重复运行会拒绝覆盖。

现有云服务复用其 `/app/data` 持久卷，专用记录文件为 `/app/data/quad-voice-agent.json`，不写入门店 `db.json`。文件模式只允许单实例。可配置 `VOICE_DATABASE_URL` 改用PostgreSQL；需先备份再迁移数据，设置数据库连接不会自动迁移旧文件。

接入版API能力默认可用，但全局外呼默认关闭、接听白名单默认空；没有创建及审批任务不会拨打电话。设置 `VOICE_LIVE_ENABLED=false` 可从服务器完全禁用新外呼。现有业务员搜索立即使用现有OpenAI模型；模型缺少web_search权限时明确报错，不伪造结果。可用 `OPENAI_VOICE_SEARCH_MODEL` 单独指定已获授权的搜索模型。

## 本地演示：完全模拟

```sh
npm ci
npm run demo
```

打开 [本地模拟演示](http://127.0.0.1:4381)。不需要API密钥，不访问OpenAI或Twilio。演示中的解析和来源均为固定测试资料，界面明确标注“本地模拟”。不要将这个进程暴露到公网；它仅绑定127.0.0.1，没有登录验证。

## 独立云服务

```sh
npm ci
npm start
```

需要配置专用 `VOICE_ADMIN_TOKEN`（至少24字符）及环境变量。生产模式强制要求PostgreSQL。环境变量示例在 `.env.example`，Node 22可使用 `node --env-file=.env.local server.js`；普通 `npm start` 不会自动读取env文件。独立部署版无法访问另一个进程内的加密门店密钥，应使用Railway环境变量引用或正式服务端适配器；不应从浏览器导出密钥。

- Railway部署读取Dockerfile和railway.json，绑定 `HOST=0.0.0.0`，自动使用 `PORT`。
- 创建PostgreSQL，将连接串配置为 `VOICE_DATABASE_URL`；私有网络连接无需公开数据库端口。
- `VOICE_PUBLIC_URL` 必须是精确HTTPS域名，不带末尾斜线；它用于Twilio签名核验。
- `VOICE_LIVE_ENABLED=true` 仅开启接口能力，仍需老板登录后开启开关并授权号码。
- 不修改现有Twilio号码的来电转接；外呼在每次Calls请求中提供独立Webhook。
- 健康检查 `/health`；门店接入版继续使用现有 `/api/health`。
- 单实例部署；不要在已有活动通话期间发布。部署后先做无电话预检，再由授权测试接听人验收。

## 需要的现有账号及服务

| 服务 | 用途 | 本项目动作 |
|---|---|---|
| OpenAI Platform | Realtime、文字解析、报告及web_search | 复用门店现有密钥；核对模型权限和额度 |
| Twilio | 美国主叫号码、Calls、Media Streams、语音信箱检测 | 复用现有账号及 `+1 (725) 241-2586` 配置，不购买新号码 |
| GitHub | 版本管理及Railway自动部署 | 复用 film-shop-management |
| Railway | 云端进程、持久卷；可另加PostgreSQL | 优先接入现有服务，保留原有来电处理 |

号码仍需以当前服务器实际配置为准。美国主叫号码不是测试接听号码。未给出新的测试接听号码前，不做真实试拨；历史授权不自动视为本次试拨许可。

## 文档

- [架构、开发顺序及成本](VOICE-ARCHITECTURE.md)
- [API与数据结构](VOICE-API.md)
- [测试与验收清单](VOICE-TEST-RECORD.md)
- 手机入口：`/mobile.html` → 业务 → AI查找与电话

## 尚未完成

真实英文电话、真实AI搜索、延迟和音质、三场景真人验收、PostgreSQL实库测试，以及独立云服务运行验收仍需实际环境验证。此MVP不自动接听来电、不录音、不自动重拨、不进行营销外呼、不执行付款或有约束力的预约。10员工并发、Redis分布式队列、Next.js前端迁移、归档及数据保留策略在后续阶段完成。
