import { createHash } from 'node:crypto';
import { config } from './config';
import { getSettings } from './settings';

/**
 * 爱发电（afdian.com）开放 API 客户端。
 *
 * 鉴权：POST 表单 `user_id` + `params`(JSON 字符串) + `ts`(秒) + `sign`
 *       sign = md5(token + "params" + params + "ts" + ts + "user_id" + user_id)
 *
 * 只依赖 user_id + token 两个变量，不要求 OAuth，适合自托管。
 * 文档：https://afdian.com/dashboard/dev（开放平台 → API）
 */

export interface AfdianUser {
  user_id?: string;
  name?: string;
  avatar?: string;
}

export interface AfdianSponsor {
  sponsor_plans?: unknown[];
  current_plan?: { plan_id?: string; plan_title?: string; plan_price?: string } | null;
  all_sum_amount?: string;
  create_time?: number;
  last_pay_time?: number;
  user?: AfdianUser;
}

export interface AfdianSponsorPage {
  total_count?: number;
  total_page?: number;
  list?: AfdianSponsor[];
}

interface AfdianResponse<T> {
  ec?: number;
  em?: string;
  data?: T;
}

export class AfdianError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AfdianError';
  }
}

export async function afdianConfigured(): Promise<boolean> {
  const s = await getSettings();
  return Boolean(s.afdianUserId && s.afdianToken);
}

/** 公开主页地址：没配就用 user_id 拼一个默认值 */
export async function afdianPageUrl(): Promise<string> {
  const s = await getSettings();
  return s.afdianPageUrl || (s.afdianUserId ? `https://afdian.com/a/${s.afdianUserId}` : '');
}

export function signParams(params: string, ts: string, userId: string, token: string): string {
  return createHash('md5').update(`${token}params${params}ts${ts}user_id${userId}`).digest('hex');
}

async function request<T>(path: string, params: Record<string, unknown>): Promise<T> {
  const settings = await getSettings();
  const userId = settings.afdianUserId;
  const token = settings.afdianToken;

  if (!userId || !token) {
    throw new AfdianError('not_configured', '未配置爱发电 user_id / token（可在后台「站点设置」填写）');
  }
  const body = JSON.stringify(params);
  const ts = String(Math.floor(Date.now() / 1000));

  const form = new URLSearchParams({
    user_id: userId,
    params: body,
    ts,
    sign: signParams(body, ts, userId, token),
  });

  let res: Response;
  try {
    res = await fetch(`https://afdian.com${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new AfdianError('unreachable', '连不上爱发电接口（网络或超时）');
  }

  if (!res.ok) {
    throw new AfdianError('http_error', `爱发电返回 HTTP ${res.status}`);
  }

  const data = (await res.json().catch(() => null)) as AfdianResponse<T> | null;
  if (!data) throw new AfdianError('bad_response', '爱发电返回的不是合法 JSON');
  if (data.ec !== 200) {
    // em 是爱发电给的错误说明，直接透出便于排查（多半是 token 错或权限没开）
    throw new AfdianError('api_error', data.em || `爱发电接口返回 ec=${data.ec}`);
  }

  return (data.data ?? {}) as T;
}

/** 连通性与鉴权自检 */
export async function ping(): Promise<boolean> {
  await request<Record<string, unknown>>('/api/open/misc/ping', {});
  return true;
}

/** 拉取赞助者列表（自动翻页，最多 maxPages 页） */
export async function fetchSponsors(maxPages = 10): Promise<{
  list: AfdianSponsor[];
  totalCount: number;
  pages: number;
}> {
  const perPage = 20;
  const all: AfdianSponsor[] = [];
  let totalPage = 1;
  let totalCount = 0;

  for (let page = 1; page <= maxPages; page++) {
    const data = await request<AfdianSponsorPage>('/api/open/query-sponsor', { page, per_page: perPage });

    const list = Array.isArray(data.list) ? data.list : [];
    all.push(...list);

    totalPage = Number(data.total_page ?? 1) || 1;
    totalCount = Number(data.total_count ?? all.length) || all.length;

    if (page >= totalPage || list.length === 0) break;
  }

  return { list: all, totalCount, pages: Math.min(totalPage, maxPages) };
}
