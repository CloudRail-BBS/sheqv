import { apiGetOr } from './api-client';

/**
 * 身份组的**读**接口。
 *
 * 只服务后台：`/api/v1/admin/groups` 带权限点与「进组前必须签署的公约」，
 * 普通用户走 `/api/v1/groups`，拿不到这两项。
 * 组的增删改在 `components/admin-groups.tsx` 里直接打接口，不经过这里。
 */

export interface Group {
  id: string;
  name: string;
  slug: string;
  color: string;
  weight: number;
  isDefault: boolean;
  isBuiltin: boolean;
  permissions: string[];
  requiredAgreements: string[];
  memberCount: number;
}

export interface GroupOption {
  id: string;
  name: string;
  isDefault: boolean;
}

/** 后台下拉用：只需要 id / 名称 / 是否默认组 */
export async function listGroupOptions(): Promise<GroupOption[]> {
  const data = await apiGetOr<{ items: Group[] }>('/api/v1/admin/groups', { items: [] });
  return data.items.map((g) => ({ id: g.id, name: g.name, isDefault: g.isDefault }));
}
