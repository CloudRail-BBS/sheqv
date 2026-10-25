# Capacitor Android 客户端

当前目录是壳工程配置与原生文件插件参考实现，尚未生成完整 `android/` Gradle 工程。

## 生成 Android 工程

需要 JDK 17 或 21、Android Studio / Android SDK：

```bash
cd apps/android
npm install
npx cap add android
npx cap sync android
npx cap open android
```

把 `native/FileBridgePlugin.kt` 放到：

```text
android/app/src/main/java/com/cloudrail/community/FileBridgePlugin.kt
```

把 `native/file_paths.xml` 放到 `android/app/src/main/res/xml/file_paths.xml`，
并把 `native/manifest-snippets.xml` 里的权限/provider 合并进 AndroidManifest。

在 `MainActivity.java` / `.kt` 注册插件：

```kotlin
registerPlugin(FileBridgePlugin::class.java)
```

## 修改域名

`capacitor.config.ts` 里的 `server.url` 与 `allowNavigation` 改成实际域名。
`cleartext` 保持 false。

## 构建

```bash
cd android
./gradlew assembleRelease
```

需要自己的 keystore；APK 直接分发，不走应用商店。

## 推送

集成个推 Android SDK，拿到 CID 后上报服务端。后台 `/admin/apps` 已能保存
AppID / AppKey / AppSecret / MasterSecret；服务端发送推送的 REST 调用还未接入。

## 文件能力

- 资源下载：`FileBridge.saveUrlToDownloads`
- 证书/分享图：`FileBridge.saveImageToGallery`
- 导出/另存为：`FileBridge.saveAs`（SAF）
- 分享：`FileBridge.shareFile`
- 安装更新：`FileBridge.installApk`

不要申请 `MANAGE_EXTERNAL_STORAGE`。
