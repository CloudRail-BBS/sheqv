'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TicketStatus } from '@/lib/ticket-types';

/** 工单详情里的回复框与关闭/重开操作 */
export function TicketActions({ id, status }: { id: string; status: TicketStatus }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    if (busy || !body.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/v1/me/tickets/${id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    if (!res?.ok) {
      setErr(data?.message ?? '发送失败，稍后再试');
      return;
    }
    setBody('');
    router.refresh();
  }

  async function setStatus(next: 'closed' | 'open') {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/v1/me/tickets/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: next }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setErr('操作失败，稍后再试');
      return;
    }
    router.refresh();
  }

  if (status === 'closed') {
    return (
      <div className="ticket-closed">
        <span>这张工单已经关闭。</span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setStatus('open')} disabled={busy}>
          重新打开
        </button>
      </div>
    );
  }

  return (
    <div className="ticket-reply">
      <textarea
        className="input textarea"
        rows={4}
        maxLength={2000}
        value={body}
        placeholder="补充说明，或回复管理员的处理结果…"
        onChange={(e) => setBody(e.target.value)}
      />
      {err && (
        <p className="small" style={{ color: 'var(--danger)' }}>
          {err}
        </p>
      )}
      <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setStatus('closed')}
          disabled={busy}
          title="问题已解决或不再需要跟进"
        >
          关闭工单
        </button>
        <button type="button" className="btn btn-sm btn-primary" onClick={send} disabled={busy || !body.trim()}>
          {busy ? '发送中…' : '发送'}
        </button>
      </div>
    </div>
  );
}
