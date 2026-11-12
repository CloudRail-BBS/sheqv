'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { compressImage, formatBytes, imageTypeError, uploadWithProgress } from '@/lib/upload';

/** 与服务端 media::MAX_BYTES 一致 */
const MAX = 2 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

/**
 * 资源详情页的方标 / 封面。
 *
 * 有封面就贴图，没有就回落到「游戏配色 + 标题首字」。作者本人（或管理员）
 * 悬停能看到「换封面」：选图 → 本地压到 1200px → 传媒体库 → PATCH 资源。
 * 这样老资源也能事后补封面，不必重新发布。
 */
export function ResourceCover({
  id,
  cover,
  title,
  tone,
  canEdit,
}: {
  id: string;
  cover: string;
  title: string;
  tone: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(cover);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    // 封面最大也就 76px 显示，1200 边足够并且压得小
    const { file: prepared } = await compressImage(file, { maxEdge: 1200, maxBytes: MAX * 0.8 });
    if (prepared.size > MAX) {
      setBusy(false);
      setErr(`图片压缩后仍有 ${formatBytes(prepared.size)}，请换一张小一点的`);
      return;
    }
    const up = await uploadWithProgress('/api/v1/me/media?kind=resource', prepared, {
      headers: { 'content-type': prepared.type || 'application/octet-stream' },
      timeoutMs: 60_000,
    });
    if (!up.ok) {
      setBusy(false);
      setErr(up.message ?? '封面上传失败');
      return;
    }
    const url = (up.data as { url?: string } | undefined)?.url ?? '';
    if (!url) {
      setBusy(false);
      setErr('封面上传失败');
      return;
    }
    const res = await fetch(`/api/v1/resources/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cover: url }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setErr('封面保存失败');
      return;
    }
    setCurrent(url);
    router.refresh();
  }

  return (
    <div className={'res-head-mark cover-' + tone + (current ? ' has-img' : '')}>
      {current ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={current}
          alt={`${title} 的封面`}
          decoding="async"
          onError={() => setCurrent('')}
        />
      ) : (
        <span aria-hidden="true">{title.trim().slice(0, 1)}</span>
      )}

      {canEdit && (
        <>
          <input ref={ref} type="file" accept={ACCEPT} hidden onChange={onPick} />
          <button
            type="button"
            className="res-cover-edit"
            onClick={() => ref.current?.click()}
            disabled={busy}
            title={current ? '换一张封面图 / logo' : '上传封面图 / logo'}
          >
            {busy ? '上传中…' : current ? '换封面' : '加封面'}
          </button>
        </>
      )}
      {err && <em className="res-cover-err">{err}</em>}
    </div>
  );
}
