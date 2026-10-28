import { apiGetOr } from './api-client';

/**
 * 徽章（自动达成）。判定在**后端** `achievements.rs`，这里只取结果。
 * 目录仍在前端留一份：个人主页的「未达成」进度条需要它。
 */

export type BadgeTone = 'blue' | 'gold' | 'red' | 'gray';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  tone: BadgeTone;
  /** 后台设置的外观（空 = 用 tone 推导） */
  style?: string;
  effect?: string;
}

export interface EarnedBadge extends Achievement {
  earnedAt?: number;
}

export const CATALOG: Achievement[] = [
  { id: 'founder', name: '创始成员', desc: '站内第一个注册账号', tone: 'gold' },
  { id: 'admin', name: '管理员', desc: '拥有站点管理权限', tone: 'blue' },
  { id: 'first-post', name: '初次发声', desc: '发布第一篇帖子', tone: 'blue' },
  { id: 'writer', name: '笔耕不辍', desc: '累计发布 10 篇帖子', tone: 'blue' },
  { id: 'talker', name: '热心回复', desc: '累计发表 20 条评论', tone: 'blue' },
  { id: 'liked', name: '人气作者', desc: '帖子累计获得 50 个赞', tone: 'blue' },
  { id: 'sponsor', name: '赞助者', desc: '出现在赞助名单中', tone: 'blue' },
  { id: 'veteran', name: '元老', desc: '注册满 30 天', tone: 'gray' },
];

export interface AchievementState {
  earned: EarnedBadge[];
  all: (Achievement & { earned: boolean })[];
}

/** 全站「id:uid / name:昵称 → 徽章」表，列表页一次取回批量渲染 */
export async function getAchievementMap(): Promise<Record<string, EarnedBadge[]>> {
  const d = await apiGetOr<{ map: Record<string, EarnedBadge[]> }>('/api/v1/achievements', {
    map: {},
  });
  return d.map ?? {};
}

export async function getAchievementState(user: {
  id: string;
  nickname: string;
}): Promise<AchievementState> {
  const d = await apiGetOr<AchievementState>(
    `/api/v1/achievements/${encodeURIComponent(user.id)}`,
    {
      earned: [],
      all: CATALOG.map((b) => ({ ...b, earned: false })),
    },
  );
  return d;
}

export function findBadges(
  map: Record<string, EarnedBadge[]> | null | undefined,
  who: { id?: string; name?: string },
  limit = 3,
): EarnedBadge[] {
  if (!map) return [];
  const list =
    (who.id ? map[`id:${who.id}`] : undefined) ?? (who.name ? map[`name:${who.name}`] : undefined) ?? [];
  return list.slice(0, limit);
}
