import { initialOf } from './initials';

/** 私聊的共享类型与展示用工具（客户端也能引，不要在这里 import 服务端模块） */

export interface DmPeer {
  id: string;
  nickname: string;
  avatar: string;
}

export interface DmConversation {
  peer: DmPeer;
  lastAt: number;
  lastPreview: string;
  lastMine: boolean;
  unread: number;
}

export interface DmMessage {
  id: string;
  body: string;
  at: number;
  mine: boolean;
  /** 仅前端：发送中，尚未收到服务端回执 */
  pending?: boolean;
}

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 会话列表里的时间：今天只给时分，昨天给「昨天」，更早给日期 */
export function dmListTime(ts: number): string {
  if (!ts) return '';
  const now = Date.now();
  const diff = startOfDay(now) - startOfDay(ts);
  const d = new Date(ts);
  if (diff === 0) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  if (diff === DAY) return '昨天';
  if (d.getFullYear() === new Date(now).getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 气泡里的时间 */
export function dmClock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 日期分隔条文案 */
export function dmDayLabel(ts: number): string {
  const diff = startOfDay(Date.now()) - startOfDay(ts);
  if (diff === 0) return '今天';
  if (diff === DAY) return '昨天';
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 两条消息是否跨天（决定要不要插日期条） */
export function differentDay(a: number, b: number): boolean {
  return startOfDay(a) !== startOfDay(b);
}

/** 头像回落：昵称首字（与组织徽记同一套规则） */
export function dmInitial(nickname: string): string {
  return initialOf(nickname);
}
