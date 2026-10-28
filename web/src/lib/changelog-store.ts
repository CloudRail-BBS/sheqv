import { apiGetOr } from './api-client';

/** 更新日志条目（前台只读已发布，后台读全部） */
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

export async function listChangelog(): Promise<ChangelogApiItem[]> {
  const d = await apiGetOr<{ items: ChangelogApiItem[] }>('/api/v1/changelog', { items: [] });
  return d.items ?? [];
}
