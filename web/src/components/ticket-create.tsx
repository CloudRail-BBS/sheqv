'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABEL,
  type TicketCategory,
} from '@/lib/ticket-types';

/**
 * 提交工单。
 *
 * 独立小弹窗：分类 + 标题 + 描述。提交成功后直接跳到详情页，
 * 后续沟通都在详情页的时间线里，不再回到列表找。
 */
export function TicketCreate() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<TicketCategory>('bug');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const res = await fetch('/api/v1/me/tickets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category, subject, body }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { id?: string; message?: string }
      | null;
    setBusy(false);
    if (!res?.ok || !data?.id) {
      setErr(data?.message ?? '提交失败，稍后再试');
      return;
    }
    setOpen(false);
    setSubject('');
    setBody('');
    router.push(`/tickets/${data.id}`);
    router.refresh();
  }

  const canSubmit = subject.trim().length >= 4 && body.trim().length >= 5 && !busy;

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        提交工单
      </button>

      {mounted &&
        open &&
        createPortal(
          <div className="modal-mask" onClick={() => setOpen(false)}>
            <div className="modal ticket-compose" onClick={(e) => e.stopPropagation()}>
              <div className="between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: 16 }}>提交工单</h3>
                  <p className="small muted" style={{ marginTop: 4, lineHeight: 1.7 }}>
                    写清楚发生了什么、期望是什么；账号相关的工单请附上用户名。
                  </p>
                </div>
                <button
                  type="button"
                  className="auth-modal-close"
                  aria-label="关闭"
                  onClick={() => setOpen(false)}
                >
                  ×
                </button>
              </div>

              <div className="ticket-form">
                <label className="field">
                  <span>分类</span>
                  <select
                    className="input"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as TicketCategory)}
                  >
                    {TICKET_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {TICKET_CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>标题（4–80 字）</span>
                  <input
                    className="input"
                    value={subject}
                    maxLength={80}
                    placeholder="一句话说明问题"
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>详细描述（5–2000 字）</span>
                  <textarea
                    className="input textarea"
                    rows={6}
                    maxLength={2000}
                    value={body}
                    placeholder="出现时间、操作步骤、看到的报错；可附链接"
                    onChange={(e) => setBody(e.target.value)}
                  />
                </label>
              </div>

              {err && (
                <p className="small" style={{ color: 'var(--danger)', marginTop: 8 }}>
                  {err}
                </p>
              )}

              <div className="row" style={{ gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
                  取消
                </button>
                <button type="button" className="btn btn-primary" onClick={submit} disabled={!canSubmit}>
                  {busy ? '提交中…' : '提交'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
