'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { WIKI_CATEGORIES, categoryLabel, fmtDay, type WikiEntry } from '@/lib/wiki-types';

/**
 * 后台百科维护：列表 + 新建/编辑弹窗。
 *
 * 词条正文是 Markdown，编辑器和帖子编辑一致（纯 textarea + 等宽字体）；
 * 保存后 `router.refresh()` 重新拉服务端列表，不在前端拼状态。
 */
const BLANK = {
  title: '',
  category: 'intro',
  summary: '',
  body: '',
  tags: '',
  published: true,
};

export function AdminWiki({ items }: { items: WikiEntry[] }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WikiEntry | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy]);

  function startNew() {
    setEditing(null);
    setForm({ ...BLANK });
    setErr(null);
    setOpen(true);
  }

  function startEdit(item: WikiEntry) {
    setEditing(item);
    setForm({
      title: item.title,
      category: item.category,
      summary: item.summary,
      body: item.body,
      tags: item.tags.join(' '),
      published: item.published,
    });
    setErr(null);
    setOpen(true);
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setErr(null);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setErr(null);

    const payload = {
      title: form.title.trim(),
      category: form.category,
      summary: form.summary.trim(),
      body: form.body,
      tags: form.tags.split(/[\s,，]+/).map((t) => t.trim()).filter(Boolean).slice(0, 5),
      published: form.published,
    };

    const res = await fetch(
      editing ? `/api/v1/admin/wiki/${editing.id}` : '/api/v1/admin/wiki',
      {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      },
    ).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    if (!res?.ok) {
      setErr(data?.message ?? '保存失败');
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function remove(item: WikiEntry) {
    if (!window.confirm(`删除词条「${item.title}」？删了线上就看不到了。`)) return;
    const res = await fetch(`/api/v1/admin/wiki/${item.id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      setErr('删除失败');
      return;
    }
    router.refresh();
  }

  return (
    <div className="card card-pad">
      <div className="between" style={{ marginBottom: 10 }}>
        <div>
          <h2 className="settings-main-title" style={{ fontSize: 15 }}>
            百科词条
          </h2>
          <p className="settings-main-desc">
            面向全站的说明文档：入门、机制、服务器、开发、社区五类。草稿不会出现在前台。
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={startNew}>
          新建词条
        </button>
      </div>

      {err && (
        <p className="small" style={{ color: 'var(--danger)', marginBottom: 8 }}>
          {err}
        </p>
      )}

      {items.length === 0 ? (
        <p className="small muted">还没有词条，点右上角新建第一条。</p>
      ) : (
        <div className="policy-admin-list">
          {items.map((it) => (
            <div key={it.id} className="card policy-admin-row">
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 7, flexWrap: 'wrap' }}>
                  <b>{it.title}</b>
                  <span className="badge badge-ghost">{categoryLabel(it.category)}</span>
                  {!it.published && <span className="badge badge-warn">草稿</span>}
                </div>
                <p className="small muted" style={{ marginTop: 4 }}>
                  {it.summary || '没有摘要'} · 更新于 {fmtDay(it.updatedAt)} · {it.views} 次浏览
                </p>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => startEdit(it)}>
                  编辑
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => remove(it)}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {mounted &&
        open &&
        createPortal(
          <div className="composer-modal" role="dialog" aria-modal="true" aria-label="编辑词条">
            <button type="button" className="composer-backdrop" aria-label="关闭" onClick={close} />
            <div className="composer-panel org-modal" style={{ width: 'min(760px, 94vw)' }}>
              <div className="composer-panel-head">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b className="composer-head-title">{editing ? '编辑词条' : '新建词条'}</b>
                  <div className="composer-head-sub">正文支持 Markdown，二级标题会出现在右侧目录</div>
                </div>
                <button type="button" className="composer-icon-btn" aria-label="关闭" onClick={close}>
                  ×
                </button>
              </div>

              <div className="org-form-grid">
                <label className="field">
                  标题
                  <input
                    className="input"
                    value={form.title}
                    maxLength={60}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="例如：怎么开一个 Minecraft 服务器"
                  />
                </label>
                <label className="field">
                  分类
                  <select
                    className="input"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {WIKI_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field" style={{ gridColumn: '1 / -1' }}>
                  摘要
                  <input
                    className="input"
                    value={form.summary}
                    maxLength={200}
                    onChange={(e) => setForm({ ...form, summary: e.target.value })}
                    placeholder="一句话说清这条词条解决什么问题"
                  />
                </label>
                <label className="field" style={{ gridColumn: '1 / -1' }}>
                  标签（空格分隔，最多 5 个）
                  <input
                    className="input"
                    value={form.tags}
                    onChange={(e) => setForm({ ...form, tags: e.target.value })}
                    placeholder="开服 联机 端口"
                  />
                </label>
                <label className="field" style={{ gridColumn: '1 / -1' }}>
                  正文
                  <textarea
                    className="input textarea"
                    rows={14}
                    value={form.body}
                    onChange={(e) => setForm({ ...form, body: e.target.value })}
                    style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.75 }}
                    placeholder={'## 第一步\n\n……'}
                  />
                </label>
                <label className="switch-row" style={{ marginTop: 0, gridColumn: '1 / -1' }}>
                  <input
                    type="checkbox"
                    checked={form.published}
                    onChange={(e) => setForm({ ...form, published: e.target.checked })}
                  />
                  <span>发布到前台（取消勾选存为草稿）</span>
                </label>
              </div>

              {err && (
                <p className="small" style={{ marginTop: 8, color: 'var(--danger)' }}>
                  {err}
                </p>
              )}

              <div className="composer-modal-foot">
                <span className="tip">{form.body.length} 字</span>
                <button type="button" className="btn btn-sm btn-ghost" onClick={close} disabled={busy}>
                  取消
                </button>
                <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={busy}>
                  {busy ? '保存中…' : '保存'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
