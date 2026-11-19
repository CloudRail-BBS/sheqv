# 云轨社区 Web 全站 UI 改造实施计划

> **For agentic workers:** 按任务检查点实施。所有任务共同遵守本文件的全局约束。

**Goal:** 在不改变业务契约的前提下，统一云轨社区前台、管理后台与运营台的视觉质量和动效细节，并整理前端样式入口。

**Architecture:** 保留 Next.js App Router 与三个独立 Web shell，新增少量客户端叶子组件承接滚动效果。以主题变量和带 shell 前缀的 CSS 组织视觉差异；移动端样式继续在通用视觉之后加载。大样式文件只按现有顺序拆分，避免重写或重排覆盖规则。

**Tech Stack:** Next.js 15 App Router、React 19、TypeScript、原生 CSS、IntersectionObserver 与被动滚动监听。

**Spec:** `docs/superpowers/specs/2026-11-19-cloudrail-web-ui-design.md`

## Global Constraints

- 保留现有路由、内容、权限、业务行为、明暗主题和 CloudRail Sans。
- 前台优先保障阅读；管理后台与运营台共享视觉原语，但保留独立导航与权限边界。
- 轮播视差仅作用于装饰背景层，速度系数为 `0.15 / 0.4 / 0.7`；关键文字和操作正常滚动。
- 滚动淡入在视口 `85%` 触发，以 `28px` 位移、`0.7s` cubic ease-out 完成；支持离开视口后重播。
- 复用现有 modal、drawer、bottom sheet；尊重 `prefers-reduced-motion` 和 `.site-scroll` 滚动容器。
- 不对信息流、长文、管理列表使用滚动吸附、滚动劫持、整页横向滚动或逐帖交错动画。
- 不引入大型动效依赖；不改 API、数据库、Rust、客户端目录、部署配置、密钥、`promo/`、`node_modules` 或用户数据。
- CSS 拆分保持选择器相对顺序、主题覆盖和媒体查询顺序；不全局重命名类、不引入 cascade layers。
- 交付时删除本次生成的 Next 构建缓存及其他明确生成的构建产物。

---

### Task 1: 建立视觉基线与样式分区

**Files:**
- Read: `web/src/app/globals.css`, `web/src/app/mobile.css`, `web/src/app/layout.tsx`
- Create: `docs/superpowers/plans/2026-11-19-cloudrail-web-ui-baseline.md`

- [ ] 记录暗色与浅色语义 token 的当前值、三个 shell 的主要根类、关键响应式断点及全局 CSS 的职责边界。
- [ ] 确认首页、社区内容页、后台概览、运营审核页可用的本地启动方式和缺失依赖。
- [ ] 将任何运行环境限制记录在基线文件，不写入虚构数据或 API 契约。

### Task 2: 统一共享视觉语言与管理界面

**Files:**
- Create: `web/src/app/styles/cloudrail-tokens.css`
- Create: `web/src/app/styles/cloudrail-console.css`
- Create: `web/src/app/styles/cloudrail-ops.css`
- Modify: `web/src/app/layout.tsx` only in Task 5, to load style entrypoints in order

- [ ] 将蓝青品牌色作为少量 shell 内的语义提示，复用现有 `--blue`、`--cyan`、`--panel`、`--line`、`--text` 等令牌；覆盖浅色和深色主题。
- [ ] 在 `.console` 下细化固定分组侧栏、顶栏、内容表面、列表与筛选的边界和焦点；保留 960px 切换抽屉及其现有交互。
- [ ] 在 `.ops` 下细化紧凑顶栏、横向队列导航、审核表格和状态标签；保留 700px 窄屏断点及独立路径匹配。
- [ ] 不修改导航数据、门禁、审核 props、API 数据和危险操作语义。用 `rg` 确认文件只包含新增 shell 视觉规则，并通过 `npm run typecheck` 与 `npm run build`。

### Task 3: 改善社区前台与滚动动效

**Files:**
- Create: `web/src/components/scroll-reveal.tsx`
- Create: `web/src/lib/scroll-motion.mjs`, `web/src/lib/scroll-motion.d.ts`
- Create: `web/scripts/scroll-motion.test.mjs`
- Create: `web/src/app/styles/cloudrail-site.css`
- Modify: `web/src/components/carousel.tsx`, `web/src/app/(site)/(home)/page.tsx`

- [ ] 先在 `scroll-motion.test.mjs` 写纯函数行为测试并确认失败；用无依赖的 `node --test` 验证 parallax 深度比例和 reveal 触发线计算，再实现 `.mjs` 及其声明文件。
- [ ] 首页轮播继续用后台管理的标题、文案、图片和链接；把主图与青蓝装饰层分开，只对装饰层做 `0.15 / 0.4 / 0.7` 深度偏移，文字和 CTA 不偏移。
- [ ] `ScrollReveal` 只包围首页明确分组，不包帖子列表；以 `.site-scroll` 为 IO root（不存在时使用 viewport），85% 高度触发、28px、0.7 秒 cubic ease-out，离开视口底部后复位并支持重播。
- [ ] 用被动 scroll 监听和 `requestAnimationFrame` 合并写样式；监听实际滚动容器，清理 listener、observer 和 RAF；减少动态模式直接显示最终状态。
- [ ] CSS 保留静态首屏与 JS 未加载时的可读状态。验证 `node --test scripts/scroll-motion.test.mjs`、`npm run typecheck` 与 `npm run build`。
- [ ] 复用现有公告 modal、`console-nav` drawer 和业务 sheet，仅当视觉检查指出问题时做局部样式补丁；不更改关闭、焦点、滚动锁定逻辑。

### Task 4: 按原顺序拆分样式入口

**Files:**
- Modify: `web/src/app/globals.css`, `web/src/app/layout.tsx`
- Create: `web/src/app/styles/index.css`
- Create: `web/src/app/styles/legacy-00.css` through `legacy-03.css`

- [ ] 以现有完整 CSS 规则边界为切点，将旧 `globals.css` 作为四段连续文本拆到 `legacy-00.css` 至 `legacy-03.css`；文件注释说明它们按旧级联顺序拼接，禁止搬动或改写规则。
- [ ] 建立唯一 `styles/index.css` 顺序清单：先载入四段旧样式，再载入共享 token、console、ops、site 新样式；根布局改为只导入该清单，字体继续在样式之前、`mobile.css` 继续在样式之后。
- [ ] 拆分前后用 Node 脚本对四个旧分片 UTF-8 内容按序连接，与原 `globals.css` 字节逐一比较；相等后移除已由入口替代的原单文件。
- [ ] 保持移动 CSS 作为最后的窄屏覆盖入口；检查 Next CSS 解析和主题选择器。

### Task 5: 完成验证和构建缓存清理

**Files:**
- Read: `web/package.json`, `web/scripts/smoke.sh`, `web/src/app/styles/index.css`
- Modify: `docs/superpowers/plans/2026-11-19-cloudrail-web-ui-baseline.md`

- [ ] 运行 `npm run typecheck`、`npm run build`、`npm run smoke`；缺少数据库/API 时如实区分静态通过与服务端冒烟阻塞。
- [ ] 对主要 Web 页面做桌面/移动、浅色/深色、键盘焦点与减少动态效果检查。
- [ ] 删除本轮生成的 `.next` 与确认由检查生成的构建缓存；保留依赖和用户文件。

