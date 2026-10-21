# 方块竞技场 · BlockArena

Minecraft / Roblox 玩家社区 + 赛事确权平台。

核心闭环：**公会 → 战队 → 约战 → 名单快照 → 双方提交 → 确认 / 争议 → 仲裁 → 战绩**。
只有双方确认或仲裁裁定的比赛才计入战绩。

自托管部署，不依赖任何托管平台。

---

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 15（App Router）+ React 19 + TypeScript |
| 样式 | 手写 CSS，**零 UI 依赖**；深色为黑白灰阶，浅色为独立色值（CSS 变量） |
| 存储 | 文件型 JSON（`$DATA_DIR/*.json`），原子写 + 进程内串行 |
| 账号 | scrypt 密码哈希 + HMAC 签名会话 Cookie，无状态 |
| 配置 | 业务配置在后台 `/admin/settings`（含站点名与 Logo）；进程参数与密钥在 `.env` |
| 人机验证 | GeeTest v4（注册 / 登录，服务端二次校验） |
| 部署 | Docker（standalone 产物）/ systemd，反代用 nginx 或 Caddy |

---

## 快速开始

### Docker（推荐）

```bash
cd web
cp .env.example .env             # 可选：只填端口/密钥，业务配置在后台
docker compose up -d --build
curl -s localhost:8900/api/health
```

打开 `http://localhost:8900/register` 注册**第一个账号**——它会自动成为管理员。
站点没有默认管理员，也没有内置账号。

之后**业务配置**都在 `/admin/settings` 里改：站点名、GeeTest 人机验证、爱发电、开放注册、对外地址。
改完立即生效，不用重启。

**进程参数与密钥**（`PORT` / `DATA_DIR` / `SESSION_SECRET` / `ADMIN_TOKEN`）留在 `.env`，
这些要么改了必须重启，要么不该写进数据卷。

### 本地开发

```bash
cd web
npm install
npm run dev                   # http://localhost:8900（默认端口 8900）
```

完整步骤见 [`docs/自托管部署.md`](docs/自托管部署.md)。

---

## 已实现

- **账号**：注册 / 登录 / 退出、首个用户即管理员、scrypt 哈希、签名会话
- **人机验证**：GeeTest v4，注册与登录强制（未配置时跳过并提示）
- **社区**：发帖、评论、点赞、搜索、空状态引导
- **站内信**：顶栏未读角标 + 快捷面板（不跳页看最近消息）、一键已读、按账号记已读水位
- **公约**：诚信 / 社区两份，版本变更自动失效，未签限制落在服务端渲染分支
- **赞助**：爱发电名单同步 + 官网公开榜 `/sponsors`
- **公告**：后台发布 / 置顶 / 草稿，前台列表与详情，首页右栏最新 3 条
- **轮播**：后台可改文案与背景（纯色或图片），全部停用则首页不留空位
- **后台**：真实概览、用户管理、帖子管理、公告管理、轮播管理、公约管理、赞助管理、站点设置
- **端能力**：32 个能力键 + 6 个配额，服务端 UA 判定，微信内自动降级
- **主题**：深色黑白灰阶 / 浅色独立色值，cookie 驱动 SSR，首屏不闪
- **加载**：全局骨架屏（同构三栏，避免内容出现时跳动）+ 页面淡入 + `prefers-reduced-motion` 兜底
- **健壮**：自定义 404 / 错误边界（带 digest 便于查日志）

## 尚未实现

登录方式只有账号密码；**手机号 / 邮箱 / 微信 / Apple / 扫码登录均未实现**。
资源上传只有配额校验，没有落地通道；私信、举报审核、仲裁流程仍是设计稿。

**占位数据已全部清空**：资源、公会、战队、约战、排行榜、公告现在都是真实空数据，
每个列表页给出空态与下一步动作，不再展示虚构内容。结构保留在 `web/src/lib/data.ts`，
接入真实数据源后按同样的类型填充即可。

---

## 目录

```
├─ web/                        应用主体
│  ├─ src/app/                 路由（App Router）
│  ├─ src/components/          客户端组件
│  ├─ src/lib/                 能力判定 / 账号 / 存储 / 爱发电
│  ├─ Dockerfile               standalone 多阶段构建
│  ├─ docker-compose.yml       单服务 + 数据卷 + healthcheck
│  ├─ deploy/                  nginx / Caddy / systemd / 备份脚本
│  └─ scripts/                 smoke.sh（冒烟）、selfhost-check.sh（部署体检）
├─ contracts/                  端能力契约（32 键 + OpenAPI）
├─ docs/
│  ├─ 开发文档.md              结构、请求时序、加能力键、排障
│  └─ 自托管部署.md            Docker / systemd / 反代 / 备份 / 安全清单
└─ 功能清单-v3-单一Web端.md     产品功能矩阵
```

---

## 验证

```bash
cd web
bash scripts/smoke.sh http://localhost:8900                       # 功能回归
ADMIN_TOKEN=xxx bash scripts/selfhost-check.sh https://你的域名    # 部署体检
```

冒烟脚本建议对**空数据目录**跑一次，可以完整验证"第一个注册用户成为管理员"。

---

## 许可

未声明 License。转载或二次分发前请先联系仓库维护者。
