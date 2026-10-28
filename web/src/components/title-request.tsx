'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BADGE_EFFECTS, BADGE_STYLES, TITLE_MAX, TITLE_MIN, type BadgeEffect, type BadgeStyle } from '@/lib/badges';
import { TITLE_STATUS_LABEL, type TitleRequest } from '@/lib/title-types';

/**
 * 头衔申请。
 *
 * 头衔不能自己改：提交「文案 + 样式 + 特效 + 说明」，管理员审核通过才生效。
 * 同一时间只能有一条待审；被拒可以改完再提，页面上保留最近一次结果。
 */
export function TitleRequestForm({
  current,
  currentStyle,
  currentEffect,
  isAdmin,
  requests,
}: {
  current: string;
  currentStyle?: string;
  currentEffect?: string;
  isAdmin: boolean;
  requests: TitleRequest[];
}) {
  const router = useRouter();
  const latest = requests[0];
  const pending = requests.find((r) => r.status === 'pending');
  const rejected = latest?.status === 'rejected' ? latest : undefined;

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(rejected?.title ?? '');
  const [style, setStyle] = useState<BadgeStyle>((rejected?.style as BadgeStyle) || 'blue');
  const [effect, setEffect] = useState<BadgeEffect>((rejected?.effect as BadgeEffect) || '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/v1/me/title-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, style, effect, reason }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    if (!res?.ok) {
      setMsg({ ok: false, text: data?.message ?? '提交失败，稍后再试' });
      return;
    }
    setMsg({ ok: true, text: '已提交，等待管理员审核' });
    setOpen(false);
    setReason('');
    router.refresh();
  }

  async function cancel(id: string) {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/v1/me/title-requests/${id}`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMsg({ ok: false, text: '撤销失败，稍后再试' });
      return;
    }
    router.refresh();
  }

  return (
    <div className="title-request">
      <div className="title-current">
        <span className="composer-meta-label">当前</span>
        {current ? (
          <span className="ut" data-kind={isAdmin ? 'admin' : 'custom'} data-bs={currentStyle || 'blue'} data-be={currentEffect || undefined}>
            {current}
          </span>
        ) : (
          <span className="small muted">还没有头衔</span>
        )}
      </div>

      {pending ? (
        <div className="title-pending">
          <span className="badge badge-warn" data-dot="">待审核</span>
          <span className="title-preview ut" data-kind="custom" data-bs={pending.style} data-be={pending.effect || undefined}>
            {pending.title}
          </span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => cancel(pending.id)} disabled={busy}>
            撤销申请
          </button>
        </div>
      ) : (
        <div className="title-actions">
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpen((v) => !v)}>
            {rejected ? '重新申请' : '申请头衔'}
          </button>
          <span className="small muted">2–8 个字，审核通过后显示在作者名后面</span>
        </div>
      )}

      {rejected && !open && (
        <p className="title-note">
          上次申请「{rejected.title}」未通过
          {rejected.reviewNote ? `：${rejected.reviewNote}` : '，可以改个说法再试。'}
        </p>
      )}

      {open && !pending && (
        <div className="title-form">
          <label className="field">
            <span>头衔文案</span>
            <input
              className="input"
              value={title}
              maxLength={TITLE_MAX}
              placeholder={isAdmin ? '例如：站长' : '例如：红石工程师'}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>

          <div className="field">
            <span>样式</span>
            <div className="title-swatches" role="radiogroup" aria-label="头衔样式">
              {BADGE_STYLES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="radio"
                  aria-checked={style === s.key}
                  className="title-swatch"
                  data-on={style === s.key}
                  onClick={() => setStyle(s.key)}
                >
                  <span className="ut" data-kind="custom" data-bs={s.key}>
                    {title.trim() || s.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>特效</span>
            <div className="title-effects" role="radiogroup" aria-label="头衔特效">
              {BADGE_EFFECTS.map((e) => (
                <button
                  key={e.key || 'none'}
                  type="button"
                  role="radio"
                  aria-checked={effect === e.key}
                  className="chip"
                  data-on={effect === e.key}
                  onClick={() => setEffect(e.key)}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          <div className="title-preview-line">
            <span className="composer-meta-label">预览</span>
            <span className="ut" data-kind="custom" data-bs={style} data-be={effect || undefined}>
              {title.trim() || '头衔预览'}
            </span>
          </div>

          <label className="field">
            <span>申请说明（可空，审核时会看）</span>
            <textarea
              className="input textarea"
              rows={2}
              maxLength={200}
              value={reason}
              placeholder="例如：连续三个月整理红石教程，想用这个头衔"
              onChange={(e) => setReason(e.target.value)}
            />
          </label>

          {msg && (
            <p className="small" style={{ color: msg.ok ? 'var(--ok)' : 'var(--danger)' }}>
              {msg.text}
            </p>
          )}

          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={submit}
              disabled={busy || title.trim().length < TITLE_MIN}
            >
              {busy ? '提交中…' : '提交申请'}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
              取消
            </button>
            <span className="small muted">提交后由管理员审核，通常一两天内处理。</span>
          </div>
        </div>
      )}

      {!pending && requests.length > 0 && (
        <ul className="title-history">
          {requests.slice(0, 3).map((r) => (
            <li key={r.id}>
              <span className={'badge ' + (r.status === 'approved' ? 'badge-ok' : r.status === 'rejected' ? 'badge-danger' : 'badge-ghost')}>
                {TITLE_STATUS_LABEL[r.status]}
              </span>
              <span className="title-history-name">{r.title}</span>
              <span className="small muted">{new Date(r.createdAt).toISOString().slice(0, 10)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
