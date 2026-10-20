'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Agreement, Clause } from '@/lib/agreements';

const EMPTY = { title: '', version: 'v1', scope: '', summary: '', gate: '' };

export function AgreementAdmin({ items }: { items: Agreement[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [clauses, setClauses] = useState<Clause[]>([{ h: '', p: '' }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function setClause(i: number, k: keyof Clause, v: string) {
    setClauses((list) => list.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)));
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/v1/admin/agreements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...form, clauses }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '创建失败');
      setForm({ ...EMPTY });
      setClauses([{ h: '', p: '' }]);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '创建失败');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, active: boolean) {
    setBusy(true);
    await fetch('/api/v1/admin/agreements', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, active }),
    });
    setBusy(false);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm('删除后签署记录仍在，但公约不再展示。确认删除？')) return;
    setBusy(true);
    await fetch(`/api/v1/admin/agreements?id=${id}`, { method: 'DELETE' });
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <div className="between">
        <div className="small muted">
          共 {items.length} 份 · 启用 {items.filter((i) => i.active).length} 份
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setOpen((v) => !v)}>
          {open ? '收起表单' : '新增公约'}
        </button>
      </div>

      {open && (
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="adm-form">
            <label className="field">
              <span>标题 *</span>
              <input className="input" value={form.title} onChange={set('title')} placeholder="例如：赛事观赛公约" maxLength={20} />
            </label>
            <label className="field">
              <span>版本 *</span>
              <input className="input" value={form.version} onChange={set('version')} placeholder="v1" />
            </label>
            <label className="field">
              <span>适用范围 *</span>
              <input className="input" value={form.scope} onChange={set('scope')} placeholder="所有报名参赛的战队" />
            </label>
            <label className="field">
              <span>未签署限制 *</span>
              <input className="input" value={form.gate} onChange={set('gate')} placeholder="未签署时不能报名赛事" />
            </label>
          </div>

          <label className="field">
            <span>简介 *</span>
            <textarea className="input textarea" rows={2} value={form.summary} onChange={set('summary')} placeholder="一句话说明这份公约约束什么" />
          </label>

          <div className="field">
            <span>条款（至少一条）</span>
            {clauses.map((c, i) => (
              <div key={i} className="clause-row">
                <input
                  className="input"
                  style={{ width: 110 }}
                  value={c.h}
                  onChange={(e) => setClause(i, 'h', e.target.value)}
                  placeholder="小标题"
                  maxLength={8}
                />
                <input
                  className="input grow"
                  value={c.p}
                  onChange={(e) => setClause(i, 'p', e.target.value)}
                  placeholder="条款内容"
                />
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setClauses((l) => (l.length > 1 ? l.filter((_, idx) => idx !== i) : l))}
                  disabled={clauses.length === 1}
                >
                  删除
                </button>
              </div>
            ))}
            <button className="btn btn-sm btn-ghost" onClick={() => setClauses((l) => [...l, { h: '', p: '' }])}>
              + 添加条款
            </button>
          </div>

          {err && <div className="small" style={{ color: 'var(--danger)' }}>{err}</div>}

          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
              取消
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={busy}>
              {busy ? '保存中…' : '创建并启用'}
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>公约</th>
              <th>版本</th>
              <th className="num">条款</th>
              <th>状态</th>
              <th>更新时间</th>
              <th className="num">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="name-cell">
                    <b>{a.title}</b>
                    {a.builtin && <span className="badge">内置</span>}
                  </div>
                  <div className="small muted mono">{a.id}</div>
                </td>
                <td className="mono">{a.version}</td>
                <td className="num">{a.clauses.length}</td>
                <td>
                  <span className={'badge ' + (a.active ? 'badge-live' : '')}>{a.active ? '启用' : '停用'}</span>
                </td>
                <td className="mono muted">{a.updatedAt}</td>
                <td className="num">
                  {a.builtin ? (
                    <span className="small muted">内置不可改</span>
                  ) : (
                    <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => toggle(a.id, !a.active)} disabled={busy}>
                        {a.active ? '停用' : '启用'}
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => remove(a.id)} disabled={busy}>
                        删除
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
