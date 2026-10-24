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
  description: string;
  keywords: string[];
  baseUrl: string;
  logo: string;
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
    logo: absolute((settings.logoImage || '/logo.png').trim(), baseUrl),
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
  const defaultTitle = `${site.name} · 玩家社区与赛事确权`;
  const headline = title ? `${title} · ${site.name}` : defaultTitle;
  const shareImage = absolute(input.image || '/opengraph-image.png', site.baseUrl);
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
      title: title ? `${title} · ${site.name}` : site.name,
      description,
      images: [shareImage],
    },
    robots: input.noIndex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
        },
  };
}

/** 首页专用：站点级 JSON-LD（WebSite + 站内搜索） */
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
