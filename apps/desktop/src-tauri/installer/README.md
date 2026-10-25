# NSIS 安装器素材

- `header.bmp`：150×57，安装页头部
- `sidebar.bmp`：164×314，欢迎页 / 完成页侧栏

在 `tauri.conf.json` 的 `bundle.windows.nsis` 中引用：
`headerImage`、`sidebarImage`、`uninstallerHeaderImage`。

重新生成时保持 24-bit BMP、尺寸不变，否则 NSIS 会拒绝或拉伸。
