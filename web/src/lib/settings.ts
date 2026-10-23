import { apiGetOr } from './api-client';
import { getCurrentUser } from './current-user';

/**
 * 站点设置。
 *
 * 公开页只拿得到**白名单投影**（不含 geetestKey / afdianToken / OAuth secret）；
 * 管理员访问后台时自动改走 `/admin/settings`，拿到完整值，表单才不会把密钥写空。
 */

export interface SiteSettings {
  siteName: string;
  logoText: string;
  logoImage: string;
  publicBaseUrl: string;
  geetestId: string;
  geetestKey: string;
  afdianUserId: string;
  afdianToken: string;
  afdianPageUrl: string;
  githubClientId: string;
  githubClientSecret: string;
  cnkdClientId: string;
  cnkdClientSecret: string;
  footerText: string;
  footerIcp: string;
  footerLinks: string;
  meGuestText: string;
  loginHint: string;
  registerHint: string;
  allowRegister: boolean;
  homeShowAnnouncements: boolean;
  /** 仅公开投影提供：id + secret 是否都配好 */
  githubEnabled?: boolean;
  cnkdEnabled?: boolean;
}

const DEFAULTS: SiteSettings = {
  siteName: '方块竞技场',
  logoText: '',
  logoImage: '',
  publicBaseUrl: '',
  geetestId: '',
  geetestKey: '',
  afdianUserId: '',
  afdianToken: '',
  afdianPageUrl: '',
  githubClientId: '',
  githubClientSecret: '',
  cnkdClientId: '',
  cnkdClientSecret: '',
  footerText: '',
  footerIcp: '',
  footerLinks: '',
  meGuestText: '',
  loginHint: '',
  registerHint: '',
  allowRegister: true,
  homeShowAnnouncements: true,
};

async function fetchSettings(): Promise<Partial<SiteSettings>> {
  const user = await getCurrentUser();
  const path = user?.isAdmin ? '/api/v1/admin/settings' : '/api/v1/settings';
  const d = await apiGetOr<{ settings: Partial<SiteSettings> }>(path, { settings: {} });
  return d.settings ?? {};
}

export async function getSettings(): Promise<SiteSettings> {
  return { ...DEFAULTS, ...(await fetchSettings()) };
}

export async function getOverrides(): Promise<Partial<SiteSettings>> {
  const d = await apiGetOr<{ overrides: Partial<SiteSettings> }>('/api/v1/admin/settings', {
    overrides: {},
  });
  return d.overrides ?? {};
}
