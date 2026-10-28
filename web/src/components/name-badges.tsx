import type { BadgeInfo } from '@/lib/badges';
import type { UserGroup } from '@/lib/users';
import { UserBadge } from './user-badge';
import { GroupTag } from './group-tag';

/**
 * 作者名后面的一组标签：头衔 + 身份组。
 *
 * 头衔与组名相同时只留头衔 —— 不然会出现「liangan 管理员 管理员」这种一眼看不懂的重复。
 * 全站的「名字 + 标签」都走这里，避免各处各写一遍又漏掉去重。
 */
export function NameBadges({
  badge,
  group,
  size,
}: {
  badge?: BadgeInfo | null;
  group?: UserGroup | null;
  size?: 'sm';
}) {
  const showGroup = group && group.name !== badge?.label;
  return (
    <>
      <UserBadge badge={badge} size={size} />
      {showGroup ? <GroupTag group={group} size={size} /> : null}
    </>
  );
}
