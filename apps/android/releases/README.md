# Android 客户端交付

## Release APK（正式版，推荐分发）

- 文件：`BlockArena-0.1.2-release.apk`
- 类型：Release APK，已用项目 keystore 签名（APK Signature Scheme v2）
- 版本：0.1.2（versionCode 3）
- 包名：`com.cloudrail.community`
- 站点：https://crbbsx.com
- 大小：3,635,420 字节（约 3.5MB）
- SHA-256：`85f451e9e7379dfb61d71862778ccb18d0c21cb06b2e0a9b28189749010dc9ab`
- 证书：`CN=CloudRail Community, OU=Android, O=CloudRail, L=Shanghai, ST=Shanghai, C=CN`
- 证书 SHA-256：`46a76f1444b2fa5edccd487105d1ed3473e9e6c71c1416b3006c5e74556bba29`

安装包不入库、也不随站点发布（`apps/android/releases/*.apk` 已 gitignore）。
分发时把 APK 上传到你自己的托管位置，再到后台 → 客户端 → 版本发布登记：
平台 `android`、渠道 `stable`、版本 `0.1.2`、build `3`、大小 `3635420`、
SHA-256 同上，下载地址填上传后的实际链接。

## Debug APK

- 文件：`BlockArena-0.1.2-debug.apk`
- 仅用于快速调试，不建议分发（debug 签名，不能覆盖安装正式版）
- SHA-256：`aab1f317843767ecb7fc3f088c92d33ed81cb2b83552d870d95011c90dba639a`

## 版本历史

| 版本 | 文件 | versionCode | 说明 |
|---|---|---|---|
| 0.1.2 | `BlockArena-0.1.2-release.apk` | 3 | 原生下载桥（系统下载器 + 会话 Cookie） |
| 0.1.1 | `BlockArena-0.1.1-release.apk` | 2 | 全屏与安全区适配 |
| 0.1.0 | `BlockArena-0.1.0-release.apk` | 1 | 首个正式包 |

## Keystore

- 路径：`apps/android/keystore/blockarena-release.keystore`
- Alias：`blockarena`
- 密码：`apps/android/keystore/keystore.properties`（已 gitignore）
- 请立刻备份 keystore 与密码；丢失后无法覆盖安装更新。

## 全屏

已启用 edge-to-edge：状态栏/导航栏透明，内容延伸到系统栏下方，
Web 端用 `env(safe-area-inset-*)` 留白。
