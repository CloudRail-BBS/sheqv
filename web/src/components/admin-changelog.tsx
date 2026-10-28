'use client';

import { useCallback, useEffect, useState } from 'react';

interface Entry {
  id: string;
  version: string;
  title: string;
  body: string;
  tag: string;
  published: boolean;
  releasedAt: number;
}

const TAGS = ['功能', '修复', '安全', '样式', '文档'];

const EMPTY = { version: '', title: '', body: '', tag: '功能', published: true };
type Draft = typeof EMPTY;

const day = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/** 后台更新日志：正文一行一条，前台按要点渲染 */
export function AdminChangelog() {
  const [items, setItems] = useState<Entry[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/admin/changelog', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) {
      setMsg({ ok: false, text: '读取失败（需要管理员权限）' });
      return;
    }
    const data = (await res.json()) as { items: Entry[] };
    setItems(data.items ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(
      editing ? `/api/v1/admin/changelog/${editing}` : '/api/v1/admin/changelog',
      {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      },
    ).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    if (!res?.ok) {
      setMsg({ ok: false, text: data?.message ?? '保存失败' });
      return;
    }
    setMsg({ ok: true, text: editing ? '已保存' : '已创建' });
    setDraft(null);
    setEditing(null);
    void load();
  }

  async function togglePublish(e: Entry) {
    const res = await fetch(`/api/v1/admin/changelog/${e.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ published: !e.published }),
    }).catch(() => null);
    if (!res?.ok) {
      setMsg({ ok: false, text: '操作失败' });
      return;
    }
    void load();
  }

  async function remove(id: string) {
    if (!window.confirm('删除这条更新日志？')) return;
    const res = await fetch(`/api/v1/admin/changelog/${id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      setMsg({ ok: false, text: '删除失败' });
      return;
    }
    if (editing === id) {
      setEditing(null);
      setDraft(null);
    }
    void load();
  }

  function edit(e: Entry) {
    setEditing(e.id);
    setDraft({
      version: e.version,
      title: e.title,
      body: e.body,
      tag: e.tag || '功能',
      published: e.published,
    });
    setMsg(null);
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => {
            setEditing(null);
            setDraft({ ...EMPTY });
            setMsg(null);
          }}
        >
          新建条目
        </button>
      </div>

      {msg && (
        <p className="small" style={{ color: msg.ok ? 'var(--ok)' : 'var(--danger)', marginBottom: 8 }}>
          {msg.text}
        </p>
      )}

      {draft && (
        <div className="card card-pad" style={{ marginBottom: 12 }}>
          <div className="between" style={{ marginBottom: 10 }}>
            <b>{editing ? '编辑更新日志' : '新建更新日志'}</b>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDraft(null)}>
              取消
            </button>
          </div>

          <div className="adm-form" style={{ gridTemplateColumns: '160px minmax(0, 1fr)' }}>
            <label className="field">
              <span>版本号</span>
              <input
                className="input mono"
                value={draft.version}
                maxLength={24}
                placeholder="2026.10.28.1"
                onChange={(e) => setDraft({ ...draft, version: e.target.value })}
              />
            </label>
            <label className="field">
              <span>标题（2–60 字）</span>
              <input
                className="input"
                value={draft.title}
                maxLength={60}
                placeholder="一句话概括这次更新"
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label className="field">
              <span>标签</span>
              <select
                className="input"
                value={draft.tag}
                onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
              >
                {TAGS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <div className="field" style={{ justifyContent: 'flex-end' }}>
              <span>状态</span>
              <label className="check" style={{ height: 34 }}>
                <input
                  type="checkbox"
                  checked={draft.published}
                  onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
                />
                <span>立即发布</span>
              </label>
            </div>
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span>正文（一行一条要点）</span>
              <textarea
                className="input textarea"
                rows={6}
                maxLength={8000}
                value={draft.body}
                placeholder={'新增工单系统…\n修复人机验证不显示…'}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
            </label>
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={save}
              disabled={busy || draft.title.trim().length < 2}
            >
              {busy ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="card empty-state">
          <b>还没有更新日志</b>
          <p>点右上角「新建条目」写第一条。</p>
        </div>
      ) : (
        <div className="ticket-list">
          {items.map((e) => (
            <div key={e.id} className="card card-pad">
              <div className="between" style={{ alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <b style={{ fontSize: 13 }}>{e.title}</b>
                    {e.version && <span className="cl-ver mono">{e.version}</span>}
                    <span className={'badge ' + (e.published ? 'badge-ok' : 'badge-ghost')}>
                      {e.published ? '已发布' : '草稿'}
                    </span>
                    <span className="small muted mono">{day(e.releasedAt)}</span>
                  </div>
                  <p className="small muted" style={{ marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                    {e.body}
                  </p>
                </div>
                <div className="row" style={{ gap: 4, flex: 'none' }}>
                  <button type="button" className="btn btn-sm btn-ghost adm-mini" onClick={() => edit(e)}>
                    编辑
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost adm-mini"
                    onClick={() => void togglePublish(e)}
                  >
                    {e.published ? '转草稿' : '发布'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost adm-mini"
                    onClick={() => void remove(e.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
