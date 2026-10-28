import { cache } from 'react';
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
  /** 首页默认标题；留空用「站点名 · 玩家社区与赛事确权」 */
  seoTitle: string;
  /** 搜索引擎与社交分享用的描述；留空用内置文案 */
  seoDescription: string;
  /** 逗号分隔的关键词；留空用内置文案 */
  seoKeywords: string;
  /** 分享封面；留空用 /opengraph-image.png */
  seoOgImage: string;
  /** 是否允许搜索引擎收录（false = 全站 noindex + robots 全禁） */
  seoIndex: boolean;
  /** Google Search Console 验证码 */
  seoVerification: string;
  /** Twitter 分享卡片账号，如 @cloudrail */
  seoTwitter: string;
  /** db = PostgreSQL bytea；s3 = 对象存储（阿里云 OSS / 雨云 ROS） */
  storageDriver: string;
  storageEndpoint: string;
  storageRegion: string;
  storageBucket: string;
  storageAccessKey: string;
  storageSecretKey: string;
  storagePathPrefix: string;
  storageForcePathStyle: boolean;
  /** 个推 Android 推送 */
  getuiAppId: string;
  getuiAppKey: string;
  getuiAppSecret: string;
  getuiMasterSecret: string;
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
  /** 关于社区：介绍正文与加入说明（纯文本，空行分段） */
  aboutIntro: string;
  aboutJoin: string;
  /** 公告发布时是否自动推送 */
  pushAnnounce: boolean;
  loginHint: string;
  registerHint: string;
  /** 登录页左侧能力条：每行「标题|描述」，最多 3 条；留空用内置文案 */
  loginPoints: string;
  guildsHint: string;
  teamsHint: string;
  matchesHint: string;
  serversHint: string;
  resourcesHint: string;
  devTeamsHint: string;
  leaderboardHint: string;
  pointsHint: string;
  rewardsHint: string;
  announcementsHint: string;
  policiesHint: string;
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
  /** 帖子审核策略：off 关闭 / ai AI 预审 / all 全部人工 */
  postAuditMode: string;
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  /** 留空用内置审核提示词 */
  aiPrompt: string;
  /** 侧边栏 / 移动端底部栏的 key 列表（逗号分隔，空串用内置默认） */
  sidebarItems: string;
  tabbarItems: string;
  /** 仅公开投影提供：id + secret 是否都配好 */
  githubEnabled?: boolean;
  cnkdEnabled?: boolean;
}

const DEFAULTS: SiteSettings = {
  siteName: '云轨社区',
  logoText: '',
  logoImage: '/logo.png',
  seoTitle: '',
  seoDescription: '',
  seoKeywords: '',
  seoOgImage: '',
  seoIndex: true,
  seoVerification: '',
  seoTwitter: '',
  storageDriver: 'db',
  storageEndpoint: '',
  storageRegion: '',
  storageBucket: '',
  storageAccessKey: '',
  storageSecretKey: '',
  storagePathPrefix: 'uploads',
  storageForcePathStyle: true,
  getuiAppId: '',
  getuiAppKey: '',
  getuiAppSecret: '',
  getuiMasterSecret: '',
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
  aboutIntro: '',
  aboutJoin: '',
  pushAnnounce: false,
  loginHint: '',
  registerHint: '',
  loginPoints: '',
  guildsHint: '',
  teamsHint: '',
  matchesHint: '',
  serversHint: '',
  resourcesHint: '',
  devTeamsHint: '',
  leaderboardHint: '',
  pointsHint: '',
  rewardsHint: '',
  announcementsHint: '',
  policiesHint: '',
  allowRegister: true,
  homeShowAnnouncements: true,
  emailLoginEnabled: false,
  smtpHost: '',
  smtpPort: '465',
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  smtpSecure: true,
  postAuditMode: 'off',
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: 'gpt-4o-mini',
  aiPrompt: '',
  sidebarItems: '',
  tabbarItems: '',
};

async function fetchSettings(): Promise<Partial<SiteSettings>> {
  const user = await getCurrentUser();
  const path = user?.isAdmin ? '/api/v1/admin/settings' : '/api/v1/settings';
  const d = await apiGetOr<{ settings: Partial<SiteSettings> }>(path, { settings: {} });
  return d.settings ?? {};
}

/**
 * 站点设置：请求内只取一次。
 * 一页里 layout / generateMetadata / 页脚 / base-url 会各要一遍，不去重就是 4 次内网请求。
 */
export const getSettings = cache(async (): Promise<SiteSettings> => {
  return { ...DEFAULTS, ...(await fetchSettings()) };
});

export async function getOverrides(): Promise<Partial<SiteSettings>> {
  const d = await apiGetOr<{ overrides: Partial<SiteSettings> }>('/api/v1/admin/settings', {
    overrides: {},
  });
  return d.overrides ?? {};
}
