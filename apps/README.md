# 客户端工程

- `desktop/`：Tauri 2，Windows EXE / macOS APP+DMG，远程加载线上 Web。
- `android/`：Capacitor，Android APK，远程加载线上 Web；已生成 Android 工程并接入 FileBridge。

## 前置

- 桌面：Node 22、Rust 1.85+、Windows 需 WebView2（Win10/11 通常自带）。
- Android：Node 22、JDK 17 或 21、Android Studio / Android SDK、Gradle。

## 离线预览页

两个客户端都内置了同一份本地页面：`apps/offline/index.html`（约 20KB，无外部依赖）。

- **桌面端**：窗口入口改成 `index.html`（本地）。打开时先探测线上站点，能连上就 `location.replace`
  过去；连不上就停在这个页面，显示和站内同构的**界面骨架**（顶栏 / 侧栏 / 两列卡片 / 右栏），
  并每 5→30 秒退避重试，联网后自动进入社区。
- **安卓端**：`server.errorPath = 'offline.html'`，WebView 打不开线上站点时加载同一份页面。
- 两个客户端的副本由脚本同步，改完源文件跑一次：

```bash
node apps/offline/sync.mjs
```

调试参数（浏览器里直接看效果）：`?preview=1` 只渲染界面不发请求，`?offline=1` 模拟断网。

## 域名

两个工程默认加载 `https://crbbsx.com`。客户端只允许这个域名导航。

## 发布

版本发布在站点后台 `/admin/apps`；客户端通过 `/api/v1/app/latest` 检查更新。
安装包本身需上传到对象存储、静态目录或自己的下载服务器，再把地址填入后台。
