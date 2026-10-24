'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Kind = 'avatar' | 'background';

const MAX = 2 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

async function postImage(kind: Kind, file: File): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`/api/v1/me/media?kind=${kind}`, {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  }).catch(() => null);

  if (!res?.ok) {
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, message: data?.message ?? '上传失败' };
  }
  return { ok: true };
}

/** 头像 / 主页背景上传：选图即上传，成功后 refresh 让服务端数据重新渲染 */
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
  const [err, setErr] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) {
      setErr('只支持 PNG / JPEG / WebP / GIF');
      return;
    }
    if (file.size > MAX) {
      setErr('图片不能超过 2MB');
      return;
    }

    setBusy(true);
    setErr(null);
    const result = await postImage(kind, file);
    setBusy(false);
    if (!result.ok) {
      setErr(result.message ?? '上传失败');
      return;
    }
    router.refresh();
  }

  return (
    <span className="img-upload">
      <input ref={ref} type="file" accept={ACCEPT} hidden onChange={onPick} />
      <button type="button" className={className} onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? '上传中…' : label}
      </button>
      {err && <span className="img-upload-err">{err}</span>}
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
