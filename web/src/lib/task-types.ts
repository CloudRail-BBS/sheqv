/** 任务与赛事的纯类型（客户端组件可直接引用） */

export type TaskKind = 'daily' | 'weekly' | 'once';
export type TaskMetric = 'checkin' | 'post' | 'comment' | 'like' | 'resource' | 'server';

export interface UserTask {
  id: string;
  title: string;
  description: string;
  kind: TaskKind;
  metric: TaskMetric;
  target: number;
  rewardPoints: number;
  progress: number;
  claimed: boolean;
  claimable: boolean;
  periodKey: string;
}

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  daily: '每日',
  weekly: '每周',
  once: '一次性',
};

export const TASK_METRIC_LABEL: Record<TaskMetric, string> = {
  checkin: '签到',
  post: '发帖',
  comment: '评论',
  like: '点赞',
  resource: '发布资源',
  server: '上传服务器',
};

export type TournamentStatus = 'draft' | 'signup' | 'running' | 'ended';

export interface Tournament {
  id: string;
  title: string;
  game: string;
  mode: string;
  summary: string;
  body?: string;
  cover: string;
  prize: string;
  status: TournamentStatus;
  signupStart?: number;
  signupEnd?: number;
  startAt?: number;
  endAt?: number;
  maxEntries: number;
  entryCount: number;
  createdAt: number;
  /** 对外显示的主办方名称；空则由前端回落到站点名 */
  hostName?: string;
  /** 主办账号：拥有它的人可以领主办证书 */
  hostUserId?: string;
}

export interface TournamentEntry {
  id: string;
  userId: string;
  nickname: string;
  teamName: string;
  contact: string;
  note: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

export const TOURNAMENT_STATUS_LABEL: Record<TournamentStatus, string> = {
  draft: '草稿',
  signup: '报名中',
  running: '进行中',
  ended: '已结束',
};

export function fmtDay(ts?: number): string {
  if (!ts) return '待定';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}
