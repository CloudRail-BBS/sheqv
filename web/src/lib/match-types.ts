export type MatchStatus = 'pending_accept' | 'locked' | 'declined';

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  pending_accept: '待接受',
  locked: '名单已锁定',
  declined: '已拒绝',
};

export interface MatchView {
  id: string;
  title: string;
  game: string;
  format: string;
  maps: string[];
  scheduledAt: number;
  note: string;
  status: MatchStatus;
  creatorId: string;
  creatorKind: 'guild' | 'team';
  creatorOrgId: string;
  creatorName: string;
  creatorTag: string;
  opponentKind: 'guild' | 'team';
  opponentOrgId: string;
  opponentName: string;
  opponentTag: string;
  acceptedAt?: number;
  createdAt: number;
}

export const MATCH_GAME_LABEL: Record<string, string> = {
  minecraft: 'Minecraft',
  rusted_warfare: 'Rusted Warfare',
};

export function fmtMatchTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
