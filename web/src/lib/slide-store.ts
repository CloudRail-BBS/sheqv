import { dataFile, readJson, serialize, writeJsonAtomic } from './json-store';

/**
 * 首页轮播。后台可改文案、按钮、背景色或背景图，不用改代码。
 *
 * 没写过设置时用 DEFAULT_SLIDES（三条真实引导）；后台一旦保存就以文件为准，
 * 这样"删光"也能生效（不会被默认值顶回来）。
 */

export interface Slide {
  id: string;
  kicker: string;
  title: string;
  desc: string;
  cta: string;
  href: string;
  /** 背景色（CSS 颜色），与 bgImage 二选一，bgImage 优先 */
  bgColor: string;
  /** 背景图 URL，覆盖 bgColor */
  bgImage: string;
  /** 文字色：深色背景用 light */
  textTone: 'light' | 'dark';
  active: boolean;
  order: number;
}

const FILE = dataFile('slides.json');

export const DEFAULT_SLIDES: Slide[] = [
  {
    id: 's-welcome',
    kicker: '从这里开始',
    title: '注册一个账号，就能发帖、评论与签署公约',
    desc: '第一个注册的账号自动成为管理员。本站没有内置账号，社区内容全部来自真实用户。',
    cta: '注册账号',
    href: '/register',
    bgColor: '#1b1b1e',
    bgImage: '',
    textTone: 'light',
    active: true,
    order: 1,
  },
  {
    id: 's-rules',
    kicker: '社区规则',
    title: '发帖前先看一眼两份公约',
    desc: '《社区公约》管发言，《诚信公约》管比赛。公约升版后需要重新签署，旧签名自动失效。',
    cta: '阅读公约',
    href: '/agreements',
    bgColor: '#232327',
    bgImage: '',
    textTone: 'light',
    active: true,
    order: 2,
  },
  {
    id: 's-sponsor',
    kicker: '支持我们',
    title: '服务器与赛事奖品来自赞助',
    desc: '赞助名单公开可查，金额与时间直接读爱发电的接口，不投放广告也不卖榜单位置。',
    cta: '查看赞助者',
    href: '/sponsors',
    bgColor: '#141416',
    bgImage: '',
    textTone: 'light',
    active: true,
    order: 3,
  },
];

interface Store {
  /** 有 key 说明后台保存过，哪怕 items 是空数组 */
  items: Slide[];
  touched?: boolean;
}

async function read(): Promise<Slide[]> {
  const parsed = await readJson<Partial<Store>>(FILE, {});
  if (!parsed.touched) return DEFAULT_SLIDES;
  return Array.isArray(parsed.items) ? parsed.items : [];
}

export async function listSlides(opts?: { activeOnly?: boolean }): Promise<Slide[]> {
  const items = await read();
  const list = opts?.activeOnly ? items.filter((s) => s.active) : items;
  return list.slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export interface SlideInput {
  kicker?: unknown;
  title?: unknown;
  desc?: unknown;
  cta?: unknown;
  href?: unknown;
  bgColor?: unknown;
  bgImage?: unknown;
  textTone?: unknown;
  active?: unknown;
  order?: unknown;
}

const asText = (v: unknown): string => (typeof v === 'string' ? v : '');

/** 只接受 http(s) 或站内相对路径，挡掉 javascript: 这类注入 */
export function safeHref(v: string): string {
  const s = v.trim();
  if (!s) return '/';
  if (s.startsWith('/') || /^https?:\/\//i.test(s)) return s;
  return '/';
}

function safeColor(v: string): string {
  const s = v.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
  if (/^rgba?\([\d\s.,%]+\)$/.test(s)) return s;
  return '#1b1b1e';
}

export function validateSlide(input: SlideInput): string | null {
  const title = asText(input.title).trim();
  if (title.length < 2 || title.length > 48) return '标题需 2–48 字';
  if (asText(input.desc).length > 160) return '描述不超过 160 字';
  if (asText(input.cta).length > 12) return '按钮文案不超过 12 字';
  return null;
}

export async function createSlide(input: SlideInput): Promise<Slide> {
  const items = await read();
  const item: Slide = {
    id: `sl${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`,
    kicker: asText(input.kicker).trim().slice(0, 16),
    title: asText(input.title).trim(),
    desc: asText(input.desc).trim(),
    cta: asText(input.cta).trim() || '了解更多',
    href: safeHref(asText(input.href)),
    bgColor: safeColor(asText(input.bgColor) || '#1b1b1e'),
    bgImage: asText(input.bgImage).trim(),
    textTone: asText(input.textTone) === 'dark' ? 'dark' : 'light',
    active: input.active !== false,
    order: Number(input.order) || items.length + 1,
  };

  await serialize(async () => {
    await writeJsonAtomic(FILE, { touched: true, items: [...items, item] } satisfies Store);
  });

  return item;
}

export async function updateSlide(id: string, patch: SlideInput): Promise<Slide | null> {
  let out: Slide | null = null;
  const items = await read();

  await serialize(async () => {
    const target = items.find((s) => s.id === id);
    if (!target) return;

    if (typeof patch.kicker === 'string') target.kicker = patch.kicker.trim().slice(0, 16);
    if (typeof patch.title === 'string' && patch.title.trim()) target.title = patch.title.trim();
    if (typeof patch.desc === 'string') target.desc = patch.desc.trim();
    if (typeof patch.cta === 'string') target.cta = patch.cta.trim() || '了解更多';
    if (typeof patch.href === 'string') target.href = safeHref(patch.href);
    if (typeof patch.bgColor === 'string') target.bgColor = safeColor(patch.bgColor);
    if (typeof patch.bgImage === 'string') target.bgImage = patch.bgImage.trim();
    if (patch.textTone === 'dark' || patch.textTone === 'light') target.textTone = patch.textTone;
    if (typeof patch.active === 'boolean') target.active = patch.active;
    if (patch.order !== undefined) target.order = Number(patch.order) || target.order;

    await writeJsonAtomic(FILE, { touched: true, items } satisfies Store);
    out = target;
  });

  return out;
}

export async function removeSlide(id: string): Promise<boolean> {
  const items = await read();
  const next = items.filter((s) => s.id !== id);
  if (next.length === items.length) return false;

  await serialize(async () => {
    await writeJsonAtomic(FILE, { touched: true, items: next } satisfies Store);
  });
  return true;
}
