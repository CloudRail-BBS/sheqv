import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { cookieName, isSigValid, parseSig, type Agreement } from './agreements';
import { getAgreement } from './agreement-store';

export interface SignatureState {
  id: string;
  title: string;
  version: string;
  signed: boolean;
  at: number | null;
  /** 公约已升版但签的是旧版 */
  stale: boolean;
}

export async function getSignatures(list: Agreement[]): Promise<Record<string, SignatureState>> {
  const c = await cookies();
  const out: Record<string, SignatureState> = {};

  for (const a of list) {
    const raw = c.get(cookieName(a.id))?.value;
    const sig = parseSig(raw);
    out[a.id] = {
      id: a.id,
      title: a.title,
      version: a.version,
      signed: isSigValid(raw, a.version),
      at: sig?.at ?? null,
      stale: !!sig && sig.version !== a.version,
    };
  }
  return out;
}

/** 任意公约是否已按当前版本签署 */
export async function isSigned(id: string): Promise<boolean> {
  const c = await cookies();
  const a = await getAgreement(id);
  if (!a || !a.active) return false;
  return isSigValid(c.get(cookieName(a.id))?.value, a.version);
}

/** 比赛确权固定依赖内置的诚信公约 */
export async function isTrustSigned(): Promise<boolean> {
  return isSigned('trust');
}

/** 发帖 / 评论 / 上传 依赖社区公约 */
export async function isCommunitySigned(): Promise<boolean> {
  return isSigned('community');
}

/* ── Route Handler 专用：直接读 req.cookies，避开 RSC 上下文 ── */

export async function isSignedFrom(req: NextRequest, id: string): Promise<boolean> {
  const a = await getAgreement(id);
  if (!a || !a.active) return false;
  return isSigValid(req.cookies.get(cookieName(a.id))?.value, a.version);
}

export async function isCommunitySignedFrom(req: NextRequest): Promise<boolean> {
  return isSignedFrom(req, 'community');
}
