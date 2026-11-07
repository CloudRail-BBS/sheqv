/**
 * 内容分类（百科 / 资源库 / 帖子版块 / 帖子标签）——只有类型与纯函数。
 *
 * 客户端组件（编辑器、后台管理）只能引这里：`category-store` 带着 `api-client`，
 * 里面引了 `next/headers`，打进 client bundle 会直接报错。
 */

export type CategoryScope = 'wiki' | 'resource' | 'post_section' | 'post_tag';

export interface ContentCategory {
  id: string;
  scope: CategoryScope;
  key: string;
  label: string;
  descr: string;
  sort: number;
  /** 后台列表用：有多少条内容在用；公开接口恒为 0 */
  count: number;
}

/** 找不到就退回 key 本身，删分类后老内容也不会显示空白 */
export function catLabel(list: ContentCategory[] | undefined | null, key: string): string {
  return list?.find((c) => c.key === key)?.label ?? key;
}

export const SCOPE_LABEL: Record<CategoryScope, string> = {
  wiki: '百科分类',
  resource: '资源分类',
  post_section: '帖子版块',
  post_tag: '帖子标签',
};
