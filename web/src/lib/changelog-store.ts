import { apiGetOr } from './api-client';

/** 后台录入的一条更新日志 */
export interface ChangelogApiItem {
  id: string;
  version: string;
  title: string;
  body: string;
  tag: string;
  published: boolean;
  /** 毫秒时间戳 */
  releasedAt: number;
}

/**
 * 读已发布的更新日志。
 *
 * 后台还没录过时返回空数组——调用方自行回落到 `lib/changelog.ts` 里的内置列表，
 * 这样老站点升级后不会突然变成空白页。
 */
export async function listChangelog(): Promise<ChangelogApiItem[]> {
  const d = await apiGetOr<{ items: ChangelogApiItem[] }>('/api/v1/changelog', { items: [] });
  return d.items ?? [];
}
