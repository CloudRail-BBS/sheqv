# 部署入口

配置不在本目录：**每个容器的配置都在它自己的目录里**。

| 目录 | 内容 | 服务 |
|---|---|---|
| `server/compose.yml` | 后端编排 | `db`（PostgreSQL）+ `api`（Rust） |
| `server/Dockerfile` · `server/.env.example` | 后端构建与环境模板 | |
| `web/compose.yml` | 前端编排 | `web`（Next.js） |
| `web/Dockerfile` · `web/.env.example` | 前端构建与环境模板 | |

本目录只有几个**跨栈的入口脚本**（不定义任何服务）：

```bash
cd deploy
./up.sh             # 后端栈 → 等 api 就绪 → 前端栈，一条命令起全栈
./down.sh           # 停容器，保留数据卷
./down.sh --purge   # 连数据卷一起删（会丢数据库）
./doctor.sh         # 起不来时先跑它（两个栈的状态、健康、日志一起看）
```

> `down.sh` 的顺序是**先前端后后端**。web 接在后端创建的 `blockarena-net` 上，
> 先停后端会让网络删不掉，报 `! Network blockarena-net Resource is still in use`。

## 日常操作

| 场景 | 命令 | 说明 |
|---|---|---|
| **日常重启** | `./up.sh --no-build` | 直接用现有镜像，秒级；数据保留 |
| 改了代码 / 依赖 / Dockerfile | `git pull && ./up.sh` | 带 `--build` 重建镜像 |
| 只改了 `.env` 或 compose 配置 | `./up.sh --no-build` | compose 检测到配置变化会重建受影响容器 |
| 只重启后端 | `(cd ../server && docker compose restart api)` | 不重新读 compose 配置 |
| 停服务、保留数据 | `./down.sh` | 下次 `up.sh` 数据还在 |
| 清空重来 | `./down.sh --purge && ./up.sh` | **会删数据库** |
| 改了 `POSTGRES_PASSWORD` | 见下方注意 | 卷里的密码不会跟着变 |

> **服务器重启**：三个容器都是 `restart: unless-stopped`，Docker 起来后会自动恢复，
> 不需要手动 `up.sh`。但如果之前执行过 `./down.sh`（容器被手动停止），
> Docker 不会自动拉起，需要 `./up.sh --no-build`。

> **改了 `POSTGRES_PASSWORD` 不会生效**：PostgreSQL 只在首次 initdb 时读这个值。
> 要改密码必须进容器 `ALTER USER arena PASSWORD '新密码';`；
> 直接改 `.env` 会让 api 认证失败（详见下方问题表）。

## 也可以分开起

拆开的好处是改前端不用动后端：

```bash
cd server && cp .env.example .env   # 或 ./init-env.sh 自动生成随机密码
cd server && docker compose up -d --build     # db + api，同时创建 blockarena-net
cd web    && docker compose up -d --build     # web，接入上面那个网络
```

两个栈的 project name 不同（`blockarena` / `blockarena-web`），所以
`docker compose down` 只影响自己这一栈，不会误删对方容器。

## 端口

| 服务 | 容器内 | 宿主机 | 说明 |
|---|---|---|---|
| web | 8900 | `127.0.0.1:8900` | `WEB_HOST_PORT` 可改；对外由 nginx 承载 |
| api | 8080 | `127.0.0.1:8860` | **8080 常被占用**，所以映射到 8860；`API_HOST_PORT` 可改 |
| db | 5432 | 不发布 | 只在 `blockarena-net` 内可达 |

健康检查：`curl -s 127.0.0.1:8860/api/health`

## 首次初始化

```bash
cd deploy && ./up.sh
cd server && docker compose exec api /usr/local/bin/arena-api create-admin \
  --username ops --password '<强密码>' --nickname 运维
```

不要依赖「第一个注册的人成为管理员」——公网可达时会被抢注。建完再去后台打开注册。

## 环境变量

| 文件 | 键 | 说明 |
|---|---|---|
| `server/.env` | `POSTGRES_PASSWORD` **必填** | 同时用于初始化 db 与拼 api 的 `DATABASE_URL` |
| | `API_HOST_PORT` | 默认 8860 |
| | `SESSION_SECRET` | 留空自动生成到数据卷；多实例必须显式配同一个值 |
| | `ADMIN_TOKEN` / `PUBLIC_BASE_URL` | 可选 |
| | `REGISTRY` | 可选。基础镜像前缀，国内填 `docker.m.daocloud.io/library/` |
| | `APT_MIRROR` | 可选。Debian 包源域名，如 `mirrors.aliyun.com` |
| `web/.env` | `API_BASE` | 默认 `http://api:8080`（走 compose 网络别名） |
| | `WEB_HOST_PORT` | 默认 8900 |
| | `REGISTRY` / `NPM_REGISTRY` / `APK_MIRROR` | 可选。镜像站前缀、npm 源、Alpine 源 |

`server/.env` 同时被 `cargo run`（dotenvy）读取，所以裸机调试也用这一份。

## 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| api 反复重启，日志 `password authentication failed for user "arena"` | 数据卷是旧密码初始化的，改 `.env` 不会改已存在的角色 | 数据可丢：`./down.sh --purge`；要保留：`(cd ../server && docker compose exec db psql -U arena -d arena -c "ALTER USER arena PASSWORD '新密码';")` |
| `-bash: ./up.sh: Permission denied` | 脚本没有执行位 | 用 `bash up.sh`；或 `chmod +x deploy/*.sh server/*.sh server/scripts/*.sh` |
| `network blockarena-net declared as external, but could not be found` | 先起了 web | 先 `cd server && docker compose up -d` |
| `! Network blockarena-net Resource is still in use`（`down` 时） | web 是独立 project，容器还连着这个网络 | 用 `./down.sh`（先前端后后端）；或先 `cd web && docker compose down` |
| 构建报 `failed to resolve source metadata for docker.io/...` / `DeadlineExceeded` | 服务器连不上 Docker Hub（国内常见） | 见下方「拉不到镜像 / 构建超时」 |
| 浏览器里注册/登录返回 500，api 日志里没有该请求 | web 的 rewrites 固化了构建时的地址；没传 `API_BASE` 就会写死 `127.0.0.1:8080`（容器里是 web 自己） | `cd web && docker compose build`（`web/compose.yml` 的 `build.args` 已传 `http://api:8080`） |

## 拉不到镜像 / 构建超时（国内服务器）

典型报错：

```
failed to solve: DeadlineExceeded: debian:bookworm-slim: failed to resolve source metadata
for docker.io/library/debian:bookworm-slim: ... timeout awaiting response headers
```

**方案 A：给 Docker 配镜像加速（一次性，影响整台机器，推荐）**

```bash
sudo tee /etc/docker/daemon.json >/dev/null <<'JSON'
{ "registry-mirrors": ["https://docker.m.daocloud.io"] }
JSON
sudo systemctl daemon-reload && sudo systemctl restart docker
```

之后 `./up.sh` 不需要改任何东西。可用镜像地址会变，失效了就换一个
（`docker.m.daocloud.io` / `docker.1panel.live` 等）。

**方案 B：只给本栈换源（不想动 daemon，或没有 root）**

在 `server/.env` 与 `web/.env` 里放开这几行（`.env.example` 已写好注释）：

```ini
REGISTRY=docker.m.daocloud.io/library/
APT_MIRROR=mirrors.aliyun.com      # 后端 apt
NPM_REGISTRY=https://registry.npmmirror.com   # 前端 npm
APK_MIRROR=mirrors.aliyun.com      # 前端 apk
```

然后照常 `./up.sh`。`compose.yml` 会把 `REGISTRY` 当构建参数传给两个 Dockerfile，
`postgres` / `redis` 的镜像名也一起前缀化；`APT_MIRROR` / `NPM_REGISTRY` /
`APK_MIRROR` 是**只换域名**的替换（路径不变），留空就走官方源。

只要临时试一次，也可以直接传参：

```bash
cd server && docker compose build \
  --build-arg REGISTRY=docker.m.daocloud.io/library/ \
  --build-arg APT_MIRROR=mirrors.aliyun.com api
```

> 前缀末尾的 `/library/` 不能省：`rust`、`debian`、`node`、`postgres`、`redis`
> 都在 Docker Hub 的官方 `library` 命名空间下；镜像站要求路径一致。
>
> 只换镜像站、没换 npm 源时，`npm ci` 仍可能卡在 `registry.npmjs.org`——
> 前端构建卡住的话把 `NPM_REGISTRY` 一起设上。

## 备份 / 恢复

```bash
cd server
docker compose exec db pg_dump -U arena -d arena -Fc > /backup/arena-$(date +%F).dump
```

或直接用脚本（会自动识别本机 `pg_dump` 与容器两种模式）：

```bash
cd server && ./scripts/backup.sh --dir /backup --keep 14
cd server && ./scripts/restore.sh /backup/arena-XXXX.dump --yes   # 覆盖当前库，会先自动备份
```
