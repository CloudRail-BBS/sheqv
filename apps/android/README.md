# Capacitor Android 客户端

Android 工程已生成（`android/`），可在 Android Studio 打开或命令行构建。

## 环境

- JDK 17 或 21
- Android SDK：`platforms;android-34`、`build-tools;34.0.0`
- Android Studio（可选）

## 配置站点地址

```bash
cd apps/android
APP_URL=https://crbbsx.com npx cap sync android
```

`capacitor.config.ts` 从 `APP_URL` 读取地址；不设置时使用占位域名。
`allowNavigation` 自动取该域名的 host。

## 构建 Debug APK

```bash
cd apps/android/android
./gradlew assembleDebug
```

产物：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## 构建 Release APK

先准备自己的 keystore，并在 `android/app/build.gradle` 配置 signingConfig：

```bash
./gradlew assembleRelease
```

直接分发 APK 需要自己承担签名、更新与安装未知应用提示。

## 原生能力

- `FileBridge` 已注册到 `MainActivity`：
  - `saveUrlToDownloads`：DownloadManager 下载到公共下载目录
  - `saveImageToGallery`：MediaStore 保存到 `Pictures/云轨社区`
  - `saveAs`：SAF 用户选择位置
  - `shareFile`：FileProvider + 系统分享
  - `installApk`：应用内更新安装
- 权限与 FileProvider 已写入 Manifest / `res/xml/file_paths.xml`。
- 不使用 `MANAGE_EXTERNAL_STORAGE`。
- Android 13+ 通知权限需在运行时请求。

## 个推

1. 集成个推 Android SDK。
2. 拿到 CID 后上报服务端（接口待接）。
3. 后台 `/admin/apps` 已能保存 AppID / AppKey / AppSecret / MasterSecret。
4. 服务端发送推送的 REST 调用还未接入。

## JS 调用

远程页面可通过 Capacitor 注入的桥调用：

```ts
const { FileBridge } = (window as any).Capacitor.Plugins;
await FileBridge.saveUrlToDownloads({ url, filename });
```

建议在 Web 端封装一层 `capabilities` 判断，只在 Android App 内调用。
