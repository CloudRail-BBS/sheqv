# 后端迁移到 Rust · 方案

> 目标：把「数据、身份、配置、外部集成」这层后端从 Node/TypeScript 换成 Rust，**前端保持 Next.js 不重写**。
> 状态：已立项，未开工。本文是实施蓝图，配套 `开发文档.md` §14。
> 撰写：2026-10-22

---

## 1. 结论先行

| 项 | 结论 |
|---|---|
| 迁移范围 | **只换后端**：API、会话、存储、外部集成。Next.js 继续负责 SSR、样式、交互、端能力 |
| 推荐架构 | Rust(axum) 独占 `/api/v1/**` + SQLite；Next 退化为「渲染层 + BFF」，服务端组件通过内网 HTTP 取数 |
| 存储 | JSON 文件 → **SQLite（WAL）**：有事务、读写并发安全、备份简单；"只能单进程"变成"只能单机" |
| 平滑度 | 老会话 Cookie、老密码哈希、API 路径/状态码/错误码全部保持兼容 → **切换时用户不掉线、不改密码** |
| 工期 | 单人 16–22 人日（≈4–5 周），分 6 个阶段，每阶段可独立验收 |
| 验收标准 | `scripts/smoke.sh` 现有 164 条断言全绿，且**同一套脚本**分别跑通 Node 与 Rust 两套实现 |

**一句话**：Rust 接手「后端的所有权」，Next 保留「呈现的所有权」，中间用一份不动的 HTTP 契约连接。

---

## 2. 现状盘点

先把要搬的东西量清楚，避免低估。

| 层 | 规模 | 说明 |
|---|---|---|
| API 路由 | 24 个 `route.ts` | `app/api/v1/**` 23 个 + `/api/health`；含 OAuth 两条与后台 8 组 |
| 领域库 | 26 个模块 / 3388 行 | `users` `session` `forum-store` `sponsor-store` `settings` `oauth` `geetest` `afdian` … |
| 页面数据入口 | Server Components 直连 `lib/*` | **这是最大的坑**：页面不是打自己的 API，而是直接 import 函数 |
| 存储 | `$DATA_DIR/*.json` 6 个文件 | 原子写 + 进程内串行，没有跨进程锁 |
| 前端 | 78 个 tsx / 51 个 ts | 不迁移 |

两条数据通路必须同时考虑：

```
① 页面渲染：RSC ──import──▶ lib/*  ──▶ JSON
② 写操作：  浏览器 ──fetch──▶ route.ts ──▶ lib/* ──▶ JSON
```

只改 ② 不改 ①，就会出现「读走 Node、写走 Rust」的双写风险。所以迁移必须同时动 ① 的取数方式。

---

## 3. 三种方案对比

### 方案 A（推荐）Rust 做 API，Next 保留 SSR

```
浏览器 ──▶ nginx ─┬─ /api/* ──────────────▶ Rust :8080 ──▶ SQLite
                  └─ /*      ──▶ Next :8900 ──内网 fetch──▶ Rust :8080
```

- 前端 78 个 tsx（页面与组件）、样式、RSC、端能力判定**全部保留**，只把 `lib/*` 的数据函数换成 HTTP 调用。
- API 契约不变 → 冒烟脚本原样复用。
- 代价：多一跳内网请求（同机 ≈0.2–1ms），两个进程要一起部署。

### 方案 B Rust 单体（axum + Leptos/maud），彻底删掉 Next

- 一套语言、一个进程、镜像更小，理论上最"干净"。
- 但 78 个 tsx（页面与组件）、13 个 loading、表单交互、轮播、主题、tabbar 全部重写；工期 6–10 周且回归风险高。
- **只适合「后续所有前端工作都想用 Rust 写」的长期决策**，不适合作为一次迁移。

### 方案 C 只把存储换成 Rust sidecar，API 仍留在 Next

- 等于在中间加一层进程间调用，复杂度上升、收益近乎为零。
- 直接否掉。

**选 A。** 判断依据：这次要换的是"实现语言"，不是"产品形态"。方案 A 把风险限制在后端，前端零回归；将来真想走 B，也可以在 A 的基础上一个页面一个页面换，而不是一次性重写。

---

## 4. 职责边界：什么搬、什么留

这是全篇最需要达成共识的一张表。判定规则一句话：**「谁拥有事实」进 Rust，「事实怎么呈现」留 Next。**

| 能力 | 归属 | 理由 |
|---|---|---|
| 用户 / 身份 / 会话 / 密码 | Rust | 安全边界，必须在后端 |
| 帖子 / 评论 / 点赞 | Rust | 事实数据 |
| 公约与签署状态 | Rust | 事实数据（目前存 cookie，迁移时顺手改成表） |
| 公告 / 轮播 / 站点设置 | Rust | 运营配置，多端一致 |
| 赞助者快照 / 爱发电同步 | Rust | 外部集成 + 写入 |
| 站内信聚合、未读水位 | Rust | 依赖用户与评论事实 |
| GeeTest 校验、OAuth 换取 token | Rust | 密钥不能进前端 |
| 徽章**判定** | Rust | 依赖全站统计 |
| 徽章/头衔**渲染** | Next | 纯展示，`components/user-badge.tsx` 等 |
| 端能力（runtime / form / isWeChat） | **Next** | 这是"端"的属性，不是后端事实；`lib/capabilities.ts` 不动 |
| `bootstrap` 契约与 ETag | **Next** | 同上，中间件层能力协商 |
| 相对时间（"3 分钟前"）等派生展示 | Next | 不该让后端产出中文展示串 |
| 更新日志 `changelog.ts` | Next | 随代码发布的内容 |

> 推论：Rust **不返回** `time: "3 分钟前"` 这类字段，只返回 `createdAt` 毫秒。`forum-store.ts` 里的 `relTime()` 挪到 Next 侧。这一条会改动 `PostView` 的构造方式，属于本方案里**唯一需要动前端数据形状**的地方。

---

## 5. 技术选型

版本为 2026-10 查到的稳定版，实际以 `cargo add` 拉到的为准，并全部锁进 `Cargo.lock`。

| 用途 | crate | 版本 | 备注 |
|---|---|---|---|
| HTTP 框架 | `axum` | 0.8.x | 与 tower 生态一致，路由/提取器够用 |
| 异步运行时 | `tokio` | 1.54 | `features = ["full"]` 或按需 |
| 数据库 | `sqlx` | 0.8/0.9 | `sqlite` + `runtime-tokio-rustls` + `chrono`；编译期 SQL 校验 |
| 中间件 | `tower-http` | 0.7 | trace / compression / timeout / set-header |
| 序列化 | `serde` + `serde_json` | 1 | `rename_all = "camelCase"` |
| 密码 | `scrypt` + `rand` | 0.12 / 0.9 | 参数从哈希串里读，**保持与 Node 一致** |
| 会话签名 | `hmac` + `sha2` + `base64` | 0.12 / 0.10 / 0.22 | HMAC-SHA256 + base64url 无填充 |
| 爱发电签名 | `md-5` | 0.10 | 对方只支持 md5，没得选 |
| 出站 HTTP | `reqwest` | 0.13 | `rustls-tls`，不用 OpenSSL |
| 时间 | `chrono` | 0.4 | 只做格式化与时区，存储用 i64 毫秒 |
| 日志 | `tracing` + `tracing-subscriber` | 0.1 / 0.3 | `RUST_LOG=info,arena_api=debug` |
| 错误 | `thiserror` | 2 | 领域错误；`anyhow` 只在 main/脚本里 |
| 恒定时间比较 | `subtle` | 2 | 验密码 / 验签名用 `ct_eq`，不要 `==` |
| 配置 | `dotenvy` + 手写 `Config` | 0.15 | 与现有 `.env` 变量名一一对应 |

不用：ORM（Diesel/SeaORM）——表少、查询简单，sqlx 直写 SQL 更透明；也不用 actix-web（团队若更熟可换，方案不变）。

**Cargo.toml 骨架**

```toml
[package]
name = "arena-api"
version = "0.1.0"
edition = "2024"
rust-version = "1.85"

[dependencies]
axum = { version = "0.8", features = ["macros"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "signal", "time"] }
sqlx = { version = "0.8", default-features = false, features = ["runtime-tokio-rustls", "sqlite", "macros"] }
tower = "0.5"
tower-http = { version = "0.7", features = ["trace", "compression-gzip", "timeout", "set-header"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
scrypt = "0.12"
subtle = "2"
rand = "0.9"
hmac = "0.12"
sha2 = "0.10"
md-5 = "0.10"
base64 = "0.22"
reqwest = { version = "0.13", default-features = false, features = ["rustls-tls", "json"] }
chrono = "0.4"
thiserror = "2"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
dotenvy = "0.15"
```

---

## 6. 数据模型（SQLite）

一个库文件 `$DATA_DIR/arena.db`，开 WAL。时间统一 **INTEGER 毫秒**。

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id            TEXT PRIMARY KEY,              -- 沿用现值：u + Date.now().toString(36) + 4 位随机 base36（长度不固定，导入时原样保留）
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nickname      TEXT NOT NULL,
  password_hash TEXT NOT NULL DEFAULT '',      -- scrypt$N$r$p$salt$hash；纯第三方账号为空串
  email         TEXT UNIQUE COLLATE NOCASE,
  role          TEXT NOT NULL CHECK (role IN ('admin','member')),
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER,
  notif_read_at INTEGER,
  banned        INTEGER NOT NULL DEFAULT 0,
  title         TEXT,
  badges        TEXT NOT NULL DEFAULT '[]'     -- 体量小，不值得单表
);

CREATE TABLE identities (
  provider TEXT NOT NULL CHECK (provider IN ('github','cnkd')),
  sub      TEXT NOT NULL,                      -- 平台唯一 id，不是昵称
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  login    TEXT NOT NULL,
  avatar   TEXT,
  PRIMARY KEY (provider, sub)
);

CREATE TABLE posts (
  id         TEXT PRIMARY KEY,
  title      TEXT,
  body       TEXT NOT NULL,
  guild      TEXT NOT NULL DEFAULT '',
  tags       TEXT NOT NULL DEFAULT '[]',
  author_id  TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX posts_created ON posts(created_at DESC);

CREATE TABLE comments (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  TEXT NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX comments_post ON comments(post_id, created_at);

CREATE TABLE likes (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at      INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id)               -- 天然幂等，替代现在的计数文件
);

CREATE TABLE signatures (                       -- 公约签署：从 cookie 升级成事实
  agreement_id TEXT NOT NULL,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version      TEXT NOT NULL,
  signed_at    INTEGER NOT NULL,
  PRIMARY KEY (agreement_id, user_id)
);

CREATE TABLE settings (                         -- 只存被后台改过的键，语义与现在一致
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                           -- JSON 编码的原始值
);

CREATE TABLE announcements (id TEXT PRIMARY KEY, title TEXT, body TEXT, kind TEXT,
  pinned INTEGER, published INTEGER, created_at INTEGER, updated_at INTEGER);

CREATE TABLE slides (id TEXT PRIMARY KEY, kicker TEXT, title TEXT, desc TEXT, cta TEXT,
  href TEXT, bg_color TEXT, bg_image TEXT, text_tone TEXT, active INTEGER, ord INTEGER);

CREATE TABLE sponsors (id TEXT PRIMARY KEY, name TEXT, avatar TEXT, amount REAL,
  plan_title TEXT, first_at INTEGER, last_pay_at INTEGER, source TEXT, hidden INTEGER);

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);   -- syncedAt / lastCount / schema_version
```

**JSON → SQLite 映射要点**

| 现状 | 迁移后 |
|---|---|
| `users.json` 里 `identities[]` 内嵌 | 拆成 `identities` 表，`(provider, sub)` 主键 |
| 帖子/评论/点赞分三个 JSON 段落 | 三张表，点赞从"计数"变"行"，`INSERT OR IGNORE` 即幂等 |
| 公约签署在 Cookie（`ag_trust`） | 落 `signatures` 表，换设备也能带过去；旧 Cookie 保留一个版本周期做兜底 |
| `slides` 的 `order` | SQL 保留字，列名用 `ord`，序列化仍叫 `order` |
| `sponsors.syncedAt` | 放 `meta` 表 |
| 设置"只存改过的键" | `settings` 行存在即覆盖，删除行即回落环境变量 |

一次性导入工具：`arena-api migrate --from $DATA_DIR --dry-run`，可重复执行（按主键 upsert），先 dry-run 打印条数与冲突。

---

## 7. 兼容性红线（决定能不能"平滑切换"）

这七条任何一条做错，切换当天就会出事故。

| # | 契约 | 现在的精确格式 | Rust 必须怎么做 |
|---|---|---|---|
| 1 | 会话 Cookie | `ba_session = <userId>.<exp 秒>.<base64url(HMAC-SHA256(secret, "<userId>.<exp>"))>` | 签名入参是拼接后的**文本**，不是解码字节；base64 用 URL_SAFE **无填充** |
| 2 | 会话密钥来源 | `SESSION_SECRET` 优先；否则读 `$DATA_DIR/.session-secret`（64 位 hex，首次自动生成） | **复用同一个文件**。Rust 若自己另生成，等于瞬间把所有人登出 |
| 3 | 密码哈希 | `scrypt$16384$8$1$<base64 盐 16B>$<base64 key 64B>`，标准 base64 带 `=` | salt/key 用**标准 base64**（不是 URL-safe）；N/r/p 从串里解析，不写死 |
| 4 | Cookie 属性 | HttpOnly / SameSite=Lax / Path=/ / Max-Age=7d / Secure 仅当 `x-forwarded-proto: https` | 逐项照抄，Secure 判断保留 header 优先、URL 兜底 |
| 5 | 错误响应 | `{ "error": "username_taken", "message": "该用户名已被占用" }` | 错误码字符串与中文文案**逐条对齐**；统一放 `errors.rs` 一张表 |
| 6 | 时间戳单位 | 全部毫秒（`Date.now()`） | 存 i64 毫秒；别在某个接口里混进秒 |
| 7 | JSON 键名与缺省 | camelCase；`undefined` 的键直接不出现，`null` 才输出 null | `#[serde(rename_all = "camelCase")]` + `skip_serializing_if = "Option::is_none"` |

**必须写的兼容性单测（golden fixtures）**：把现在 Node 生成的 3 条东西硬编码成 Rust 测试用例 —— ① 一个真实 `passwordHash`（明文已知）② 一个真实 `ba_session` token ③ 一个真实 `users.json` 片段。Rust 侧断言"能验通过"，`cargo test` 不过就不许发版。

**scrypt 的性能陷阱**：N=16384 单次约 50–80ms，纯 CPU。axum 里**必须**扔进 `tokio::task::spawn_blocking`，否则并发登录会把 runtime 线程全占住，表现为"登录一多，全站卡住"。

**密码校验的参考实现**（参数从串里读，因此老用户和新强度能共存）：

```rust
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use subtle::ConstantTimeEq;

fn verify_password(password: &str, stored: &str) -> bool {
    let parts: Vec<&str> = stored.split('$').collect();
    if parts.len() != 6 || parts[0] != "scrypt" { return false; }

    let (Ok(n), Ok(r), Ok(p)) = (
        parts[1].parse::<u64>(),
        parts[2].parse::<u32>(),
        parts[3].parse::<u32>(),
    ) else { return false };

    let (Ok(salt), Ok(expected)) = (B64.decode(parts[4]), B64.decode(parts[5])) else {
        return false;
    };
    if expected.is_empty() { return false }

    let log_n = n.trailing_zeros() as u8;              // 16384 → 14
    let Ok(params) = scrypt::Params::new(log_n, r, p, expected.len()) else {
        return false;
    };

    let mut key = vec![0u8; expected.len()];
    if scrypt::scrypt(password.as_bytes(), &salt, &params, &mut key).is_err() {
        return false;
    }
    key.ct_eq(&expected).into()                        // 恒定时间比较
}
```

会话验签同理：用 `hmac::Hmac<Sha256>` 对 `format!("{userId}.{exp}")` 求 MAC，再 `BASE64_URL_SAFE_NO_PAD.encode` 后 `ct_eq`。

---

## 8. 分阶段实施

每个阶段的结束条件都是「可独立验证」，不是「代码写完了」。

### Phase 0 · 骨架（2–3 人日）

- `server/` 新 crate（`src/main.rs` + `src/lib.rs` + `src/routes/` + `src/domain/` + `src/db/`）
- `Config`（`PORT=8080` / `DATA_DIR` / `SESSION_SECRET` / `ADMIN_TOKEN` / `PUBLIC_BASE_URL`）、`tracing`、优雅停机
- `GET /api/health`：返回数据目录可写性，JSON 形状与 Node 版**同构**
- `Dockerfile`：`rust:1-slim` 构建 → `debian:bookworm-slim` 或 `gcr.io/distroless/cc` 运行，带 `tini`
- `docker-compose.yml` 增加 `api` 服务；`nginx`/`Caddy` 示例加 `/api/` 分流

**验收**：`curl :8080/api/health` 与 Node 版字段一致；镜像 < 80MB；`docker compose up` 两服务都健康。

### Phase 1 · 身份与会话（3–4 人日）

- `users` / `identities` 表、`migrate` 导入器
- `POST /auth/register|login|logout`、`GET /auth/state`、`PATCH /me`
- scrypt 兼容、会话签名兼容、封禁判定、首个用户成为 admin（`BEGIN IMMEDIATE` + `SELECT count(*)`，并发只出一个 admin）
- GeeTest `gcaptcha4/validate`（fail-closed，`GEETEST_BYPASS_ON_ERROR` 才放行）

**验收**：用**迁移前**的旧 Cookie 直接打 Rust，返回 200；旧密码能登录；冒烟 §7–§9 全绿。

### Phase 2 · 内容（4–5 人日）

- 帖子/评论/点赞、`GET /posts`、`POST /posts`、`/posts/:id/comments`、`/posts/:id/like`
- 公约签署改表 + 旧 Cookie 兜底；`GET /agreements/signatures`
- 站内信聚合、已读水位
- 徽章判定（把 `achievements.ts` 的 8 条规则翻成 SQL/内存计算，输出 `badges[]`）

**验收**：冒烟 §5/§6/§10–§12 全绿；删除帖子连带评论点赞（外键 CASCADE）。

### Phase 3 · 后台（3–4 人日）

- `/api/v1/admin/**` 全部 8 组
- **三条防锁死规则必须事务化**：不能改自己角色/封自己/删自己；任何操作后至少一个可用管理员；应急口令同样受限
- 设置三级优先级（`settings` 行 > 环境变量 > 默认）+ `resetKey` 回落
- 爱发电 `query-sponsor` 翻页 + md5 签名 + 合并语义（覆盖金额、保留 `hidden`、手动条目不动）
- 公告/轮播 CRUD（`safeHref` / `safeColor` 的校验等价物）

**验收**：冒烟 §9/§13 全绿；并发两次设置写入不丢；`--dry-run` 导入后 `users` 计数一致。

### Phase 4 · 第三方登录（2–3 人日）

- `GET /auth/oauth/:provider`：state + PKCE(S256)，httpOnly Cookie 10 分钟
- `GET /auth/oauth/:provider/callback`：校验 state → 换 token → 取 profile → 按 `(provider, sub)` 找人或建号
- 注册开关只拦新建；纯第三方账号 `password_hash=''` 拒绝密码登录

**验收**：GitHub / CNKD 真机各走通一次；错误码与现在一致（`state_mismatch` / `register_closed` / `account_inactive` …）。

### Phase 5 · 切换与下线（2–3 人日）

1. Next 新增 `lib/api-client.ts`：把 `getSettings` / `listPosts` / `getCurrentUser` 等**同名函数**改成内网 fetch，页面 import 全不动
2. `getCurrentUser()` 转发 Cookie 调 `/api/v1/auth/state`，仍用 React `cache()` 保证每请求一次
3. **只在请求内去重，不做跨请求缓存**：`layout.tsx` 每请求都取一次设置，这样后台「改完立即生效」的承诺不会被 CDN 式缓存打破；真遇到瓶颈再加 1–2 秒 TTL 并同步改文案
4. 停写窗口（约 5 分钟）：停 Next → 导数据 → 起 Rust → 起 Next
5. nginx 把 `/api/*` 指到 Rust；观察 48 小时
6. 删除 `web/src/app/api/**`（保留 `/api/health` 转发或改由 nginx 探 Rust）
7. 更新 `自托管部署.md`、`README.md`、`smoke.sh` 默认端口说明

**验收**：冒烟 164 条全绿；`selfhost-check.sh` 全绿；登录状态在切换前后连续（同一个 Cookie 不失效）。

---

## 9. 工程结构

```
server/
├─ Cargo.toml
├─ Cargo.lock                 # 必须提交
├─ .sqlx/                     # sqlx 离线查询缓存（CI 无数据库也能编译）
├─ migrations/
│  └─ 0001_init.sql
├─ src/
│  ├─ main.rs                 # 装配、中间件、优雅停机
│  ├─ config.rs
│  ├─ errors.rs               # 错误码 → (status, 中文 message) 的唯一出口
│  ├─ db/                     # 连接池、事务助手、迁移
│  ├─ domain/
│  │  ├─ user.rs  session.rs  forum.rs  agreement.rs
│  │  ├─ settings.rs  announcement.rs  slide.rs  sponsor.rs
│  │  ├─ geetest.rs  afdian.rs  oauth.rs  achievements.rs
│  ├─ routes/
│  │  ├─ auth.rs  posts.rs  agreements.rs  notifications.rs
│  │  ├─ admin.rs  oauth.rs  health.rs
│  └─ bin/
│     └─ migrate.rs           # JSON → SQLite 导入
└─ tests/
   ├─ compat.rs               # Node 产物 golden fixtures
   └─ api.rs                  # sqlx::test 起临时库跑接口
```

---

## 10. 测试与验收

| 层 | 手段 | 覆盖 |
|---|---|---|
| 兼容性 | `cargo test --test compat` | 老 hash / 老 token / 老 JSON 片段能验通过 |
| 接口 | `cargo test --test api`（`sqlx::test` 每例一个临时库） | 注册 → 登录 → 发帖 → 评论 → 点赞 → 删除 |
| 端到端 | **现有 `smoke.sh`**，加 `SMOKE_BASE` 变量即可指向 Rust | 164 条断言，Node 与 Rust 各跑一遍 |
| 部署 | `selfhost-check.sh` | 健康、页面、鉴权三态、安全头 |
| 压测（可选） | `oha` / `wrk` 对 `/api/v1/posts` | 确认 spawn_blocking 生效、登录并发不拖垮全站 |

冒烟脚本要做的唯一改动：把硬编码的 `$BASE` 换成 `BASE="${1:-http://localhost:8900}"`（现在应该已经支持），再加一个可选的 `--api-base` 指向 8080。

---

## 11. 部署变更

目标拓扑（两服务一数据卷）：

```yaml
services:
  api:
    build: ./server
    environment: [ DATA_DIR=/data, PORT=8080, SESSION_SECRET, ADMIN_TOKEN, PUBLIC_BASE_URL ]
    volumes: [ "blockarena-data:/data" ]     # SQLite 库在这里
    healthcheck: curl -f http://127.0.0.1:8080/api/health
    security_opt: [ no-new-privileges:true ]
    cap_drop: [ ALL ]

  web:
    build: ./web
    environment: [ API_BASE=http://api:8080, PORT=8900 ]
    depends_on: { api: { condition: service_healthy } }
    # 不再挂数据卷：Next 只读不写
```

- 对外只暴露 nginx；`/api/*` 直连 `api`，页面请求到 `web`。
- **备份方式要改**：从「打包目录」变成 `sqlite3 arena.db ".backup '/backup/arena-$(date).db'"`（WAL 模式下不能直接 `cp` 主文件）。`deploy/backup.sh` 要同步改。
- 数据目录里仍保留 `.session-secret`（会话密钥），备份别忘了它。
- **限制从"单进程"放宽到"单机"**：WAL 下多连接可安全共享（写串行、读并发），不再要求整个站点只有一个进程；
  但 SQLite 不能跨主机共享，横向扩容仍要换 Postgres（`sqlx` 只需换 driver 与迁移脚本）。

---

## 12. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 会话/密码不兼容，切换即全员登出 | 高 | §7 的 golden fixtures 先写、先绿；`SESSION_SECRET` / `.session-secret` 复用 |
| 中文错误文案漂移，前端提示变成英文或空白 | 中 | `errors.rs` 单一出口 + 与 TS 的码表逐条 diff |
| scrypt 阻塞 runtime | 高 | 一律 `spawn_blocking`；压测里专门测 20 并发登录 |
| 双写期间数据分叉 | 高 | 不做双写：切换用「停写窗口 + 一次性导入」，窗口内只允许一个写入方 |
| sqlx 编译期查询需要数据库 | 中 | `cargo sqlx prepare` 提交 `.sqlx/`，CI 与 Docker 构建用 offline 模式 |
| 时间单位混用（秒/毫秒） | 中 | `type Millis = i64` 新类型，禁止裸 i64 进库 |
| 迁移后发现必须回滚 | 中 | 切换前自动导出 `snapshot-<ts>.json`；回滚 = 起 Node + 导入该快照（见 §13） |
| 团队不熟 Rust，迭代变慢 | 中 | 前端工作不受影响；后端只改 Rust 目录，边界清晰 |

---

## 13. 回滚

1. **切换前**：`arena-api migrate export --out /backup/snapshot-<ts>.json`（反向导出，格式与现 `*.json` 一致）。
2. **切换后 48 小时内**若出现阻断级问题：停 `api` → 起旧版 `web` 镜像（tag 保留）→ 把 snapshot 放回 `$DATA_DIR` → nginx 撤掉 `/api/` 分流。
3. 因为会话密钥与密码格式完全一致，回滚后**用户仍然不掉线**。
4. 48 小时后确认稳定，再删除旧镜像与 Next 侧的死代码。

---

## 14. 明确不做

- 不重写前端、不换 React、不引入 SSR 框架替换。
- 不改 URL、不改状态码、不改 Cookie 名 —— 客户端与反代配置零改动。
- 不引入 Redis / 消息队列 / k8s。当前体量用不上。
- 不做「双写灰度」。双写会制造两个真源，风险远大于收益。
- 不顺手把公会/战队/约战做出来 —— 那些属于产品功能，另立需求。

---

## 15. 需要你拍板的三件事

1. **范围**：按方案 A（只换后端）开工，还是想直接走方案 B（连前端一起 Rust 化）？——B 对 UI 的具体影响见 §17。
2. **存储**：本次一起切 SQLite（推荐，解掉单实例限制），还是先维持 JSON 只为降低单次变更面？
3. **节奏**：一次性做完再上线，还是 Phase 1 完成后先让「登录注册」跑在 Rust 上做灰度验证（其余接口仍走 Node，两个服务同时在线）？

> 第 3 项若选灰度，需要额外做「按路径分流」，大约 +1–2 人日，但能把第一波风险压在最小范围。

---

## 16. 什么时候**不该**做这个迁移

如果动机只是「Rust 更快」——这个站点当前的瓶颈不在 Node：JSON 全量读写、单实例锁、每次请求多次 `readFile` 才是。这些在方案 A 里会被 SQLite 一并解决，而 **Rust 带来的吞吐提升对一个玩家社区站几乎没有感知**。

值得做的理由应该是这几条之一：想要单二进制部署、想要更低常驻内存（Rust ≈20–30MB vs Node ≈120MB）、团队要长期用 Rust 维护后端、或者要把后端能力复用到非 Web 端。如果这些都不成立，把预算投在 SQLite 迁移 + 公会/约战功能上，收益更直接。

---

## 17. 附：走方案 B 时，UI 会受什么影响

结论一句话：**「看起来」几乎能一样，「摸起来」很难一样。** 要分三层看。

| 层 | 会不会变 | 原因 |
|---|---|---|
| 视觉样式（颜色、间距、圆角、断点、明暗主题） | **不变** | `globals.css` 是纯 CSS 资产，与框架无关，原样搬过去 |
| DOM 结构与文案 | 需要手抄，可做到一致 | 78 个 tsx 的 JSX 要改写成对应模板（`maud` 的 `html!` 或 Leptos 的 `view!`），没有自动转换器 |
| 交互与状态（表单、局部刷新、动画、滚动位置） | **会变，且是主要风险** | 这是框架行为，不是 CSS。`useState`/`useEffect`/`router.refresh()`/Suspense 骨架都要重新设计 |

### 17.1 现状的交互密度（决定重写成本）

| 指标 | 数量 |
|---|---|
| tsx 总数 | 78 |
| 服务端页面（纯展示，可机械搬） | 28 个 `page.tsx` |
| `'use client'` 客户端组件 | 28 个（36%） |
| 用到 `useState` / `useEffect` / `useRef` | 23 个 |
| 用到 `useRouter`（刷新/跳转） | 14 个 |

也就是说：**七成是「把 JSX 抄成模板」，三成是「重写逻辑」**，而工期与风险基本都压在那三成里。

### 17.2 最容易"走样"的 7 个地方

| 位置 | 现在怎么做的 | 换框架后要重新解决 |
|---|---|---|
| `components/geetest.tsx` | `useEffect` + `ref` 包装命令式 JS，带多 CDN 回退、6s 超时、重试、看门狗、`destroy()` | WASM/模板侧要写胶水代码；初始化时机与销毁顺序错一步就白屏或重复挂载 |
| `components/carousel.tsx` | 客户端定时切换 + 指示器 + 交互暂停 | 状态机重写，容易丢"悬停暂停"或闪一下第一帧 |
| `components/notification-bell.tsx` | 面板开合、点外部关闭、已读提交后本地更新 | 事件委托与焦点管理要重做，键盘 Esc 行为容易漏 |
| `app/loading.tsx` + Suspense | 流式：先出骨架，再替换成内容 | 模板引擎下容易退化成"整页空白 → 一次性出现" |
| `theme-toggle.tsx` + `layout.tsx` 的 `data-theme` | SSR 直出 `data-theme`，**无闪烁** | 若改成纯 CSR 或 hydration 时机不对，切换/刷新会闪一下白 |
| `composer.tsx` / `auth-forms.tsx` | 受控输入 + 即时校验 + 提交态 | 每个字段的校验时序要重写一遍，漏一条就是"能提交空表单" |
| 14 个用 `router.refresh()` 的地方 | 提交后让服务端重渲染当前路由 | 要换成"局部替换 HTML"或"重新拉数据"，顺序不对会出现"操作成功但界面没变" |

### 17.3 三条前端路线，UI 影响各不同

| 路线 | 视觉一致 | 交互一致 | 说明 |
|---|---|---|---|
| **axum + `maud` + htmx**（推荐） | 高 | 中高 | 服务端拼 HTML，htmx 做局部替换；CSS 一行不改，DOM 可逐页对齐。最接近"只换语言"。表单/列表型页面（本站大多数）几乎无损 |
| **Leptos**（SSR + WASM 水合） | 高 | 高 | 组件模型最接近 React（信号 vs hooks），交互能做得几乎一样；代价是 WASM 包体积与水合成本，且每个组件仍要重写 |
| **Yew** | 高 | 中 | 类 React 语法，心智负担最低，但 SSR 支持弱，首屏容易退化成 CSR |

### 17.4 建议

1. **不要在方案 A 落地前就开始 B。** 先把后端稳定 3–6 个月，前端一行不动，风险最低。
2. 真要统一语言，选 **axum + maud + htmx 逐页替换**：一个路由一个路由换，CSS 完全不碰，随时可回滚到 Next 页面。
3. 只有当你明确需要"复杂客户端交互 + 统一 Rust"，才考虑 Leptos；即便如此，也要接受 1–2 轮交互回归与首屏性能重新调优。
4. 无论哪条路线，**UI 验收都要靠同一套截图基线**：改之前先按 1440 / 900 / 390 三个视口各页截图存档，重写后逐页比对，而不是"看着差不多"。

