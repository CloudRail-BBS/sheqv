import { apiGetOr } from './api-client';
import { getCurrentUser } from './current-user';

/**
 * 赞助者快照的读接口。公开页只看到展示中的；管理员能拿到隐藏项以便恢复。
 */

export interface SponsorEntry {
  id: string;
  name: string;
  avatar?: string;
  amount: number;
  planTitle?: string;
  firstAt?: number;
  lastPayAt?: number;
  source: 'afdian' | 'manual';
  hidden?: boolean;
}

export interface SponsorSnapshot {
  sponsors: SponsorEntry[];
  syncedAt: number | null;
  lastCount: number;
  totalAmount: number;
  count: number;
  configured: boolean;
}

const EMPTY: SponsorSnapshot = {
  sponsors: [],
  syncedAt: null,
  lastCount: 0,
  totalAmount: 0,
  count: 0,
  configured: false,
};

export function sortSponsors(list: SponsorEntry[]): SponsorEntry[] {
  return list
    .slice()
    .sort(
      (a, b) =>
        b.amount - a.amount || (b.lastPayAt ?? 0) - (a.lastPayAt ?? 0) || a.name.localeCompare(b.name),
    );
}

export async function getSnapshot(includeHidden = false): Promise<SponsorSnapshot> {
  const user = await getCurrentUser();

  if (user?.isAdmin) {
    const d = await apiGetOr<{ snapshot: Omit<SponsorSnapshot, 'lastCount'> }>(
      '/api/v1/admin/sponsors',
      { snapshot: { sponsors: [], syncedAt: null, totalAmount: 0, count: 0, configured: false } },
    );
    const s = d.snapshot;
    return { ...s, lastCount: s.count };
  }

  const d = await apiGetOr<{
    items: SponsorEntry[];
    totalAmount: number;
    count: number;
    syncedAt: number | null;
  }>('/api/v1/sponsors', { items: [], totalAmount: 0, count: 0, syncedAt: null });

  return {
    sponsors: includeHidden ? d.items : d.items.filter((s) => !s.hidden),
    syncedAt: d.syncedAt,
    lastCount: d.count,
    totalAmount: d.totalAmount,
    count: d.count,
    configured: false,
  };
}

export function formatAmount(n: number): string {
  return n.toLocaleString('zh-CN', {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function formatDate(ts?: number): string {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
