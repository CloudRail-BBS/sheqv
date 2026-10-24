import { cache } from 'react';
import { apiGetOr } from './api-client';
import type { RewardsSnapshot } from './reward-types';

/** 福利中心读接口；拆卡 / 兑换 / 抽奖都在客户端直接打 API。 */
export const getRewards = cache(async (): Promise<RewardsSnapshot> => {
  const data = await apiGetOr<RewardsSnapshot>('/api/v1/rewards', {
    cards: [],
    history: [],
    prizes: [],
    draws: [],
    points: 0,
    cost: 20,
  });
  return {
    cards: data.cards ?? [],
    history: data.history ?? [],
    prizes: data.prizes ?? [],
    draws: data.draws ?? [],
    points: data.points ?? 0,
    cost: data.cost ?? 20,
  };
});
