import { NextResponse, type NextRequest } from 'next/server';
import { getBaseUrl } from '@/lib/base-url';
import { getSettings } from '@/lib/settings';
import { SESSION_COOKIE, issueSessionToken, sessionCookieOptions } from '@/lib/session';
import { findByIdentity, upsertSocialUser } from '@/lib/users';
import {
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  OAuthError,
  callbackUrl,
  exchangeCode,
  fetchProfile,
  providerEnabled,
  type OAuthProvider,
} from '@/lib/oauth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/auth/oauth/:provider/callback
 *
 * 1. 校验 state（Cookie 与 URL 必须一致，防 CSRF）
 * 2. 服务端换 token，再取用户资料
 * 3. 已有绑定 → 直接登录；没有 → 建号（受「开放注册」开关约束）
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const base = await getBaseUrl(req);
  const fail = (code: string) => NextResponse.redirect(`${base}/login?error=${code}`);

  if (provider !== 'github' && provider !== 'cnkd') return fail('unknown_provider');
  const p = provider as OAuthProvider;

  const settings = await getSettings();
  if (!providerEnabled(p, settings)) return fail('provider_disabled');

  const q = req.nextUrl.searchParams;
  if (q.get('error')) return fail('access_denied');

  const code = q.get('code') ?? '';
  const state = q.get('state') ?? '';
  const cookieState = req.cookies.get(OAUTH_STATE_COOKIE)?.value ?? '';
  const cookieVerifier = req.cookies.get(OAUTH_VERIFIER_COOKIE)?.value ?? '';

  const [stateProvider, stateValue] = cookieState.split('.');
  if (!code || !state || stateProvider !== p || !stateValue || stateValue !== state) {
    return fail('state_mismatch');
  }

  const [verifierProvider, verifier] = cookieVerifier.split('.');
  if (verifierProvider !== p || !verifier) return fail('missing_pkce');

  let user;
  let created = false;

  try {
    const clientId = p === 'github' ? settings.githubClientId : settings.cnkdClientId;
    const clientSecret = p === 'github' ? settings.githubClientSecret : settings.cnkdClientSecret;

    const accessToken = await exchangeCode(p, {
      clientId,
      clientSecret,
      code,
      redirectUri: callbackUrl(base, p),
      verifier,
    });

    const profile = await fetchProfile(p, accessToken);

    // 注册开关只拦"新建账号"，老用户照常登录
    const existing = await findByIdentity(p, profile.sub);
    if (!existing && !settings.allowRegister) return fail('register_closed');

    const result = await upsertSocialUser(profile);
    if (!result) return fail('create_failed');
    user = result.user;
    created = result.created;

    if (user.banned) return fail('account_banned');
  } catch (e) {
    if (e instanceof OAuthError) return fail(e.code);
    return fail('oauth_failed');
  }

  const { token, maxAge } = await issueSessionToken(user.id);
  const res = NextResponse.redirect(`${base}/me${created ? '?welcome=1' : ''}`);
  res.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions(req), maxAge });
  // 一次性 Cookie 用完即弃
  res.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 });
  res.cookies.set(OAUTH_VERIFIER_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
