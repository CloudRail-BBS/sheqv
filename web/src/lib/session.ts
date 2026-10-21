import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from './config';

/**
 * 会话：无状态签名 Cookie，不落服务端会话表。
 *
 * token = `<userId>.<exp>.<hmac>`，HMAC-SHA256，密钥优先取 SESSION_SECRET，
 * 没配就自动生成一个存在 $DATA_DIR/.session-secret —— 这样重启不会把所有用户踢下线，
 * 而容器重建只要数据卷还在，密钥也还在。
 */

export const SESSION_COOKIE = 'ba_session';
export const SESSION_TTL = 60 * 60 * 24 * 7; // 7 天

let cachedSecret: string | null = null;

async function getSecret(): Promise<string> {
  if (config.sessionSecret) return config.sessionSecret;
  if (cachedSecret) return cachedSecret;

  const file = path.join(config.dataDir, '.session-secret');
  try {
    const existing = (await fs.readFile(file, 'utf-8')).trim();
    if (existing) {
      cachedSecret = existing;
      return existing;
    }
  } catch {
    // 首次启动：生成并落盘
  }

  const secret = randomBytes(32).toString('hex');
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(file, secret, { encoding: 'utf-8', mode: 0o600 });
  cachedSecret = secret;
  return secret;
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export async function issueSessionToken(userId: string): Promise<{ token: string; maxAge: number }> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const data = `${userId}.${exp}`;
  const token = `${data}.${sign(data, await getSecret())}`;
  return { token, maxAge: SESSION_TTL };
}

export async function verifySessionToken(token?: string | null): Promise<{ userId: string } | null> {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [userId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!userId || !Number.isFinite(exp)) return null;
  if (exp * 1000 < Date.now()) return null;

  const expected = sign(`${userId}.${expStr}`, await getSecret());
  if (!safeEqual(sig, expected)) return null;

  return { userId };
}

/**
 * 统一 Cookie 属性：只有当前请求确实走 https 才带 Secure。
 * 不用 PUBLIC_BASE_URL 判断——反代后那个变量经常没配或配错，
 * 按请求 proto 判断既准又不需要任何配置。
 */
export function sessionCookieOptions(req?: { headers: Headers; url?: string }) {
  let secure = false;
  if (req) {
    const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    if (proto) secure = proto === 'https';
    else if (req.url) {
      try {
        secure = new URL(req.url).protocol === 'https:';
      } catch {
        secure = false;
      }
    }
  }

  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL,
    secure,
  };
}
