'use client';

import { useCallback, useEffect, useState } from 'react';
import { BADGE_EFFECTS, BADGE_STYLES } from '@/lib/badges';
import { TITLE_STATUS_LABEL, type TitleRequest, type TitleRequestStatus } from '@/lib/title-types';

const FILTERS: { key: string; label: string }[] = [
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '未通过' },
  { key: '', label: '全部' },
];

const day = (ts: number) => new Date(ts).toISOString().slice(0, 16).replace('T', ' ');

/**
 * 头衔申请审核。
 *
 * 通过时可以把文案、样式、特效都改一遍——用户自选的样式不一定适合，
 * 最终写进 users 的是这里提交的那份。
 */
export function AdminTitles() {
  const [status, setStatus] = useState('pending');
  const [items, setItems] = useState<TitleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState<Record<string, { style: string; effect: string; note: string }>>({});

  const load = useCallback(async (next: string) => {
    setLoading(true);
    const res = await fetch(`/api/v1/admin/title-requests?status=${encodeURIComponent(next)}`, {
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) {
      setMsg({ ok: false, text: '读取失败（需要管理员权限）' });
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { items: TitleRequest[] };
    setItems(data.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(status);
  }, [load, status]);

  function patchOf(item: TitleRequest) {
    return draft[item.id] ?? { style: item.style || 'blue', effect: item.effect || '', note: '' };
  }

  function edit(id: string, item: TitleRequest, next: Partial<{ style: string; effect: string; note: string }>) {
    setDraft((d) => ({ ...d, [id]: { ...patchOf(item), ...next } }));
  }

  async function review(item: TitleRequest, next: TitleRequestStatus) {
    if (busy) return;
    const p = patchOf(item);
    setBusy(item.id);
    setMsg(null);
    const res = await fetch(`/api/v1/admin/title-requests/${item.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        status: next,
        style: p.style,
        effect: p.effect,
        note: p.note.trim(),
      }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setMsg({ ok: false, text: '操作失败，稍后再试' });
      return;
    }
    setMsg({ ok: true, text: next === 'approved' ? '已通过，头衔已生效' : '已拒绝' });
    void load(status);
  }

  return (
    <>
      <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key || 'all'}
            type="button"
            className="chip"
            data-on={status === f.key}
            onClick={() => setStatus(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {msg && (
        <p className="small" style={{ color: msg.ok ? 'var(--ok)' : 'var(--danger)', marginBottom: 8 }}>
          {msg.text}
        </p>
      )}

      {loading ? (
        <p className="small muted">读取中…</p>
      ) : items.length === 0 ? (
        <div className="card empty-state">
          <b>没有对应的申请</b>
          <p>用户在「我的 → 头衔」提交后会出现在这里。</p>
        </div>
      ) : (
        <div className="title-review">
          {items.map((item) => {
            const p = patchOf(item);
            return (
              <div key={item.id} className="card card-pad title-review-row">
                <div className="title-review-head">
                  <b>{item.nickname}</b>
                  <span className="ut" data-kind="custom" data-bs={p.style} data-be={p.effect || undefined}>
                    {item.title}
                  </span>
                  <span className={'badge ' + (item.status === 'approved' ? 'badge-ok' : item.status === 'rejected' ? 'badge-danger' : 'badge-warn')}>
                    {TITLE_STATUS_LABEL[item.status]}
                  </span>
                  <span className="small muted mono" style={{ marginLeft: 'auto' }}>{day(item.createdAt)}</span>
                </div>

                {item.reason && <p className="title-review-reason">{item.reason}</p>}
                {item.reviewNote && <p className="small muted">审核备注：{item.reviewNote}</p>}

                {item.status === 'pending' ? (
                  <>
                    <div className="title-review-controls">
                      <label className="field">
                        <span>样式</span>
                        <select className="input" value={p.style} onChange={(e) => edit(item.id, item, { style: e.target.value })}>
                          {BADGE_STYLES.map((s) => (
                            <option key={s.key} value={s.key}>{s.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>特效</span>
                        <select className="input" value={p.effect} onChange={(e) => edit(item.id, item, { effect: e.target.value })}>
                          {BADGE_EFFECTS.map((e) => (
                            <option key={e.key || 'none'} value={e.key}>{e.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="field" style={{ gridColumn: '1 / -1' }}>
                        <span>备注（拒绝时会展示给用户）</span>
                        <input
                          className="input"
                          value={p.note}
                          maxLength={100}
                          placeholder="可空"
                          onChange={(e) => edit(item.id, item, { note: e.target.value })}
                        />
                      </label>
                    </div>
                    <div className="row" style={{ gap: 8, marginTop: 10 }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => review(item, 'approved')}
                        disabled={busy === item.id}
                      >
                        {busy === item.id ? '处理中…' : '通过并生效'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => review(item, 'rejected')}
                        disabled={busy === item.id}
                      >
                        拒绝
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
