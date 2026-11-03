/** 活动的纯类型（客户端组件可直接引用） */

export type EventStatus = 'draft' | 'open' | 'ended';

export interface EventItem {
  id: string;
  title: string;
  summary: string;
  body: string;
  cover: string;
  reward: string;
  /** RFC3339；未设置时为空 */
  startsAt?: string | null;
  endsAt?: string | null;
  status: EventStatus;
  sort: number;
  entryCount: number;
  joined: boolean;
}

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  draft: '草稿',
  open: '进行中',
  ended: '已结束',
};

export function fmtEventDate(v?: string | null): string {
  if (!v) return '待定';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '待定';
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

/** 时间区间：8/12 – 8/20；只填了一个就显示单边 */
export function fmtEventRange(a?: string | null, b?: string | null): string {
  if (!a && !b) return '时间待定';
  if (a && !b) return `${fmtEventDate(a)} 起`;
  if (!a && b) return `截止 ${fmtEventDate(b)}`;
  return `${fmtEventDate(a)} – ${fmtEventDate(b)}`;
}
