/** 奖品图片上传（抽奖奖品 / 礼品卡都用这一条通道） */

/** 与服务端 `media::MAX_BYTES` 保持一致 */
export const REWARD_IMAGE_MAX = 2 * 1024 * 1024;

export const REWARD_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

export const REWARD_IMAGE_TYPES = REWARD_IMAGE_ACCEPT.split(',');

/** 选文件后先在本地拦一道，省掉一次 2MB 的无效上传 */
export function checkRewardImage(file: File): string | null {
  if (!REWARD_IMAGE_TYPES.includes(file.type)) {
    return '只支持 PNG / JPEG / WebP / GIF';
  }
  if (file.size > REWARD_IMAGE_MAX) {
    return '图片不能超过 2 MB';
  }
  return null;
}

export type UploadResult = { ok: true; url: string } | { ok: false; message: string };

/**
 * 上传一张奖品图，返回可以直接塞进 `customImage` 的地址。
 *
 * kind=reward 在服务端只对管理员开放（别的用途走 avatar / background / post）。
 */
export async function uploadRewardImage(file: File): Promise<UploadResult> {
  const local = checkRewardImage(file);
  if (local) return { ok: false, message: local };

  const res = await fetch('/api/v1/me/media?kind=reward', {
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
