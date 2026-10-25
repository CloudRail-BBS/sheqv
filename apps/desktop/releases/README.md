# Windows 客户端交付

## 安装包

- 文件：`BlockArena-0.1.0-windows-x64-setup.exe`
- 类型：Tauri 2 NSIS 安装包（x64）
- 版本：0.1.0
- 站点：https://crbbsx.com
- 大小：约 2.3MB
- SHA-256：`2d221e31d6e9f605ec5bca8b09e12623144e6a80c3bb760239a19ef132780732`
- 已使用本地自签代码签名证书签名

## 免安装版

- 文件：`BlockArena-0.1.0-windows-x64-portable.exe`
- SHA-256：`8519e1585349360307b87ae5914286a188468bb700408451d15ed3d6d42215d8`
- 已使用同一张自签证书签名

## 签名证书

- Subject：`CN=CloudRail Community, OU=Desktop, O=CloudRail, L=Shanghai, ST=Shanghai, C=CN`
- Thumbprint：`C10751DC472672DA30BFDC6DC9052687E12936A2`
- SHA-256：`D20BC81ECB0CC7F06AE179416767D7E224E06E8B20030624A7CA3084EF6D47B8`
- PFX / CER / 密码：`apps/desktop/certs/`（已 gitignore，需本地备份）

自签证书不会被其他电脑默认信任，SmartScreen 仍可能提示。需要本机测试时，
把 `certs/blockarena-codesign.cer` 导入「受信任的发布者 / 受信任的根证书颁发机构」，
不要把 PFX 私钥分发给最终用户。

## 安装页

- 品牌头图 / 欢迎页侧栏图
- 中文 / 英文语言
- 当前用户安装，不强制 UAC
- 开始菜单「云轨社区」
