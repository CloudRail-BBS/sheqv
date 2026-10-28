import { apiGetOr } from './api-client';

export type SubmissionStatus = 'pending' | 'published' | 'rejected' | 'hidden';

export interface Submission {
  id: string;
  kind: 'post' | 'resource';
  title: string;
  status: SubmissionStatus;
  rejectReason?: string | null;
  createdAt: number;
  reviewedAt?: number | null;
  href: string;
}

/**
 * 我的投稿（帖子 + 资源）。
 *
 * 与公开列表的区别：这里包含 `pending` / `rejected`，是用户唯一能看到
 * 「自己那条卡在哪」的地方；详情页也复用同一套状态与驳回原因。
 */
export async function listMySubmissions(): Promise<{
  pendingCount: number;
  items: Submission[];
}> {
  const data = await apiGetOr<{
    pendingCount: number;
    posts: Submission[];
    resources: Submission[];
  }>('/api/v1/me/submissions', { pendingCount: 0, posts: [], resources: [] });

  const items = [...(data.posts ?? []), ...(data.resources ?? [])].sort(
    (a, b) => b.createdAt - a.createdAt,
  );
  return { pendingCount: data.pendingCount ?? 0, items };
}
