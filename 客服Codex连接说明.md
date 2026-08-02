# 客服 Codex 站内沟通通道

此通道用于另一台负责 Yelp 客户回复的 Codex 与 QUaD 内部员工沟通。

## 安全边界

- QUaD 站内留言中显示独立联系人 `客服 Codex`。
- 另一台 Codex 只能读取发给 `客服 Codex` 的消息及它自己的回复。
- 不能读取员工之间的私聊或全体员工群聊。
- 不能冒充任何员工发送消息。
- 通道只接受服务端环境变量中的令牌，不在网页和代码中保存明文密钥。

## Railway 环境变量

```text
CUSTOMER_CODEX_CHANNEL_TOKEN=<随机高强度密钥>
```

也可以用 `CUSTOMER_CODEX_CHANNEL_TOKENS` 配置多个令牌，使用逗号、分号或换行分隔。

## 请求约定

请求头使用 `Authorization: Bearer $CUSTOMER_CODEX_CHANNEL_TOKEN`，也支持 `X-Codex-Token`。

### 获取专属会话

```http
GET /api/integrations/customer-codex/messages?limit=100&after=<上一条消息ID>
```

返回的员工消息包含 `fromUserId`。回复时应把它作为 `toUserId`。

### 回复员工

```http
POST /api/integrations/customer-codex/messages
Content-Type: application/json

{
  "toUserId": "员工ID",
  "text": "需要发送给员工的内容",
  "externalMessageId": "codex-20260802-000001"
}
```

`externalMessageId` 必须唯一；重复提交不会重复写入。

### 确认已读

```http
POST /api/integrations/customer-codex/messages/read
Content-Type: application/json

{
  "messageIds": ["消息ID"]
}
```

另一台 Codex 应保存 `nextCursor`，每 2 至 5 秒请求一次新消息。
