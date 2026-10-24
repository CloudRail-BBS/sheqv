/** 积分与签到的纯类型（客户端组件可安全引用）。 */

export interface PointLog {
  id: string;
  delta: number;
  reason: string;
  at: number;
}

export interface RankRow {
  rank: number;
  userId: string;
  nickname: string;
  points: number;
}

export interface PointsSnapshot {
  points: number;
  streak: number;
  todayDone: boolean;
  nextReward: number;
  todayEarned: number;
  log: PointLog[];
  rank: RankRow[];
  myRank: number;
  /** 最近 7 天是否签到，旧 → 新 */
  recentDays: boolean[];
}

export interface CheckinResult {
  already: boolean;
  earned: number;
  points: number;
  streak: number;
  myRank: number;
}

export const REASON_LABEL: Record<string, string> = {
  post: '发帖',
  comment: '评论',
  checkin: '签到',
  admin: '管理员调整',
};

export function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason;
}

/** 签到分规则说明，前端与后端（points::reward_for）必须一致 */
export const CHECKIN_BASE = 10;
export const STREAK_BONUS_MAX = 7;

export function rewardFor(streak: number): number {
  const n = Math.max(1, streak);
  return CHECKIN_BASE + Math.min(n - 1, STREAK_BONUS_MAX);
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
