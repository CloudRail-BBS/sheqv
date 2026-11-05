'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

interface ServerItem {
  id: string;
  kind: string;
  name: string;
  host: string;
  port: number;
  edition: string;
  description: string;
  owner: string;
  status: string;
  playersOnline: number;
  playersMax: number;
  createdAt: number;
}

type Tab = 'pending' | 'approved' | 'rejected';

const TABS: { key: Tab; label: string }[] = [
  { key: 'pending', label: '待审' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
];

const day = (ts: number) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(ts));

const KIND: Record<string, string> = { minecraft: 'Minecraft', rusted_warfare: 'Rusted Warfare' };

export function OpsServers() {
  const [items, setItems] = useState<ServerItem[]>([]);
  const [tab, setTab] = useState<Tab>('pending');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/ops/servers', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) {
      setMsg({ ok: false, text: '读取失败（需要运营权限）' });
      return;
    }
    const data = (await res.json()) as { items: ServerItem[] };
    setItems(data.items ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(item: ServerItem, status: 'approved' | 'rejected' | 'pending') {
    if (status === 'rejected' && !window.confirm(`拒绝「${item.name}」？提交者会收到通知。`)) return;
    setBusy(item.id);
    setMsg(null);
    const res = await fetch(`/api/v1/ops/servers/${item.id}`, {
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
      text: status === 'approved' ? '已通过，探测会自动开始' : status === 'rejected' ? '已拒绝' : '已退回待审',
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
          <b>{tab === 'pending' ? '没有待审的服务器' : '这里是空的'}</b>
          <p>{tab === 'pending' ? '玩家提交的联机大厅条目会排在这里。' : '处理过的条目会按结果归档。'}</p>
        </div>
      ) : (
        <div className="ticket-list">
          {shown.map((s) => (
            <div key={s.id} className="card card-pad">
              <div className="between" style={{ alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <b style={{ fontSize: 14 }}>{s.name}</b>
                    <span className="badge badge-ghost">{KIND[s.kind] ?? s.kind}</span>
                    {s.status === 'pending' && <span className="badge badge-warn">待审</span>}
                    {s.status === 'approved' && <span className="badge badge-ok">已通过</span>}
                    {s.status === 'rejected' && <span className="badge badge-ghost">已拒绝</span>}
                  </div>
                  <div className="small muted mono" style={{ marginTop: 6 }}>
                    {s.host}:{s.port} · {s.edition || '未填版本'} · {s.owner || '未知提交者'} ·{' '}
                    {day(s.createdAt)}
                  </div>
                  {s.description && (
                    <p className="small muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
                      {s.description}
                    </p>
                  )}
                </div>
                <div className="row" style={{ gap: 6, flex: 'none' }}>
                  {s.status === 'pending' ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={busy === s.id}
                        onClick={() => void review(s, 'approved')}
                      >
                        通过
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={busy === s.id}
                        onClick={() => void review(s, 'rejected')}
                      >
                        拒绝
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      disabled={busy === s.id}
                      onClick={() => void review(s, 'pending')}
                    >
                      退回待审
                    </button>
                  )}
                  <a
                    className="btn btn-sm btn-ghost"
                    href={`/servers`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    看大厅
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
