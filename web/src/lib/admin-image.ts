/** 后台图片上传（奖品图 / 卡面图 / 关于页头像与 logo 共用一条通道） */

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

/** 选文件后先在本地拦一道，省掉一次 2MB 的无效上传 */
export function checkAdminImage(file: File): string | null {
  if (!ADMIN_IMAGE_TYPES.includes(file.type)) {
    return '只支持 PNG / JPEG / WebP / GIF';
  }
  if (file.size > ADMIN_IMAGE_MAX) {
    return '图片不能超过 2 MB';
  }
  return null;
}

export type UploadResult = { ok: true; url: string } | { ok: false; message: string };

/** 上传一张后台展示图，返回可以直接存进业务字段的地址 */
export async function uploadAdminImage(file: File, kind: AdminImageKind = 'reward'): Promise<UploadResult> {
  const local = checkAdminImage(file);
  if (local) return { ok: false, message: local };

  const res = await fetch(`/api/v1/me/media?kind=${kind}`, {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  }).catch(() => null);

  if (!res?.ok) {
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, message: data?.message ?? '上传失败，请重试' };
  }

  const data = (await res.json().catch(() => null)) as { url?: string } | null;
  if (!data?.url) return { ok: false, message: '上传成功但没拿到图片地址' };
  return { ok: true, url: data.url };
}
