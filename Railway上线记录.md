# Railway 上线记录

上线日期：2026-06-23

## 线上访问地址

https://film-shop-management-production.up.railway.app

## Railway 项目

- Project：film-shop-management
- Project ID：6580027c-18d1-4c04-8853-add5c4ec8c3d
- Service：film-shop-management
- Service ID：98da52c1-47dc-4232-9bf1-b23782008303
- Environment：production
- Region：sfo

## 持久化数据

Railway Volume：

- Name：film-shop-management-volume
- Mount Path：/app/data
- 当前用途：保存 data/db.json

环境变量：

```bash
DATA_DIR=/app/data
NODE_ENV=production
```

## 默认登录

- 邮箱：admin@filmshop.local
- 密码：admin123

上线后第一件事：进入“设置”修改默认老板密码。

## 已验证

- /api/health 正常
- 默认老板账号登录正常
- HTTPS 页面可打开
- Volume 已挂载到 /app/data

