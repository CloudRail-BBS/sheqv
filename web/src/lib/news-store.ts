import { apiGet, apiGetOr } from './api-client';
import type { PublicUser } from './users';

/** 新闻栏目（后台可增删改，顺序即报刊版面顺序） */
export interface NewsColumn {
  id: string;
  name: string;
  slug: string;
  intro: string;
  sort: number;
  /** 已发布的新闻条数 */
  count: number;
}

/** 一条新闻 */
export interface NewsArticle {
  id: string;
  columnId: string | null;
  columnName: string | null;
  columnSlug: string | null;
  title: string;
  summary: string;
  body: string;
  cover: string;
  author: string;
  source: string;
  published: boolean;
  /** 毫秒时间戳 */
  publishedAt: number;
}

export async function listNewsColumns(): Promise<NewsColumn[]> {
  const d = await apiGetOr<{ items: NewsColumn[] }>('/api/v1/news/columns', { items: [] });
  return d.items ?? [];
}

export async function listNews(opts?: {
  column?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<NewsArticle[]> {
  const q = new URLSearchParams();
  if (opts?.column) q.set('column', opts.column);
  if (opts?.from) q.set('from', opts.from);
  if (opts?.to) q.set('to', opts.to);
  if (opts?.limit) q.set('limit', String(opts.limit));
  const suffix = q.toString() ? `?${q}` : '';
  const d = await apiGetOr<{ items: NewsArticle[] }>(`/api/v1/news${suffix}`, { items: [] });
  return d.items ?? [];
}

export async function getNews(id: string): Promise<NewsArticle | null> {
  try {
    const d = await apiGet<{ item: NewsArticle }>(`/api/v1/news/${id}`);
    return d.item ?? null;
  } catch {
    return null;
  }
}

/**
 * 报刊导出是受限动作：管理员天然通过，其他账号看身份组里有没有 `news.export`。
 * 页面要在服务端先判一次，不能只靠隐藏按钮。
 */
export function canExportPaper(user: PublicUser | null): boolean {
  if (!user) return false;
  return Boolean(user.isAdmin || user.permissions?.includes('news.export'));
}

/** 2026.11.05 —— 报刊版式用点分日期 */
export function newsDay(ts: number): string {
  const d = new Date(ts);
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}.${get('month')}.${get('day')}`;
}

/** 11 月 5 日 —— 列表里读起来轻一点 */
export function newsStamp(ts: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'long',
    day: 'numeric',
  }).format(new Date(ts));
}

/** 今天的 YYYY-MM-DD（上海时区），给日期输入框做默认值 */
export function shanghaiDay(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts; // en-CA 就是 YYYY-MM-DD
}
