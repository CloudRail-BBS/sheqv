'use client';

import { useState } from 'react';
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

export function AdminPosts({ items }: { items: AdminPostRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const kw = q.trim().toLowerCase();
  const shown = kw
    ? items.filter(
        (p) =>
          (p.title ?? '').toLowerCase().includes(kw) ||
          (p.body ?? '').toLowerCase().includes(kw) ||
          p.author.toLowerCase().includes(kw),
      )
    : items;

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
              <th style={{ width: 120 }}>操作</th>
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
                <tr key={p.id}>
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
                    <button className="btn btn-sm btn-ghost" disabled={busyId === p.id} onClick={() => remove(p.id)}>
                      {busyId === p.id ? '删除中…' : '删除'}
                    </button>
                  </td>
                </tr>
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
