'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmtNum, fmtSize } from '@/lib/resource-types';

/**
 * 资源详情页的操作区：点赞与下载。
 *
 * 下载先打一次 `POST /download` 拿真实地址，再触发浏览器下载——
 * 这样计数、去重与跳转是同一份事实，不会出现「页面显示 10 次、后台记 11 次」。
 */
export function ResourceActions({
  id,
  initialLiked,
  initialLikes,
  initialDownloads,
  sizeBytes,
  url,
  loggedIn,
  canDelete,
  directDownload,
}: {
  id: string;
  initialLiked: boolean;
  initialLikes: number;
  initialDownloads: number;
  sizeBytes: number;
  url: string;
  loggedIn: boolean;
  canDelete: boolean;
  directDownload: boolean;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [likes, setLikes] = useState(initialLikes);
  const [downloads, setDownloads] = useState(initialDownloads);
  const [busy, setBusy] = useState<'like' | 'download' | 'delete' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function toggleLike() {
    if (!loggedIn) {
      router.push('/login');
      return;
    }
    if (busy) return;
    setBusy('like');
    const res = await fetch(`/api/v1/resources/${id}/like`, { method: 'POST' }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setMsg('点赞失败，稍后再试');
      return;
    }
    const data = (await res.json()) as { liked: boolean; likeCount: number };
    setLiked(data.liked);
    setLikes(data.likeCount);
  }

  async function download() {
    if (busy) return;
    setBusy('download');
    setMsg(null);

    const res = await fetch(`/api/v1/resources/${id}/download`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }).catch(() => null);

    if (!res?.ok) {
      setBusy(null);
      setMsg('获取下载地址失败，请稍后再试');
      return;
    }
    const data = (await res.json()) as { url: string; downloadCount: number };
    setDownloads(data.downloadCount);
    setBusy(null);

    if (!directDownload) {
      // 微信内置浏览器：明确告诉用户去外部浏览器，而不是悄悄失败
      setMsg('当前环境不支持直接下载，请复制链接到浏览器打开');
      return;
    }
    const a = document.createElement('a');
    a.href = data.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  }

  async function remove() {
    if (!confirm('删除后不可恢复，确定删除这个资源？')) return;
    setBusy('delete');
    const res = await fetch(`/api/v1/resources/${id}`, { method: 'DELETE' }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setMsg('删除失败，可能没有权限');
      return;
    }
    router.push('/resources');
    router.refresh();
  }

  return (
    <div className="res-actions">
      <button className="act" data-on={liked} onClick={toggleLike} disabled={busy === 'like'}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 20.5S3.5 15.2 3.5 9.4A4.9 4.9 0 0 1 12 5.6a4.9 4.9 0 0 1 8.5 3.8c0 5.8-8.5 11.1-8.5 11.1Z"
            fill={liked ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        <span className="mono">{fmtNum(likes)}</span>
      </button>

      <button className="btn btn-primary btn-sm" onClick={download} disabled={busy === 'download'}>
        {busy === 'download' ? '准备中…' : '下载资源'}
      </button>

      <span className="small muted mono">↓ {fmtNum(downloads)}</span>
      <span className="small muted">{fmtSize(sizeBytes)}</span>

      <a href={url} target="_blank" rel="noreferrer noopener" className="small muted" style={{ marginLeft: 'auto' }}>
        原始链接 ↗
      </a>

      {canDelete && (
        <button className="btn btn-sm btn-ghost" onClick={remove} disabled={busy === 'delete'}>
          删除
        </button>
      )}

      {msg && <span className="small" style={{ color: 'var(--amber)', width: '100%' }}>{msg}</span>}
    </div>
  );
}
