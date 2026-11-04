/** 后台图片上传（奖品图 / 卡面图 / 关于页头像与 logo 共用一条通道） */

import { compressImage, formatBytes, imageTypeError, uploadWithProgress } from './upload';

/** 与服务端 `media::MAX_BYTES` 保持一致 */
export const ADMIN_IMAGE_MAX = 2 * 1024 * 1024;

export const ADMIN_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

export const ADMIN_IMAGE_TYPES = ADMIN_IMAGE_ACCEPT.split(',');

/**
 * `reward` = 抽奖奖品 / 礼品卡 / 卡面；
 * `about` = 关于社区的成员头像与合作单位 logo。
 * 两者在服务端都只对管理员开放（别的用途走 avatar / background / post）。
 */
export type AdminImageKind = 'reward' | 'about';

/** 选文件后只拦格式；体积交给压缩，不再一上来就把 5MB 的手机照片拒掉 */
export function checkAdminImage(file: File): string | null {
  if (ADMIN_IMAGE_TYPES.includes(file.type)) return null;
  return imageTypeError(file) ?? '只支持 PNG / JPEG / WebP / GIF';
}

export type UploadResult = { ok: true; url: string } | { ok: false; message: string };

/**
 * 上传一张后台展示图，返回可以直接存进业务字段的地址。
 * 先在本地压到 1600 长边 / 1.6MB，再带进度上传。
 */
export async function uploadAdminImage(
  file: File,
  kind: AdminImageKind = 'reward',
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const local = checkAdminImage(file);
  if (local) return { ok: false, message: local };

  const { file: prepared } = await compressImage(file, {
    maxEdge: 1600,
    maxBytes: ADMIN_IMAGE_MAX * 0.8,
  });
  if (prepared.size > ADMIN_IMAGE_MAX) {
    return { ok: false, message: `压缩后仍有 ${formatBytes(prepared.size)}，请换一张小一点的` };
  }

  const res = await uploadWithProgress(`/api/v1/me/media?kind=${kind}`, prepared, {
    headers: { 'content-type': prepared.type || 'application/octet-stream' },
    onProgress,
    timeoutMs: 60_000,
  });
  if (!res.ok) return { ok: false, message: res.message ?? '上传失败，请重试' };

  const url = (res.data as { url?: string } | null)?.url;
  if (!url) return { ok: false, message: '上传成功但没拿到图片地址' };
  return { ok: true, url };
}
