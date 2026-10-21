import { MATCHES, MATCH_STATUS_LABEL } from './data';
import { listNotifications } from './forum-store';
import type { PublicUser } from './users';

/**
 * 站内信聚合。
 *
 * 两个来源：
 *  - 别人在我帖子下的评论（有时间戳，可判未读）
 *  - 待我确认 / 有争议的比赛（没有时间戳，恒为"待处理"，不计入未读数）
 *
 * 未读的判定基准是 users.json 里的 notifReadAt，按账号存，换设备一致。
 */

export interface Note {
  id: string;
  kind: 'comment' | 'match';
  /** 列表主文案 */
  title: string;
  /** 副文案 */
  text: string;
  at: number;
  href: string;
  unread: boolean;
  badge?: string;
}

export interface NotificationFeed {
  comments: Note[];
  pending: Note[];
  /** 未读评论数 */
  unread: number;
}

export async function getNotifications(user: PublicUser | null): Promise<NotificationFeed> {
  const readAt = user?.notifReadAt ?? 0;

  // 自己发的评论不通知自己
  const comments = await listNotifications(user?.nickname ?? undefined);

  const pendingMatches = MATCHES.filter((m) => m.status === 'submitted' || m.status === 'disputed');

  const commentNotes: Note[] = comments.slice(0, 30).map((c) => ({
    id: c.id,
    kind: 'comment',
    title: c.author,
    text: c.text,
    at: c.at,
    href: c.href,
    unread: c.at > readAt,
  }));

  const pendingNotes: Note[] = pendingMatches.map((m) => ({
    id: `match:${m.id}`,
    kind: 'match',
    title: m.title,
    text: '等待我确认结果',
    at: 0,
    href: `/matches/${m.id}`,
    unread: false,
    badge: MATCH_STATUS_LABEL[m.status],
  }));

  return {
    comments: commentNotes,
    pending: pendingNotes,
    unread: commentNotes.filter((n) => n.unread).length,
  };
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
