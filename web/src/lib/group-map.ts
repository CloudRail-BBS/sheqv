import { cache } from 'react';
import { listPublicUsers, type UserGroup } from './users';

/**
 * 作者 → 身份组 的查表。
 *
 * 帖子与评论只带 `authorId` / 昵称，不重复存组信息；
 * 一个页面里所有作者共用一次公开用户列表，顺手建两张键：
 * `id:<用户 id>` 与 `name:<昵称>`（老数据只有昵称也能命中）。
 */
export type GroupMap = Record<string, UserGroup>;

export const getGroupMap = cache(async (): Promise<GroupMap> => {
  const users = await listPublicUsers();
  const map: GroupMap = {};
  for (const u of users) {
    if (!u.group) continue;
    map[`id:${u.id}`] = u.group;
    map[`name:${u.nickname}`] = u.group;
  }
  return map;
});

export function resolveGroup(
  map: GroupMap | undefined,
  who: { id?: string | null; name?: string | null },
): UserGroup | undefined {
  if (!map) return undefined;
  if (who.id) {
    const hit = map[`id:${who.id}`];
    if (hit) return hit;
  }
  if (who.name) {
    const hit = map[`name:${who.name}`];
    if (hit) return hit;
  }
  return undefined;
}
