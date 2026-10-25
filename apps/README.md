# 客户端工程

- `desktop/`：Tauri 2，Windows EXE / macOS APP+DMG，远程加载线上 Web。
- `android/`：Capacitor，Android APK，远程加载线上 Web；已生成 Android 工程并接入 FileBridge。

## 前置

- 桌面：Node 22、Rust 1.85+、Windows 需 WebView2（Win10/11 通常自带）。
- Android：Node 22、JDK 17 或 21、Android Studio / Android SDK、Gradle。

## 域名

两个工程里的 `https://your-domain.example` 都要替换成实际站点地址，例如
`https://bbs.example.com`。客户端只允许这个域名导航。

## 发布

版本发布在站点后台 `/admin/apps`；客户端通过 `/api/v1/app/latest` 检查更新。
安装包本身需上传到对象存储、静态目录或自己的下载服务器，再把地址填入后台。
