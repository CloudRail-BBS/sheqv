# Android 客户端（原生壳 + 原生模块）

自研 Kotlin 壳，加载线上站点，负责系统能力；界面仍是 Web，**不再依赖 Capacitor**。
包名 `com.cloudrail.community`，与历史安装包一致，可直接覆盖升级。

## 结构

```text
apps/android/
  app/                      Android 应用模块（Kotlin）
    src/main/java/com/cloudrail/community/
      MainActivity.kt       WebView 壳：导航、返回、深链、离线页、主题、文件选择
      WebBridge.kt          window.NativeApp 暴露给网页的方法
      Downloads.kt          DownloadManager 下载 / MediaStore 保存图片
    src/main/res/           布局、主题、图标、FileProvider 路径
  keystore/                 release 签名（gitignored，务必离线备份）
  releases/                 历史 APK（不入库）
```

## 环境

- JDK 17
- Android SDK：`platforms;android-34`、`build-tools;34.0.0`
- `local.properties` 里写 `sdk.dir=...`（已 gitignore）

## 构建

```bash
cd apps/android

# 调试包（包名带 .debug，可与正式包共存）
./gradlew assembleDebug

# 正式包（读取 keystore/keystore.properties 自动签名）
./gradlew assembleRelease
```

产物：

```text
app/build/outputs/apk/debug/app-debug.apk
app/build/outputs/apk/release/app-release.apk
```

默认加载 `https://crbbsx.com`。联调本地或内网时可覆盖：

```bash
./gradlew assembleDebug -PappUrl=http://10.0.2.2:8900
```

> debug 包允许明文 HTTP，release 包禁止（`usesCleartextTraffic=false`）。
> 调试包自动开启 WebView 远程调试（`chrome://inspect`）。

签名材料在 `keystore/`：`blockarena-release.keystore` + `keystore.properties`。
丢失后无法覆盖安装更新，请单独备份。

## 原生模块

| 能力 | 实现 |
| --- | --- |
| 会话 | WebView CookieManager（`acceptThirdPartyCookies`），`onPause` 主动 flush |
| 下载 | `DownloadManager` 落到系统「下载」目录，自动补 `Cookie` 与 UA，重名加时间戳 |
| 保存图片 | MediaStore → `Pictures/云轨社区`（Android 10+），≤12MB |
| 文件选择 | `WebChromeClient.onShowFileChooser` + 系统选择器，`<input type="file">` 直接可用 |
| 分享 | `ACTION_SEND` 文本/链接 |
| 外链 | Custom Tabs；非本站域名一律外部打开 |
| 返回键 | 网页历史优先，到底双击退出（2 秒内） |
| 深链 | `https://crbbsx.com/...` intent-filter，`singleTask` 复用实例 |
| 状态栏 | 跟随站内 `data-theme` 切换图标明暗与栏底色 |
| 离线兜底 | 主文档加载失败显示原生错误页（重试 / 浏览器打开） |
| 长按图片 | 保存图片 / 复制链接 |

## 网页侧调用

原生方法挂在 `window.NativeApp`：

```js
NativeApp.download(url, filename)        // 下载
NativeApp.saveBase64(name, mime, base64) // 保存图片
NativeApp.share(title, text, url)
NativeApp.openExternal(url)
NativeApp.setTheme(dark)                 // 状态栏明暗
NativeApp.toast(msg) / NativeApp.vibrate(ms)
NativeApp.version()                      // 版本名
NativeApp.reload()
```

为了不动站点既有代码，壳在页面加载完成后注入一层兼容层：
`window.Capacitor.isNativePlatform()` 返回 true，
`Capacitor.Plugins.FileBridge.saveUrlToDownloads / saveImageToGallery / shareFile`
会转发到上面的原生方法。站点里的 `web/src/lib/native-download.ts` 因此照常工作。

## 已知未做

- 推送：只申请了通知权限，尚未接厂商通道（原方案里的个推未落地）。
- OAuth 回跳：GitHub / CNKD 登录在外部浏览器完成后不会把会话带回 WebView，
  目前建议站内用账号密码或邮箱验证码登录；后续需要 `blockarena://` 回调或服务端一次性换票。
- 应用内更新：`REQUEST_INSTALL_PACKAGES` 已声明，下载/安装流程未接。
- 模拟器（软件 GPU）上首页偶尔出现底部重复绘制的合成异常，真机与桌面浏览器未复现；
  排查过 DOM（只有一个 `.tabbar` / `.feed-tabs`）、关闭过 `backdrop-filter`、固定背景与回弹，
  均未消除，暂按模拟器渲染问题记录。
