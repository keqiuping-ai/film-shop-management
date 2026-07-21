# QUAD 客服助手受限 API

此接口供另一台 Codex 或其他客服助手直接读取“客服任务中心”并提交建议回复，不依赖浏览器、鼠标或键盘。

## 安全边界

- 只识别 Railway 环境变量 `CUSTOMER_SERVICE_AGENT_TOKEN`（也可用 `CUSTOMER_SERVICE_AGENT_TOKENS` 配置多个令牌）。
- 令牌不能读取财务、库存、员工、施工单、设置或完整数据库。
- 当前为 `direct-send` 模式：助手可以领取任务、读取必要的客户沟通上下文、提交建议回复和跟进时间，也可以通过现有 Twilio 通道直接发送纯文字短信。
- 每次直接发送必须先领取任务，并使用唯一 `requestId`；重复提交相同编号不会重复发送。
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

## 直接发送 Twilio 短信

先领取任务，再调用：

```http
POST /api/agent/customer-tasks/{collection}/{id}/send
```

```json
{
  "text": "Hi, this is QUAD Film following up on your Yelp inquiry. Would today or tomorrow work better for you to visit our shop?",
  "requestId": "codex-20260720-customer-id-001"
}
```

`requestId` 必须为 8–120 位字母、数字、点、下划线、冒号或短横线组成的唯一编号。同一客户记录使用相同 `requestId` 重试时，系统返回第一次发送结果，不会再次发送。

## Codex 工作规则

1. 先读取 `active` 队列，每次只领取一项。
2. 核对来源平台、客户姓名、电话、车辆、需求和最近沟通记录。
3. 回复客户必须使用英文；不要虚构价格、库存、工期或预约时间。
4. 涉及价格不确定、投诉、退款、法律责任或重要承诺时，提交 `needs_human`，不要自行决定。
5. 发送前再次核对客户姓名、规范化手机号、来源和最后一条消息；新客户首聊必须说明 Yelp 或 Meta/Facebook 来源并提出明确的到店问题。
6. 对投诉、退款、法律责任、价格不确定、库存不确定或重要承诺，使用 `needs_human`，不要直接发送。
7. 每次发送使用稳定且唯一的 `requestId`；超时重试时必须沿用原编号。
8. 发送后重新读取任务，确认出站短信已进入聊天记录。
