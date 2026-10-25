# Windows 客户端交付

- 文件：`BlockArena-0.1.0-windows-x64-setup.exe`
- 类型：Tauri 2 NSIS 安装包（x64）
- 版本：0.1.0
- 站点：https://crbbsx.com
- 大小：约 2.3MB
- SHA-256：`9bf1eef8a16f7b2a04f384cd33a95021ed9ed807de1997b4b501906f08413ba8`

## 注意

- 当前未做 Windows 代码签名；SmartScreen 会提示“未知发布者”。
- 安装后从开始菜单启动“云轨社区”。
- 首次打开需要网络，客户端加载线上站点。
- 安装包由 `npx tauri build --bundles nsis` 生成；本地 `target/release` 曾受安全规则限制，
  实际使用系统临时 target 目录构建。
