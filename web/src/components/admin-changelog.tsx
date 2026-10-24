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

export function AdminChangelog() {
  const [items, setItems] = useState<Entry[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/admin/changelog', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '读取失败' });
      return;
    }
    const data = (await res.json()) as { items: Entry[] };
    setItems(data.items);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setMsg(null);

    const res = await fetch(editing ? `/api/v1/admin/changelog/${editing}` : '/api/v1/admin/changelog', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    }).catch(() => null);

    setBusy(false);

    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setMsg({ kind: 'err', text: data?.message ?? '保存失败' });
      return;
    }

    setMsg({ kind: 'ok', text: editing ? '已保存' : '已创建' });
    setDraft(null);
    setEditing(null);
    void load();
  }

  async function togglePublish(e: Entry) {
    await fetch(`/api/v1/admin/changelog/${e.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ published: !e.published }),
    }).catch(() => null);
    void load();
  }

  async function remove(id: string) {
    if (!confirm('删除这条更新日志？')) return;
    await fetch(`/api/v1/admin/changelog/${id}`, { method: 'DELETE' }).catch(() => null);
    void load();
  }

  return (
    <>
      {msg && (
        <p className={`small ${msg.kind === 'err' ? 'auth-err' : 'muted'}`} style={{ marginTop: 10 }}>
          {msg.text}
        </p>
      )}

      <div className="between" style={{ marginTop: 14 }}>
        <h3 style={{ fontSize: 13 }}>全部条目</h3>
        {!draft && (
          <button className="btn btn-sm btn-primary" onClick={() => { setDraft({ ...EMPTY }); setEditing(null); }}>
            新建条目
          </button>
        )}
      </div>

      <div className="card" style={{ marginTop: 8, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>版本</th>
              <th>标题</th>
              <th>标签</th>
              <th>状态</th>
              <th style={{ width: 170 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id}>
                <td className="mono small">{e.version || '—'}</td>
                <td>{e.title}</td>
                <td>
                  <span className="badge">{e.tag}</span>
                </td>
                <td className="small muted">{e.published ? '已发布' : '草稿'}</td>
                <td>
                  <span className="row" style={{ gap: 6 }}>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => {
                        setEditing(e.id);
                        setDraft({
                          version: e.version,
                          title: e.title,
                          body: e.body,
                          tag: e.tag,
                          published: e.published,
                        });
                      }}
                    >
                      编辑
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => togglePublish(e)}>
                      {e.published ? '下线' : '发布'}
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => remove(e.id)}>
                      删除
                    </button>
                  </span>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="small muted">
                  还没有更新日志
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {draft && (
        <div className="card card-pad" style={{ marginTop: 14 }}>
          <h3 style={{ fontSize: 13 }}>{editing ? '编辑条目' : '新建条目'}</h3>

          <div className="adm-form" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 10 }}>
            <label className="field">
              <span>版本号</span>
              <input
                className="input"
                value={draft.version}
                onChange={(e) => setDraft({ ...draft, version: e.target.value })}
                placeholder="2026.10.24"
                maxLength={24}
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
          </div>

          <label className="field" style={{ marginTop: 10 }}>
            <span>标题</span>
            <input
              className="input"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="新增审核与身份组"
              maxLength={60}
            />
          </label>

          <label className="field" style={{ marginTop: 10 }}>
            <span>正文</span>
            <textarea
              className="input"
              rows={5}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder="每一行会作为一条要点显示"
              style={{ height: 'auto', padding: '8px 10px', resize: 'vertical' }}
            />
          </label>

          <label className="check" style={{ marginTop: 10 }}>
            <input
              type="checkbox"
              checked={draft.published}
              onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
            />
            <span>立即发布（取消则存为草稿）</span>
          </label>

          <div className="row" style={{ gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? '保存中…' : '保存'}
            </button>
            <button className="btn btn-ghost" onClick={() => { setDraft(null); setEditing(null); }}>
              取消
            </button>
          </div>
        </div>
      )}
    </>
  );
}
