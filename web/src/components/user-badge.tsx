import type { BadgeInfo } from '@/lib/badges';

/**
 * 用户头衔徽标。
 *
 * 一个用户只有一个头衔（管理员没自定义时默认「管理员」）。
 * 颜色与特效来自后台审核时定的样式：`data-bs` 管配色、`data-be` 管动效，
 * 没配就按角色回落（管理员实心 + 扫光，普通头衔品牌蓝）。
 */
export function UserBadge({ badge, size }: { badge?: BadgeInfo | null; size?: 'sm' }) {
  if (!badge) return null;
  const style = badge.style || (badge.admin ? 'solid' : 'blue');
  const effect = badge.effect || (badge.admin ? 'shine' : '');
  return (
    <span
      className="ut"
      data-kind={badge.admin ? 'admin' : 'custom'}
      data-size={size}
      data-bs={style}
      data-be={effect || undefined}
    >
      {badge.label}
    </span>
  );
}
