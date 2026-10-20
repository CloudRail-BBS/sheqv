import { NextResponse, type NextRequest } from 'next/server';
import { cookieName } from '@/lib/agreements';
import { getAgreement } from '@/lib/agreement-store';
import { getCurrentUserFrom } from '@/lib/current-user';

/**
 * POST /api/v1/agreements/sign
 * body: { id }
 * 写入 `ag_<id>=<version>.<epoch>`（httpOnly），版本变更后旧签名自动失效。
 * 签署人取自当前登录账号，不接受客户端传昵称。
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUserFrom(req);
  if (!user) {
    return NextResponse.json({ error: 'need_login', message: '请先登录再签署公约' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  const id = body?.id;

  const agreement = id ? await getAgreement(id) : null;
  if (!agreement || !agreement.active) {
    return NextResponse.json({ error: 'unknown_agreement' }, { status: 400 });
  }

  const at = Math.floor(Date.now() / 1000);
  const value = `${agreement.version}.${at}`;

  const res = NextResponse.json({
    ok: true,
    id: agreement.id,
    version: agreement.version,
    at,
    nickname: user.nickname,
  });

  res.cookies.set(cookieName(agreement.id), value, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: true,
  });

  return res;
}
