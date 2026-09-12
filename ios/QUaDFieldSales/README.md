# QUaD Field Sales 原样移植版

本目录用用户提供的“天目软件 iPhone 原生 App 一比一移植代码包”整体替换旧的简化版原生客户端。

当前接入范围：

- App：`QUaD Field Sales`
- Bundle ID：`com.quadfilm.field`
- Apple Team：`39U2MQ3H7U`
- QUaD 登录：`POST /api/login`
- QUaD 客户读取：`GET /api/mobile/bootstrap` 中的 `fieldSales.accounts`
- QUaD 客户新增：`POST /api/field-sales/accounts`
- QUaD 站内消息：`GET/POST /api/messages`
- QUaD 上下班打卡与轨迹：`POST /api/mobile/clock`、`POST /api/field-sales/location-points`
- QUaD 拜访计划、出发、旧行程恢复、到店与完成拜访：`/api/field-sales/visit-plans`、`/api/field-sales/trips/*`、`/api/field-sales/visits/*`
- QUaD 现场照片、录音与日报：`/api/field-sales/attachments`、`/api/field-sales/daily-reports`

以上业务接口已逐项适配 QUaD 数据结构。尚未适配的原 QEOS 请求仍会在客户端网络层发出前拦截，不会请求旧服务器。

生产默认地址是 `https://film-shop-management-production.up.railway.app`。本地隔离验证可在启动 App 时设置进程环境变量 `QUAD_API_BASE_URL`。

验证命令：

```sh
node scripts/test-native-customer-adapter.js
xcodebuild \
  -project ios/QUaDFieldSales/LidaField.xcodeproj \
  -scheme LidaField \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
```
