# arena-api · 后端（Rust + PostgreSQL）

前后端分离后的后端服务：axum 0.8 + sqlx 0.8 + PostgreSQL 18。
设计文档见 [`../docs/前后端分离方案.md`](../docs/前后端分离方案.md)。

**当前进度：Phase 0–4 已完成**

- Phase 0：健康检查、迁移、连接池、会话密钥加载
- Phase 1：注册 / 登录 / 退出 / `auth/state`、`PATCH /me`（头衔）、GeeTest 服务端校验、
  站点设置（表 > 环境变量 > 默认）、首个用户的并发安全（advisory lock）
- Phase 2：帖子 / 评论 / 点赞、公约与签署（表 + 旧 Cookie 双认）、站内信聚合
- Phase 3：后台八组（用户 / 帖子 / 设置 / 公约 / 公告 / 轮播 / 赞助 / 爱发电），三条防锁死规则事务化
- Phase 4：GitHub / CNKD 第三方登录（state + PKCE S256、回调换 token、`(provider, sub)` 建号）
- 剩余：Phase 5 前端切换、Phase 6 运维

## 已实现接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 探活：DB + 数据目录，失败 503 |
| GET | `/api/v1/auth/state` | `{initialized, userCount, user}`，`Cache-Control: no-store` |
| POST | `/api/v1/auth/register` | 首个用户自动 admin；写 `ba_session` Cookie |
| POST | `/api/v1/auth/login` | 用户名或邮箱 + 密码 |
| POST | `/api/v1/auth/logout` | 清 Cookie（`Max-Age=0`） |
| POST | `/api/v1/auth/email-code` | 发邮箱验证码（需后台开启 + SMTP 配通） |
| POST | `/api/v1/auth/email-login` | 邮箱 + 验证码登录，写会话 Cookie |
| PATCH | `/api/v1/me` | 只开放头衔，保留字对普通用户拦截 |
| GET | `/api/v1/posts[?q=]` | 帖子列表（含评论）；`q` 搜索标题/正文/标签 |
| POST | `/api/v1/posts` | 需登录 + 社区公约；作者取自会话 |
| POST | `/api/v1/posts/{id}/like` | 匿名可点、可重复（计数器语义） |
| POST | `/api/v1/posts/{id}/comments` | 需登录 + 社区公约，2–300 字 |
| GET | `/api/v1/agreements` | 生效中的公约 |
| GET | `/api/v1/agreements/signatures` | 当前账号的签署状态 |
| POST | `/api/v1/agreements/sign` | 写 `signatures` 表 + 兼容旧 `ag_*` Cookie |
| GET | `/api/v1/notifications` | 评论通知 + 未读数（`no-store`） |
| POST | `/api/v1/notifications/read` | 推进已读水位（只进不退） |
| GET | `/api/v1/sponsors` | 公开赞助名单（只含展示中的，`no-store`） |
| GET | `/api/v1/settings` | 站点设置白名单投影（不含任何 secret，附 `githubEnabled`/`cnkdEnabled`） |
| GET | `/api/v1/users` · `/users/{id}` | 公开用户列表 / 单个公开资料（**不含 email**） |
| GET | `/api/v1/posts/{id}` | 帖子详情 |
| GET | `/api/v1/announcements/{id}` | 公告详情（未发布按 404） |
| GET | `/api/v1/stats` | 帖子/评论/点赞计数 |
| PATCH | `/api/v1/admin/users/{id}/badges` | 后台分配徽章（≤12 个，自动去重） |
| GET | `/api/v1/achievements` | 全站徽章表（`id:` / `name:` 双键） |
| GET | `/api/v1/achievements/{userId}` | 单人已得徽章 + 全目录进度 |
| GET/PATCH/DELETE | `/api/v1/admin/users` | 列表 / 改角色·封禁·头衔 / 删除；三条防锁死规则 |
| GET/DELETE | `/api/v1/admin/posts` | 列表 / 删帖（级联评论与点赞） |
| GET/PATCH | `/api/v1/admin/settings` | 读（含 overrides）/ 改 / `resetKey` 回落 |
| GET/POST/PATCH/DELETE | `/api/v1/admin/agreements` | 后台公约 CRUD，内置锁定 |
| GET/POST/PATCH/DELETE | `/api/v1/admin/announcements` | 公告 CRUD（置顶 / 草稿） |
| GET/POST/PATCH/DELETE | `/api/v1/admin/slides` | 轮播 CRUD（href/颜色白名单） |
| GET/POST/PATCH/DELETE | `/api/v1/admin/sponsors` | 快照 / 手动录入 / 隐藏 / 删除 |
| POST | `/api/v1/admin/afdian/sync` | 拉取爱发电并覆盖快照 |
| GET | `/api/v1/auth/oauth/{provider}` | 生成 state + PKCE，写一次性 Cookie，302 到平台 |
| GET | `/api/v1/auth/oauth/{provider}/callback` | 校验 state → 换 token → 取资料 → 建号/登录 → 302 `/me` |
| GET/POST | `/api/v1/guilds` | 公会列表（`?game=`）/ 创建（每人一个，创建者即负责人） |
| GET/PATCH/DELETE | `/api/v1/guilds/{id}` | 详情 / 改名·简介·状态（负责人或管理员）/ 删除 |
| GET/POST | `/api/v1/teams` | 战队列表 / 创建；**战队独立于公会**，不挂在公会下 |
| GET/PATCH/DELETE | `/api/v1/teams/{id}` | 详情 / 修改 / 删除 |
| GET | `/api/v1/leaderboard?game=` | 公会榜与战队榜分开返回（积分 → 胜场 → 少负 → 早创建） |
| GET | `/api/v1/admin/orgs` | 后台：两张榜一起给 |
| PATCH/DELETE | `/api/v1/admin/orgs/{kind}/{id}` | 校准积分·战绩（唯一写入口）/ 删除 |
| GET | `/api/v1/servers?kind=` | 联机大厅条目（只含公开展示的，带探测快照） || POST | `/api/v1/servers` | 自由上传（登录 + `post.create`），MC 与中转站共用 |
| PATCH/DELETE | `/api/v1/servers/{id}` | 本人或管理员；改地址会清空探测快照 |
| POST | `/api/v1/servers/{id}/probe` | 手动刷新一次（10 秒冷却） |
| GET | `/api/v1/relay/rooms` | 铁锈战争中转站的实时房间（10 秒缓存，失败回落旧数据） |
| GET | `/api/v1/admin/servers` | 后台列表（含隐藏条目） |
| PATCH/DELETE | `/api/v1/admin/servers/{id}` | 隐藏 / 恢复 / 删除 |

## 本地运行

需要一个可连的 PostgreSQL（本机或容器都行）。最省事的是只起数据库：

```bash
docker run -d --name arena-pg -p 5432:5432 \
  -e POSTGRES_DB=arena -e POSTGRES_USER=arena -e POSTGRES_PASSWORD=devpass \
  postgres:18-alpine

cp .env.example .env      # 把 DATABASE_URL 改成 postgres://arena:devpass@localhost:5432/arena
cargo run -- serve        # 默认 8080，启动时自动跑迁移
curl -s localhost:8080/api/health | jq
```

没有 `jq` 就直接 `curl -s localhost:8080/api/health`。

## 子命令

| 命令 | 用途 |
|---|---|
| `arena-api serve`（默认） | 启动 HTTP 服务；启动时执行内嵌迁移，失败即退出 |
| `arena-api healthcheck` | 探一次 `/api/health`，给 Docker healthcheck 用（镜像里不装 curl） |
| `arena-api create-admin --username <u> --password <p> [--nickname <n>]` | 空库首次部署建管理员；重复执行会报"用户名已存在" |

## 空库首次部署

```bash
createdb arena                      # 或由 compose 的 POSTGRES_DB 自动建
cargo run -- create-admin --username ops --password '<强密码>' --nickname 运维
cargo run -- serve                  # 起来之后用这个账号登录，再决定是否开放注册
```

不依赖「第一个注册的人当管理员」——那样在公网可达时容易被人抢注。

## 邮箱验证码登录

后台「设置 → 邮箱验证码登录」里开启，并填 SMTP（主机 / 端口 / 账号 / 授权码 / 发件人 /
直连 TLS）。国内常见：QQ、163 用 465 + 授权码；企业邮箱多为 587 + STARTTLS。

- 验证码 **只存 HMAC-SHA256 哈希**（密钥 `SESSION_SECRET`），10 分钟过期、一次性、
  错 5 次作废
- 同一邮箱 60 秒一次、每小时 5 次；另有全局每分钟 30 封兜底
- 邮箱没注册时返回同样的成功文案但不发信（防枚举）
- 发信失败回 `email_send_failed`，细节只进日志（可能含服务器地址）

## 测试

```bash
cargo test                     # 单元测试 + 兼容性 fixture，不需要数据库
cargo clippy --all-targets     # 静态检查
cargo fmt --check

# 账号链路端到端（需要服务已启动，且指向测试库）
bash scripts/smoke-auth.sh    http://127.0.0.1:8080
bash scripts/smoke-content.sh http://127.0.0.1:8080
```

`tests/compat.rs` 里的常量是用**现有 Node 实现真实生成**的密码哈希与会话 token。
这些用例是切换后端的准入门槛：不过就不许上线。

| 脚本 | 断言数 | 覆盖 |
|---|---|---|
| `smoke-auth.sh` | 23 | 健康检查、匿名状态、注册、重名 409、弱密码 422、会话识别、错误密码 401、正确登录、改头衔、保留字拦截、登出清 Cookie |
| `smoke-oauth.sh` | 11 | 未配置/未知 provider、授权跳转与 PKCE、Cookie 属性、state 不匹配、平台拒绝 |
| `smoke-admin.sh` | 48 | 鉴权三态、防锁死（改自己/最后一个管理员）、设置改与恢复、删帖、公告、轮播、赞助、内置公约锁定、未配爱发电 |
| `smoke-content.sh` | 47 | 公约列表与签署、未签公约 403、匿名发帖 403、发帖校验、点赞计数器、评论校验、站内信未读与已读、签署状态、搜索命中/无结果/通配符转义、徽章表与单人进度 |

以上脚本都会写测试数据，**只对测试库跑**；`cargo test` 另有 16 个用例（12 单元 + 4 跨语言 fixture）。

## 运维脚本

```bash
# 备份（-Fc，自动校验 + 保留 N 份；没有 pg_dump 时自动走 docker compose exec db）
DATABASE_URL=... bash scripts/backup.sh --keep 14 --dir /backup

# 恢复（覆盖当前库，必须 --yes；会先自动备份一次现状）
DATABASE_URL=... bash scripts/restore.sh /backup/arena-XXXX.dump --yes

# 压测（只读、无依赖）
node scripts/loadtest.mjs --base http://127.0.0.1:8080 --path api/v1/posts \
  --concurrency 20 --requests 300
```

本机实测（20 并发 × 300）：`/posts` 744 RPS / p50 16ms / p95 47ms；`/auth/state` 1266 RPS / p95 35ms。
冷启动首轮 p95 会到 400ms+（建连），压测前先预热一轮。

## 已知缺口（切换前要处理）

| 项 | 现状 |
|---|---|
| 公会 / 战队 / 约战 | 仍是前端 mock，未落库（不阻塞切换） |
| 搜索分词 | 现在是 `ILIKE` 子串匹配；数据量大后要不要换分词待定 |
| 真实 OAuth | 只测了本地分支，没连过 GitHub / CNKD 真实平台 |
| 相对时间 | 后端只返 `createdAt`（毫秒），`time` 由前端算 |

## 约定

- **时间**：数据库存 `timestamptz`，API 出口一律转毫秒整数（与 Node 版契约一致）。
- **错误**：`errors.rs` 是唯一出口，形如 `{ "error": "code", "message": "中文提示" }`。
- **密钥**：`SESSION_SECRET` 优先；缺省复用 `$DATA_DIR/.session-secret`。**迁移期间不能重新生成**，否则全体用户掉线。
- **迁移**：`migrations/` 只增不改，用 `sqlx::migrate!` 编译期内嵌；多副本启动由 PG advisory lock 保证只跑一次。
- **SQL**：暂用运行时 `sqlx::query`，不依赖编译期数据库连接；后续改用 `query!` 时先 `cargo sqlx prepare` 并提交 `.sqlx/`。

## 目录

```
src/
├─ main.rs            装配、中间件、优雅停机、healthcheck 子命令
├─ config.rs          环境变量、会话密钥加载、数据目录可写性
├─ settings.rs        站点设置（表 > 环境变量 > 默认，只存改过的键）
├─ db.rs              连接池参数、迁移
├─ errors.rs          错误码与中文文案
├─ auth/              password（scrypt 兼容）、session（HMAC Cookie + Cookie 头）
├─ current_user.rs    CurrentUser / MaybeUser 提取器
├─ users.rs           用户仓库、注册校验、头衔规则
├─ captcha.rs         GeeTest v4 服务端校验
└─ routes/            health / auth / me
migrations/           0001_init.sql（全量 schema）
tests/compat.rs       跨语言兼容性 fixture
scripts/smoke-auth.sh 账号链路端到端断言
```
