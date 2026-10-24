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
 *
 * 顺带把 .env 读进来：standalone 的 server.js 不保证会加载 .env，
 * 不处理的话「在 .env 里配了 SESSION_SECRET 却没生效」很难查。
 * 真实环境变量优先于 .env 里的同名项。
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadEnvFile } from './load-env.mjs';

const loaded = loadEnvFile(path.join(process.cwd(), '.env'));

const port = String(process.env.PORT || '8900');
const host = process.env.HOST || '0.0.0.0';
const standalone = process.argv.includes('--standalone');
const distDir = process.env.NEXT_DIST_DIR || '.dist';

/**
 * rewrites 在构建时固化成绝对地址，运行时改 API_BASE 不会生效。
 * 这里把「构建时用的地址」与「运行时环境变量」对一下，不一致就明确告警——
 * 否则表现是「浏览器发的 /api/* 全部 500」，而日志里什么都看不出来。
 */
try {
  const buildBase = readFileSync(path.join(process.cwd(), '.build-api-base'), 'utf8').trim();
  const runBase = (process.env.API_BASE || '').trim();
  const norm = (v) => v.replace(/\/+$/, '');
  if (buildBase && runBase && norm(buildBase) !== norm(runBase)) {
    console.warn(`[start] ⚠️ API_BASE 与构建时不一致：构建=${buildBase} 运行时=${runBase}`);
    console.warn('[start]    浏览器侧 /api/* 仍会转发到构建时的地址（rewrites 在构建期固化）。');
    console.warn('[start]    要改这个地址必须重建镜像：cd web && docker compose build');
  } else if (buildBase) {
    console.log(`[start] API_BASE=${buildBase}（与构建期一致）`);
  }
} catch {
  // 本地 dev / 非镜像运行时没有这个文件，忽略
}

if (loaded > 0) {
  console.log(`[start] 已从 .env 读取 ${loaded} 项配置，监听 ${host}:${port}`);
} else {
  console.log(`[start] 未发现 .env（或已被环境变量覆盖），监听 ${host}:${port}`);
}

let cmd;
let args;

if (standalone) {
  // 两处布局都要支持：
  // - 镜像里：standalone 产物已展开到工作目录，server.js 在根
  // - 本地：next build 产出在 <distDir>/standalone/server.js
  const candidates = [
    path.join(process.cwd(), 'server.js'),
    path.join(distDir, 'standalone', 'server.js'),
  ];
  const entry = candidates.find((p) => existsSync(p));
  if (!entry) {
    console.error(`找不到 server.js（试过：${candidates.join('、')}），先执行 npm run build`);
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
