/**
 * 头衔（用户徽标）。
 *
 * 设计上只有**一个**徽标位：管理员的「管理员」不是另画一个标签，
 * 而是这个位置的默认文案 —— 管理员一旦自定义头衔，就显示自定义的那个，
 * 但样式仍然是管理员样式。这样作者名后面永远只有一个徽标，不会越排越长。
 *
 * 这个文件是纯函数 + 类型，客户端组件也能安全引用（不要在这里 import 服务端存储）。
 */

export interface BadgeInfo {
  /** 展示文案，2–8 字 */
  label: string;
  /** 管理员标识：决定样式（暖金）与保留字豁免 */
  admin?: boolean;
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
export function badgeOf(user: { role: string; title?: string }): BadgeInfo | null {
  const admin = user.role === 'admin';
  const label = (user.title ?? '').trim() || (admin ? ADMIN_LABEL : '');
  if (!label) return null;
  return admin ? { label, admin: true } : { label };
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
