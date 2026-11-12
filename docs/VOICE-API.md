# API、环境变量及数据结构

所有业务API位于 `/api/voice-agent`。门店接入版使用既有 `Authorization: Bearer <登录令牌>`，服务器重新读取当前用户及业务权限。独立版使用HttpOnly、SameSite=Strict会话cookie。浏览器不接触OpenAI或Twilio密钥。

| 方法与路径 | 用途 | 权限 |
|---|---|---|
| GET `/api/voice-agent` | 状态、任务、通话、搜索、报告和配置是否就绪 | 业务员只见自己的记录；老板全部 |
| POST `/search` | `{query}` 真实AI联网查找 | 已授权业务账号，20次/日 |
| POST `/tasks` | 中文任务及人工核实的公司、号码、目的、授权依据 | 已授权业务账号 |
| POST `/tasks/:id/approve` | `{confirm:true}` 审阅英文目标 | 任务所属业务员或老板 |
| POST `/tasks/:id/start` | `{confirmRealCall:true}` 真正拨号 | 任务所属业务员或老板；必须经过白名单和全局开关 |
| POST `/tasks/:id/simulate` | 创建明确标注的模拟记录，无电话请求 | 任务所属业务员或老板 |
| POST `/tasks/:id/cancel` | 取消未执行任务 | 任务所属业务员或老板 |
| POST `/calls/:id/stop` | 立即请求挂断 | 通话所属业务员或老板 |
| POST `/calls/:id/reconcile` | 用服务商CallSid重新查询状态 | 通话所属业务员或老板 |
| POST `/calls/:id/cost` | 同步Twilio电话费 | 通话所属业务员或老板 |
| POST `/calls/:id/report` | 重试中文报告，必须已结束 | 通话所属业务员或老板 |
| POST `/stop-mine` | 停止当前用户全部通话 | 当前用户 |
| POST `/control` | `{stopped:boolean}` 全局开关，停止时撤销定时审批 | 老板 |
| POST `/authorize-number` | `{to,confirm:true}` 添加已核实接听号码 | 老板 |
| POST `/employee` | `{enabled:boolean}` AI商务助理的执行权限 | 老板 |
| POST `/hooks/:callId/answer` | 英文披露、接听同意 | Twilio签名及AccountSid/CallSid/From/To校验 |
| POST `/hooks/:callId/consent` | 按1后返回双向流TwiML | 同上 |
| POST `/hooks/:callId/status` | 有序状态、时长、结束触发报告 | 同上 |
| WS `/stream/:callId` | 双向PCMU音频桥接 | Twilio签名及起始身份、一次性流token |

省略前缀的路径均相对于 `/api/voice-agent`。GET返回的config仅含就绪标志、公开主叫及白名单，不含服务密钥。接口错误不会把provider响应正文或请求头返回浏览器。

创建任务的JSON示例（虚构号码，不是真实测试号码）：

```json
{
  "company":"人工核实的公司",
  "to":"+12025550123",
  "instruction":"请询问二手CNC售价、年份型号、状况和所在地，只询价。",
  "purpose":"test",
  "authorizationNote":"接听方在某日期授权本次AI测试，依据待实际填写",
  "numberConfirmed":true,
  "authorized":true,
  "scheduledAt":null
}
```

创建只解析，不拨号。`plan.missing` 非空无法审批，需补充资料后重新创建任务。`scheduledAt` 须为未来ISO 8601时间，前端datetime-local按设备时区转换后传UTC；服务器日限额采用America/Los_Angeles。

## 数据结构

MVP存储聚合，文件与PostgreSQL使用相同JSON结构：

- `version`: 结构版本。
- `stopped`: 全局停止开关，初始true。
- `employees[]`: AI角色ID、名称与执行开关，当前只有business。
- `limits`: dailyCalls、maxSeconds、dailyBudget、reservePerMinute、concurrency。当前没有开放远程修改接口；变更须通过受控配置/迁移。并发实现固定1。
- `tasks[]`: id、ownerId、公司、号码、中文要求、授权依据、英文plan、missing、审批状态、定时时间。
- `calls[]`: id、taskId、ownerId、CallSid、主被叫、mode、status、起止时间、时长、consent、预算预留、providerPrice、usage、transcript、report。
- `transcript[]`: 唯一id、itemId、at、role、英文text、interrupted。AI生成但未完整播放的内容标注打断。
- `report`: 中文摘要、完成判断、facts及每项英文原文、后续问题、建议、生成时间。
- `searches[]`: ownerId、query、创建时间、状态、中文结果、带位置索引的URL citations、usage。
- `authorizedNumbers[]`: 老板人工授权的美国接听号码，与服务器环境白名单取并集。
- `audit[]`: id、时间、actor、action及相关任务/通话ID。

PostgreSQL实际建表语句在 [schema.sql](../lib/voice-agent/schema.sql)，Store.init也执行相同幂等建表。认领电话时先锁定聚合行、核对配额及重复条件、持久化starting，再离开事务请求Twilio。网络超时后保留start-unknown，不自动重试。状态回调即使早于外呼HTTP响应也可绑定CallSid。

本次没有执行分表迁移、Redis或PostgreSQL实库测试，不应把聚合结构称作已完成的多租户数据库设计。

## 环境变量

| 变量 | 门店接入版 | 独立版 |
|---|---|---|
| OPENAI_API_KEY | 可继续使用原环境变量；否则从原加密设置读取 | 必须由服务器安全配置 |
| TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN | 原配置函数读取 | 必填 |
| TWILIO_FROM_NUMBER | 原主叫配置 | 必填 |
| TWILIO_WEBHOOK_BASE_URL | 原HTTPS回调地址 | 使用VOICE_PUBLIC_URL |
| OPENAI_PHONE_REALTIME_MODEL | 默认gpt-realtime，与原模块相同 | 默认gpt-realtime |
| OPENAI_VOICE_SEARCH_MODEL | 可选；默认现有门店文字模型 | 可选；服务端搜索默认gpt-4.1 |
| OPENAI_VOICE_TEXT_MODEL | 接入版使用现有门店模型 | 默认gpt-4o-mini |
| VOICE_DATABASE_URL | 可选，未配置使用独立持久卷文件 | NODE_ENV=production时必填 |
| VOICE_LIVE_ENABLED | `false`可完全禁用新外呼；仍有数据库开关和白名单 | 须显式`true`才允许新外呼 |
| VOICE_ALLOWED_NUMBERS | 可选，逗号分隔的人工白名单 | 同左 |
| VOICE_BROWSER_ORIGIN | 可选，精确前端origin；本地调试回调与前端域名不同时设置 | 使用VOICE_PUBLIC_URL |
| VOICE_ADMIN_TOKEN | 不使用，复用原用户登录 | 至少24字符，放服务器环境变量 |
| VOICE_PUBLIC_URL | 不使用，复用原回调地址 | 精确HTTPS域名，无末尾斜线 |
| HOST / PORT | 继承门店配置 | 云端HOST=0.0.0.0，PORT由Railway注入 |

部署前备份专用记录文件及门店数据库。回滚时恢复代码即可关闭新入口，保留专用记录文件；不要删除已有备份或重置原门店数据。
