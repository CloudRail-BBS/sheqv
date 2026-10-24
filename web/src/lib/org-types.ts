/**
 * 公会 / 战队的**纯类型与纯函数**。
 *
 * 客户端组件只能引这个文件：`orgs.ts` 里有 `api-client`（依赖 next/headers），
 * 打进客户端 bundle 会直接构建失败。
 */

export type OrgKind = 'guild' | 'team';
export type GameKey = 'minecraft' | 'roblox' | 'rusted_warfare';

export const GAMES: { key: GameKey; label: string; short: string }[] = [
  { key: 'minecraft', label: '我的世界', short: 'MC' },
  { key: 'roblox', label: 'Roblox', short: 'RBX' },
  { key: 'rusted_warfare', label: '铁锈战争', short: 'RW' },
];

export const KIND_LABEL: Record<OrgKind, string> = {
  guild: '公会',
  team: '战队',
};

export const GAME_LABEL: Record<string, string> = Object.fromEntries(
  GAMES.map((g) => [g.key, g.label]),
);

export function gameLabel(key: string): string {
  return GAME_LABEL[key] ?? key;
}

export function gameShort(key: string): string {
  return GAMES.find((g) => g.key === key)?.short ?? '?';
}

/** 徽章配色：MC 走绿色调，其余走蓝色调，未识别回落灰 */
export function gameBadgeClass(key: string): string {
  if (key === 'minecraft') return 'badge badge-mc';
  if (key === 'roblox') return 'badge badge-rw';
  return 'badge';
}

export const STATUSES: { key: string; label: string }[] = [
  { key: 'recruiting', label: '招募中' },
  { key: 'training', label: '训练中' },
  { key: 'rest', label: '休赛' },
];

export const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUSES.map((s) => [s.key, s.label]),
);

export function statusLabel(key: string): string {
  return STATUS_LABEL[key] ?? key;
}

export interface Org {
  id: string;
  kind: OrgKind;
  name: string;
  tag: string;
  game: GameKey;
  intro: string;
  owner: string;
  ownerId?: string;
  status: string;
  points: number;
  wins: number;
  losses: number;
  members: number;
  /** 0–1，没有比赛时为 0 */
  winRate: number;
  createdAt: number;
}

export function played(o: Pick<Org, 'wins' | 'losses'>): number {
  return o.wins + o.losses;
}

/** 没有场次就显示「—」，别把 0% 当成真的全败 */
export function winRateText(o: Pick<Org, 'wins' | 'losses' | 'winRate'>): string {
  return played(o) > 0 ? `${Math.round(o.winRate * 100)}%` : '—';
}

export function fmtDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** 名次配色，前三名单独高亮 */
export function rankClass(index: number): string {
  return index === 0 ? 'top1' : index === 1 ? 'top2' : index === 2 ? 'top3' : '';
}

/** 分享图需要的最小字段集；由榜单页在服务端摊平后传给客户端按钮 */
export interface ShareRow {
  rank: number;
  name: string;
  tag: string;
  game: string;
  points: number;
  wins: number;
  losses: number;
  winRate: number;
  members: number;
}

export function toShareRow(org: Org, rank: number, shortGame: string): ShareRow {
  return {
    rank,
    name: org.name,
    tag: org.tag,
    game: shortGame,
    points: org.points,
    wins: org.wins,
    losses: org.losses,
    winRate: org.winRate,
    members: org.members,
  };
}
