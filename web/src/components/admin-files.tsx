'use client';

import { useCallback, useEffect, useState } from 'react';

interface MediaItem {
  id: string;
  kind: string;
  owner: string;
  mime: string;
  size: number;
  storage: string;
  createdAt: number;
  url: string;
}

interface ResourceItem {
  id: string;
  name: string;
  owner: string;
  size: number;
  mime: string;
  storage: string;
  createdAt: number;
  url: string;
}

const fmtSize = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const fmtDay = (ts: number) => new Date(ts).toISOString().slice(0, 10);

const KIND_LABEL: Record<string, string> = {
  avatar: '头像',
  background: '背景',
  post: '正文图',
};

/** 后台文件管理：图片与资源文件分开看，能搜、能删 */
export function AdminFiles() {
  const [tab, setTab] = useState<'media' | 'resource'>('media');
  const [q, setQ] = useState('');
  const [media, setMedia] = useState<{ items: MediaItem[]; count: number; bytes: number }>({
    items: [],
    count: 0,
    bytes: 0,
  });
  const [resources, setResources] = useState<{ items: ResourceItem[]; count: number; bytes: number }>(
    { items: [], count: 0, bytes: 0 },
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/admin/files?q=${encodeURIComponent(q)}`, {
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) {
      setMsg({ ok: false, text: '读取文件列表失败（需要管理员权限）' });
      return;
    }
    const data = (await res.json()) as {
      media: { items: MediaItem[]; count: number; bytes: number };
      resources: { items: ResourceItem[]; count: number; bytes: number };
    };
    setMedia(data.media);
    setResources(data.resources);
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(kind: 'media' | 'resource', id: string) {
    if (!window.confirm('删除后不可恢复（对象存储里的原件也会删掉），确定？')) return;
    setBusy(id);
    const res = await fetch(`/api/v1/admin/files/${kind}/${id}`, { method: 'DELETE' }).catch(
      () => null,
    );
    setBusy(null);
    if (!res?.ok) {
      setMsg({ ok: false, text: '删除失败' });
      return;
    }
    setMsg({ ok: true, text: '已删除' });
    void load();
  }

  return (
    <>
      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div className="between" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div className="row wrap" style={{ gap: 6 }}>
            <button type="button" className="chip" data-on={tab === 'media'} onClick={() => setTab('media')}>
              图片 {media.count}
            </button>
            <button
              type="button"
              className="chip"
              data-on={tab === 'resource'}
              onClick={() => setTab('resource')}
            >
              资源文件 {resources.count}
            </button>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <input
              className="input"
              style={{ height: 32, width: 220 }}
              value={q}
              placeholder="按文件名 / 用户搜索"
              onChange={(e) => setQ(e.target.value)}
            />
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => void load()}>
              刷新
            </button>
          </div>
        </div>

        <p className="small muted" style={{ marginTop: 8 }}>
          图片共 {media.count} 个、{fmtSize(media.bytes)}；资源文件 {resources.count} 个、
          {fmtSize(resources.bytes)}。删除会同时清掉对象存储里的原件。
        </p>

        {msg && (
          <p className="small" style={{ marginTop: 6, color: msg.ok ? 'var(--ok)' : 'var(--danger)' }}>
            {msg.text}
          </p>
        )}
      </div>

      {tab === 'media' ? (
        media.items.length === 0 ? (
          <div className="card empty-state">
            <b>没有图片</b>
            <p>用户上传头像、背景与正文图后会出现在这里。</p>
          </div>
        ) : (
          <div className="file-grid">
            {media.items.map((m) => (
              <div key={m.id} className="card file-card">
                <span className="file-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${m.url}?w=320`} alt="" loading="lazy" decoding="async" />
                </span>
                <div className="file-meta">
                  <span className="badge badge-ghost">{KIND_LABEL[m.kind] ?? m.kind}</span>
                  <span className={`badge ${m.storage === 's3' ? 'badge-live' : ''}`}>
                    {m.storage === 's3' ? '对象存储' : '本地'}
                  </span>
                </div>
                <div className="file-sub">
                  <span>{m.owner || '—'}</span>
                  <span className="mono">{fmtSize(m.size)}</span>
                </div>
                <div className="file-actions">
                  <a className="btn btn-sm btn-ghost" href={m.url} target="_blank" rel="noreferrer">
                    查看
                  </a>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={busy === m.id}
                    onClick={() => void remove('media', m.id)}
                  >
                    {busy === m.id ? '删除中…' : '删除'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : resources.items.length === 0 ? (
        <div className="card empty-state">
          <b>没有资源文件</b>
          <p>资源发布时上传的附件会出现在这里。</p>
        </div>
      ) : (
        <div className="card adm-table">
          <table>
            <thead>
              <tr>
                <th>文件名</th>
                <th style={{ width: 110 }}>上传者</th>
                <th style={{ width: 90 }}>大小</th>
                <th style={{ width: 100 }}>存储</th>
                <th style={{ width: 100 }}>时间</th>
                <th style={{ width: 120 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {resources.items.map((f) => (
                <tr key={f.id}>
                  <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.name}
                  </td>
                  <td>{f.owner || '—'}</td>
                  <td className="mono">{fmtSize(f.size)}</td>
                  <td>
                    <span className={`badge ${f.storage === 's3' ? 'badge-live' : ''}`}>
                      {f.storage === 's3' ? '对象存储' : '本地'}
                    </span>
                  </td>
                  <td className="mono small">{fmtDay(f.createdAt)}</td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <a className="btn btn-sm btn-ghost adm-mini" href={f.url}>
                        下载
                      </a>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost adm-mini"
                        disabled={busy === f.id}
                        onClick={() => void remove('resource', f.id)}
                      >
                        {busy === f.id ? '删除中…' : '删除'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
