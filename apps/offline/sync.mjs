#!/usr/bin/env node
/**
 * 把 `apps/offline/index.html` 同步到两个客户端里。
 *
 * 这份页面是打包进安装包的本地资源：没有网络时，客户端加载它来显示界面预览。
 * - 桌面端（Tauri）：`apps/desktop/ui/index.html` 就是窗口的入口页
 * - 安卓端（Capacitor）：`apps/android/www/offline.html` 作为 `server.errorPath`
 *
 * 改完 `index.html` 后跑一次：`node apps/offline/sync.mjs`
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'index.html');

const targets = [
  join(here, '..', 'desktop', 'ui', 'index.html'),
  join(here, '..', 'android', 'www', 'index.html'),
  join(here, '..', 'android', 'www', 'offline.html'),
];

for (const file of targets) {
  mkdirSync(dirname(file), { recursive: true });
  copyFileSync(src, file);
  console.log('✓', file);
}
