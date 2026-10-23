import { apiGetOr } from './api-client';
import { listActive } from './agreement-store';
import type { Agreement } from './agreements';

/**
 * 签署状态。**以数据库为准**（`signatures` 表），旧的 `ag_*` Cookie 只由后端在
 * 发帖门槛处兜底，页面渲染不再依赖它。
 */

export interface SignatureState {
  id: string;
  title: string;
  version: string;
  signed: boolean;
  at: number | null;
  /** 公约已升版但签的是旧版 */
  stale: boolean;
}

type Signed = { id: string; version: string; at: number };

async function signedList(): Promise<Map<string, Signed>> {
  const d = await apiGetOr<{ items: Signed[] }>('/api/v1/agreements/signatures', { items: [] });
  return new Map(d.items.map((i) => [i.id, i]));
}

export async function getSignatures(list: Agreement[]): Promise<Record<string, SignatureState>> {
  const signed = await signedList();
  const out: Record<string, SignatureState> = {};

  for (const a of list) {
    const hit = signed.get(a.id);
    out[a.id] = {
      id: a.id,
      title: a.title,
      version: a.version,
      signed: hit?.version === a.version,
      at: hit?.at ?? null,
      stale: Boolean(hit) && hit!.version !== a.version,
    };
  }
  return out;
}

export async function isSigned(id: string): Promise<boolean> {
  const a = await getAgreementFor(id);
  if (!a) return false;
  return (await signedList()).get(a.id)?.version === a.version;
}

async function getAgreementFor(id: string): Promise<Agreement | null> {
  const list = await listActive();
  return list.find((a) => a.id === id) ?? null;
}

/** 比赛确权固定依赖内置的诚信公约 */
export async function isTrustSigned(): Promise<boolean> {
  return isSigned('trust');
}

/** 发帖 / 评论 / 上传 依赖社区公约 */
export async function isCommunitySigned(): Promise<boolean> {
  return isSigned('community');
}
