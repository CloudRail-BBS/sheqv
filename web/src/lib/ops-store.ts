import { cache } from 'react';
import { apiGetOr } from './api-client';

/**
 * 运营面板的数据。
 *
 * 只有一项：`/api/v1/ops/summary`。它比 `/api/v1/admin/overview` 多的只是
 * 社区侧的存量与 7 天增量（用户 / 帖子 / 评论 / 点赞 / 资源 / 联机大厅…），
 * 待办队列复用同一份结构。
 */

export interface OpsCounts {
  users: number;
  usersNew: number;
  posts: number;
  postsNew: number;
  comments: number;
  commentsNew: number;
  likes: number;
  resources: number;
  servers: number;
  matches: number;
  guilds: number;
  teams: number;
}

export interface OpsQueue {
  key: string;
  label: string;
  href: string;
  count: number;
  /** 积压最久一条的时间（毫秒） */
  oldest: number | null;
}

export interface OpsSummary {
  counts: OpsCounts;
  queues: OpsQueue[];
}

const EMPTY: OpsSummary = {
  counts: {
    users: 0,
    usersNew: 0,
    posts: 0,
    postsNew: 0,
    comments: 0,
    commentsNew: 0,
    likes: 0,
    resources: 0,
    servers: 0,
    matches: 0,
    guilds: 0,
    teams: 0,
  },
  queues: [],
};

/** 同一次请求里外壳与页面都要用，`cache()` 只发一次 */
export const getOpsSummary = cache(async (): Promise<OpsSummary> => {
  const d = await apiGetOr<{ counts?: OpsCounts; queues?: OpsQueue[] }>(
    '/api/v1/ops/summary',
    {},
  );
  return {
    counts: { ...EMPTY.counts, ...(d.counts ?? {}) },
    queues: d.queues ?? [],
  };
});

/** 待办总量：概览与导航角标用 */
export function pendingTotal(s: OpsSummary): number {
  return s.queues.reduce((n, q) => n + q.count, 0);
}
