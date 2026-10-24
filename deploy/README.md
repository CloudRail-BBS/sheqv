# 部署（docker compose）

所有部署配置都在本目录，**仓库根目录不再放任何部署文件**。

```bash
cd deploy
./up.sh          # 首次自动生成 .env（随机数据库密码/会话密钥）并构建启动
./doctor.sh      # 起不来时先跑它
```

## 端口

| 服务 | 容器内 | 宿主机 | 说明 |
|---|---|---|---|
| web | 8900 | `127.0.0.1:8900` | 对外由 nginx 承载 |
| api | 8080 | `127.0.0.1:18080` | **8080 常被占用**，所以映射到 18080；可用 `API_HOST_PORT` 改 |
| db | 5432 | 不发布 | 只在 compose 网络内可达 |

健康检查：`curl -s 127.0.0.1:18080/api/health`

## 首次初始化

```bash
./up.sh
docker compose exec api /usr/local/bin/arena-api create-admin \
  --username ops --password '<强密码>' --nickname 运维
```

不要依赖「第一个注册的人成为管理员」——公网可达时会被抢注。建完再去后台打开注册。

## 环境变量（`deploy/.env`）

| 键 | 必填 | 说明 |
|---|---|---|
| `POSTGRES_PASSWORD` | 是 | 同时用于初始化 db 与拼 api 的 `DATABASE_URL` |
| `SESSION_SECRET` | 建议 | 留空会自动生成到数据卷；多实例必须显式配同一个值 |
| `ADMIN_TOKEN` | 否 | 应急后台口令，留空不启用 |
| `PUBLIC_BASE_URL` | 建议 | 如 `https://arena.example.com`，影响 OAuth 回调与 Cookie Secure |
| `API_HOST_PORT` | 否 | 默认 18080 |

## 备份 / 恢复

```bash
cd deploy
DATABASE_URL="postgres://arena:<pass>@127.0.0.1:18080/arena" bash ../server/scripts/backup.sh
```

更省事的是容器模式（脚本自动识别，无需本机装 pg_dump）：

```bash
cd deploy && ../server/scripts/backup.sh --dir ./backups
```

恢复：`../server/scripts/restore.sh ./backups/arena-XXXX.dump --yes`（会先自动备份现状）。
