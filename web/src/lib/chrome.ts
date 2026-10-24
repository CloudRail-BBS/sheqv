import { cache } from 'react';
import { apiGetOr } from './api-client';
import type { Note } from './notifications';
import type { PublicUser } from './users';

/**
 * 顶栏一次取齐：站内信 + 积分胶囊。
 *
 * 之前 layout 先请求站内信、再请求整份积分快照，串行两跳；
 * 合并后登录用户每页少一跳，也不再为了两个数字跑流水与榜单。
 */
export interface Chrome {
  items: Note[];
  unread: number;
  points: number;
  todayDone: boolean;
}

const EMPTY: Chrome = { items: [], unread: 0, points: 0, todayDone: false };

export const getChrome = cache(async (user: PublicUser | null): Promise<Chrome> => {
  if (!user) return EMPTY;

  const data = await apiGetOr<{
    notifications?: { items?: Note[]; unread?: number };
    points?: { points?: number; todayDone?: boolean };
  }>('/api/v1/me/chrome', {});

  return {
    items: data.notifications?.items ?? [],
    unread: data.notifications?.unread ?? 0,
    points: data.points?.points ?? 0,
    todayDone: data.points?.todayDone ?? false,
  };
});
