'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  TICKET_STATUS_BADGE,
  TICKET_STATUS_LABEL,
  ticketCategoryLabel,
  type Ticket,
  type TicketDetail,
  type TicketStatus,
} from '@/lib/ticket-types';

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'open', label: '待处理' },
  { key: 'replied', label: '已回复' },
  { key: 'closed', label: '已关闭' },
];

const day = (ts: number) => new Date(ts).toISOString().slice(0, 16).replace('T', ' ');

/** 后台工单：左侧队列，右侧对话与回复 */
export function AdminTickets() {
  const [status, setStatus] = useState('');
  const [items, setItems] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadList = useCallback(async (next: string) => {
    setLoading(true);
    const res = await fetch(`/api/v1/admin/tickets?status=${encodeURIComponent(next)}`, {
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) {
      setMsg({ ok: false, text: '读取失败（需要管理员权限）' });
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { items: Ticket[] };
    setItems(data.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadList(status);
  }, [loadList, status]);

  const open = useCallback(async (id: string) => {
    setSelected(id);
    setDetail(null);
    setDetailBusy(true);
    const res = await fetch(`/api/v1/admin/tickets/${encodeURIComponent(id)}`, {
      cache: 'no-store',
    }).catch(() => null);
    setDetailBusy(false);
    if (!res?.ok) {
      setMsg({ ok: false, text: '工单读取失败' });
      return;
    }
    const data = (await res.json()) as { item: TicketDetail };
    setDetail(data.item ?? null);
  }, []);

  async function reply() {
    if (!detail || busy || !draft.trim()) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/v1/admin/tickets/${detail.id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: draft }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMsg({ ok: false, text: '发送失败' });
      return;
    }
    setDraft('');
    setMsg({ ok: true, text: '已回复，用户会收到站内信' });
    void open(detail.id);
    void loadList(status);
  }

  async function setTicketStatus(next: TicketStatus) {
    if (!detail || busy) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/v1/admin/tickets/${detail.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: next }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMsg({ ok: false, text: '操作失败' });
      return;
    }
    setMsg({ ok: true, text: next === 'closed' ? '已关闭' : '已重新打开' });
    void open(detail.id);
    void loadList(status);
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
            onClick={() => {
              setStatus(f.key);
              setSelected(null);
              setDetail(null);
            }}
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

      <div className="adm-ticket-grid">
        <div className="adm-ticket-list">
          {loading ? (
            <p className="small muted">读取中…</p>
          ) : items.length === 0 ? (
            <div className="card empty-state">
              <b>没有工单</b>
              <p>用户提交后会出现在这里。</p>
            </div>
          ) : (
            items.map((t) => (
              <button
                key={t.id}
                type="button"
                className="card adm-ticket-item"
                data-on={selected === t.id}
                onClick={() => void open(t.id)}
              >
                <div className="adm-ticket-item-top">
                  <span className={TICKET_STATUS_BADGE[t.status] ?? 'badge'}>
                    {TICKET_STATUS_LABEL[t.status]}
                  </span>
                  <span className="small muted">{ticketCategoryLabel(t.category)}</span>
                  <span className="small muted mono" style={{ marginLeft: 'auto' }}>
                    {day(t.updatedAt)}
                  </span>
                </div>
                <b className="adm-ticket-subject">{t.subject}</b>
                <div className="small muted">
                  {t.nickname} · {t.messageCount} 条
                </div>
              </button>
            ))
          )}
        </div>

        <div className="adm-ticket-detail">
          {!detail ? (
            <div className="card empty-state">
              <b>{detailBusy ? '读取中…' : '选择一张工单'}</b>
              <p>左侧点开后，可以查看对话并回复。</p>
            </div>
          ) : (
            <>
              <div className="card card-pad">
                <div className="row wrap" style={{ gap: 6 }}>
                  <span className={TICKET_STATUS_BADGE[detail.status] ?? 'badge'}>
                    {TICKET_STATUS_LABEL[detail.status]}
                  </span>
                  <span className="badge badge-ghost">{ticketCategoryLabel(detail.category)}</span>
                  <span className="small muted mono">{detail.id}</span>
                </div>
                <h3 style={{ fontSize: 15, marginTop: 8 }}>{detail.subject}</h3>
                <p className="small muted" style={{ marginTop: 4 }}>
                  {detail.nickname} · 提交于 {day(detail.createdAt)}
                </p>
              </div>

              <div className="adm-ticket-thread">
                {detail.messages.map((m) => (
                  <div key={m.id} className="card adm-ticket-msg" data-role={m.role}>
                    <div className="between" style={{ marginBottom: 4 }}>
                      <b className="small">
                        {m.role === 'admin'
                          ? m.author === '管理员'
                            ? '管理员'
                            : `${m.author}（管理员）`
                          : m.author}
                      </b>
                      <span className="small muted mono">{day(m.createdAt)}</span>
                    </div>
                    <p className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>
                      {m.body}
                    </p>
                  </div>
                ))}
              </div>

              <div className="card card-pad">
                {detail.status === 'closed' ? (
                  <div className="row" style={{ gap: 8, justifyContent: 'space-between' }}>
                    <span className="small muted">工单已关闭，回复前先重新打开。</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => void setTicketStatus('open')}
                      disabled={busy}
                    >
                      重新打开
                    </button>
                  </div>
                ) : (
                  <>
                    <textarea
                      className="input textarea"
                      rows={4}
                      maxLength={2000}
                      value={draft}
                      placeholder="回复用户；发送后会发一条站内信…"
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <div className="row" style={{ gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => void setTicketStatus('closed')}
                        disabled={busy}
                      >
                        关闭工单
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={reply}
                        disabled={busy || !draft.trim()}
                      >
                        {busy ? '发送中…' : '发送回复'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
