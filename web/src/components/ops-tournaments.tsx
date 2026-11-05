'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

interface Entry {
  id: string;
  tournamentId: string;
  tournamentTitle: string;
  userId: string;
  nickname: string;
  teamName: string;
  contact: string;
  note: string;
  status: string;
  createdAt: number;
}

type Tab = 'pending' | 'approved' | 'rejected';

const TABS: { key: Tab; label: string }[] = [
  { key: 'pending', label: '待审' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
];

const when = (ts: number) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ts));

export function OpsTournaments() {
  const [items, setItems] = useState<Entry[]>([]);
  const [tab, setTab] = useState<Tab>('pending');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/ops/tournament-entries', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) {
      setMsg({ ok: false, text: '读取失败（需要运营权限）' });
      return;
    }
    const data = (await res.json()) as { items: Entry[] };
    setItems(data.items ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(entry: Entry, status: 'approved' | 'rejected' | 'pending') {
    if (status === 'rejected' && !window.confirm(`拒绝「${entry.teamName}」的报名？报名者会收到通知。`)) return;
    setBusy(entry.id);
    setMsg(null);
    const res = await fetch(`/api/v1/ops/tournament-entries/${entry.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setMsg({ ok: false, text: '操作失败，稍后再试' });
      return;
    }
    setMsg({
      ok: true,
      text: status === 'approved' ? '已通过，名额已确认' : status === 'rejected' ? '已拒绝' : '已退回待审',
    });
    void load();
  }

  const shown = useMemo(() => items.filter((i) => i.status === tab), [items, tab]);
  const counts = useMemo(
    () => ({
      pending: items.filter((i) => i.status === 'pending').length,
      approved: items.filter((i) => i.status === 'approved').length,
      rejected: items.filter((i) => i.status === 'rejected').length,
    }),
    [items],
  );

  return (
    <>
      <div className="between" style={{ marginBottom: 10 }}>
        <div className="seg">
          {TABS.map((t) => (
            <button key={t.key} type="button" data-on={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label} {counts[t.key]}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <p className="small" style={{ color: msg.ok ? 'var(--ok)' : 'var(--danger)', marginBottom: 8 }}>
          {msg.text}
        </p>
      )}

      {shown.length === 0 ? (
        <div className="card empty-state">
          <b>{tab === 'pending' ? '没有待审的报名' : '这里是空的'}</b>
          <p>{tab === 'pending' ? '玩家提交的赛事报名会排在这里。' : '处理过的报名会按结果归档。'}</p>
        </div>
      ) : (
        <div className="ticket-list">
          {shown.map((e) => (
            <div key={e.id} className="card card-pad">
              <div className="between" style={{ alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="small muted" style={{ marginBottom: 4 }}>
                    {e.tournamentTitle}
                  </div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <b style={{ fontSize: 14 }}>{e.teamName}</b>
                    {e.status === 'pending' && <span className="badge badge-warn">待审</span>}
                    {e.status === 'approved' && <span className="badge badge-ok">已通过</span>}
                    {e.status === 'rejected' && <span className="badge badge-ghost">已拒绝</span>}
                  </div>
                  <div className="small muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
                    {e.nickname}
                    {e.contact ? ` · ${e.contact}` : ''} · {when(e.createdAt)}
                  </div>
                  {e.note && (
                    <p className="small muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
                      {e.note}
                    </p>
                  )}
                </div>
                <div className="row" style={{ gap: 6, flex: 'none' }}>
                  {e.status === 'pending' ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={busy === e.id}
                        onClick={() => void review(e, 'approved')}
                      >
                        通过
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={busy === e.id}
                        onClick={() => void review(e, 'rejected')}
                      >
                        拒绝
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      disabled={busy === e.id}
                      onClick={() => void review(e, 'pending')}
                    >
                      退回待审
                    </button>
                  )}
                  <a
                    className="btn btn-sm btn-ghost"
                    href={`/tournaments/${e.tournamentId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    看赛事
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
