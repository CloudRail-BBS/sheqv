import { dataFile, readJson, serialize, writeJsonAtomic } from './json-store';

/**
 * 公告。后台可增删改，前台按置顶 + 时间排序。
 * 存 $DATA_DIR/announcements.json；没有文件时就是空列表（不再是硬编码占位）。
 */

export type AnnouncementKind = '规则' | '版本' | '活动' | '系统';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  kind: AnnouncementKind;
  pinned: boolean;
  published: boolean;
  createdAt: number;
  updatedAt: number;
}

const FILE = dataFile('announcements.json');

const KINDS: AnnouncementKind[] = ['规则', '版本', '活动', '系统'];

interface Store {
  items: Announcement[];
}

async function read(): Promise<Store> {
  const parsed = await readJson<Partial<Store>>(FILE, {});
  return { items: Array.isArray(parsed.items) ? parsed.items : [] };
}

const sorted = (list: Announcement[]): Announcement[] =>
  list
    .slice()
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt,
    );

export async function listAnnouncements(opts?: {
  publishedOnly?: boolean;
  limit?: number;
}): Promise<Announcement[]> {
  const { items } = await read();
  let list = opts?.publishedOnly ? items.filter((a) => a.published) : items;
  list = sorted(list);
  return typeof opts?.limit === 'number' ? list.slice(0, opts.limit) : list;
}

export async function getAnnouncement(id: string): Promise<Announcement | null> {
  const { items } = await read();
  return items.find((a) => a.id === id) ?? null;
}

export interface AnnouncementInput {
  title?: unknown;
  body?: unknown;
  kind?: unknown;
  pinned?: unknown;
  published?: unknown;
}

const asText = (v: unknown): string => (typeof v === 'string' ? v : '');

export function validateAnnouncement(input: AnnouncementInput): string | null {
  const title = asText(input.title).trim();
  const body = asText(input.body).trim();
  if (title.length < 2 || title.length > 60) return '标题需 2–60 字';
  if (body.length < 4) return '正文至少 4 字';
  if (body.length > 20000) return '正文不超过 20000 字';
  return null;
}

function normalizeKind(v: unknown): AnnouncementKind {
  return (KINDS as string[]).includes(asText(v)) ? (asText(v) as AnnouncementKind) : '系统';
}

export async function createAnnouncement(input: AnnouncementInput): Promise<Announcement> {
  const now = Date.now();
  const item: Announcement = {
    id: `a${now.toString(36)}${Math.random().toString(36).slice(2, 4)}`,
    title: asText(input.title).trim(),
    body: asText(input.body).trim(),
    kind: normalizeKind(input.kind),
    pinned: input.pinned === true,
    published: input.published !== false,
    createdAt: now,
    updatedAt: now,
  };

  await serialize(async () => {
    const store = await read();
    store.items.push(item);
    await writeJsonAtomic(FILE, store);
  });

  return item;
}

export async function updateAnnouncement(
  id: string,
  patch: AnnouncementInput,
): Promise<Announcement | null> {
  let out: Announcement | null = null;

  await serialize(async () => {
    const store = await read();
    const target = store.items.find((a) => a.id === id);
    if (!target) return;

    if (typeof patch.title === 'string' && patch.title.trim()) target.title = patch.title.trim();
    if (typeof patch.body === 'string' && patch.body.trim()) target.body = patch.body.trim();
    if (patch.kind !== undefined) target.kind = normalizeKind(patch.kind);
    if (typeof patch.pinned === 'boolean') target.pinned = patch.pinned;
    if (typeof patch.published === 'boolean') target.published = patch.published;
    target.updatedAt = Date.now();

    await writeJsonAtomic(FILE, store);
    out = target;
  });

  return out;
}

export async function removeAnnouncement(id: string): Promise<boolean> {
  let found = false;
  await serialize(async () => {
    const store = await read();
    const next = store.items.filter((a) => a.id !== id);
    if (next.length === store.items.length) return;
    found = true;
    store.items = next;
    await writeJsonAtomic(FILE, store);
  });
  return found;
}
