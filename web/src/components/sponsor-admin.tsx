'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SponsorEntry } from '@/lib/sponsor-store';

interface Props {
  items: SponsorEntry[];
  configured: boolean;
  syncedAt: number | null;
  pageUrl: string;
}

const money = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const day = (ts?: number) => (ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '—');

export function SponsorAdmin({ items, configured, syncedAt, pageUrl }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [planTitle, setPlanTitle] = useState('');
  const [adding, setAdding] = useState(false);

  async function sync() {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/v1/admin/afdian/sync', { method: 'POST' }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { ok?: boolean; saved?: number; totalAmount?: number; message?: string }
      | null;
    setBusy(false);

    if (!res?.ok) {
      setMsg({ kind: 'err', text: data?.message ?? '同步失败' });
      return;
    }
    setMsg({
      kind: 'ok',
      text: `同步完成：${data?.saved ?? 0} 位赞助者，合计 ¥${money(data?.totalAmount ?? 0)}`,
    });
    router.refresh();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setMsg({ kind: 'err', text: '请填写昵称' });
      return;
    }
    setAdding(true);
    setMsg(null);

    const res = await fetch('/api/v1/admin/sponsors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, amount, planTitle }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setAdding(false);

    if (!res?.ok) {
      setMsg({ kind: 'err', text: data?.message ?? '添加失败' });
      return;
    }
    setName('');
    setAmount('');
    setPlanTitle('');
    setMsg({ kind: 'ok', text: '已添加' });
    router.refresh();
  }

  async function toggle(id: string, hidden: boolean) {
    await fetch('/api/v1/admin/sponsors', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, hidden }),
    }).catch(() => null);
    router.refresh();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/v1/admin/sponsors?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(
      () => null,
    );
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    if (!res?.ok) {
      setMsg({ kind: 'err', text: data?.message ?? '删除失败' });
      return;
    }
    router.refresh();
  }

  return (
    <>
      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div className="between" style={{ alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: 13 }}>爱发电同步</h3>
            <p className="small muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
              {configured ? (
                <>
                  已绑定爱发电账号，可随时同步。
                  上次同步：{syncedAt ? new Date(syncedAt).toLocaleString('zh-CN') : '从未'}
                </>
              ) : (
                <>
                  还没有绑定爱发电账号，
                  同步不可用。手动录入仍然可以用于线下支持。
                </>
              )}
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {pageUrl && (
              <a className="btn btn-sm btn-ghost" href={pageUrl} target="_blank" rel="noreferrer noopener">
                赞助页
              </a>
            )}
            <button className="btn btn-sm btn-primary" onClick={sync} disabled={busy || !configured}>
              {busy ? '同步中…' : '立即同步'}
            </button>
          </div>
        </div>

        {msg && (
          <p
            className="small"
            style={{ marginTop: 10, color: msg.kind === 'ok' ? 'var(--accent)' : 'var(--danger)' }}
          >
            {msg.text}
          </p>
        )}
      </div>

      <form className="card card-pad" onSubmit={add} style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, marginBottom: 10 }}>手动录入</h3>
        <div className="adm-form" style={{ gridTemplateColumns: '1.2fr 110px 1.4fr 96px' }}>
          <input className="input" placeholder="昵称" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />
          <input className="input" placeholder="金额" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          <input className="input" placeholder="档位说明（可选）" value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} maxLength={24} />
          <button className="btn btn-primary" type="submit" disabled={adding}>
            {adding ? '添加中…' : '添加'}
          </button>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>
          用于线下转账、实物支持等爱发电之外的来源，会与同步结果并存。
        </p>
      </form>

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>赞助者</th>
              <th className="num">金额</th>
              <th>档位</th>
              <th>来源</th>
              <th>最近支持</th>
              <th>状态</th>
              <th style={{ width: 100 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="small muted" style={{ padding: '18px 16px' }}>
                  还没有赞助记录。配好爱发电后点「立即同步」，或手动录入。
                </td>
              </tr>
            ) : (
              items.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="num mono">¥{money(s.amount)}</td>
                  <td className="small muted">{s.planTitle ?? '—'}</td>
                  <td>
                    <span className={'badge ' + (s.source === 'afdian' ? 'badge-live' : 'badge-ghost')}>
                      {s.source === 'afdian' ? '爱发电' : '手动'}
                    </span>
                  </td>
                  <td className="mono small muted">{day(s.lastPayAt)}</td>
                  <td>
                    <span className={'badge ' + (s.hidden ? 'badge-warn' : 'badge-live')}>
                      {s.hidden ? '已隐藏' : '展示中'}
                    </span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => toggle(s.id, !s.hidden)}>
                        {s.hidden ? '显示' : '隐藏'}
                      </button>
                      {s.source === 'manual' && (
                        <button className="btn btn-sm btn-ghost" onClick={() => remove(s.id)}>
                          删除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
