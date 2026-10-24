/** 开发团队的纯类型（客户端可引） */

export interface DevMember {
  userId: string;
  nickname: string;
  role: 'owner' | 'member' | string;
  developer: boolean;
  joinedAt: number;
}

export interface DevTeam {
  id: string;
  name: string;
  tag: string;
  description: string;
  color: string;
  game: string;
  ownerId: string;
  owner: string;
  memberCount: number;
  resourceCount: number;
  downloads: number;
  likes: number;
  createdAt: number;
  members?: DevMember[];
}

export const DEV_TEAM_GAMES = [
  { key: '', label: '跨游戏' },
  { key: 'minecraft', label: 'Minecraft' },
  { key: 'rusted_warfare', label: 'Rusted Warfare' },
] as const;

export function devTeamGameLabel(game: string): string {
  return DEV_TEAM_GAMES.find((g) => g.key === game)?.label ?? '跨游戏';
}

export function devTeamScore(t: DevTeam): number {
  return t.resourceCount * 4 + t.downloads + t.likes * 3;
}
