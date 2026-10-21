'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Announcement, AnnouncementKind } from '@/lib/announcement-store';

const KINDS: AnnouncementKind[] = ['规则', '版本', '活动', '系统'];
const fmt = (ts: number) => new Date(ts).toISOString().slice(0, 16).replace('T', ' ');

const EMPTY = { title: '', body: '', kind: '系统' as AnnouncementKind, pinned: false, published: true };

export function AnnouncementAdmin({ items }: { items: Announcement[] }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function startEdit(a: Announcement) {
    setEditing(a.id);
    setForm({ title: a.title, body: a.body, kind: a.kind, pinned: a.pinned, published: a.published });
    setMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function reset() {
    setEditing(null);
    setForm(EMPTY);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const res = await fetch('/api/v1/admin/announcements', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(editing ? { id: editing, ...form } : form),
    }).catch(() => null);

    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);

    if (!res?.ok) {
      setMsg({ kind: 'err', text: data?.message ?? '保存失败' });
      return;
    }
    setMsg({ kind: 'ok', text: editing ? '已更新' : '已发布' });
    reset();
    router.refresh();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch('/api/v1/admin/announcements', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { message?: string } | null;
      setMsg({ kind: 'err', text: d?.message ?? '操作失败' });
      return;
    }
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    await fetch(`/api/v1/admin/announcements?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    if (editing === id) reset();
    router.refresh();
  }

  return (
    <>
      <form className="card card-pad" onSubmit={submit} style={{ marginBottom: 12 }}>
        <div className="between" style={{ marginBottom: 10 }}>
          <h3 style={{ fontSize: 13 }}>{editing ? '编辑公告' : '发布公告'}</h3>
          {editing && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={reset}>
              取消编辑
            </button>
          )}
        </div>

        <label className="field">
          <span>标题</span>
          <input
            className="input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="2–60 字"
            maxLength={60}
            required
          />
        </label>

        <label className="field" style={{ marginTop: 10 }}>
          <span>正文（支持换行，纯文本）</span>
          <textarea
            className="input textarea"
            rows={6}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder="写清楚生效时间、影响范围和需要玩家做什么"
            required
          />
        </label>

        <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
          <label className="field" style={{ minWidth: 140 }}>
            <span>分类</span>
            <select
              className="input"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as AnnouncementKind })}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          <label className="check" style={{ marginTop: 18 }}>
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
            />
            <span>置顶</span>
          </label>

          <label className="check" style={{ marginTop: 18 }}>
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => setForm({ ...form, published: e.target.checked })}
            />
            <span>立即发布</span>
          </label>

          <button className="btn btn-primary" type="submit" disabled={busy} style={{ marginLeft: 'auto' }}>
            {busy ? '保存中…' : editing ? '保存修改' : '发布'}
          </button>
        </div>

        {msg && (
          <p className="small" style={{ marginTop: 10, color: msg.kind === 'ok' ? 'var(--accent)' : 'var(--danger)' }}>
            {msg.text}
          </p>
        )}
      </form>

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>标题</th>
              <th>分类</th>
              <th>状态</th>
              <th>创建</th>
              <th style={{ width: 180 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="small muted" style={{ padding: '18px 16px' }}>
                  还没有公告。用上面的表单发布第一条。
                </td>
              </tr>
            ) : (
              items.map((a) => (
                <tr key={a.id}>
                  <td style={{ maxWidth: 360 }}>
                    <a href={`/announcements/${a.id}`} className="adm-link" target="_blank" rel="noreferrer">
                      {a.title}
                    </a>
                    {a.pinned && <span className="badge badge-warn" style={{ marginLeft: 6 }}>置顶</span>}
                  </td>
                  <td>
                    <span className="badge">{a.kind}</span>
                  </td>
                  <td>
                    <span className={'badge ' + (a.published ? 'badge-live' : 'badge-ghost')}>
                      {a.published ? '已发布' : '草稿'}
                    </span>
                  </td>
                  <td className="mono small muted">{fmt(a.createdAt)}</td>
                  <td>
                    <div className="row wrap" style={{ gap: 6 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => startEdit(a)}>
                        编辑
                      </button>
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={busy}
                        onClick={() => patch(a.id, { published: !a.published })}
                      >
                        {a.published ? '转草稿' : '发布'}
                      </button>
                      <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => remove(a.id)}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
