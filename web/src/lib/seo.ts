import type { Metadata } from 'next';
import { cache } from 'react';
import { config } from './config';
import { getBaseUrl } from './base-url';
import { getSettings } from './settings';

/**
 * SEO 的单一出口。
 *
 * 站点名、描述、关键词都能在后台改，所以 metadata **不能**写死成常量对象；
 * 每个页面用 `buildMetadata()` 生成，标题模板与 canonical 才会跟着后台走。
 *
 * 注意：`getBaseUrl()` 依赖 `headers()`，静态页面构建期调用会抛错，
 * 这里统一兜底成环境变量里的对外地址（再没有就留空、不写 canonical）。
 */

export const DEFAULT_DESCRIPTION =
  '云轨社区是 Minecraft / Rusted Warfare 玩家社区：联机大厅实时显示服务器状态与联机房间，公会与战队各有独立榜单，赛事名单可存证追溯。';

export const DEFAULT_KEYWORDS = [
  '云轨社区',
  'Minecraft',
  '我的世界',
  '我的世界服务器',
  'Rusted Warfare',
  '联机大厅',
  '玩家社区',
  '公会',
  '战队',
  '电竞赛事',
];

function absolute(pathOrUrl: string, base: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (!base) return pathOrUrl;
  try {
    return new URL(pathOrUrl, base).toString();
  } catch {
    return pathOrUrl;
  }
}

export interface SiteMeta {
  name: string;
  /** 首页 / 默认标题 */
  defaultTitle: string;
  description: string;
  keywords: string[];
  baseUrl: string;
  logo: string;
  /** 分享封面绝对地址 */
  ogImage: string;
  /** 是否允许搜索引擎收录 */
  index: boolean;
  /** Google Search Console 验证码 */
  verification: string;
  /** Twitter 卡片账号 */
  twitter: string;
}

export const getSiteMeta = cache(async (): Promise<SiteMeta> => {
  const settings = await getSettings();

  let baseUrl = '';
  try {
    baseUrl = await getBaseUrl();
  } catch {
    baseUrl = config.publicBaseUrl;
  }

  const name = (settings.siteName || config.siteName || '云轨社区').trim();
  const defaultTitle =
    (settings.seoTitle || '').trim() || `${name} · 玩家社区与赛事确权`;
  const description = (settings.seoDescription || '').trim() || DEFAULT_DESCRIPTION;
  const keywords = (settings.seoKeywords || '')
    .split(/[,，\s]+/)
    .map((k) => k.trim())
    .filter(Boolean);

  return {
    name,
    description,
    keywords: keywords.length > 0 ? keywords : DEFAULT_KEYWORDS,
    baseUrl,
    defaultTitle,
    logo: absolute((settings.logoImage || '/logo.png').trim(), baseUrl),
    ogImage: absolute((settings.seoOgImage || '/opengraph-image.png').trim(), baseUrl),
    index: settings.seoIndex !== false,
    verification: (settings.seoVerification || '').trim(),
    twitter: (settings.seoTwitter || '').trim(),
  };
});

export interface PageMetaInput {
  /** 页面标题；不传就用站点默认标题 */
  title?: string;
  description?: string;
  /** 站内路径，如 `/guilds`；用于 canonical 与 og:url */
  path?: string;
  /** 不进搜索索引（登录、个人中心、搜索页等） */
  noIndex?: boolean;
  /** 覆盖分享图（默认用根目录的 opengraph-image.png） */
  image?: string;
  /** 只在根 layout 传 true：标题用 default + template，子页面只给字符串 */
  root?: boolean;
  type?: 'website' | 'article';
}

export async function buildMetadata(input: PageMetaInput = {}): Promise<Metadata> {
  const site = await getSiteMeta();
  const description = (input.description || site.description).trim();
  const title = input.title?.trim();
  const defaultTitle = site.defaultTitle;
  const headline = title ? `${title} · ${site.name}` : defaultTitle;
  const shareImage = absolute(input.image || site.ogImage, site.baseUrl);
  const indexable = site.index && !input.noIndex;
  const canonical = input.path
    ? site.baseUrl
      ? absolute(input.path, site.baseUrl)
      : input.path
    : undefined;

  return {
    ...(site.baseUrl ? { metadataBase: new URL(site.baseUrl) } : {}),
    // 子页面只给字符串，由根 layout 的 template 补站点名；
    // 两处都给 default 的话，Next 会把 template 再套一遍，标题里出现两次站名。
    title: title ?? (input.root ? { default: defaultTitle, template: `%s · ${site.name}` } : defaultTitle),
    description,
    keywords: site.keywords,
    ...(site.verification
      ? { other: { 'google-site-verification': site.verification } }
      : {}),
    applicationName: site.name,
    creator: site.name,
    publisher: site.name,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      type: input.type ?? 'website',
      siteName: site.name,
      title: headline,
      description,
      locale: 'zh_CN',
      url: canonical,
      images: [{ url: shareImage, width: 1200, height: 630, alt: site.name }],
    },
    twitter: {
      card: 'summary_large_image',
      site: site.twitter || undefined,
      title: title ? `${title} · ${site.name}` : site.name,
      description,
      images: [shareImage],
    },
    robots: indexable
      ? {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
        }
      : { index: false, follow: false },
  };
}

/** 首页专用：站点级 JSON-LD（WebSite + 站内搜索） */
/** 序列化成可安全内联的 JSON-LD（转义 `<`，避免正文里的 </script> 截断） */
export function jsonLdString(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** 帖子：DiscussionForumPosting，带作者、时间、点赞与回复数 */
export async function postJsonLd(post: {
  id: string;
  title?: string | null;
  body: string;
  author: string;
  authorId?: string | null;
  likes: number;
  comments: number;
  createdAt: number;
}): Promise<string> {
  const site = await getSiteMeta();
  const base = (site.baseUrl || '').replace(/\/+$/, '');
  const url = base ? `${base}/p/${post.id}` : `/p/${post.id}`;
  const title = post.title?.trim() || post.body.replace(/\s+/g, ' ').slice(0, 40);

  return jsonLdString({
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: title,
    url,
    mainEntityOfPage: url,
    datePublished: new Date(post.createdAt).toISOString(),
    inLanguage: 'zh-CN',
    author: {
      '@type': 'Person',
      name: post.author,
      ...(base && post.authorId ? { url: `${base}/u/${post.authorId}` } : {}),
    },
    publisher: { '@type': 'Organization', name: site.name },
    commentCount: post.comments,
    interactionStatistic: [
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/LikeAction',
        userInteractionCount: post.likes,
      },
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/CommentAction',
        userInteractionCount: post.comments,
      },
    ],
    articleBody: post.body.replace(/\s+/g, ' ').slice(0, 400),
  });
}

/** 资源：SoftwareApplication，价格 0、按游戏分类 */
export async function resourceJsonLd(item: {
  id: string;
  title: string;
  summary: string;
  author: string;
  category: string;
  gameLabel: string;
  createdAt: number;
  updatedAt: number;
}): Promise<string> {
  const site = await getSiteMeta();
  const base = (site.baseUrl || '').replace(/\/+$/, '');
  const url = base ? `${base}/resources/${item.id}` : `/resources/${item.id}`;

  return jsonLdString({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: item.title,
    description: item.summary,
    url,
    applicationCategory: item.category,
    operatingSystem: item.gameLabel,
    datePublished: new Date(item.createdAt).toISOString(),
    dateModified: new Date(item.updatedAt).toISOString(),
    author: { '@type': 'Person', name: item.author },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' },
    inLanguage: 'zh-CN',
  });
}

export async function websiteJsonLd(): Promise<string> {
  const site = await getSiteMeta();
  const url = site.baseUrl || '/';
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    alternateName: 'CloudRail Community',
    url,
    description: site.description,
    inLanguage: 'zh-CN',
    potentialAction: site.baseUrl
      ? {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${site.baseUrl}/search?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        }
      : undefined,
  });
}
