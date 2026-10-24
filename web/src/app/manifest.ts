import type { MetadataRoute } from 'next';
import { getSettings } from '@/lib/settings';

/** PWA / 主屏幕图标清单：名字跟随后台站点设置 */
export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getSettings();
  const name = (settings.siteName || '云轨社区').trim();

  return {
    name,
    short_name: Array.from(name).slice(0, 6).join(''),
    description: settings.seoDescription || '玩家社区 · 公会战队 · 赛事确权',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0a0a0b',
    theme_color: '#3e7cff',
    lang: 'zh-CN',
    icons: [
      { src: '/logo-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
