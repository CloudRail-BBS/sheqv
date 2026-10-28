/** 工单的纯类型与文案（客户端组件可直接引用） */

export type TicketStatus = 'open' | 'replied' | 'closed';
export type TicketCategory = 'account' | 'report' | 'bug' | 'suggestion' | 'other';

export interface Ticket {
  id: string;
  userId: string;
  nickname: string;
  avatar: string;
  category: TicketCategory;
  subject: string;
  status: TicketStatus;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessage: string;
  lastRole: string;
}

export interface TicketMessage {
  id: string;
  role: 'user' | 'admin' | 'system';
  author: string;
  body: string;
  createdAt: number;
}

export interface TicketDetail extends Ticket {
  messages: TicketMessage[];
}

export const TICKET_CATEGORY_LABEL: Record<TicketCategory, string> = {
  account: '账号问题',
  report: '举报与申诉',
  bug: '功能故障',
  suggestion: '功能建议',
  other: '其他',
};

export const TICKET_CATEGORIES: TicketCategory[] = [
  'account',
  'report',
  'bug',
  'suggestion',
  'other',
];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: '待处理',
  replied: '已回复',
  closed: '已关闭',
};

export const TICKET_STATUS_BADGE: Record<TicketStatus, string> = {
  open: 'badge badge-warn',
  replied: 'badge badge-live',
  closed: 'badge badge-ghost',
};

export function ticketCategoryLabel(v?: string): string {
  return TICKET_CATEGORY_LABEL[v as TicketCategory] ?? '其他';
}

export function ticketStatusLabel(v?: string): string {
  return TICKET_STATUS_LABEL[v as TicketStatus] ?? '待处理';
}
