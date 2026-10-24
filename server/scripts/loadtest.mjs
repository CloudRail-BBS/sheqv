#!/usr/bin/env node
/**
 * 极简压测：固定并发打一个只读接口，报 RPS 与 p50/p95/p99。
 *
 *   node scripts/loadtest.mjs --base http://127.0.0.1:8080 --path api/v1/posts \
 *     --concurrency 20 --requests 400
 *
 * 默认只打 GET，**不会写数据**；要压写接口请显式加 --path 并把 --method POST。
 * 没有依赖，Node 18+ 自带 fetch。
 */

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '');
  args.set(key, process.argv[i + 1]);
}

const base = (args.get('base') || 'http://127.0.0.1:8080').replace(/\/+$/, '');
// Git Bash 会把以 / 开头的参数当路径转换（/api/x → E:/.../api/x），
// 所以这里两种写法都接受：`--path api/v1/posts` 或 `--path=/api/v1/posts`
const rawPath = args.get('path') || 'api/v1/posts';
const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
const method = (args.get('method') || 'GET').toUpperCase();
const concurrency = Math.max(1, Number(args.get('concurrency') || 20));
const total = Math.max(1, Number(args.get('requests') || 200));
const url = `${base}${path}`;

const latencies = [];
let ok = 0;
let failed = 0;
const codes = new Map();

const startedAt = Date.now();

async function once() {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { method, headers: { accept: 'application/json' } });
    const body = await res.arrayBuffer();
    const ms = performance.now() - t0;
    latencies.push(ms);
    codes.set(res.status, (codes.get(res.status) || 0) + 1);
    if (res.ok) ok += 1;
    else if (failed++ < 3) {
      console.error(`非 2xx：${res.status} ${Buffer.from(body).toString('utf8').slice(0, 120)}`);
    }
  } catch (e) {
    failed += 1;
    console.error('请求失败：', e instanceof Error ? e.message : e);
  }
}

let issued = 0;
async function worker() {
  while (issued < total) {
    issued += 1;
    await once();
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));

const seconds = (Date.now() - startedAt) / 1000;
latencies.sort((a, b) => a - b);
const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))] || 0;

console.log(`目标      ${method} ${url}`);
console.log(`并发/总数 ${concurrency} / ${total}`);
console.log(`耗时      ${seconds.toFixed(2)}s   RPS ${(total / seconds).toFixed(1)}`);
console.log(
  `延迟(ms)  p50 ${pct(50).toFixed(1)}   p95 ${pct(95).toFixed(1)}   p99 ${pct(99).toFixed(1)}   max ${(
    latencies[latencies.length - 1] || 0
  ).toFixed(1)}`,
);
console.log(`结果      成功 ${ok}   失败 ${failed}   状态码 ${[...codes].map(([k, v]) => `${k}×${v}`).join(' ')}`);

if (failed > 0) process.exit(1);
