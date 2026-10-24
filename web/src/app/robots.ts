import type { MetadataRoute } from 'next';
import { getSiteMeta } from '@/lib/seo';

/**
 * robots.txt 走代码而不是 public/robots.txt：
 * 生产环境的域名来自后台设置，sitemap 地址要跟着走。
 */
export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = await getSiteMeta();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/admin/',
          '/api/',
          '/dev/',
          '/me',
          '/notifications',
          '/login',
          '/register',
          '/search',
        ],
      },
    ],
    sitemap: site.baseUrl ? `${site.baseUrl.replace(/\/+$/, '')}/sitemap.xml` : undefined,
    host: site.baseUrl || undefined,
  };
}
