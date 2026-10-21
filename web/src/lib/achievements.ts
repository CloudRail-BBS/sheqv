import { cache } from 'react';
import { listPosts } from './forum-store';
import { getSnapshot as getSponsorSnapshot } from './sponsor-store';
import { listUsers, type PublicUser } from './users';

/**
 * 徽章系统（自动达成，不需要人工发放）。
 *
 * 和「头衔」区分开：
 *  - 头衔是**身份标签**，一人一个，可自定义，显示在作者名后；
 *  - 徽章是**行为成就**，一人多个，由规则算出来，显示在个人主页与作者卡片。
 *
 * 规则只依赖 users / forum / sponsors 三份数据，读一次就能算出全站，
 * 因此列表页也能批量渲染，不需要给每个作者单独查询。
 */

export type BadgeTone = 'blue' | 'red' | 'gray';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  tone: BadgeTone;
}

export interface EarnedBadge extends Achievement {
  earnedAt?: number;
}

/** 目录：新增徽章只改这里，展示与判定会自动跟上 */
export const CATALOG: Achievement[] = [
  { id: 'founder', name: '创始成员', desc: '站内第一个注册账号', tone: 'red' },
  { id: 'admin', name: '管理员', desc: '拥有站点管理权限', tone: 'red' },
  { id: 'first-post', name: '初次发声', desc: '发布第一篇帖子', tone: 'blue' },
  { id: 'writer', name: '笔耕不辍', desc: '累计发布 10 篇帖子', tone: 'blue' },
  { id: 'talker', name: '热心回复', desc: '累计发表 20 条评论', tone: 'blue' },
  { id: 'liked', name: '人气作者', desc: '帖子累计获得 50 个赞', tone: 'blue' },
  { id: 'sponsor', name: '赞助者', desc: '出现在赞助名单中', tone: 'blue' },
  { id: 'veteran', name: '元老', desc: '注册满 30 天', tone: 'gray' },
];

interface Stats {
  posts: number;
  comments: number;
  likes: number;
}

export interface AchievementState {
  earned: EarnedBadge[];
  /** 全部目录，带是否达成，用于个人主页展示进度 */
  all: (Achievement & { earned: boolean })[];
}

const DAY = 24 * 60 * 60 * 1000;

/** 全站一次读盘，算出「用户 id → 徽章」，同时用昵称建键兼容老数据 */
export const getAchievementMap = cache(async (): Promise<Record<string, EarnedBadge[]>> => {
  const [users, posts, sponsors] = await Promise.all([listUsers(), listPosts(), getSponsorSnapshot()]);

  const stats = new Map<string, Stats>();
  const bump = (key: string, field: keyof Stats, by = 1) => {
    const cur = stats.get(key) ?? { posts: 0, comments: 0, likes: 0 };
    cur[field] += by;
    stats.set(key, cur);
  };

  for (const p of posts) {
    const key = p.authorId ? `id:${p.authorId}` : `name:${p.author}`;
    bump(key, 'posts');
    bump(key, 'likes', p.likes);
    for (const c of p.commentsList) {
      const ckey = c.authorId ? `id:${c.authorId}` : `name:${c.author}`;
      bump(ckey, 'comments');
    }
  }

  const founder = users.slice().sort((a, b) => a.createdAt - b.createdAt)[0];
  const sponsorNames = new Set(sponsors.sponsors.map((s) => s.name));

  const map: Record<string, EarnedBadge[]> = {};
  const now = Date.now();

  for (const u of users) {
    const s = stats.get(`id:${u.id}`) ?? { posts: 0, comments: 0, likes: 0 };
    const earned: EarnedBadge[] = [];
    const has = (id: string) => CATALOG.find((b) => b.id === id)!;

    if (founder && u.id === founder.id) earned.push(has('founder'));
    if (u.role === 'admin') earned.push(has('admin'));
    if (s.posts >= 1) earned.push(has('first-post'));
    if (s.posts >= 10) earned.push(has('writer'));
    if (s.comments >= 20) earned.push(has('talker'));
    if (s.likes >= 50) earned.push(has('liked'));
    if (sponsorNames.has(u.nickname)) earned.push(has('sponsor'));
    if (now - u.createdAt >= 30 * DAY) earned.push(has('veteran'));

    if (!earned.length) continue;
    map[`id:${u.id}`] = earned;
    map[`name:${u.nickname}`] = earned;
  }

  return map;
});

/** 单个用户的完整状态（个人主页用） */
export async function getAchievementState(user: PublicUser): Promise<AchievementState> {
  const map = await getAchievementMap();
  const earned = map[`id:${user.id}`] ?? map[`name:${user.nickname}`] ?? [];
  const ids = new Set(earned.map((e) => e.id));
  return {
    earned,
    all: CATALOG.map((b) => ({ ...b, earned: ids.has(b.id) })),
  };
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
