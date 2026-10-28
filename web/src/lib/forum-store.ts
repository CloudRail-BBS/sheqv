import { apiGetOr } from './api-client';

/**
 * 论坛的**读**接口。发帖 / 评论 / 点赞由客户端组件直接打 `/api/v1/posts**`，
 * 不再经过这里。
 *
 * 相对时间（「3 分钟前」）按边界约定由前端算——后端只给 `createdAt` 毫秒。
 */

export interface CommentItem {
  id: string;
  author: string;
  authorId?: string;
  body: string;
  /** 楼层号：楼主是 1，第一条回复是 2 */
  floor: number;
  at: number;
}

export interface PostView {
  id: string;
  author: string;
  authorId?: string;
  guild: string;
  time: string;
  title?: string;
  body: string;
  tags: string[];
  likes: number;
  comments: number;
  commentsList: CommentItem[];
  createdAt: number;
  isNew?: boolean;
  /** 预留：库里暂没有置顶字段 */
  pinned?: boolean;
  /** pending / published / rejected；非 published 的只有作者和审核人能看到 */
  status?: PostStatus;
  /** 未通过审核时的原因 */
  rejectReason?: string;
  href: string;
}

export type PostStatus = 'pending' | 'published' | 'rejected';

const relTime = (ts: number): string => {
  const minutes = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
};

type RawPost = Omit<PostView, 'time'> & { time?: string };

function adapt(p: RawPost): PostView {
  return { ...p, time: p.time ?? relTime(p.createdAt) };
}

export async function listPosts(query?: string): Promise<PostView[]> {
  const qs = query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
  const d = await apiGetOr<{ items: RawPost[] }>(`/api/v1/posts${qs}`, { items: [] });
  return d.items.map(adapt);
}

export async function getPost(id: string): Promise<PostView | null> {
  const d = await apiGetOr<{ post: RawPost | null }>(`/api/v1/posts/${encodeURIComponent(id)}`, {
    post: null,
  });
  return d.post ? adapt(d.post) : null;
}

export async function forumStats(): Promise<{ posts: number; comments: number; likes: number }> {
  return apiGetOr('/api/v1/stats', { posts: 0, comments: 0, likes: 0 });
}

/** 与后端同一套文案，表单在客户端先挡一层，避免白跑一次请求 */
export function validatePost(input: { title?: string; body?: string }): string | null {
  const title = (input.title ?? '').trim();
  const body = (input.body ?? '').trim();
  if (title.length < 4 || title.length > 60) return '标题需 4–60 字';
  if (body.length < 10) return '正文至少 10 字';
  if (body.length > 8000) return '正文不超过 8000 字';
  return null;
}
