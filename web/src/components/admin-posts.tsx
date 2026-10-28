'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface AdminPostRow {
  id: string;
  author: string;
  title?: string;
  body?: string;
  tags?: string[];
  createdAt?: number;
  likes: number;
  comments: number;
  href: string;
}

const day = (ts?: number) => (ts ? new Date(ts).toISOString().slice(0, 16).replace('T', ' ') : '—');

interface Floor {
  id: string;
  floor: number;
  author: string;
  body: string;
  at: number;
  isHost: boolean;
}

export function AdminPosts({ items }: { items: AdminPostRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [loadingFloors, setLoadingFloors] = useState(false);

  const kw = q.trim().toLowerCase();
  const shown = kw
    ? items.filter(
        (p) =>
          (p.title ?? '').toLowerCase().includes(kw) ||
          (p.body ?? '').toLowerCase().includes(kw) ||
          p.author.toLowerCase().includes(kw),
      )
    : items;

  /** 展开某个帖子的楼层：前台是「楼主 1、回复从 2 起」，后台沿用同一套编号 */
  async function toggleFloors(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setFloors([]);
    setLoadingFloors(true);
    const res = await fetch(`/api/v1/admin/posts/${encodeURIComponent(id)}/floors`, {
      cache: 'no-store',
    }).catch(() => null);
    setLoadingFloors(false);
    if (!res?.ok) {
      setErr('楼层读取失败');
      return;
    }
    const data = (await res.json()) as { floors: Floor[] };
    setFloors(data.floors ?? []);
  }

  async function removeComment(id: string) {
    if (!window.confirm('删除这一楼？删除后楼层号会往前补。')) return;
    const res = await fetch(`/api/v1/admin/comments/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).catch(() => null);
    if (!res?.ok) {
      setErr('删除失败');
      return;
    }
    if (openId) await toggleFloors(openId);
    router.refresh();
  }

  async function remove(id: string) {
    setBusyId(id);
    setErr(null);
    const res = await fetch(`/api/v1/admin/posts?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusyId(null);
    if (!res?.ok) {
      setErr(data?.message ?? '删除失败');
      return;
    }
    router.refresh();
  }

  return (
    <>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <input
          className="input"
          placeholder="按标题 / 正文 / 作者筛选"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <span className="small muted">
          {shown.length} / {items.length} 条
        </span>
        {err && (
          <span className="small" style={{ color: 'var(--danger)', marginLeft: 'auto' }}>
            {err}
          </span>
        )}
      </div>

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>标题</th>
              <th>作者</th>
              <th className="num">赞</th>
              <th className="num">评</th>
              <th>时间</th>
              <th style={{ width: 170 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={6} className="small muted" style={{ padding: '18px 16px' }}>
                  {items.length === 0 ? '还没有帖子。' : '没有匹配的帖子。'}
                </td>
              </tr>
            ) : (
              shown.map((p) => (
                <Fragment key={p.id}>
                <tr>
                  <td style={{ maxWidth: 380 }}>
                    <a href={p.href} className="adm-link" target="_blank" rel="noreferrer">
                      {p.title || p.body?.slice(0, 30) || '(无标题)'}
                    </a>
                    {p.tags && p.tags.length > 0 && (
                      <span className="small muted" style={{ marginLeft: 6 }}>
                        {p.tags.map((t) => `#${t}`).join(' ')}
                      </span>
                    )}
                  </td>
                  <td>{p.author}</td>
                  <td className="num mono">{p.likes}</td>
                  <td className="num mono">{p.comments}</td>
                  <td className="mono small muted">{day(p.createdAt)}</td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost adm-mini"
                        aria-expanded={openId === p.id}
                        onClick={() => void toggleFloors(p.id)}
                      >
                        {openId === p.id ? '收起' : `楼层 ${p.comments + 1}`}
                      </button>
                      <button className="btn btn-sm btn-ghost adm-mini" disabled={busyId === p.id} onClick={() => remove(p.id)}>
                        {busyId === p.id ? '删除中…' : '删除'}
                      </button>
                    </div>
                  </td>
                </tr>
                {openId === p.id && (
                  <tr>
                    <td colSpan={6} style={{ background: 'var(--panel-2)', padding: 0 }}>
                      {loadingFloors ? (
                        <p className="small muted" style={{ padding: '12px 16px' }}>读取楼层中…</p>
                      ) : (
                        <div className="adm-floors">
                          {floors.map((f) => (
                            <div key={f.id} className="adm-floor" data-host={f.isHost}>
                              <span className="adm-floor-no mono">#{f.floor}</span>
                              <span className="adm-floor-author">
                                {f.author}
                                {f.isHost && <span className="badge badge-gold" style={{ marginLeft: 6 }}>楼主</span>}
                              </span>
                              <span className="adm-floor-body">{f.body}</span>
                              <span className="small muted mono">{day(f.at)}</span>
                              {!f.isHost && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-ghost adm-mini"
                                  onClick={() => void removeComment(f.id)}
                                >
                                  删楼
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="small muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
        删除帖子会连带清掉它的评论与点赞数，避免留下孤儿数据。删除不可撤销。
      </p>
    </>
  );
}
