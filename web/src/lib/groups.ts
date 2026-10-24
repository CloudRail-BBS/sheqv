import { cache } from 'react';
import { apiGetOr } from './api-client';

/**
 * 身份组的**读**接口。
 *
 * 后台走 `/api/v1/admin/groups`（带权限键与公约 id）；
 * 公开页走 `/api/v1/groups`：只有展示需要的字段，权限已经翻译成人话。
 * 组的增删改在 `components/admin-groups.tsx` 里直接打接口，不经过这里。
 */

export interface Group {
  id: string;
  name: string;
  slug: string;
  color: string;
  description: string;
  weight: number;
  isDefault: boolean;
  isBuiltin: boolean;
  permissions: string[];
  requiredAgreements: string[];
  memberCount: number;
}

/** 公开列表项：能力与进组条件已经转成中文 */
export interface PublicGroup {
  id: string;
  name: string;
  slug: string;
  color: string;
  description: string;
  weight: number;
  isDefault: boolean;
  memberCount: number;
  capabilities: string[];
  requiredAgreements: string[];
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

/** 公开身份组列表：请求内只取一次 */
export const listPublicGroups = cache(async (): Promise<PublicGroup[]> => {
  const data = await apiGetOr<{ items: PublicGroup[] }>('/api/v1/groups', { items: [] });
  return data.items ?? [];
});
