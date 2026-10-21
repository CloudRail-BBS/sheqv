import { createHash, randomBytes } from 'node:crypto';
import type { SiteSettings } from './settings';
import type { Provider, SocialProfile } from './users';

/**
 * 第三方登录（OAuth 2.0）。
 *
 * 两家都用授权码模式，安全细节统一在这里处理：
 *  - state 防 CSRF：随机值同时写进 httpOnly Cookie 与授权 URL，回调时比对；
 *  - PKCE：GitHub 也支持（S256），统一发，避免以后换 confidential 应用再改；
 *  - 令牌交换只在服务端做，access_token 不落盘、不下发。
 */

export type OAuthProvider = Provider;

export const OAUTH_STATE_COOKIE = 'oauth_state';
export const OAUTH_VERIFIER_COOKIE = 'oauth_pkce';
export const OAUTH_TTL = 600;

/** 回调地址固定为本站路径，必须在平台后台登记为精确匹配 */
export function callbackUrl(baseUrl: string, provider: OAuthProvider): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/v1/auth/oauth/${provider}/callback`;
}

export function providerEnabled(provider: OAuthProvider, s: SiteSettings): boolean {
  return provider === 'github' ? Boolean(s.githubClientId && s.githubClientSecret) : Boolean(s.cnkdClientId && s.cnkdClientSecret);
}

const base64url = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function createState(): string {
  return base64url(randomBytes(16));
}

export function authorizeUrl(
  provider: OAuthProvider,
  opts: { clientId: string; redirectUri: string; state: string; challenge: string },
): string {
  if (provider === 'github') {
    const u = new URL('https://github.com/login/oauth/authorize');
    u.searchParams.set('client_id', opts.clientId);
    u.searchParams.set('redirect_uri', opts.redirectUri);
    // 只读公开资料，不申请 email —— scope 越少审核越简单
    u.searchParams.set('scope', 'read:user');
    u.searchParams.set('state', opts.state);
    u.searchParams.set('code_challenge', opts.challenge);
    u.searchParams.set('code_challenge_method', 'S256');
    return u.toString();
  }

  const u = new URL('https://cloud.cnkd.fun/account/oauth/authorize');
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', opts.clientId);
  u.searchParams.set('redirect_uri', opts.redirectUri);
  u.searchParams.set('scope', 'profile.basic profile.status');
  u.searchParams.set('state', opts.state);
  u.searchParams.set('code_challenge', opts.challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    if (typeof j.error === 'string') return j.error;
    if (j.error?.message) return j.error.message;
    if (j.message) return j.message;
  } catch {
    // 不是 JSON，直接截断文本
  }
  return text.slice(0, 200) || `HTTP ${res.status}`;
}

/** 授权码换 access_token */
export async function exchangeCode(
  provider: OAuthProvider,
  opts: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
    verifier: string;
  },
): Promise<string> {
  if (provider === 'github') {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        code: opts.code,
        redirect_uri: opts.redirectUri,
        code_verifier: opts.verifier,
      }),
    });
    const data = (await res.json().catch(() => null)) as
      | { access_token?: string; error?: string; error_description?: string }
      | null;
    if (!res.ok || !data?.access_token) {
      throw new OAuthError('exchange_failed', data?.error_description || data?.error || 'GitHub 授权失败');
    }
    return data.access_token;
  }

  const res = await fetch('https://cloud.cnkd.fun/api-control/account/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
      redirect_uri: opts.redirectUri,
      code_verifier: opts.verifier,
    }),
  });
  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; data?: { access_token?: string }; error?: { message?: string } }
    | null;
  const token = data?.data?.access_token;
  if (!res.ok || !data?.ok || !token) {
    throw new OAuthError('exchange_failed', data?.error?.message || (await readError(res)));
  }
  return token;
}

/** 读取用户资料，统一成 SocialProfile（sub 必须是平台稳定唯一键） */
export async function fetchProfile(provider: OAuthProvider, accessToken: string): Promise<SocialProfile> {
  if (provider === 'github') {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'blockarena',
      },
    });
    const data = (await res.json().catch(() => null)) as
      | { id?: number; login?: string; name?: string | null; avatar_url?: string }
      | null;
    if (!res.ok || !data?.id || !data.login) {
      throw new OAuthError('profile_failed', await readError(res));
    }
    return {
      provider: 'github',
      sub: String(data.id),
      login: data.login,
      displayName: data.name ?? undefined,
      avatar: data.avatar_url,
    };
  }

  const res = await fetch('https://cloud.cnkd.fun/api-control/account/oauth/userinfo', {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  });
  const data = (await res.json().catch(() => null)) as
    | {
        ok?: boolean;
        data?: { sub?: string; username?: string; displayName?: string; avatarUrl?: string; accountStatus?: string };
        error?: { message?: string };
      }
    | null;

  const info = data?.data;
  if (!res.ok || !data?.ok || !info?.sub) {
    throw new OAuthError('profile_failed', data?.error?.message || (await readError(res)));
  }
  // 文档要求：只有 active 的账号能用于生态授权
  if (info.accountStatus && info.accountStatus !== 'active') {
    throw new OAuthError('account_inactive', 'CNKD 账号当前状态不可用于登录');
  }

  return {
    provider: 'cnkd',
    sub: info.sub,
    login: info.username || info.displayName || info.sub.slice(0, 8),
    displayName: info.displayName,
    avatar: info.avatarUrl || undefined,
  };
}
