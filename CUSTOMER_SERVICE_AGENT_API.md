# QUAD 客服助手受限 API

此接口供另一台 Codex 或其他客服助手直接读取“客服任务中心”并提交建议回复，不依赖浏览器、鼠标或键盘。

## 安全边界

- 只识别 Railway 环境变量 `CUSTOMER_SERVICE_AGENT_TOKEN`（也可用 `CUSTOMER_SERVICE_AGENT_TOKENS` 配置多个令牌）。
- 令牌不能读取财务、库存、员工、施工单、设置或完整数据库。
- 当前为 `draft-only` 模式：助手可以领取任务、读取必要的客户沟通上下文、提交建议回复和跟进时间，但不能直接发送 Twilio 短信。
- 建议回复进入人工审核；员工在客户聊天工作台确认后才点击“发送短信”。
- 不要把令牌写入代码、GitHub、聊天记录或截图。

## 请求头

```text
Authorization: Bearer <CUSTOMER_SERVICE_AGENT_TOKEN>
X-Agent-Name: Codex Customer Service
Content-Type: application/json
```

## 读取任务

```http
GET /api/agent/customer-tasks?filter=active&limit=50
```

`filter` 可选值：`active`、`all`、`reply`、`first`、`followup`、`future`。

处理优先级：客户待回复 → 到期跟进 → 新客户首聊。默认 `active` 不返回尚未到期的未来任务。

## 领取或释放任务

```http
POST /api/agent/customer-tasks/{collection}/{id}/claim
POST /api/agent/customer-tasks/{collection}/{id}/release
```

`collection` 只能是 `customerConversations` 或 `prospects`。领取锁定 15 分钟，避免两个人同时回复。

## 提交建议回复或处理结果

```http
POST /api/agent/customer-tasks/{collection}/{id}/draft
```

```json
{
  "replyText": "Suggested customer reply in English.",
  "disposition": "ready_for_review",
  "note": "Checked price and availability; human should confirm before sending."
}
```

`disposition` 可选值：

- `ready_for_review`：建议回复已准备好，等待人工确认。
- `needs_human`：价格、投诉、退款或承诺等问题需要人工处理。
- `no_reply_needed`：无需发送回复，但保留处理记录。

如客户要求未来联系，可同时提交：

```json
{
  "replyText": "",
  "disposition": "no_reply_needed",
  "followUpDate": "2026-08-15",
  "followUpTime": "10:00",
  "followUpReason": "Customer expects the vehicle back in mid-August."
}
```

## Codex 工作规则

1. 先读取 `active` 队列，每次只领取一项。
2. 核对来源平台、客户姓名、电话、车辆、需求和最近沟通记录。
3. 回复客户必须使用英文；不要虚构价格、库存、工期或预约时间。
4. 涉及价格不确定、投诉、退款、法律责任或重要承诺时，提交 `needs_human`，不要自行决定。
5. 只提交建议回复，不尝试调用系统其他接口或获取其他密钥。
6. 提交后重新读取队列，确认结果已保存。
