/**
 * 头衔（用户徽标）。
 *
 * 设计上只有**一个**徽标位：管理员的「管理员」不是另画一个标签，
 * 而是这个位置的默认文案 —— 管理员一旦自定义头衔，就显示自定义的那个，
 * 但样式仍然是管理员样式。这样作者名后面永远只有一个徽标，不会越排越长。
 *
 * 这个文件是纯函数 + 类型，客户端组件也能安全引用（不要在这里 import 服务端存储）。
 */

import { isVerifyKind } from './verify-types';

/** 外观样式键；与 CSS 的 `[data-bs="…"]` 一一对应 */
export type BadgeStyle =
  | 'plain'
  | 'blue'
  | 'gold'
  | 'violet'
  | 'mint'
  | 'solid'
  | 'outline'
  | 'holo';

/** 特效键；空串表示无动效 */
export type BadgeEffect = '' | 'shine' | 'glow' | 'pulse';

export const BADGE_STYLES: { key: BadgeStyle; label: string }[] = [
  { key: 'plain', label: '中性' },
  { key: 'blue', label: '品牌蓝' },
  { key: 'gold', label: '暖金' },
  { key: 'violet', label: '紫罗兰' },
  { key: 'mint', label: '薄荷绿' },
  { key: 'solid', label: '实心反色' },
  { key: 'outline', label: '描边' },
  { key: 'holo', label: '流光渐变' },
];

export const BADGE_EFFECTS: { key: BadgeEffect; label: string }[] = [
  { key: '', label: '无' },
  { key: 'shine', label: '扫光' },
  { key: 'glow', label: '光晕' },
  { key: 'pulse', label: '呼吸' },
];

export function isBadgeStyle(v: unknown): v is BadgeStyle {
  return typeof v === 'string' && BADGE_STYLES.some((s) => s.key === v);
}

export function isBadgeEffect(v: unknown): v is BadgeEffect {
  return typeof v === 'string' && BADGE_EFFECTS.some((s) => s.key === v);
}

export interface BadgeInfo {
  /** 展示文案，2–8 字 */
  label: string;
  /** 管理员标识：决定默认样式（实心）与保留字豁免 */
  admin?: boolean;
  /** 后台审核时定的样式；空则由 admin / 默认推导 */
  style?: string;
  /** 特效 */
  effect?: string;
  /** 认证标记：blue / red（认证与头衔是两件事，可能只有认证没有头衔） */
  verifyKind?: string;
  /** 认证说明，悬停展示 */
  verifyLabel?: string;
}

/** key 形如 `id:u123` 或 `name:风蚀`，方便老数据（只有昵称）也能命中 */
export type BadgeMap = Record<string, BadgeInfo>;

/** 普通用户不能使用的头衔，避免冒充站务 */
export const RESERVED_TITLES = [
  '管理员',
  '管理',
  '站务',
  '站长',
  '官方',
  '版主',
  '超管',
  '仲裁',
  '客服',
  '系统',
];

export const TITLE_MIN = 2;
export const TITLE_MAX = 8;

/** 管理员在没设自定义头衔时显示的默认文案 */
export const ADMIN_LABEL = '管理员';

export type TitleCheck = { ok: true; value: string } | { ok: false; message: string };

/**
 * 校验并规范化头衔。空字符串表示「清除」。
 * 保留字只对非管理员拦截 —— 管理员本来就可以叫「管理员」。
 */
export function normalizeTitle(raw: unknown, isAdmin: boolean): TitleCheck {
  const text = (typeof raw === 'string' ? raw : '').trim();

  if (!text) return { ok: true, value: '' };

  // 去掉控制字符与换行，避免撑破单行布局
  const clean = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();

  // 用 code point 计数，emoji 不会被算成两个字符
  const len = Array.from(clean).length;
  if (len < TITLE_MIN || len > TITLE_MAX) {
    return { ok: false, message: `头衔需 ${TITLE_MIN}–${TITLE_MAX} 个字` };
  }

  if (!isAdmin) {
    const hit = RESERVED_TITLES.find((t) => clean.includes(t));
    if (hit) return { ok: false, message: `「${hit}」是保留头衔，不能使用` };
  }

  return { ok: true, value: clean };
}

/** 计算某个用户的徽标；普通用户没设头衔时返回 null（不占位） */
export function badgeOf(user: {
  role: string;
  title?: string;
  titleStyle?: string;
  titleEffect?: string;
  verifyKind?: string;
  verifyLabel?: string;
}): BadgeInfo | null {
  const admin = user.role === 'admin';
  const label = (user.title ?? '').trim() || (admin ? ADMIN_LABEL : '');
  const verifyKind = isVerifyKind(user.verifyKind) ? user.verifyKind : '';
  const verifyLabel = (user.verifyLabel ?? '').trim();
  // 认证是独立标记：没有头衔的认证用户也要在名字后面露出印记
  if (!label && !verifyKind) return null;
  return {
    label,
    admin,
    style: user.titleStyle || undefined,
    effect: user.titleEffect || undefined,
    verifyKind: verifyKind || undefined,
    verifyLabel: verifyLabel || undefined,
  };
}

/** 从徽标表里取：优先按 id，其次按昵称（兼容早期没有 authorId 的帖子） */
export function resolveBadge(
  map: BadgeMap | null | undefined,
  who: { id?: string; name?: string },
): BadgeInfo | undefined {
  if (!map) return undefined;
  if (who.id && map[`id:${who.id}`]) return map[`id:${who.id}`];
  if (who.name && map[`name:${who.name}`]) return map[`name:${who.name}`];
  return undefined;
}
