import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { getSettings } from './settings';

/**
 * 对外地址。
 *
 * 不再依赖 `PUBLIC_BASE_URL`：后台没填就用请求头推导（反代后读 X-Forwarded-*），
 * 这样"零配置启动"也能量出正确的短链与 ws 地址。
 * 后台填了就以后台为准（多域名 / 反代改写 Host 时用得上）。
 */

function fromHost(host: string, proto: string): string {
  const p = proto || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${p}://${host}`;
}

export function baseUrlFromHeaders(h: Headers): string {
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:8900';
  const proto = h.get('x-forwarded-proto') || '';
  return fromHost(host.split(',')[0].trim(), proto.split(',')[0].trim());
}

/** 请求是否走 https（决定 Cookie 要不要 Secure） */
export function isSecureRequest(req: NextRequest): boolean {
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim();
  if (proto) return proto === 'https';
  try {
    return new URL(req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 优先后台设置的对外地址；没设就按当前请求推导。
 * 传入 Headers / NextRequest 都可以；RSC 里不传则用 next/headers。
 */
export async function getBaseUrl(input?: NextRequest | Headers): Promise<string> {
  const settings = await getSettings();
  if (settings.publicBaseUrl) return settings.publicBaseUrl.replace(/\/+$/, '');

  if (input) {
    return baseUrlFromHeaders(input instanceof Headers ? input : input.headers);
  }

  return baseUrlFromHeaders(await headers());
}

/** http(s) → ws(s) */
export function wsFrom(httpUrl: string): string {
  return httpUrl.replace(/^http/i, 'ws');
}
