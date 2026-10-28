/** 头衔申请的纯类型（客户端组件可直接引用） */

export type TitleRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface TitleRequest {
  id: string;
  userId?: string;
  nickname?: string;
  title: string;
  style: string;
  effect: string;
  reason: string;
  status: TitleRequestStatus;
  reviewNote: string;
  createdAt: number;
  reviewedAt?: number;
}

export const TITLE_STATUS_LABEL: Record<TitleRequestStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '未通过',
  cancelled: '已撤销',
};
