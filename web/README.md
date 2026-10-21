# web · 方块竞技场

Next.js 15（App Router）+ React 19 + TypeScript，**零 UI 依赖**（手写 CSS）。

**单一 Web 端**：没有"Web 版 / H5 版"之分。桌面与手机是同一个端的两套断点；只有微信内置浏览器（`isWeChat`）会改变少量能力。

## 运行

```bash
npm install
npm run dev            # http://localhost:8900（默认端口 8900，改端口见下）
```

冒烟（68 项断言，覆盖视口判定 / 微信约束 / 主题 / 轮播 / bootstrap / 注册登录 / 首个管理员 / 权限边界 / 公约 / 后台 CRUD）：

```bash
bash scripts/smoke.sh http://localhost:8900
```

## 自托管

**本项目按自部署设计**，不依赖任何托管平台。完整步骤见 [`../docs/自托管部署.md`](../docs/自托管部署.md)。

```bash
cp .env.example .env          # 必改 PUBLIC_BASE_URL；GEETEST_ID/KEY 建议配
docker compose up -d --build
curl -s localhost:8900/api/health

# 打开 /register 注册第一个账号 —— 它会自动成为管理员
```

| 方式 | 入口 |
|---|---|
| Docker Compose（推荐） | `Dockerfile` + `docker-compose.yml`，数据挂 `blockarena-data` 卷 |
| 裸机 systemd | `deploy/blockarena.service`（`ProtectSystem=strict`，只有数据目录可写） |
| 反向代理 | `deploy/nginx.conf`（含 2GB 上传、静态长缓存、WS 预留）或 `deploy/Caddyfile`（自动 HTTPS） |
| 备份 / 恢复 | `deploy/backup.sh backup 14` · `deploy/backup.sh restore <file>` |
| 部署后体检 | `ADMIN_TOKEN=xxx bash scripts/selfhost-check.sh https://你的域名` |

需要持久化的只有一个目录（`DATA_DIR`，默认 `./.data`，容器内 `/data`）：

```
$DATA_DIR/forum.json        新帖 / 评论 / 点赞
$DATA_DIR/agreements.json   后台新增的公约
```

写入用「临时文件 + rename」，进程内串行化；断电不会留半个 JSON。
**文件存储只支持单实例**——要多副本先把 `lib/json-store.ts` 换成数据库。

关键环境变量：`PUBLIC_BASE_URL`、`ADMIN_TOKEN`、`DATA_DIR`、`SITE_NAME`、`CDN_BASE`、`ENABLE_DEV_CONSOLE`，全部见 `.env.example`。

端口：默认 **8900**（`dev` / `start` / Docker / compose / systemd / 反代示例全部一致）。
临时改端口用 `PORT=9000 npm start`；`npm run dev` 的端口写在 `package.json` 的 dev 脚本里。

## 页面

| 路由 | 说明 |
|---|---|
| `/` | 首页：轮播 + 发帖框 + 排序 tab + 帖子流 + 右栏（概览 / 活跃公会 / 活跃战队 / 标签 / 规则） |
| `/register` | 注册（人机验证 + 密码强度校验）；**第一个注册的账号自动成为管理员** |
| `/login` | 登录（同样过人机验证） |
| `/guilds` | 公会列表 + 公会战日程 |
| `/teams` | 战队列表 + 出战名单 + 战绩 |
| `/matches` `/matches/[id]` | 约战列表；详情含分局、时间线、确认/争议 |
| `/resources` `/resources/[id]` | 资源库；详情含版本日志与下载门禁 |
| `/leaderboard` | 公会榜 / 战队榜 / 选手榜 |
| `/announcements` | 公告：置顶优先，分类徽标，点击进 `/announcements/[id]` 详情 |
| `/sponsors` | 赞助者名单：累计金额 / 人数 / 前三名 / 完整列表（数据来自爱发电） |
| `/agreements` | 公约签署：诚信公约 / 社区公约，含版本校验与签署凭证 |
| `/p/[id]` | 帖子详情：正文、点赞、评论（需签社区公约） |
| `/search?q=` | 全局搜索：帖子 / 资源 / 公会 / 战队 / 比赛 |
| `/notifications` | 站内信：未读评论、待确认比赛、一键已读（顶栏另有快捷面板） |
| `/me` | 我的：战绩概览、我的比赛/资源、账号安全、通知偏好 |
| `/admin` | 管理后台（仅管理员账号可进；未登录显示登录引导，非管理员显示 403） |
| `/admin/users` | 用户管理：改角色、封禁 / 解封、删除（不能动自己或最后一个管理员） |
| `/admin/posts` | 帖子管理：筛选、删除（连带评论与点赞） |
| `/admin/announcements` | 公告管理：发布 / 编辑 / 置顶 / 转草稿 / 删除 |
| `/admin/slides` | 轮播管理：文案、链接、背景色或背景图、文字明暗、排序 |
| `/admin/settings` | 站点设置：站点名、GeeTest、爱发电、开放注册、首页公告开关（立即生效） |
| `/admin/agreements` | 公约管理：新增 / 停用 / 删除，内置两份锁定 |
| `/admin/sponsors` | 赞助管理：同步爱发电、手动录入、隐藏 / 删除 |
| `/dev/capabilities` | 端能力台：4 列能力矩阵 + 配额 + bootstrap 实测（生产默认 404） |
| `/api/health` | 健康检查：数据目录可写性、版本、uptime |

## 布局与响应式

- 桌面：`214px 侧栏 | 内容（1fr + 292px 右栏）`，左右皆 sticky；顶栏搜索在 ≥1080px 绝对居中。
- ≤1024：右栏下沉为两列卡片；≤860：侧栏隐藏、底部 5 项 tabbar（首页/公会/战队/约战/我的）；≤560：单列。
- **布局只由 CSS 断点决定**，不读 capability。`data-form` 仅用于埋点与观测。

## 明暗主题

- `theme` 写在 cookie 里，SSR 直接输出 `<html data-theme="dark|light">`，**首屏不闪**。
- 顶栏按钮即时切换（改 `dataset.theme` + 写 cookie），无需刷新。
- 深色为**黑白灰阶**（背景 #0a0a0b→#1d1d21，强调色近白，主按钮白底黑字）；浅色是独立色值，不是反色。
- 唯一保留的彩色是 `--danger`：删除 / 封禁 / 错误需要可识别的语义色。

## 轮播

`components/carousel.tsx`：3 张（赛季 / 资源上新 / 规则），5.6s 自动切换、hover 暂停、左右箭头、圆点、移动端左右滑动；`prefers-reduced-motion` 时不自动播放。

## 账号与权限

```
注册 ──GeeTest 服务端校验──► users.json（第一个用户 role=admin）
登录 ──scrypt 校验─────────► 签名 Cookie ba_session ──► getCurrentUser()
```

- **没有默认管理员**，也没有内置账号。第一个注册的用户拿到 `admin`，之后都是 `member`。
- 密码：scrypt（N=16384, r=8, p=1）+ 16 字节随机盐，哈希串自带参数，可平滑提强度。
- 会话：HMAC 签名的无状态 Cookie，7 天；密钥取 `SESSION_SECRET`，没配就自动生成到数据卷。
- 人机验证：GeeTest v4，**服务端二次校验**（客户端票据 → `sign_token` → `gcaptcha4/validate`）。
  未配置 `GEETEST_ID`/`GEETEST_KEY` 时跳过并在页面提示，公网部署必须配。
- 权限落点：发帖 / 评论 / 签署公约都要求登录，**作者取自会话而非请求体**；
  `/admin` 与 `/api/v1/admin/**` 只认 `role=admin`（`ADMIN_TOKEN` 仅作应急通道）。

## 赞助（爱发电）

```
爱发电 query-sponsor ──sync──► $DATA_DIR/sponsors.json ──只读──► /sponsors
                                    ▲
                              后台手动录入
```

- 签名：`md5(token + "params" + params + "ts" + ts + "user_id" + user_id)`，只需 `AFDIAN_USER_ID` + `AFDIAN_TOKEN`。
- 公开页读**快照**，不在渲染时调接口——爱发电不可用不影响本站。
- 同步：后台按钮，或 `POST /api/v1/admin/afdian/sync`（`ADMIN_TOKEN` 鉴权，可挂 cron）。
- 合并语义：金额/档位以爱发电为准，`hidden` 与手动录入条目按 id 保留，重同步不会冲掉。
- 未配置时 `/sponsors` 显示空态并说明，后台同步按钮置灰。

## 端能力

```
UA ──► detectRuntime ──► { runtime, form, isWeChat }
                              │
                              ├─ DEFAULTS[runtime]
                              ├─ 微信覆盖（改值，宿主事实）
                              └─ 服务端下发（取 AND，只能关）
```

- `runtime` 只有 web / android / ios；`form` 只影响布局。
- 微信内：`directDownload=false`、`evidenceVideoBytes=0`、`wechatJsSdk=true`、上传上限 300MB。
- 普通手机浏览器与桌面**同等能力**——这是与上一版最大的差别。
- 契约：`../contracts/README.md`、`../contracts/bootstrap.openapi.yaml`。

## 目录

```
src/
  middleware.ts              # 透出 x-runtime / x-form / x-wechat，不再按端拦截
  lib/
    config.ts                # 环境变量入口（PUBLIC_BASE_URL / ADMIN_TOKEN / DATA_DIR…）
    json-store.ts            # 文件存储公共件：原子写 + 进程内串行
    admin-auth.ts            # 后台口令鉴权（Bearer / httpOnly Cookie）
    capabilities.ts          # 判定 + fail-closed 合并 + 32 键默认表
    bootstrap.ts             # 响应组装 + ETag（排除 serverTime）
    request-caps.ts           # 每请求解析一次；读取 theme cookie
    data.ts                  # 类型定义（数据已清空，等真实数据源）
    settings.ts              # 运行时设置（settings.json 覆盖 env）
    announcement-store.ts    # 公告
    slide-store.ts           # 首页轮播
  components/
    carousel.tsx theme-toggle.tsx sidebar.tsx tabbar.tsx
    post-card.tsx download-gate.tsx upload-panel.tsx match-actions.tsx
    cap-provider.tsx bootstrap-probe.tsx force-switch.tsx resource-card.tsx
    auth-forms.tsx geetest.tsx admin-denied.tsx logout-button.tsx
    composer.tsx sign-agreement.tsx agreement-admin.tsx sponsor-admin.tsx
    announcement-admin.tsx slide-admin.tsx settings-form.tsx
    notification-bell.tsx admin-nav.tsx admin-users.tsx admin-posts.tsx
    empty-state.tsx page-skeleton.tsx
  app/
    layout.tsx error.tsx not-found.tsx globals.css
    (home)/page.tsx                  # 首页（放在路由组里，loading 才不会波及详情页）
    resources/(list)/page.tsx        # 列表放 (list) 组；resources/[id] 单独一段
    matches/(list)/page.tsx          # 同上，+ matches/[id]
    announcements/(list)/page.tsx    # 同上，+ announcements/[id]
    p/[id]/                          # 帖子详情（无 loading）
    guilds/ teams/ leaderboard/ me/ notifications/ sponsors/ search/ agreements/
    login/ register/
    admin/{page,users,posts,announcements,slides,sponsors,agreements,settings}/
    dev/capabilities/                # 生产 404（ENABLE_DEV_CONSOLE=1 才开）
    api/health/route.ts
    api/v1/{bootstrap,auth,posts,notifications,announcements,sponsors}/…
    api/v1/admin/{users,posts,announcements,slides,settings,agreements,sponsors,afdian}/…
```

根目录另有 `Dockerfile`、`docker-compose.yml`、`.env.example`、`.dockerignore`、`deploy/`。

## 验证

`bash scripts/smoke.sh` → 68/68：

- 桌面 `form=desktop`、iPhone `form=mobile`，两者 `runtime=web`
- iPhone 非微信**可直下**；微信内改为「预览 · 收藏」
- `/admin` 在 iPhone 返回 200 + 窄屏提示（不再 403）
- `theme=light` cookie → `data-theme="light"`
- bootstrap：`runtime=web` / `form=mobile` / `If-None-Match` → 304
- 未登录发帖 403 `need_login`；未签社区公约 403 `need_agreement`；后台接口无凭据 401
- 空数据目录下第一个注册用户 `role=admin`，第二个 `member`；重名 409、弱口令 422、错密码 401
- 登录 + 已签公约后发帖 201，作者取自账号；评论、点赞、搜索、`/me` 我的帖子全部命中

> 踩坑：ETag 曾把 `client.serverTime` 算进哈希，导致永远 304 不了。
