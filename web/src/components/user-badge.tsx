import type { BadgeInfo } from '@/lib/badges';

/**
 * 用户头衔徽标。
 *
 * 管理员与普通用户共用这一个组件：管理员样式是暖金实心，
 * 自定义头衔是中性描边 —— 不叠加，作者名后面最多一个徽标。
 */
export function UserBadge({ badge, size }: { badge?: BadgeInfo | null; size?: 'sm' }) {
  if (!badge) return null;
  return (
    <span
      className="ut"
      data-kind={badge.admin ? 'admin' : 'custom'}
      data-size={size}
      data-shine={badge.admin ? '' : undefined}
    >
      {badge.label}
    </span>
  );
}
