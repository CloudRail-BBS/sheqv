import { apiGetOr } from './api-client';
import type { PublicUser } from './users';

/**
 * 站内信聚合。评论通知由后端算好，`pending`（待确认比赛）等约战落库后再补，
 * 当前恒为空数组。
 */

export interface Note {
  id: string;
  kind: 'comment' | 'match';
  title: string;
  text: string;
  at: number;
  href: string;
  unread: boolean;
  badge?: string;
}

export interface NotificationFeed {
  comments: Note[];
  pending: Note[];
  unread: number;
}

export async function getNotifications(user: PublicUser | null): Promise<NotificationFeed> {
  if (!user) return { comments: [], pending: [], unread: 0 };

  const d = await apiGetOr<{ items: Note[]; unread: number }>('/api/v1/notifications', {
    items: [],
    unread: 0,
  });
  return { comments: d.items ?? [], pending: [], unread: d.unread ?? 0 };
}

/** 面板里合并展示：待处理在前，其余按时间倒序 */
export function flatten(feed: NotificationFeed, limit = 8): Note[] {
  return [...feed.pending, ...feed.comments].slice(0, limit);
}

export function timeAgo(at: number, now = Date.now()): string {
  if (!at) return '';
  const diff = Math.max(0, now - at);
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(at).toISOString().slice(0, 10);
}
