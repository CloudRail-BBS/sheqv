'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 信誉管理弹窗（后台用户列表用）。
 *
 * 信誉改成「初始 100，只扣分」之后，管理员在同一个地方既能看当前分与扣分明细，
 * 也能记一笔新的调整。所有调整都带理由，事后能追到是谁因为什么改的。
 */

interface Reputation {
  score: number;
  tier: string;
  hint: string;
}

interface Log {
  id: string;
  delta: number;
  reason: string;
  operator?: string;
  createdAt: number;
}

const fmt = (ms: number) =>
  new Date(ms).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function AdminReputation({
  userId,
  nickname,
  onClose,
}: {
  userId: string;
  nickname: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [rep, setRep] = useState<Reputation | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [delta, setDelta] = useState('-10');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let dead = false;
    fetch(`/api/v1/admin/users/${encodeURIComponent(userId)}/reputation`)
      .then((r) => r.json())
      .then((d) => {
        if (dead || !d?.ok) return;
        setRep(d.reputation);
        setLogs(d.logs ?? []);
      })
      .catch(() => setErr('读取信誉失败'));
    return () => {
      dead = true;
    };
  }, [userId]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  async function submit() {
    const value = Number(delta);
    if (!Number.isFinite(value) || value === 0) {
      setErr('填一个非 0 的整数，负数表示扣除');
      return;
    }
    if (reason.trim().length < 2) {
      setErr('写一句理由，方便以后追溯');
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/v1/admin/users/${encodeURIComponent(userId)}/reputation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ delta: Math.trunc(value), reason: reason.trim() }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { reputation?: Reputation; logs?: Log[]; message?: string }
      | null;
    setBusy(false);
    if (!res?.ok || !data?.reputation) {
      setErr(data?.message ?? '调整失败');
      return;
    }
    setRep(data.reputation);
    setLogs(data.logs ?? []);
    setReason('');
  }

  if (!mounted) return null;

  return createPortal(
    <div className="composer-modal" role="dialog" aria-modal="true" aria-label="信誉管理">
      <button type="button" className="composer-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="composer-panel org-modal rep-dialog">
        <div className="composer-panel-head" style={{ marginBottom: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <b className="composer-head-title">信誉管理</b>
            <div className="composer-head-sub">{nickname}</div>
          </div>
          <button type="button" className="composer-icon-btn" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="rep-score">
          <b>{rep ? rep.score : '—'}</b>
          <div>
            <span className="rep-score-tier">{rep?.tier ?? '读取中'}</span>
            <p>{rep?.hint ?? '　'}</p>
          </div>
        </div>

        <div className="rep-form">
          <label className="field" style={{ width: 96, flex: 'none' }}>
            <span>调整</span>
            <input
              className="input"
              type="number"
              min={-100}
              max={100}
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
            />
          </label>
          <label className="field" style={{ flex: 1, marginTop: 0 }}>
            <span>理由</span>
            <input
              className="input"
              value={reason}
              maxLength={80}
              placeholder="如：多次发布与版块无关的内容"
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            style={{ height: 34, flex: 'none' }}
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? '提交中…' : '提交'}
          </button>
        </div>
        <p className="rep-tip">负数表示扣除，正数表示恢复；单次范围 −100 ~ 100。</p>

        {err && <p className="todo-err" style={{ margin: '0 0 8px' }}>{err}</p>}

        <div className="rep-logs">
          <div className="rep-logs-head">调整记录</div>
          {logs.length === 0 ? (
            <p className="small muted" style={{ padding: '6px 0' }}>
              还没有人工调整记录。
            </p>
          ) : (
            logs.map((l) => (
              <div key={l.id} className="rep-log">
                <span className={'rep-log-delta ' + (l.delta < 0 ? 'is-down' : 'is-up')}>
                  {l.delta > 0 ? `+${l.delta}` : l.delta}
                </span>
                <span className="rep-log-reason">{l.reason || '未填写理由'}</span>
                <span className="rep-log-meta">
                  {l.operator ?? '口令操作'} · {fmt(l.createdAt)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
