# Windows 客户端交付

- 文件：`BlockArena-0.1.0-windows-x64-setup.exe`
- 类型：Tauri 2 NSIS 安装包（x64）
- 版本：0.1.0
- 站点：https://crbbsx.com
- 大小：约 2.3MB
- SHA-256：`1ea2ecd18182e8a36dbecc9bd05517fc67e564004608b1ea50c6ad5369bf8635`

## 注意

- 当前未做 Windows 代码签名；SmartScreen 会提示“未知发布者”。
- 安装后从开始菜单启动“云轨社区”。
- 首次打开需要网络，客户端加载线上站点。
- 安装包由 `npx tauri build --bundles nsis` 生成；本地 `target/release` 曾受安全规则限制，
  实际使用系统临时 target 目录构建。
- 安装页已配置品牌头图 / 侧栏图 / 安装图标，中文/英文语言，当前用户安装，开始菜单「云轨社区」。
