#!/usr/bin/env node
/**
 * 启动包装：跨平台读端口，默认 8900。
 *
 *   node scripts/start.mjs                  # next start（需要先 build）
 *   node scripts/start.mjs --standalone     # 跑 standalone 产物，等价镜像里的启动方式
 *   PORT=9000 node scripts/start.mjs        # 临时换端口
 *
 * 为什么不直接在 package.json 写 `-p ${PORT:-8900}`：
 * npm 在 Windows 上用 cmd.exe 跑脚本，`${VAR:-default}` 不展开，
 * next 会收到字面量然后报错。用 node 兜一层最稳。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const port = String(process.env.PORT || '8900');
const host = process.env.HOST || '0.0.0.0';
const standalone = process.argv.includes('--standalone');
const distDir = process.env.NEXT_DIST_DIR || '.dist';

let cmd;
let args;

if (standalone) {
  const entry = path.join(distDir, 'standalone', 'server.js');
  if (!existsSync(entry)) {
    console.error(`找不到 ${entry}，先执行：NEXT_DIST_DIR=${distDir} npm run build`);
    process.exit(1);
  }
  // standalone 的 server.js 自己读 PORT / HOSTNAME
  cmd = process.execPath;
  args = [entry];
} else {
  cmd = process.execPath;
  args = ['node_modules/next/dist/bin/next', 'start', '-H', host, '-p', port];
}

const child = spawn(cmd, args, {
  stdio: 'inherit',
  env: standalone ? { ...process.env, PORT: port, HOSTNAME: host } : process.env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

// 容器 stop / Ctrl-C 时把信号转发给子进程，不留孤儿
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig));
}
