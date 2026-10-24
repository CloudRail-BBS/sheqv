/**
 * 联机大厅的**纯类型与纯函数**。
 *
 * 单独一层是为了客户端组件能安全引用：`server-store.ts` 会 import `api-client`，
 * 而后者依赖 `next/headers`，被打进客户端 bundle 会直接构建失败。
 */

export type ServerKind = 'minecraft' | 'rusted_warfare';
export type ProbeState = 'unknown' | 'online' | 'offline';

export interface GameServer {
  id: string;
  kind: ServerKind;
  name: string;
  /** MC 是主机名/IP，RW 是中转站根地址 */
  host: string;
  port: number;
  edition: string;
  description: string;
  tags: string[];
  owner: string;
  ownerId?: string;
  visibility: 'public' | 'hidden';
  probeState: ProbeState;
  probeError: string;
  playersOnline: number;
  playersMax: number;
  versionName: string;
  motd: string;
  latencyMs: number;
  probedAt?: number;
  createdAt: number;
}

export interface RelayRoom {
  id: string;
  displayId: string;
  players: number;
  connections: number;
  status: string;
  host: string;
  map: string;
  isMod: boolean;
  publicRoom: boolean;
  joinLink: string;
  createdAt: number;
  lastActiveAt: number;
}

export interface RelayNode {
  url: string;
  name: string;
  role: string;
  roomCount: number;
  updatedAt: number;
  fetchedAt: number;
  ok: boolean;
  error: string;
  rooms: RelayRoom[];
}

export interface RelaySnapshot {
  nodes: RelayNode[];
  totalRooms: number;
  totalPlayers: number;
}

/** MC 显示成 `host:port`；RW 的中转站地址自带端口，直接展示 */
export function addressOf(s: GameServer): string {
  return s.kind === 'minecraft' ? `${s.host}:${s.port}` : s.host;
}

export const STATE_LABEL: Record<ProbeState, string> = {
  online: '在线',
  offline: '离线',
  unknown: '待探测',
};

/** 中转站给的房间状态是英文枚举，这里只翻译玩家看得懂的那几个 */
const ROOM_STATUS: Record<string, string> = {
  ingame: '游戏中',
  battleroom: '准备中',
  waiting: '等待中',
  closed: '已关闭',
};

export function roomStatusLabel(status: string): string {
  return ROOM_STATUS[status] ?? (status || '未知');
}

/** 相对时间，和列表页保持同一套口径 */
export function ago(ts: number, now = Date.now()): string {
  if (!ts) return '';
  const min = Math.floor(Math.max(0, now - ts) / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
