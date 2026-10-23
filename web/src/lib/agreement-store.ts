import { apiGetOr } from './api-client';
import type { Agreement } from './agreements';

/**
 * 公约的读接口。新增 / 停用 / 删除由后台客户端组件直接打 `/api/v1/admin/agreements`。
 */

type Items = { items: Agreement[] };

/** 生效中的公约（前台） */
export async function listActive(): Promise<Agreement[]> {
  const d = await apiGetOr<Items>('/api/v1/agreements', { items: [] });
  return d.items;
}

/** 全部公约（含停用，后台） */
export async function listAgreements(): Promise<Agreement[]> {
  const d = await apiGetOr<Items>('/api/v1/admin/agreements', { items: [] });
  return d.items;
}

export async function getAgreement(id: string): Promise<Agreement | null> {
  return (await listActive()).find((a) => a.id === id) ?? null;
}
