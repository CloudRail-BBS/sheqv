import { apiGetOr } from './api-client';

import type { CategoryScope, ContentCategory } from './category-types';

export * from './category-types';

/** 服务端取分类；接口挂了就返回空数组，页面用 key 兜底显示 */
export async function listCategories(scope: CategoryScope): Promise<ContentCategory[]> {
  const d = await apiGetOr<{ items: ContentCategory[] }>(
    `/api/v1/categories?scope=${scope}`,
    { items: [] },
  );
  return d.items ?? [];
}
