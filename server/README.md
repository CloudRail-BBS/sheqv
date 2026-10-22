# arena-api · 后端（Rust + PostgreSQL）

前后端分离后的后端服务：axum 0.8 + sqlx 0.8 + PostgreSQL 18。
设计文档见 [`../docs/前后端分离方案.md`](../docs/前后端分离方案.md)。

**当前进度：Phase 0（骨架与数据库）已完成** —— 健康检查、迁移、连接池、会话密钥加载、密码/会话兼容层与兼容性测试。
业务接口从 Phase 1 开始（注册 / 登录 / 会话）。

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

## 测试

```bash
cargo test                     # 单元测试 + 兼容性 fixture，不需要数据库
cargo clippy --all-targets     # 静态检查
cargo fmt --check
```

`tests/compat.rs` 里的常量是用**现有 Node 实现真实生成**的密码哈希与会话 token。
这些用例是切换后端的准入门槛：不过就不许上线。

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
├─ db.rs              连接池参数、迁移
├─ errors.rs          错误码与中文文案
├─ auth/              password（scrypt 兼容）、session（HMAC Cookie 兼容）
└─ routes/            health 等
migrations/           0001_init.sql（全量 schema）
tests/compat.rs       跨语言兼容性 fixture
```
