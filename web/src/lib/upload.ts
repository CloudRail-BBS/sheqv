/**
 * 上传的公共层：进度、图片压缩、体积格式化。
 *
 * 为什么要自己压一遍再传：
 * 服务端 `media::MAX_BYTES` 是 2MB，而且是在**收到完整请求之后**才判的；
 * 手机随手一张照片 4–8MB，直接被拒，用户只看到「图片不能超过 2MB」。
 * 这里先在浏览器里把长边缩到 1600（头像 512）、转 WebP、按目标体积调质量，
 * 通常能从 5MB 压到 300KB 左右，上传也快得多。
 */

export type UploadResult = {
  ok: boolean;
  status: number;
  data: unknown;
  /** 服务端返回的 message，或本地兜底的错误文案 */
  message?: string;
};

/** 字节数转人类可读（1.2 MB）。上传提示里到处要用，放这里统一。 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${i === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/**
 * 带进度的上传。
 *
 * `fetch` 拿不到上传进度（只有下载侧），所以这里用 XHR；
 * 返回结构统一，调用方不用区分网络错误 / HTTP 错误 / JSON 解析失败。
 */
export function uploadWithProgress(
  url: string,
  file: File | Blob,
  opts: {
    onProgress?: (percent: number) => void;
    headers?: Record<string, string>;
    timeoutMs?: number;
  } = {},
): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    if (opts.timeoutMs) xhr.timeout = opts.timeoutMs;
    for (const [key, value] of Object.entries(opts.headers ?? {})) {
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText) as unknown;
      } catch {
        data = null;
      }
      const message = (data as { message?: string } | null)?.message;
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        data,
        message,
      });
    };
    xhr.onerror = () =>
      resolve({ ok: false, status: 0, data: null, message: '网络异常，请检查连接后重试' });
    xhr.ontimeout = () =>
      resolve({ ok: false, status: 0, data: null, message: '上传超时，请重试' });
    xhr.onabort = () =>
      resolve({ ok: false, status: 0, data: null, message: '上传已取消' });
    xhr.send(file);
  });
}

/* ── 图片压缩 ───────────────────────────── */

let webpSupport: boolean | null = null;

function supportsWebp(): boolean {
  if (webpSupport !== null) return webpSupport;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    webpSupport = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    // 默认 from-image：按 EXIF 方向摆正，手机竖拍不会躺倒
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode_failed'));
      el.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

export type CompressOptions = {
  /** 长边上限，默认 1600（与服务端 media::MAX_WIDTH 一致） */
  maxEdge?: number;
  /** 目标体积上限，默认 1.6MB，给服务端 2MB 留余量 */
  maxBytes?: number;
};

export type CompressOutcome = {
  file: File;
  /** 压缩前的字节数；等于 file.size 表示没动 */
  originalSize: number;
  /** 是否真的重编码过 */
  compressed: boolean;
};

/**
 * 把图片压到「长边 + 体积」双限制内。
 *
 * - GIF 原样返回：canvas 会丢掉动画帧；
 * - 非图片原样返回，由调用方决定要不要拦；
 * - 压完反而更大（小图 / 已经是高压缩比）时保留原文件。
 */
export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<CompressOutcome> {
  const { maxEdge = 1600, maxBytes = 1.6 * 1024 * 1024 } = opts;
  const unchanged: CompressOutcome = { file, originalSize: file.size, compressed: false };

  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return unchanged;
  }

  let decoded: Decoded | null = null;
  try {
    decoded = await decode(file);
    const scale = Math.min(1, maxEdge / Math.max(decoded.width, decoded.height));

    // 尺寸已经够小、体积也达标：不做无意义的重编码
    if (scale === 1 && file.size <= maxBytes) return unchanged;

    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return unchanged;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // 透明图转 JPEG 会变黑底，先铺白；WebP 保留透明
    const mime = supportsWebp() ? 'image/webp' : 'image/jpeg';
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(decoded.source, 0, 0, width, height);
    decoded.release();
    decoded = null;

    let quality = 0.9;
    let blob = await toBlob(canvas, mime, quality);
    while (blob && blob.size > maxBytes && quality > 0.55) {
      quality -= 0.1;
      blob = await toBlob(canvas, mime, quality);
    }
    if (!blob) return unchanged;
    if (blob.size >= file.size && scale === 1) return unchanged;

    const ext = mime === 'image/webp' ? '.webp' : '.jpg';
    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    return {
      file: new File([blob], `${base}${ext}`, { type: mime, lastModified: Date.now() }),
      originalSize: file.size,
      compressed: true,
    };
  } catch {
    return unchanged;
  } finally {
    decoded?.release();
  }
}

/** 上传前的本地格式校验说明，几个入口共用一套文案 */
export function imageTypeError(file: File): string | null {
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (allowed.includes(file.type)) return null;
  // 手机相册里的 HEIC 在部分安卓浏览器上 type 为空
  if (!file.type && /\.(heic|heif)$/i.test(file.name)) {
    return 'HEIC 照片请先在相册里转成 JPEG，或改从文件里选 JPG / PNG';
  }
  return '只支持 PNG / JPEG / WebP / GIF';
}
