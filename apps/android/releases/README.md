# Android 客户端交付

## Release APK（正式版，推荐分发）

- 文件：`BlockArena-0.2.0-release.apk`
- 类型：Release APK，已用项目 keystore 签名（APK Signature Scheme v2）
- 版本：0.2.0（versionCode 4）
- 包名：`com.cloudrail.community`（与 0.1.x 一致，可直接覆盖安装）
- 站点：https://crbbsx.com
- 大小：2,758,289 字节（约 2.7MB）
- SHA-256：`7edbd11928691c4e7c7293e18a2359a39dec7ad35a23c24ea96eaee8939698c5`
- 证书：`CN=CloudRail Community, OU=Android, O=CloudRail, L=Shanghai, ST=Shanghai, C=CN`
- 证书 SHA-256：`46a76f1444b2fa5edccd487105d1ed3473e9e6c71c1416b3006c5e74556bba29`

安装包不入库、也不随站点发布（`apps/android/releases/*.apk` 已 gitignore）。
分发时把 APK 上传到你自己的托管位置，再到后台 → 客户端 → 版本发布登记：
平台 `android`、渠道 `stable`、版本 `0.2.0`、build `4`、大小 `2758289`、
SHA-256 同上，下载地址填上传后的实际链接。

## Debug APK

- 文件：`BlockArena-0.2.0-debug.apk`
- 仅用于快速调试，不建议分发（debug 签名，不能覆盖安装正式版）
- 包名带 `.debug`，可与正式版共存
- SHA-256：`d7838496a213d9e91682a8d5e533626fc1e43a373fdb4d00be80f04d25f0cf0c`

## 版本历史

| 版本 | 文件 | versionCode | 说明 |
|---|---|---|---|
| 0.2.0 | `BlockArena-0.2.0-release.apk` | 4 | 去掉 Capacitor，自研 Kotlin 原生壳：下载/保存图片/文件选择/分享/深链/返回键/主题/离线页 |
| 0.1.2 | `BlockArena-0.1.2-release.apk` | 3 | 原生下载桥（系统下载器 + 会话 Cookie） |
| 0.1.1 | `BlockArena-0.1.1-release.apk` | 2 | 全屏与安全区适配 |
| 0.1.0 | `BlockArena-0.1.0-release.apk` | 1 | 首个正式包 |

## Keystore

- 路径：`apps/android/keystore/blockarena-release.keystore`
- Alias：`blockarena`
- 密码：`apps/android/keystore/keystore.properties`（已 gitignore）
- 请立刻备份 keystore 与密码；丢失后无法覆盖安装更新。

## 全屏与状态栏

窗口按系统栏避让（`decorFitsSystemWindows=true`），Web 不需要再吃 `env(safe-area-inset-*)`；
状态栏 / 导航栏底色与图标明暗跟随站内 `data-theme`（注入脚本监听属性变化）。
