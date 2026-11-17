# QUAD 系统可用性方案（2026-11-17）

## 已落地到应用代码

- 管理端、员工端、客户下单端的 API 请求均有超时上限。
- 请求超过 12 秒会显示“服务器响应较慢”；断线、超时或 502/503/504 会显示明确的“服务器线路异常”。
- 网络失败不再清除管理端已有登录状态和已打开的页面。
- Service Worker 缓存独立的 `/offline.html`，已经访问过系统的设备在入口断线时可看到明确说明，而不是白屏或无限加载。
- 所有页面共用 `/connectivity.js`，避免三个端口出现三套不一致的故障提示。

## 独立备用入口与一分钟监控

`infrastructure/cloudflare-availability/` 是独立于 Railway 的 Cloudflare Worker：

- Cron 每分钟请求 Railway `/api/health`。
- 状态改变时向 `ALERT_WEBHOOK_URL` 发出故障或恢复通知，避免每分钟重复报警。
- Worker 自己提供备用状态页和 `/health`，建议绑定 `backup.quadfilmus.com`。
- 监控状态保存在 Cloudflare KV；Railway 整体不可用时，监控和备用说明页仍可工作。

部署前仍需要两个外部配置：Cloudflare 账号中的 KV/域名路由，以及接收通知的 webhook。不能把这些密钥写入 Git。

## CDN 评估结论

把图片、CSS、JavaScript 和视频放到 Cloudflare CDN/R2 可以明显降低 Railway 的静态流量，并让页面骨架在 Railway 线路故障时仍能打开。它不能单独保证订单、库存和登录继续工作，因为这些操作仍依赖 Railway API 和主数据库。

推荐按顺序实施：

1. 先上线 Cloudflare Worker 备用状态页和一分钟监控。
2. 将版本化静态资源迁移到 Cloudflare CDN/R2，HTML 和 API 路径保持不变。
3. 最后才评估第二套 API 服务和数据库复制；这一步涉及数据一致性，不能只用第二个域名假装成真正备用系统。

## 域名路由核查

`quadfilmus.com` 的 `/` 仅映射客户官网 `customer.html`；Railway 原域名 `/` 映射管理系统 `index.html`。域名加入本身不会把两套页面混在一起，但两者目前共享同一个 Railway 服务，因此会一起受该服务或其网络线路影响。
