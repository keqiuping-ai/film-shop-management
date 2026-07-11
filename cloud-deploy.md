# 云端部署说明

## 我推荐的服务器方案

第一阶段推荐：Railway 或 Render。

原因：

- 不需要自己维护 Linux 服务器。
- 可以直接跑 Node 服务。
- 支持环境变量 `PORT`。
- 支持持久化存储，用来保存 `data/db.json`。
- 后续可以接 GitHub 自动部署和升级。

如果你想最省心：选 Railway。

如果你想价格更固定、后台更传统：选 Render。

如果后面订单量变大、需要更强控制：再迁移到 DigitalOcean / AWS / 阿里云国际。

## 必须保留的数据目录

这个系统当前数据保存在：

`data/db.json`

云端部署时必须给下面路径配置“持久化磁盘/Volume”：

`/app/data`

并设置环境变量：

```bash
DATA_DIR=/app/data
```

否则每次重新部署，数据可能丢失。

## 必须设置的环境变量

```bash
PORT=云平台分配的端口
DATA_DIR=/app/data
NODE_ENV=production
```

多数云平台会自动设置 `PORT`，系统已经支持读取。

## Docker 部署

项目已经包含：

- `Dockerfile`
- `.dockerignore`

本地测试：

```bash
docker build -t film-shop-cloud .
docker run -p 4318:4318 -v film-shop-data:/app/data film-shop-cloud
```

打开：

`http://localhost:4318`

## Railway 部署要点

1. 注册 Railway。
2. 新建 Project。
3. 从 GitHub Repo 部署，或上传这个项目。
4. 添加 Volume，挂载路径填：

```bash
/app/data
```

5. 环境变量：

```bash
DATA_DIR=/app/data
NODE_ENV=production
```

6. Railway 通常会自动提供 `PORT`。
7. 部署后打开 Railway 给的网址。

## Render 部署要点

1. 注册 Render。
2. 新建 Web Service。
3. 使用 Docker 部署。
4. 选择付费 Web Service，因为免费服务没有可靠持久化磁盘。
5. 添加 Persistent Disk，挂载路径填：

```bash
/app/data
```

6. 环境变量：

```bash
DATA_DIR=/app/data
NODE_ENV=production
```

7. Render 通常会自动提供 `PORT`。

## 域名和 HTTPS

正式使用建议绑定域名，例如：

`https://app.yourfilmshop.com`

云平台一般会自动提供 HTTPS。

如果暂时没有域名，也可以先用云平台默认网址。

## 上线后第一件事

登录默认老板账号：

- `admin@filmshop.local`
- `admin123`

马上做三件事：

1. 修改老板密码。
2. 创建每个员工自己的账号。
3. 按岗位设置权限。

## 备份

第一阶段必须定期备份：

`/app/data/db.json`

后续正式版建议改成 PostgreSQL，并开启每日自动备份。

## 生产升级建议

当前第一阶段可以上线试用，但真正长期商用建议第二阶段升级：

- PostgreSQL 数据库
- 图片上传存储
- 每日自动备份
- 日志审计导出
- HTTPS 域名
- 自动升级包签名校验
