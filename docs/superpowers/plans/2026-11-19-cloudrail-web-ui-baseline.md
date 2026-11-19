# 云轨社区 Web UI 基线

记录日期：2026-11-19  
基线提交：`d583fe3c3dfc26bf8ef768edfdb06b17abdb2b5d`

## Web 外壳

- 社区前台由 `web/src/app/(site)/layout.tsx` 提供；主要页面使用 `.site-scroll`、`.topbar`、`.app`、`.content` 与 `.footer`。移动布局在 860px 附近转为底部导航和单栏。
- 管理后台由 `web/src/app/(console)/layout.tsx` 提供，根类 `.console`；桌面固定分组侧栏，960px 附近转成移动抽屉。抽屉状态、Escape、背景滚动锁定和路径切换关闭由 `console-nav.tsx` 管理。
- 运营台由 `web/src/app/(ops)/ops/layout.tsx` 提供，根类 `.ops`；使用独立的顶部品牌栏和横向队列导航，在 700px 附近收紧。
- 三个 shell 在根布局下共用主题变量和全局 CSS，不互相嵌套。管理与运营权限仍分别经 `getAdminGate()` 和 `getOpsGate()` 处理。

## 样式入口

- `web/src/app/layout.tsx` 当前按顺序加载 `fonts.css`、`globals.css`、`mobile.css`；移动规则最后覆盖窄屏布局。
- 基线 `globals.css` 有 10,074 行；主题/基础样式和多轮兼容覆盖交织，文件末尾包含全局按钮、字段、卡片与表格修订，不能按目录名任意重排。
- `mobile.css` 有 575 行，主要限制在站点前台和小屏交互；它继续作为最末覆盖层。
- 深色和浅色主题已共享 `--panel`、`--line`、`--text`、`--blue`、`--cyan` 等变量；字体为自托管 CloudRail Sans。

## 已有交互

- 首页轮播使用管理端配置的内容和素材；卡片浏览和轮播切换由 `web/src/components/carousel.tsx` 提供。
- 首页信息流已有 `FeedFade`，用于切换推荐/最新等标签时做一次入场；帖子卡片本身没有交错动画。
- 公告弹窗使用 Portal、Escape 关闭、本地已读记录和页面滚动锁定；业务组件还有多种 modal、drawer 和 bottom sheet。
- 全局 CSS 已有 `prefers-reduced-motion` 规则和统一的 `:focus-visible` 样式。

## 工具与视觉检查限制

- `web/package.json` 包含 `typecheck`、`build`、`smoke` 命令。基线工作区未发现 `web/node_modules`，需要先按 lockfile 安装依赖再运行前端检查。
- 社区、后台和运营页面的 SSR 依赖本地 Rust API 与 PostgreSQL。未配置环境时，类型检查和静态构建仍可独立验证；端到端页面检查需确认服务可用。
- 视觉验收视口固定为 375、768、1024、1440 CSS px；主题固定为浅色和深色。
