import { apiGetOr } from './api-client';
import type { GameKey, Org, OrgKind } from './org-types';

/**
 * 公会 / 战队的**读**接口（仅服务端）。
 *
 * 两个资源各自独立：没有「取某公会的战队」这种调用，因为战队不属于公会。
 * 创建与修改在客户端组件里直接打接口。
 */

export * from './org-types';

function qs(game?: string): string {
  return game ? `?game=${encodeURIComponent(game)}` : '';
}

export async function listOrgs(kind: OrgKind, game?: string): Promise<Org[]> {
  const path = kind === 'guild' ? '/api/v1/guilds' : '/api/v1/teams';
  const d = await apiGetOr<{ items: Org[] }>(`${path}${qs(game)}`, { items: [] });
  return d.items;
}

export async function getOrg(kind: OrgKind, id: string): Promise<Org | null> {
  const path = kind === 'guild' ? '/api/v1/guilds' : '/api/v1/teams';
  const d = await apiGetOr<{ item: Org | null }>(`${path}/${encodeURIComponent(id)}`, {
    item: null,
  });
  return d.item;
}

export interface LeaderboardData {
  game?: GameKey;
  guilds: Org[];
  teams: Org[];
}

export async function leaderboard(game?: string): Promise<LeaderboardData> {
  return apiGetOr<LeaderboardData>(`/api/v1/leaderboard${qs(game)}`, { guilds: [], teams: [] });
}

/** 在某张榜里找自己的名次（从 1 开始；找不到返回 null） */
export function rankOf(items: Org[], id: string): number | null {
  const i = items.findIndex((o) => o.id === id);
  return i < 0 ? null : i + 1;
}
