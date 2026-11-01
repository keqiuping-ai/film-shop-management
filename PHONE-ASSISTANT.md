# QUAD FILM 中文 AI 电话测试接入

## 状态与范围

2026-10-31：代码已在基于远端 main 164da44 的独立工作副本完成；用户已明确授权发布到既有 Railway 应用并向已授权手机进行一次中文测试；开发记录不等于上线验收结果。原本 http://127.0.0.1:4173 的模拟应用保持原样。用户已明确选择复用门店现有 AI 服务。

先前已通过 Twilio 控制台向用户指定测试手机完成一次 18 秒的真实固定语音播报；该记录不证明本次新增中文 AI 对话已经通过。

本新增功能只允许老板账号、只允许 +16265864446 这一已授权号码。新增 /phone-assistant.html，从设置页“客户来电转接”区域进入。没有修改原 /api/twilio/voice 来电去向。测试会产生现有账户的电话、识别、合成和 AI 用量费用；不购买号码、不新建账号或密钥。

## 对话流程

1. 页面读取服务状态，完整填写目标、背景、必问问题、授权边界和升级确认条件。
2. 核对任务只创建内存会话，不拨号。第二次明确点击“确认，拨打一次测试电话”才提交。
3. 后端使用现有 Twilio 配置从 725-241-2586 发起，最长 180 秒、最多 8 轮，振铃等待 20 秒；不自动重拨。
4. 接听后先播报 AI 测试、识别、文字处理和保留说明，按 1 同意后才启用语音识别。不按 1 会挂断。
5. Twilio Gather 识别普通话，OpenAI 使用已有客服模型和加密密钥生成简短中文回答，Twilio Polly.Zhiyu 播报。逐句轮流，有识别和生成等待，暂不支持实时打断。
6. 说“结束测试”、按 9、直接挂断或网页结束按钮均可终止。两次无输入、AI 超时/失败或会话过期安全结束。
7. 页面显示识别文字、AI生成回复和服务商状态，可以下载中文测试汇报。所有外部业务事实未知，预订/付款/折扣/合同均未执行。

## 复用与配置

密钥只在原服务器内部通过 openAiCustomerReplyKey(readDb()) 使用，浏览器仅获得 ready 等布尔状态。没有提取、复制或写入任何真实密钥。模型复用 customerAiReplyModel(db)，API 基址沿用 OPENAI_API_BASE_URL。没有启用其他 AI 供应商回退。

使用现有 TWILIO_ACCOUNT_SID、TWILIO_AUTH_TOKEN、TWILIO_FROM_NUMBER、TWILIO_WEBHOOK_BASE_URL。回调基础地址必须为现有服务器的 HTTPS 地址；缺配置时返回未就绪。可回退 config.publicUrl，但不会信任浏览器提交的任意主机地址。当前只允许一个实例内存会话，多实例需共享会话存储后才可使用。

新增接口：

- GET /api/phone-assistant/config：仅老板，返回配置就绪标志和测试限制。
- POST /api/phone-assistant/sessions：校验并准备任务，不拨号。
- POST /api/phone-assistant/sessions/:id/start：要求 confirm=true，幂等发起一次。
- POST /api/phone-assistant/sessions/:id/cancel：终止，处理提交中取消竞态。
- GET /api/phone-assistant/sessions/:id：仅创建会话的老板可读。
- GET /api/phone-assistant/sessions/:id/report：中文文本。
- POST /api/phone-assistant/hooks/:id/{answer,consent,gather,wait,status}：Twilio 签名验证，并核对账号、主被叫及 CallSid；无需登录令牌。

AI生成在后台执行，语音 webhook 立即返回短 Pause/Redirect 轮询，避免长响应超出电话服务回调时限。旧轮次重放不重复调用 AI；取消使在途生成失效。AI不配置任何业务工具，不自动执行任务。API提交结果未知时禁止自动重试；应查 Twilio 日志。

## 数据和限制

- 不录音；Twilio 接触语音，OpenAI 接收识别文字和任务上下文。OpenAI请求 store=false。提供商自身的数据处理以其账号设置和政策为准。
- 应用文字记录只在内存保留约一小时，定期清除；重启丢失。不写入生产 db.json，不同步客户聊天，不自动发短信。
- 浏览器会在 sessionStorage 保存会话ID以恢复本标签页；不在其内保存对话或API密钥。登录沿用系统现有会话。
- 服务商“完成/进行中”不能区分本人和语音信箱。页面文字为识别/生成结果，不证明用户实际听到。
- 本次仅完成测试入口，不包括正式向第三方执行四类业务任务、来电AI接管、实时插话、完整生产存储或多实例容错。
- 中文识别模型使用 googlev2_chirp_3 / cmn-Hans-CN，TTS 使用 zh-CN / Polly.Zhiyu；账号地区及语音模型可用性仍需真实通话验收。

## 实际验证

- npm run test:phone-assistant：12 项通过，0 失败；含真实管理服务器隔离启动、认证、无凭证泄露的状态响应、正/负签名校验及准备不拨号。
- 模块测试覆盖指定号码限制、老板权限、必填、并发幂等、回调身份、同意门槛、中文多轮和重复回调、取消/提交竞态、AI失败/超时、倒序状态、记录过期、未知结果不重拨。
- node --test scripts/test-realtime-call-translation.js：原有 7 项通过。
- server.js、public/app.js、public/phone-assistant.js、lib/phone-assistant.js 语法检查通过；git diff --check 通过。
- Chromium 浏览器使用明确标记的电话/AI测试桩验证：任务空白、准备不拨号、两次确认、重复点击、刷新恢复、中文识别展示、特殊字符安全、汇报下载、修改清空及取消准备；1440/390/320宽度无横向溢出。
- 测试没有真实调用 AI、没有新增真实外呼、没有访问生产数据库；实际HTTP集成测试通过预加载脚本阻止全部外部提供商请求。
- 尚未验证：线上复用密钥的认证/余额、真实中文STT/TTS、多轮电话时延、真实取消、iPhone/Safari和其他浏览器。

运行测试需现有项目依赖 npm install 后执行 npm run test:phone-assistant。本轮测试使用 NODE_PATH 指向既有工作副本的依赖，无新增依赖。

## 部署前仍需确认

用户最初要求“不推送远程，不公开部署”，随后已明确授权发布本次改动到既有 Railway 应用并进行一次中文测试。真实语音回调需电话服务能访问 HTTPS 服务。没有生成隧道或公开本机。发布本身不发起电话；发布并核查配置后，才向已授权手机拨一次不超过3分钟的中文测试。

改动仅限一个后端模块、两处服务器调用及适配、新测试页面和脚本、原设置页入口、测试命令及本说明。上线前检查 main 是否更新并重放测试；上线后验证原来电转接继续存在。回退本次提交即可移除新入口，不修改电话服务商号码配置。

## 官方资料

- https://developers.openai.com/api/docs/guides/text
- https://www.twilio.com/docs/voice/twiml/gather
- https://www.twilio.com/docs/voice/twiml/say
- https://www.twilio.com/docs/voice/api/call-resource
- https://docs.cloud.google.com/speech-to-text/docs/speech-to-text-supported-languages


## 自然语音修订（首次电话反馈之后）

首版已获授权并发布（33db638、e8f3b0c），只向指定手机实际拨打一次，最终 completed，146 秒，4 轮中文问答。用户反馈“机械感太强”，对话中也明确反馈响应和播报慢。识别文字出现“改增膜”，疑似行业词误识别。首版仅证明中文双向流程可运行，体验未验收。

后续修订新增 lib/phone-realtime.js，生产新会话默认改为实时音频：Twilio bidirectional Media Streams ↔ OpenAI Realtime，保留原来电转接。复用服务器内部的既有 OpenAI 密钥；默认实时模型 gpt-realtime，可由 OPENAI_PHONE_REALTIME_MODEL 指定。语音 marin，speed=1.1；普通话、短句、单次只问一件事，不反复自报身份。音频使用 PCMU/8000 Hz，免转码；电话线路仍是窄带音质，不能等同于网页耳机试听音质。

- 每次说话直接由实时模型听音频并输出音频，不必等待完整转写后再请求文本模型。独立字幕仅供记录，可能与模型实际理解不完全一致。
- VAD 450ms 停顿后自动响应；支持插话自动停止生成，Twilio clear 清除积压，并 conversation.item.truncate 同步估算的已播放时长。被打断的AI字幕会标注，生成字幕不证明全部已被听到。
- WebSocket 入口只接受 Twilio 固定 wss 地址签名、已授权/已按1同意的会话、匹配 AccountSid/CallSid、一次性 token、PCMU 8kHz 单声道；浏览器不能直接连接。身份失败不会连接AI。
- 准备期输入缓冲最多100帧；音频发送积压会结束测试。挂断、按9、结束测试、取消和服务错误均清理两端连接。
- 新增 POST /api/phone-assistant/realtime-check：只验证已有密钥能建立实时会话并接受声音与音频配置，不发起电话、不发送音频、不创建AI回复。页面自动执行该检查；检查未通过不允许拨号。结果短期缓存。
- 最长180秒、最多8轮、仅指定测试手机号、老板权限、不会自动重拨等限制保留。不保存原始音频文件，应用文字保留约一小时。

自然语音版本的本机测试：22项电话/实时集成测试通过，含实际本地WebSocket升级与签名、假AI音频双向传输、插话清音和截断、身份失败、字幕重放和结束清理；原有7项语音翻译测试通过；13项Chromium界面检查通过（明确标记提供商测试桩）。HTTP测试同时阻断fetch和WebSocket对外连接。

尚需实机验收：真实Twilio媒体流升级、用户听到的自然度、响应时延、真实插话效果和行业词准确性。仅连接检查通过不能算真实语音质量通过。首版通话授权已使用，本次修订不自动再次拨号，等待用户另行要求试听。

参考：https://developers.openai.com/api/docs/guides/realtime-conversations 、https://developers.openai.com/api/docs/guides/voice-websockets 、https://www.twilio.com/docs/voice/media-streams/websocket-messages 。
