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
  /** 展示位置：home / resources / both */
  placement: string;
  order: number;
}

export async function listSlides(opts?: {
  activeOnly?: boolean;
  /** 只取某个位置（both 两边都会出现）；不传就是全部 */
  placement?: 'home' | 'resources';
}): Promise<Slide[]> {
  const user = await getCurrentUser();
  const admin = Boolean(user?.isAdmin);
  const qs = !admin && opts?.placement ? `?placement=${opts.placement}` : '';
  const path = admin ? '/api/v1/admin/slides' : `/api/v1/slides${qs}`;
  const d = await apiGetOr<{ items: Slide[] }>(path, { items: [] });
  let items = d.items;
  if (opts?.activeOnly) items = items.filter((s) => s.active);
  // 管理员拿到的是全量（含停用的），位置要在这里自己筛
  if (opts?.placement) {
    items = items.filter((s) => s.placement === opts.placement || s.placement === 'both');
  }
  return items;
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
