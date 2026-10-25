# Tauri 桌面客户端

## 开发

```bash
cd apps/desktop
npm install
# 先把 src-tauri/tauri.conf.json 的 url 改成实际站点
npm run dev
```

首次构建前生成图标（需要一张 512×512 PNG）：

```bash
npm run icon
```

## 构建

```bash
npm run build
```

产物在 `src-tauri/target/release/bundle/`：

- Windows：NSIS `.exe`
- macOS：`.dmg` / `.app`

## 签名

- 本地已生成自签代码签名证书：`apps/desktop/certs/`（已 gitignore）。
- 当前 EXE / 安装包已用该证书签名；其他电脑仍需导入 `.cer` 才会信任。
- 正式对外分发建议购买 OV/EV 代码签名证书，否则 SmartScreen 仍会提示。
- macOS 需要 Apple Developer ID + notarization；否则 Gatekeeper 会拦截。

## 自动更新

1. 安装 `tauri-plugin-updater`。
2. 生成签名密钥，把公钥写入 `tauri.conf.json` 的 `plugins.updater.pubkey`。
3. 配置更新清单地址，例如 `https://你的域名/download/latest.json`。
4. 在后台「端管理」发布版本并填写下载地址。

当前工程只搭了窗口/托盘/通知/外链/单实例，更新器与下载命令下一步接入。
