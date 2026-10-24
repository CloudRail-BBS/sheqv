/** 福利中心纯类型（客户端组件用） */

export interface GiftCard {
  id: string;
  kind: 'gift' | 'code' | string;
  code: string;
  title: string;
  note: string;
  theme: string;
  rewardPoints: number;
  rewardKind: string;
  rewardValue: string;
  assignedUserId?: string;
  usedAt?: number;
  expiresAt?: number;
  createdAt: number;
}

export interface Prize {
  id: string;
  name: string;
  kind: string;
  points: number;
  theme: string;
  stock?: number;
  weight: number;
  enabled: boolean;
}

export interface DrawRow {
  prizeName: string;
  cost: number;
  at: number;
}

export interface RewardsSnapshot {
  cards: GiftCard[];
  history: GiftCard[];
  prizes: Prize[];
  draws: DrawRow[];
  points: number;
  cost: number;
}

export function fmtCardDate(ts?: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}
