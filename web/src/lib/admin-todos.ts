import { cache } from 'react';
import { apiGetOr } from './api-client';

/**
 * 后台待办与总览。
 *
 * 外壳（侧栏角标、顶栏待办数）和首页都要用同一份数据，所以用 `cache()` 包一层：
 * 同一次请求里两个 Server Component 只会真正 fetch 一次。
 */

export type TodoPriority = 'high' | 'normal' | 'low';

export interface AdminTodo {
  id: string;
  title: string;
  note: string;
  priority: TodoPriority;
  /** `YYYY-MM-DD`；没有截止日就是 null */
  dueDate: string | null;
  status: 'open' | 'done';
  creator: string | null;
  createdAt: number;
  doneAt: number | null;
}

export interface TodoStats {
  open: number;
  overdue: number;
  doneToday: number;
  doneTotal: number;
}

export interface QueueItem {
  key: string;
  label: string;
  href: string;
  count: number;
  /** 积压最久一条的时间（毫秒） */
  oldest: number | null;
}

export interface RedisState {
  /** 是否配了 REDIS_URL */
  configured: boolean;
  /** 是否真的连上了（连不上会降级进程内） */
  connected: boolean;
  note: string;
}

export interface AdminOverview {
  queues: QueueItem[];
  todos: TodoStats;
  pending: number;
  /** 运行环境；老版本后端可能没有，读取时兜底 */
  system?: { redis: RedisState };
}

const EMPTY_STATS: TodoStats = { open: 0, overdue: 0, doneToday: 0, doneTotal: 0 };

/** 侧栏角标 + 顶栏待办数 */
export const getAdminOverview = cache(async (): Promise<AdminOverview> => {
  const d = await apiGetOr<AdminOverview>('/api/v1/admin/overview', {
    queues: [],
    todos: EMPTY_STATS,
    pending: 0,
  });
  return {
    queues: d.queues ?? [],
    todos: d.todos ?? EMPTY_STATS,
    pending: d.pending ?? 0,
    // 解构时要带上，漏了后台就看不到 Redis 状态
    system: d.system,
  };
});

/** 首页待办清单（首屏由服务端给，之后客户端自己刷） */
export const getAdminTodos = cache(
  async (): Promise<{ items: AdminTodo[]; stats: TodoStats }> => {
    const d = await apiGetOr<{ items: AdminTodo[]; stats: TodoStats }>(
      '/api/v1/admin/todos',
      { items: [], stats: EMPTY_STATS },
    );
    return { items: d.items ?? [], stats: d.stats ?? EMPTY_STATS };
  },
);
