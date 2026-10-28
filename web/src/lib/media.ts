/**
 * 站内图片按需取尺寸。
 *
 * `/api/v1/media/{id}` 支持 `?w=`，服务端第一次缩好后就缓存在 `media_variants`，
 * 之后直接读；头像即使不带参数也会自动按 256px 出图。
 * 外部图片（图床、CDN）原样返回，不硬加参数。
 */

const MEDIA_PREFIX = '/api/v1/media/';

/** 常用尺寸：列表缩略图 / 详情大图 / 分享图素材 */
export const MEDIA_W = {
  thumb: 320,
  card: 640,
  cover: 960,
  hero: 1280,
  full: 1600,
} as const;

export function mediaUrl(url: string | undefined | null, width: number): string | undefined {
  if (!url) return undefined;
  if (!url.startsWith(MEDIA_PREFIX)) return url;
  // 已经带参数的（老的分享链接、带版本的 URL）不再动
  if (url.includes('?')) return url;
  return `${url}?w=${width}`;
}
