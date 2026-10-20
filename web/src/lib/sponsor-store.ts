import { dataFile, readJson, serialize, writeJsonAtomic } from './json-store';
import type { AfdianSponsor } from './afdian';

/**
 * 赞助者快照。
 *
 * 公开页只读这份快照，不在渲染时打爱发电接口——接口挂了不该拖垮页面。
 * 数据由后台「立即同步」或 cron 调用 admin 接口写入。
 */

export interface SponsorEntry {
  /** 爱发电 user_id；手动录入为 m<时间戳> */
  id: string;
  name: string;
  avatar?: string;
  /** 累计赞助金额（元） */
  amount: number;
  planTitle?: string;
  firstAt?: number;
  lastPayAt?: number;
  source: 'afdian' | 'manual';
  /** 后台可隐藏，不从数据里删 */
  hidden?: boolean;
}

interface Store {
  sponsors: SponsorEntry[];
  /** 上次成功同步的时间戳（毫秒） */
  syncedAt: number | null;
  /** 上次同步来自爱发电的人数（含已隐藏） */
  lastCount: number;
}

const FILE = dataFile('sponsors.json');

const EMPTY: Store = { sponsors: [], syncedAt: null, lastCount: 0 };

async function read(): Promise<Store> {
  const parsed = await readJson<Partial<Store>>(FILE, {});
  return {
    sponsors: Array.isArray(parsed.sponsors) ? parsed.sponsors : [],
    syncedAt: typeof parsed.syncedAt === 'number' ? parsed.syncedAt : null,
    lastCount: Number(parsed.lastCount ?? 0) || 0,
  };
}

const num = (v: string | number | undefined): number => {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/** 金额降序；同额按最近支持时间降序 */
export function sortSponsors(list: SponsorEntry[]): SponsorEntry[] {
  return list
    .slice()
    .sort((a, b) => b.amount - a.amount || (b.lastPayAt ?? 0) - (a.lastPayAt ?? 0) || a.name.localeCompare(b.name));
}

export interface SponsorSnapshot {
  sponsors: SponsorEntry[];
  syncedAt: number | null;
  totalAmount: number;
  count: number;
  configured: boolean;
}

export async function getSnapshot(includeHidden = false): Promise<SponsorSnapshot> {
  const store = await read();
  const visible = store.sponsors.filter((s) => includeHidden || !s.hidden);
  const sorted = sortSponsors(visible);

  return {
    sponsors: sorted,
    syncedAt: store.syncedAt,
    totalAmount: Math.round(sorted.reduce((sum, s) => sum + s.amount, 0) * 100) / 100,
    count: sorted.length,
    configured: false, // 由调用方按环境变量覆盖
  };
}

/**
 * 用爱发电返回的列表覆盖快照。
 * 保留手动录入的条目，以及原有的 hidden 标记（隐藏是按人设的，不该被同步抹掉）。
 */
export async function replaceFromAfdian(list: AfdianSponsor[]): Promise<{ count: number; total: number }> {
  const mapped: SponsorEntry[] = [];
  for (const s of list) {
    const id = s.user?.user_id ?? '';
    if (!id) continue;
    mapped.push({
      id,
      name: s.user?.name || '匿名赞助者',
      avatar: s.user?.avatar,
      amount: num(s.all_sum_amount),
      planTitle: s.current_plan?.plan_title,
      firstAt: s.create_time,
      lastPayAt: s.last_pay_time,
      source: 'afdian',
    });
  }

  return serialize(async () => {
    const store = await read();
    const manual = store.sponsors.filter((s) => s.source === 'manual');
    const hiddenIds = new Set(store.sponsors.filter((s) => s.hidden).map((s) => s.id));

    const merged = mapped.map((s) => (hiddenIds.has(s.id) ? { ...s, hidden: true } : s));

    await writeJsonAtomic(FILE, {
      sponsors: [...merged, ...manual],
      syncedAt: Date.now(),
      lastCount: mapped.length,
    } satisfies Store);

    return {
      count: mapped.length,
      total: Math.round(merged.reduce((sum, s) => sum + s.amount, 0) * 100) / 100,
    };
  });
}

export interface ManualInput {
  name?: string;
  amount?: string | number;
  planTitle?: string;
  note?: string;
}

export async function addManual(input: ManualInput): Promise<SponsorEntry> {
  const name = (input.name ?? '').trim();
  const amount = num(input.amount);
  if (name.length < 1 || name.length > 24) throw new Error('INVALID_NAME');
  if (!(amount > 0)) throw new Error('INVALID_AMOUNT');

  const entry: SponsorEntry = {
    id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`,
    name,
    amount,
    planTitle: (input.planTitle ?? '').trim() || undefined,
    firstAt: Math.floor(Date.now() / 1000),
    lastPayAt: Math.floor(Date.now() / 1000),
    source: 'manual',
  };

  await serialize(async () => {
    const store = await read();
    store.sponsors.push(entry);
    await writeJsonAtomic(FILE, store);
  });

  return entry;
}

export async function setHidden(id: string, hidden: boolean): Promise<boolean> {
  let found = false;
  await serialize(async () => {
    const store = await read();
    const target = store.sponsors.find((s) => s.id === id);
    if (!target) return;
    target.hidden = hidden;
    found = true;
    await writeJsonAtomic(FILE, store);
  });
  return found;
}

/** 只允许删手动录入的条目——爱发电来源的重同步就会回来，删了没意义 */
export async function removeManual(id: string): Promise<'ok' | 'not_found' | 'not_manual'> {
  let result: 'ok' | 'not_found' | 'not_manual' = 'not_found';
  await serialize(async () => {
    const store = await read();
    const target = store.sponsors.find((s) => s.id === id);
    if (!target) return;
    if (target.source !== 'manual') {
      result = 'not_manual';
      return;
    }
    store.sponsors = store.sponsors.filter((s) => s.id !== id);
    result = 'ok';
    await writeJsonAtomic(FILE, store);
  });
  return result;
}

export function formatAmount(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
}

export function formatDate(ts?: number): string {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
