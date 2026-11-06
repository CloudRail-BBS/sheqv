'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  SCOPE_LABEL,
  type CategoryScope,
  type ContentCategory,
} from '@/lib/category-types';

/**
 * 后台分类管理（百科 / 资源库）。
 *
 * 分类的 `key` 是内容行里存的值，建好不再改；这里能改的只有展示名、说明与排序。
 * 删除时若还有内容在用，必须选一个迁移目标：先搬内容再删分类，
 * 避免留下「分类没了、内容还挂着一个不存在的值」。
 */

interface Draft {
  label: string;
  descr: string;
  sort: number;
}

const EMPTY: Draft = { label: '', descr: '', sort: 100 };

export function AdminCategories() {
  const [scope, setScope] = useState<CategoryScope>('wiki');
  const [items, setItems] = useState<ContentCategory[]>([]);
  /** 首次取数完成前不要显示「还没有分类」，否则每次进页都会闪一下空状态 */
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [move, setMove] = useState<{
    key: string;
    label: string;
    count: number;
    target: string;
  } | null>(null);

  const load = useCallback(async (scopeArg: CategoryScope) => {
    try {
      const res = await fetch(`/api/v1/admin/categories?scope=${scopeArg}`, {
        cache: 'no-store',
      }).catch(() => null);
      if (!res?.ok) {
        setMsg({ ok: false, text: '读取失败（需要管理员权限）' });
        return;
      }
      const d = (await res.json()) as { items?: ContentCategory[] };
      setItems(d.items ?? []);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load(scope);
  }, [load, scope]);

  function switchScope(next: CategoryScope) {
    setScope(next);
    setLoaded(false);
    setDraft(null);
    setEditing(null);
    setMove(null);
    setMsg(null);
  }

  function startNew() {
    setEditing(null);
    setDraft({ ...EMPTY, sort: (items.at(-1)?.sort ?? 0) + 10 });
    setMsg(null);
    setMove(null);
  }

  async function save() {
    if (!draft || busy) return;
    if (draft.label.trim().length === 0) {
      setMsg({ ok: false, text: '分类名不能为空' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const url = editing
        ? `/api/v1/admin/categories/${scope}/${encodeURIComponent(editing)}`
        : '/api/v1/admin/categories';
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          editing
            ? { label: draft.label.trim(), descr: draft.descr.trim(), sort: draft.sort }
            : { scope, label: draft.label.trim(), descr: draft.descr.trim(), sort: draft.sort },
        ),
      }).catch(() => null);
      const data = (await res?.json().catch(() => ({}))) as { message?: string };
      if (!res?.ok) throw new Error(data?.message ?? '保存失败');
      setDraft(null);
      setEditing(null);
      setMsg({ ok: true, text: '已保存' });
      await load(scope);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '保存失败' });
    } finally {
      setBusy(false);
    }
  }

  async function remove(key: string, label: string, count: number) {
    if (count > 0) {
      const target = items.find((c) => c.key !== key)?.key ?? '';
      setMove({ key, label, count, target });
      setMsg(null);
      return;
    }
    if (!window.confirm(`删除分类「${label}」？目前没有内容在用它。`)) return;
    await doRemove(key, '');
  }

  async function doRemove(key: string, moveTo: string) {
    setBusy(true);
    setMsg(null);
    try {
      const qs = moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : '';
      const res = await fetch(
        `/api/v1/admin/categories/${scope}/${encodeURIComponent(key)}${qs}`,
        { method: 'DELETE' },
      ).catch(() => null);
      const data = (await res?.json().catch(() => ({}))) as { message?: string; moved?: number };
      if (!res?.ok) throw new Error(data?.message ?? '删除失败');
      setMove(null);
      setMsg({
        ok: true,
        text: data?.moved ? `已删除，${data.moved} 条内容已迁移` : '已删除',
      });
      await load(scope);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '删除失败' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="between" style={{ marginBottom: 10 }}>
        <div className="seg">
          {(['wiki', 'resource'] as CategoryScope[]).map((s) => (
            <button key={s} type="button" data-on={scope === s} onClick={() => switchScope(s)}>
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-sm btn-primary" onClick={startNew}>
          新建分类
        </button>
      </div>

      {msg && (
        <p
          className="small"
          style={{ color: msg.ok ? 'var(--ok)' : 'var(--danger)', marginBottom: 8 }}
        >
          {msg.text}
        </p>
      )}

      {draft && (
        <div className="card card-pad" style={{ marginBottom: 12 }}>
          <div className="between" style={{ marginBottom: 10 }}>
            <b>{editing ? '编辑分类' : '新建分类'}</b>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setDraft(null);
                setEditing(null);
              }}
            >
              取消
            </button>
          </div>
          <div className="cat-form">
            <label className="field">
              <span>分类名（1–12 字）</span>
              <input
                className="input"
                value={draft.label}
                maxLength={12}
                placeholder={scope === 'wiki' ? '例如：红石' : '例如：建筑'}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </label>
            <label className="field">
              <span>排序（小的在前）</span>
              <input
                className="input mono"
                type="number"
                value={draft.sort}
                onChange={(e) => setDraft({ ...draft, sort: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="field field-wide">
              <span>一句话说明（可空，最多 60 字，用在百科侧栏与按钮提示）</span>
              <input
                className="input"
                value={draft.descr}
                maxLength={60}
                placeholder="这一类的词条都讲什么"
                onChange={(e) => setDraft({ ...draft, descr: e.target.value })}
              />
            </label>
          </div>
          {editing && (
            <p className="small muted" style={{ marginTop: 8 }}>
              改名字只影响展示，已有内容不用动；链接里的标识仍是{' '}
              <span className="mono">{editing}</span>。
            </p>
          )}
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={save}
              disabled={busy || draft.label.trim().length === 0}
            >
              {busy ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}

      {move && (
        <div className="card card-pad" style={{ marginBottom: 12, borderColor: 'var(--warn-line)' }}>
          <b>「{move.label}」还有 {move.count} 条内容</b>
          <p className="small muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
            删除后这些内容不会消失，会整体移到你下面选的分类里。
          </p>
          <div className="row wrap cat-move" style={{ gap: 8, marginTop: 10 }}>
            <select
              className="input"
              style={{ maxWidth: 220 }}
              value={move.target}
              onChange={(e) => setMove({ ...move, target: e.target.value })}
            >
              {items
                .filter((c) => c.key !== move.key)
                .map((c) => (
                  <option key={c.key} value={c.key}>
                    移到「{c.label}」
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              style={{ color: 'var(--danger)', borderColor: 'var(--danger-line)' }}
              disabled={busy || !move.target}
              onClick={() => doRemove(move.key, move.target)}
            >
              {busy ? '处理中…' : '确认迁移并删除'}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMove(null)}>
              取消
            </button>
          </div>
        </div>
      )}

      {!loaded ? (
        <div className="card card-pad">
          <p className="small muted">读取中…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="card card-pad">
          <p className="small muted">
            还没有分类。没有分类时前台无法提交内容，先建一个再用。
          </p>
        </div>
      ) : (
        <div className="ticket-list">
          {items.map((c) => (
            <div key={c.id} className="card card-pad">
              <div className="between" style={{ alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <b style={{ fontSize: 13 }}>{c.label}</b>
                    <span className="small muted mono">#{c.sort}</span>
                    <span className="badge badge-ghost">{c.count} 条内容</span>
                    {c.key !== c.label && <span className="small muted mono">{c.key}</span>}
                  </div>
                  {c.descr && (
                    <p className="small muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
                      {c.descr}
                    </p>
                  )}
                </div>
                <div className="row" style={{ gap: 6, flex: 'none' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => {
                      setEditing(c.key);
                      setDraft({ label: c.label, descr: c.descr, sort: c.sort });
                      setMove(null);
                      setMsg(null);
                    }}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => remove(c.key, c.label, c.count)}
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
