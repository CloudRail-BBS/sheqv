import { apiGetOr } from './api-client';
import { getCurrentUser } from './current-user';

/**
 * 首页轮播的读接口。管理员拿到全部（含停用），其他人只拿启用中的。
 * 新站没有轮播时返回空数组——首页据此不渲染轮播区。
 */

export interface Slide {
  id: string;
  kicker: string;
  title: string;
  desc: string;
  cta: string;
  href: string;
  bgColor: string;
  bgImage: string;
  textTone: 'light' | 'dark';
  active: boolean;
  order: number;
}

export async function listSlides(opts?: { activeOnly?: boolean }): Promise<Slide[]> {
  const user = await getCurrentUser();
  const path = user?.isAdmin ? '/api/v1/admin/slides' : '/api/v1/slides';
  const d = await apiGetOr<{ items: Slide[] }>(path, { items: [] });
  return opts?.activeOnly ? d.items.filter((s) => s.active) : d.items;
}

/** 只放行站内路径与 http(s) */
export function safeHref(v: string): string {
  const s = v.trim();
  if (!s) return '/';
  if (s.startsWith('/') || /^https?:\/\//i.test(s)) return s;
  return '/';
}

export function validateSlide(input: { title?: string; desc?: string; cta?: string }): string | null {
  const title = (input.title ?? '').trim();
  if (title.length < 2 || title.length > 48) return '标题需 2–48 字';
  if ((input.desc ?? '').length > 160) return '描述不超过 160 字';
  if ((input.cta ?? '').length > 12) return '按钮文案不超过 12 字';
  return null;
}
