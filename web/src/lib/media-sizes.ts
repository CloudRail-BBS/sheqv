import { apiGetOr } from './api-client';

export type ImageSize = { w: number; h: number };
export type ImageSizes = Record<string, ImageSize>;

/**
 * 正文里的站内图片只存了 URL，没有宽高。渲染前批量问一次（最多 24 张），
 * 让 `<SmartImage>` 用真实比例占位，加载完成后不会把下面的内容顶下去。
 *
 * 查不到（老图在 S3、或不是站内图）就回落默认比例，不影响渲染。
 */
export async function getImageSizes(text: string): Promise<ImageSizes> {
  const ids = [...text.matchAll(/\/api\/v1\/media\/([A-Za-z0-9]+)/g)]
    .map((m) => m[1])
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .slice(0, 24);
  if (ids.length === 0) return {};

  const data = await apiGetOr<{ items: ImageSizes }>(
    `/api/v1/media/sizes?ids=${ids.join(',')}`,
    { items: {} },
  );
  return data.items ?? {};
}
