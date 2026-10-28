'use client';

import { useCallback, useEffect, useState } from 'react';
import { fmtTime, reasonLabel, type PointLog } from '@/lib/point-types';

interface Row {
  id: string;
  nickname: string;
  username: string;
  points: number;
  lastReason?: string;
  lastAt?: number;
}

const QUICK = [10, 50, 100];

/**
 * 后台积分管理。
 *
 * 列表按余额倒序，可按昵称/用户名搜；每行可以加减分（补偿、扣回刷来的分），
 * 也能展开看最近流水对账。加减分走 `point_logs`，与自助获得的积分同一本账。
 */
export function AdminPoints() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [logs, setLogs] = useState<PointLog[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const load = useCallback(async (keyword: string) => {
    setLoading(true);
    const res = await fetch(`/api/v1/admin/points?q=${encodeURIComponent(keyword)}`, {
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) {
      setMsg({ ok: false, text: '读取失败（需要管理员权限）' });
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { items: Row[] };
    setItems(data.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load('');
  }, [load]);

  async function toggleLogs(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setLogs([]);
    const res = await fetch(`/api/v1/admin/points/${encodeURIComponent(id)}/logs`, {
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) {
      setMsg({ ok: false, text: '流水读取失败' });
      return;
    }
    const data = (await res.json()) as { items: PointLog[] };
    setLogs(data.items ?? []);
  }

  async function adjust(row: Row, delta: number) {
    if (!delta || busy) return;
    setBusy(row.id);
    setMsg(null);
    const res = await fetch('/api/v1/admin/points', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: row.id, delta }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { message?: string; points?: number }
      | null;
    setBusy(null);
    if (!res?.ok) {
      setMsg({ ok: false, text: data?.message ?? '调整失败' });
      return;
    }
    setMsg({
      ok: true,
      text: `${row.nickname} ${delta > 0 ? '+' : ''}${delta} 分，当前 ${data?.points ?? '—'}`,
    });
    setItems((list) =>
      list.map((r) => (r.id === row.id ? { ...r, points: data?.points ?? r.points } : r)),
    );
    if (openId === row.id) void toggleLogs(row.id);
  }

  return (
    <>
      <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
        <input
          className="input"
          placeholder="按昵称 / 用户名搜索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void load(q);
          }}
          style={{ maxWidth: 300 }}
        />
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => void load(q)}>
          搜索
        </button>
        <span className="small muted">{items.length} 人</span>
        {msg && (
          <span
            className="small"
            style={{ color: msg.ok ? 'var(--ok)' : 'var(--danger)', marginLeft: 'auto' }}
          >
            {msg.text}
          </span>
        )}
      </div>

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>用户</th>
              <th className="num">积分</th>
              <th>最近变动</th>
              <th style={{ width: 260 }}>调整</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="small muted" style={{ padding: '18px 16px' }}>
                  读取中…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="small muted" style={{ padding: '18px 16px' }}>
                  没有匹配的用户。
                </td>
              </tr>
            ) : (
              items.map((row) => {
                const value = draft[row.id] ?? '';
                return (
                  <tr key={row.id} style={{ verticalAlign: 'top' }}>
                    <td>
                      <button
                        type="button"
                        className="adm-link"
                        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
                        aria-expanded={openId === row.id}
                        onClick={() => void toggleLogs(row.id)}
                      >
                        {row.nickname}
                      </button>
                      <div className="small muted mono">@{row.username}</div>
                      {openId === row.id && (
                        <div className="adm-point-logs">
                          {logs.length === 0 ? (
                            <span className="small muted">还没有积分流水。</span>
                          ) : (
                            logs.map((l) => (
                              <div key={l.id} className="adm-point-log">
                                <span
                                  className="mono"
                                  style={{ color: l.delta >= 0 ? 'var(--ok)' : 'var(--danger)' }}
                                >
                                  {l.delta > 0 ? `+${l.delta}` : l.delta}
                                </span>
                                <span>{reasonLabel(l.reason)}</span>
                                <span className="small muted mono">{fmtTime(l.at)}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </td>
                    <td className="num mono" style={{ fontWeight: 600 }}>{row.points}</td>
                    <td className="small muted">
                      {row.lastReason ? reasonLabel(row.lastReason) : '—'}
                      {row.lastAt ? <div className="mono">{fmtTime(row.lastAt)}</div> : null}
                    </td>
                    <td>
                      <div className="adm-point-adjust">
                        <input
                          className="input"
                          inputMode="numeric"
                          placeholder="±分数"
                          value={value}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [row.id]: e.target.value }))
                          }
                          style={{ width: 92 }}
                          aria-label={`${row.nickname} 调整分数`}
                        />
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost adm-mini"
                          disabled={busy === row.id}
                          onClick={() => void adjust(row, Number(value) || 0)}
                        >
                          应用
                        </button>
                        {QUICK.map((n) => (
                          <button
                            key={n}
                            type="button"
                            className="btn btn-sm btn-ghost adm-mini"
                            disabled={busy === row.id}
                            onClick={() => void adjust(row, n)}
                            title={`加 ${n} 分`}
                          >
                            +{n}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost adm-mini"
                          disabled={busy === row.id}
                          onClick={() => void adjust(row, -Math.abs(Number(value) || 10))}
                          title="按输入值扣分（没填则扣 10）"
                        >
                          扣
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="small muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
        加减分写进同一本 `point_logs`，用户在「积分」页能看到「管理员调整」这一条；
        扣除时余额不会低于 0。删除帖子 / 评论 / 资源会自动冲正当初发的分，不需要手工扣。
      </p>
    </>
  );
}
