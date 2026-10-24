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
  /** 登录页左侧能力条：每行「标题|描述」，最多 3 条；留空用内置文案 */
  loginPoints: string;
  allowRegister: boolean;
  homeShowAnnouncements: boolean;
  /** 邮箱验证码登录开关（SMTP 配置只在后台可见，公开投影里没有） */
  emailLoginEnabled: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  /** true = 465 直连 TLS；false = 587 STARTTLS */
  smtpSecure: boolean;
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
  loginPoints: '',
  allowRegister: true,
  homeShowAnnouncements: true,
  emailLoginEnabled: false,
  smtpHost: '',
  smtpPort: '465',
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  smtpSecure: true,
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
