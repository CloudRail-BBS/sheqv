import { apiGetOr } from './api-client';
import { getCurrentUser } from './current-user';

/**
 * 公告的读接口。库里的 `kind` 存英文（rule/version/activity/system），
 * 前端展示统一用中文标签——**不要在组件里直接用英文值**。
 */

export type AnnouncementKind = '规则' | '版本' | '活动' | '系统';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  kind: AnnouncementKind;
  pinned: boolean;
  published: boolean;
  createdAt: number;
  updatedAt: number;
}

const KIND_LABEL: Record<string, AnnouncementKind> = {
  rule: '规则',
  version: '版本',
  activity: '活动',
  system: '系统',
};

type Raw = Omit<Announcement, 'kind'> & { kind: string };

const adapt = (a: Raw): Announcement => ({ ...a, kind: KIND_LABEL[a.kind] ?? '系统' });

/** 管理员拿到全部（含草稿），其他人只拿已发布 */
export async function listAnnouncements(opts?: {
  publishedOnly?: boolean;
  limit?: number;
}): Promise<Announcement[]> {
  const user = await getCurrentUser();
  const path = user?.isAdmin ? '/api/v1/admin/announcements' : '/api/v1/announcements';
  const d = await apiGetOr<{ items: Raw[] }>(path, { items: [] });

  let list = d.items.map(adapt);
  if (opts?.publishedOnly) list = list.filter((a) => a.published);
  if (opts?.limit) list = list.slice(0, opts.limit);
  return list;
}

export async function getAnnouncement(id: string): Promise<Announcement | null> {
  const user = await getCurrentUser();
  if (user?.isAdmin) {
    return (await listAnnouncements()).find((a) => a.id === id) ?? null;
  }
  const d = await apiGetOr<{ item: Raw | null }>(`/api/v1/announcements/${encodeURIComponent(id)}`, {
    item: null,
  });
  return d.item ? adapt(d.item) : null;
}

/** 与后端同一套文案；后台表单先挡一层 */
export function validateAnnouncement(input: { title?: string; body?: string }): string | null {
  const title = (input.title ?? '').trim();
  const body = (input.body ?? '').trim();
  if (title.length < 2 || title.length > 60) return '标题需 2–60 字';
  if (body.length < 4) return '正文至少 4 字';
  if (body.length > 20000) return '正文不超过 20000 字';
  return null;
}
