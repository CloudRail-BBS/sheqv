'use client';

import { useState } from 'react';
import type { Policy } from '@/lib/policy-types';
import { MarkdownEditor } from './markdown-editor';

const BLANK: Policy = {
  slug: '',
  title: '',
  summary: '',
  body: '',
  version: 'v1',
  published: true,
  showOnCert: false,
  builtin: false,
  updatedAt: '',
};

/**
 * 政策后台：左侧/上方编辑，下方列表。
 * 内置政策可以改内容、下架，但不能删除；slug 创建后不可改。
 */
export function AdminPolicies({ initial }: { initial: Policy[] }) {
  const [rows, setRows] = useState<Policy[]>(initial);
  const [form, setForm] = useState<Policy>(BLANK);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const open = creating || editing !== null;

  function startCreate() {
    setForm({ ...BLANK });
    setCreating(true);
    setEditing(null);
    setMsg(null);
  }

  function startEdit(p: Policy) {
    setForm({ ...p });
    setCreating(false);
    setEditing(p);
    setMsg(null);
  }

  function close() {
    setCreating(false);
    setEditing(null);
    setMsg(null);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(
      creating ? '/api/v1/admin/policies' : `/api/v1/admin/policies/${editing!.slug}`,
      {
        method: creating ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: form.slug,
          title: form.title,
          summary: form.summary,
          body: form.body,
          version: form.version,
          published: form.published,
          showOnCert: form.showOnCert,
        }),
      },
    ).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { item?: Policy; message?: string }
      | null;
    setBusy(false);
    if (!res?.ok || !data?.item) {
      setMsg({ kind: 'err', text: data?.message ?? '保存失败' });
      return;
    }
    const item = data.item;
    setRows((list) =>
      creating ? [item, ...list] : list.map((p) => (p.slug === item.slug ? item : p)),
    );
    setMsg({ kind: 'ok', text: '已保存' });
    setCreating(false);
    setEditing(item);
    setForm({ ...item });
  }

  async function remove(p: Policy) {
    if (!confirm(`删除政策《${p.title}》？`)) return;
    const res = await fetch(`/api/v1/admin/policies/${p.slug}`, { method: 'DELETE' }).catch(
      () => null,
    );
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setMsg({ kind: 'err', text: data?.message ?? '删除失败' });
      return;
    }
    setRows((list) => list.filter((x) => x.slug !== p.slug));
    if (editing?.slug === p.slug) close();
  }

  return (
    <div className="admin-policies">
      <div className="between" style={{ marginTop: 12, marginBottom: 10 }}>
        <div>
          <h2 className="settings-main-title" style={{ fontSize: 15 }}>
            政策与协议
          </h2>
          <p className="settings-main-desc">
            用户协议、免责声明、隐私政策等；可控制是否发布、是否作为证书免责声明。
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>
          新建政策
        </button>
      </div>

      {open && (
        <div className="card card-pad policy-editor">
          <div className="between" style={{ marginBottom: 10 }}>
            <h3 style={{ fontSize: 13 }}>{creating ? '新建政策' : `编辑：${editing?.title}`}</h3>
            <button type="button" className="btn btn-sm btn-ghost" onClick={close}>
              收起
            </button>
          </div>

          <div className="seo-grid">
            <label className="field">
              <span>标识（slug，创建后不可改）</span>
              <input
                className="input mono"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="terms / disclaimer / privacy"
                disabled={!creating}
                maxLength={40}
              />
            </label>
            <label className="field">
              <span>标题</span>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例如：用户协议"
                maxLength={60}
              />
            </label>
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span>摘要（列表与分享摘要用）</span>
              <input
                className="input"
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                maxLength={200}
              />
            </label>
            <label className="field">
              <span>版本</span>
              <input
                className="input mono"
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
                placeholder="v1"
                maxLength={20}
              />
            </label>
            <label className="switch-row" style={{ marginTop: 26 }}>
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => setForm({ ...form, published: e.target.checked })}
              />
              <span>发布到前台</span>
            </label>
            <label className="switch-row" style={{ marginTop: 26 }}>
              <input
                type="checkbox"
                checked={form.showOnCert}
                onChange={(e) => setForm({ ...form, showOnCert: e.target.checked })}
              />
              <span>
                作为证书免责声明
                <em className="field-opt">建议只给「免责声明」开启</em>
              </span>
            </label>
          </div>

          <div style={{ marginTop: 10 }}>
            <MarkdownEditor
              value={form.body}
              onChange={(body) => setForm({ ...form, body })}
              rows={12}
              placeholder="政策正文，支持 Markdown。"
            />
          </div>

          <div className="row" style={{ gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
              {busy ? '保存中…' : '保存政策'}
            </button>
            {msg && (
              <span className="small" style={{ color: msg.kind === 'ok' ? 'var(--blue)' : 'var(--danger)' }}>
                {msg.text}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="policy-admin-list">
        {rows.map((p) => (
          <div key={p.slug} className="card policy-admin-row">
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 7, flexWrap: 'wrap' }}>
                <b>{p.title}</b>
                <span className="badge mono">{p.version}</span>
                <span className="mono small muted">/{p.slug}</span>
                {p.builtin && <span className="badge badge-ghost">内置</span>}
                {!p.published && <span className="badge badge-warn">草稿</span>}
                {p.showOnCert && <span className="badge">证书声明</span>}
              </div>
              <p className="small muted" style={{ marginTop: 4 }}>
                {p.summary || '暂无摘要'} · 更新于 {p.updatedAt}
              </p>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => startEdit(p)}>
                编辑
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={p.builtin}
                onClick={() => remove(p)}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
