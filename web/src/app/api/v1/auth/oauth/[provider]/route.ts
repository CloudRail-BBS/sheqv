import { NextResponse, type NextRequest } from 'next/server';
import { getBaseUrl } from '@/lib/base-url';
import { getSettings } from '@/lib/settings';
import {
  OAUTH_STATE_COOKIE,
  OAUTH_TTL,
  OAUTH_VERIFIER_COOKIE,
  authorizeUrl,
  callbackUrl,
  createPkce,
  createState,
  providerEnabled,
  type OAuthProvider,
} from '@/lib/oauth';

export const dynamic = 'force-dynamic';

/** 当前请求是否是 https（反代下看 X-Forwarded-Proto） */
function isSecure(req: NextRequest): boolean {
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (proto) return proto === 'https';
  return req.nextUrl.protocol === 'https:';
}

/**
 * GET /api/v1/auth/oauth/:provider
 * 生成 state 与 PKCE，写 httpOnly Cookie，然后跳去平台授权页。
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const base = await getBaseUrl(req);

  if (provider !== 'github' && provider !== 'cnkd') {
    return NextResponse.redirect(`${base}/login?error=unknown_provider`);
  }

  const p = provider as OAuthProvider;
  const settings = await getSettings();
  if (!providerEnabled(p, settings)) {
    return NextResponse.redirect(`${base}/login?error=provider_disabled&provider=${p}`);
  }

  const clientId = p === 'github' ? settings.githubClientId : settings.cnkdClientId;
  const state = createState();
  const { verifier, challenge } = createPkce();

  const target = authorizeUrl(p, {
    clientId,
    redirectUri: callbackUrl(base, p),
    state,
    challenge,
  });

  const res = NextResponse.redirect(target);
  const opts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: OAUTH_TTL,
    secure: isSecure(req),
  };
  res.cookies.set(OAUTH_STATE_COOKIE, `${p}.${state}`, opts);
  res.cookies.set(OAUTH_VERIFIER_COOKIE, `${p}.${verifier}`, opts);
  return res;
}
