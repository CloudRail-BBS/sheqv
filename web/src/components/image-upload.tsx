'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { compressImage, formatBytes, imageTypeError, uploadWithProgress } from '@/lib/upload';

type Kind = 'avatar' | 'background';

/** 与服务端 media::MAX_BYTES 一致 */
const MAX = 2 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

/** 头像 512 足够清晰（展示最大 96px），背景按服务端的 1600 */
const MAX_EDGE: Record<Kind, number> = { avatar: 512, background: 1600 };

/**
 * 头像 / 主页背景上传：选图 → 本地压缩 → 带进度上传 → 刷新。
 *
 * 压缩这一步很关键：手机照片动辄 5–8MB，服务端 2MB 就会拒；
 * 压完通常只剩几百 KB，既传得上去也快。
 */
export function ImageUploadButton({
  kind,
  label,
  className = 'btn btn-sm btn-ghost',
}: {
  kind: Kind;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const typeErr = imageTypeError(file);
    if (typeErr) {
      setErr(typeErr);
      return;
    }

    setBusy(true);
    setErr(null);
    setNote(null);
    setStage('压缩中…');

    const { file: prepared, originalSize, compressed } = await compressImage(file, {
      maxEdge: MAX_EDGE[kind],
      maxBytes: MAX * 0.8,
    });

    if (prepared.size > MAX) {
      setBusy(false);
      setStage('');
      setErr(
        file.type === 'image/gif'
          ? `GIF 动图不能压缩（会丢帧），请换一张 2MB 以内的`
          : `图片压缩后仍有 ${formatBytes(prepared.size)}，请换一张小一点的`,
      );
      return;
    }

    setStage('上传中 0%');
    const res = await uploadWithProgress(`/api/v1/me/media?kind=${kind}`, prepared, {
      headers: { 'content-type': prepared.type || 'application/octet-stream' },
      onProgress: (pct) => setStage(`上传中 ${pct}%`),
      timeoutMs: 60_000,
    });

    if (!res.ok) {
      setBusy(false);
      setStage('');
      setErr(res.message ?? '上传失败');
      return;
    }

    if (compressed) {
      const saved = Math.round((1 - prepared.size / originalSize) * 100);
      setNote(`${formatBytes(originalSize)} → ${formatBytes(prepared.size)}（省 ${saved}%）`);
    }
    setStage('完成');
    // 让「已压缩」提示露一下再刷新，刷新后组件会重新挂载
    window.setTimeout(() => {
      setBusy(false);
      setStage('');
      router.refresh();
    }, 500);
  }

  return (
    <span className="img-upload">
      <input ref={ref} type="file" accept={ACCEPT} hidden onChange={onPick} />
      <button
        type="button"
        className={className}
        onClick={() => ref.current?.click()}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? stage || '处理中…' : label}
      </button>
      {err && <span className="img-upload-err">{err}</span>}
      {!err && note && <span className="img-upload-note">{note}</span>}
    </span>
  );
}

/** 清空头像 / 背景（只清本站媒体，不碰外链） */
export function ImageClearButton({
  field,
  label,
  className = 'btn btn-sm btn-ghost',
}: {
  field: 'avatar' | 'profileBg';
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function clear() {
    setBusy(true);
    setErr(null);
    const res = await fetch('/api/v1/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [field]: '' }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setErr('清除失败');
      return;
    }
    router.refresh();
  }

  return (
    <span className="img-upload">
      <button type="button" className={className} onClick={clear} disabled={busy}>
        {busy ? '清除中…' : label}
      </button>
      {err && <span className="img-upload-err">{err}</span>}
    </span>
  );
}
