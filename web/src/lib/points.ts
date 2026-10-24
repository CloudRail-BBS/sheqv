import { apiGetOr } from './api-client';
import type { PointsSnapshot } from './point-types';

/**
 * 积分的**读**接口（仅服务端）。
 * 签到本身是写操作，在客户端组件里直接 POST `/api/v1/points/checkin`。
 */

export * from './point-types';

const EMPTY: PointsSnapshot = {
  points: 0,
  streak: 0,
  todayDone: false,
  nextReward: 10,
  todayEarned: 0,
  log: [],
  rank: [],
  myRank: 0,
  recentDays: [false, false, false, false, false, false, false],
};

export async function getPoints(): Promise<PointsSnapshot> {
  const d = await apiGetOr<{ data: PointsSnapshot }>('/api/v1/points', { data: EMPTY });
  return d.data ?? EMPTY;
}

/** 顶栏只要两个数，单独一个轻量入口，避免整页拿全量流水 */
export async function getPointsChip(): Promise<{ points: number; todayDone: boolean }> {
  const data = await getPoints();
  return { points: data.points, todayDone: data.todayDone };
}
