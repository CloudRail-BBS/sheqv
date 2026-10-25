import { apiGetOr } from './api-client';
import type { Policy } from './policy-types';

/** 已发布政策（前台） */
export async function listPolicies(): Promise<Policy[]> {
  const d = await apiGetOr<{ items: Policy[] }>('/api/v1/policies', { items: [] });
  return d.items;
}

/** 全部政策（后台） */
export async function listAllPolicies(): Promise<Policy[]> {
  const d = await apiGetOr<{ items: Policy[] }>('/api/v1/admin/policies', { items: [] });
  return d.items;
}

export async function getPolicy(slug: string): Promise<Policy | null> {
  const d = await apiGetOr<{ item: Policy | null }>(
    `/api/v1/policies/${encodeURIComponent(slug)}`,
    { item: null },
  );
  return d.item ?? null;
}

/** 证书底部免责声明：优先用勾选了「证书声明」的政策摘要 */
export async function certificateDisclaimer(): Promise<string> {
  const items = await listPolicies().catch(() => []);
  const p = items.find((x) => x.showOnCert) ?? items.find((x) => x.slug === 'disclaimer');
  return (
    p?.summary ||
    '本站证书仅证明相关账号在特定时间点的站内状态或签署行为，不构成官方资质或法律意见。'
  );
}
