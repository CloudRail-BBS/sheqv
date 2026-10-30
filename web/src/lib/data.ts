export type GameKey = 'mc' | 'rw';

export const GAME_LABEL: Record<GameKey, string> = { mc: 'Minecraft', rw: 'Rusted Warfare' };

export interface ResourceItem {
  id: string;
  title: string;
  game: GameKey;
  category: string;
  tags: string[];
  author: string;
  authorGuild: string;
  downloads: number;
  rating: number;
  sizeBytes: number;
  version: string;
  updatedAt: string;
  summary: string;
  license: 'CC BY-NC' | 'MIT' | '作者保留' | 'GPL-3.0';
  versions: { version: string; date: string; note: string }[];
}

export const RESOURCES: ResourceItem[] = [];

export type MatchStatus = 'pending_accept' | 'locked' | 'live' | 'submitted' | 'disputed' | 'confirmed';

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  pending_accept: '待接受',
  locked: '名单已锁定',
  live: '进行中',
  submitted: '待确认',
  disputed: '争议中',
  confirmed: '已确认',
};

export interface TimelineEvent {
  at: string;
  title: string;
  detail: string;
  actor: string;
  state: 'done' | 'active' | 'waiting';
}

export interface MatchItem {
  id: string;
  title: string;
  game: GameKey;
  format: string;
  status: MatchStatus;
  guildA: { name: string; tag: string; score?: number; submitted?: boolean };
  guildB: { name: string; tag: string; score?: number; submitted?: boolean };
  scheduledAt: string;
  maps: string[];
  rosterLockedAt?: string;
  deadline: string;
  rounds?: { map: string; scoreA: number; scoreB: number }[];
  timeline: TimelineEvent[];
}

export const MATCHES: MatchItem[] = [];

export interface GuildItem {
  tag: string;
  name: string;
  members: number;
  power: number;
  winRate: number;
  intro: string;
}

export const GUILDS: GuildItem[] = [];

export interface TeamItem {
  id: string;
  name: string;
  tag: string;
  guild: string;
  game: GameKey;
  members: number;
  roster: string[];
  wins: number;
  losses: number;
  winRate: number;
  intro: string;
  status: '训练中' | '招募中' | '休赛';
}

export const TEAMS: TeamItem[] = [];

export interface PlayerItem {
  id: string;
  name: string;
  guild: string;
  team: string;
  matches: number;
  wins: number;
  rate: number;
  points: number;
  trend: 'up' | 'down' | 'flat';
}

export const PLAYERS: PlayerItem[] = [];

export interface FeedItem {
  id: string;
  author: string;
  /** 作者账号 id（老数据没有，回落到昵称匹配） */
  authorId?: string;
  guild: string;
  time: string;
  title?: string;
  body: string;
  tags: string[];
  likes: number;
  comments: number;
  /** 浏览数 */
  views?: number;
  pinned?: boolean;
  kind?: 'post' | 'match' | 'resource';
}

export const FEED: FeedItem[] = [];

export interface Announcement {
  id: string;
  title: string;
  kind: '规则' | '版本' | '活动' | '系统';
  date: string;
  body: string;
  views: number;
  pinned?: boolean;
}

export const ANNOUNCEMENTS: Announcement[] = [];
