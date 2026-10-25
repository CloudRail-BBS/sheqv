# Android 客户端交付

## Release APK（推荐测试）

- 文件：`BlockArena-0.1.0-release.apk`
- 类型：Release APK，已用项目 keystore 签名
- 版本：0.1.0
- 包名：`com.cloudrail.community`
- 站点：https://crbbsx.com
- 大小：约 3.5MB
- SHA-256：`1c3d00bf7d777718fef689611a448bacc25a2b23470de55d0eef84c22bfef52e`
- 证书：`CN=CloudRail Community, OU=Android, O=CloudRail, L=Shanghai, ST=Shanghai, C=CN`
- 证书 SHA-256：`46a76f1444b2fa5edccd487105d1ed3473e9e6c71c1416b3006c5e74556bba29`

## Debug APK

- 文件：`BlockArena-0.1.0-debug.apk`
- 仅用于快速调试，不建议分发
- SHA-256：`8e59b4746f92135d71515e6f505b0d2239f638769f00664c51585d16eb22c74f`

## Keystore

- 路径：`apps/android/keystore/blockarena-release.keystore`
- Alias：`blockarena`
- 密码：`apps/android/keystore/keystore.properties`（已 gitignore）
- 请立刻备份 keystore 与密码；丢失后无法覆盖安装更新。

## 全屏

已启用 edge-to-edge：状态栏/导航栏透明，内容延伸到系统栏下方，
Web 端用 `env(safe-area-inset-*)` 留白。
