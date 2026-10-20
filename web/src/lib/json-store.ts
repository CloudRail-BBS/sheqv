import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from './config';

/**
 * 文件型 JSON 存储的公共件：
 *  - 路径统一走 DATA_DIR（容器里挂卷即可持久化）
 *  - 写入用「临时文件 + rename」，避免进程被杀时留下半个文件
 *  - 同进程内的写操作串行化，避免并发请求互相覆盖
 *
 * 生产建议替换为数据库；替换时保持上层函数签名不变即可。
 */

export function dataFile(name: string): string {
  return path.join(config.dataDir, name);
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });

  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf-8');
  // rename 在同一文件系统上是原子操作；失败时清理临时文件，不留垃圾
  try {
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.unlink(tmp).catch(() => {});
    throw e;
  }
}

/** 进程内串行队列：文件存储没有事务，至少保证同进程不会丢更新 */
let chain: Promise<unknown> = Promise.resolve();

export function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
