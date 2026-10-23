import { cookies } from 'next/headers';

/**
 * 内网 API 客户端：**只允许在服务端使用**（Server Component / Server Action）。
 *
 * 三件事必须在这里统一处理，散落到各模块迟早出错：
 * 1. 带上浏览器 Cookie——会话、`ag_*` 签署全在 Cookie 里，服务端 fetch 不会自动带；
 * 2. 把后端的 `{error, message}` 转成可 `catch` 的异常，页面与 action 才能给出中文提示；
 * 3. `cache: 'no-store'`——站点数据是实时的，缓存交给 Next 的 `cache()` 或页面级 revalidate。
 *
 * 地址来自 `API_BASE`（compose 里是 `http://api:8080`，本机默认 `http://127.0.0.1:8080`）。
 * 不要把这里改成浏览器直连：浏览器应走同源 `/api/*`（nginx 分流或 next.config rewrites）。
 */

const BASE = (process.env.API_BASE || 'http://127.0.0.1:8080').replace(/\/+$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message || code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function cookieHeader(): Promise<string> {
  try {
    const jar = await cookies();
    return jar
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
  } catch {
    // 构建期 / 静态环境下没有请求上下文，按匿名处理
    return '';
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!res.ok) {
    const err = (body ?? {}) as { error?: string; message?: string };
    throw new ApiError(res.status, err.error || `http_${res.status}`, err.message);
  }
  return body as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { cookie: await cookieHeader(), accept: 'application/json' },
    cache: 'no-store',
  });
  return parse<T>(res);
}

export async function apiSend<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      cookie: await cookieHeader(),
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  return parse<T>(res);
}

/**
 * 读接口的兜底：后端没起来时页面不该整页 500。
 * 只用于「缺数据也能渲染空态」的读路径，写路径必须让异常冒出去。
 */
export async function apiGetOr<T>(path: string, fallback: T): Promise<T> {
  try {
    return await apiGet<T>(path);
  } catch (e) {
    console.error(`[api] GET ${path} 失败：`, e instanceof Error ? e.message : e);
    return fallback;
  }
}
