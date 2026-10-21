/**
 * 极简 .env 读取，零依赖。
 *
 * 为什么自己写：standalone 的 server.js 不保证会加载 .env，
 * 而 `next start` / `next dev` 自己会读。为了两条启动路径行为一致，
 * 在进程入口统一读一次 —— 读早了也没关系，Next 不会覆盖已存在的变量。
 *
 * 规则（够用就好，不做 dotenv 的全语法）：
 *   - `KEY=VALUE`
 *   - `#` 开头是注释
 *   - 值可以用单/双引号包住
 *   - **已存在的环境变量优先**，不覆盖
 */
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';

export function loadEnvFile(file) {
  if (!existsSync(file)) return 0;

  let count = 0;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq < 1) continue;

    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();

    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = val;
      count += 1;
    }
  }

  return count;
}
