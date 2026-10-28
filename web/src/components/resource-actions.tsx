'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmtNum, fmtSize, type ResourceFile } from '@/lib/resource-types';

/**
 * 资源详情页的操作区：点赞与下载。
 *
 * 下载先打一次接口拿真实地址，再触发浏览器下载——计数、去重与跳转是同一份事实。
 * 有附件时逐个文件下载；只有一个外链时退回单个「下载资源」按钮。
 */
export function ResourceActions({
  id,
  initialLiked,
  initialLikes,
  initialDownloads,
  sizeBytes,
  url,
  files = [],
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
  files?: ResourceFile[];
  loggedIn: boolean;
  canDelete: boolean;
  directDownload: boolean;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [likes, setLikes] = useState(initialLikes);
  const [downloads, setDownloads] = useState(initialDownloads);
  const [fileDownloads, setFileDownloads] = useState<Record<string, number>>(() =>
    Object.fromEntries(files.map((f) => [f.id, f.downloads])),
  );
  const [busy, setBusy] = useState<'like' | 'download' | 'delete' | null>(null);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const external = /^https?:\/\//i.test(url);
  const hasFiles = files.length > 0;
  // 有附件时列表已经覆盖了「本站文件」这一份，主按钮只留给真正的外链
  const showMainButton = external || !hasFiles;

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

  function trigger(href: string) {
    if (!directDownload) {
      setMsg('当前环境不支持直接下载，请复制链接到浏览器打开');
      return;
    }
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
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
    trigger(data.url);
  }

  async function downloadFile(fileId: string) {
    if (busy) return;
    setBusy('download');
    setBusyFile(fileId);
    setMsg(null);

    const res = await fetch(`/api/v1/resources/${id}/files/${encodeURIComponent(fileId)}/download`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }).catch(() => null);

    if (!res?.ok) {
      setBusy(null);
      setBusyFile(null);
      setMsg('获取下载地址失败，请稍后再试');
      return;
    }
    const data = (await res.json()) as {
      url: string;
      fileDownloads: number;
      downloadCount: number;
    };
    setBusy(null);
    setBusyFile(null);
    setFileDownloads((prev) => ({ ...prev, [fileId]: data.fileDownloads }));
    setDownloads(data.downloadCount);
    trigger(data.url);
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
    <>
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

        {showMainButton && (
          <button className="btn btn-primary btn-sm" onClick={download} disabled={busy === 'download'}>
            {busy === 'download' ? '准备中…' : hasFiles ? '下载主文件' : '下载资源'}
          </button>
        )}

        <span className="small muted mono">↓ {fmtNum(downloads)}</span>
        <span className="small muted">{fmtSize(sizeBytes)}</span>

        {external && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="small muted"
            style={{ marginLeft: 'auto' }}
          >
            原始链接 ↗
          </a>
        )}

        {canDelete && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={remove}
            disabled={busy === 'delete'}
            style={external ? undefined : { marginLeft: 'auto' }}
          >
            删除
          </button>
        )}

        {msg && <span className="small" style={{ color: 'var(--warn)', width: '100%' }}>{msg}</span>}
      </div>

      {hasFiles && (
        <div className="res-files">
          <div className="res-files-head">
            <b>文件</b>
            <span className="small muted">{files.length} 个，共 {fmtSize(sizeBytes)}</span>
          </div>
          <ul className="res-file-list">
            {files.map((f) => (
              <li key={f.id} className="res-file-row">
                <span className="res-file-ext" aria-hidden="true">
                  {f.name.split('.').pop()?.slice(0, 4).toUpperCase() || 'FILE'}
                </span>
                <span className="res-file-name" title={f.name}>{f.name}</span>
                <span className="res-file-size mono">{fmtSize(f.size)}</span>
                <span className="res-file-dl mono" title="该文件下载次数">
                  ↓ {fmtNum(fileDownloads[f.id] ?? f.downloads)}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => downloadFile(f.id)}
                  disabled={busy === 'download'}
                >
                  {busyFile === f.id ? '准备中…' : '下载'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
