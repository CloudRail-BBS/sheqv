'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  VERIFY_CATEGORIES,
  VERIFY_KIND_META,
  VERIFY_STATUS_LABEL,
  verifyKindLabel,
  type VerifyKind,
  type VerifyRequest,
} from '@/lib/verify-types';
import { VerifyMark } from './verify-mark';

/**
 * 认证申请。
 *
 * 和头衔不同，认证是「平台给身份背书」：提交主体、类别与证明材料，
 * 管理员核对后才会亮标。蓝标给个人、红标给机构，通过后不能自己换。
 */
export function VerificationRequestForm({
  currentKind,
  currentLabel,
  requests,
}: {
  currentKind?: string;
  currentLabel?: string;
  requests: VerifyRequest[];
}) {
  const router = useRouter();
  const latest = requests[0];
  const pending = requests.find((r) => r.status === 'pending');
  const rejected = latest?.status === 'rejected' ? latest : undefined;

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<VerifyKind>(
    (rejected?.kind as VerifyKind) || (currentKind === 'red' ? 'red' : 'blue'),
  );
  const [subject, setSubject] = useState(rejected?.subject ?? '');
  const [category, setCategory] = useState(rejected?.category || VERIFY_CATEGORIES[0]);
  const [evidence, setEvidence] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/v1/me/verification-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, subject, category, evidence, contact }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    if (!res?.ok) {
      setMsg({ ok: false, text: data?.message ?? '提交失败，稍后再试' });
      return;
    }
    setMsg({ ok: true, text: '已提交，等待管理员核对' });
    setOpen(false);
    setEvidence('');
    router.refresh();
  }

  async function cancel(id: string) {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/v1/me/verification-requests/${id}`, {
      method: 'DELETE',
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMsg({ ok: false, text: '撤销失败，稍后再试' });
      return;
    }
    router.refresh();
  }

  const canSubmit =
    subject.trim().length >= 2 && evidence.trim().length >= 10 && !busy;

  return (
    <div className="verify-request">
      <div className="verify-current">
        <span className="composer-meta-label">当前</span>
        {currentKind === 'blue' || currentKind === 'red' ? (
          <>
            <VerifyMark kind={currentKind} label={currentLabel} size="lg" />
            <b>{verifyKindLabel(currentKind)}</b>
            <span className="small muted">{currentLabel || '已认证'}</span>
          </>
        ) : (
          <span className="small muted">还没有认证</span>
        )}
      </div>

      {pending ? (
        <div className="verify-pending">
          <span className="badge badge-warn" data-dot="">
            待审核
          </span>
          <span className="badge badge-ghost">{verifyKindLabel(pending.kind)}</span>
          <span className="verify-subject">{pending.subject}</span>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => cancel(pending.id)}
            disabled={busy}
          >
            撤销申请
          </button>
        </div>
      ) : (
        <div className="verify-actions">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => setOpen((v) => !v)}
          >
            {currentKind ? '申请升级 / 变更认证' : rejected ? '重新申请' : '申请认证'}
          </button>
          <span className="small muted">蓝标给个人，红标给机构；审核通过后名字后面会挂一枚印记</span>
        </div>
      )}

      {rejected && !open && (
        <p className="verify-note">
          上次申请「{rejected.subject}」未通过
          {rejected.reviewNote ? `：${rejected.reviewNote}` : '，可以补充材料后重新提交。'}
        </p>
      )}

      {open && !pending && (
        <div className="verify-form">
          <div className="field">
            <span>认证类型</span>
            <div className="verify-kinds" role="radiogroup" aria-label="认证类型">
              {(['blue', 'red'] as VerifyKind[]).map((k) => {
                const meta = VERIFY_KIND_META[k];
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    className="verify-kind"
                    data-vk={k}
                    data-on={kind === k}
                    onClick={() => setKind(k)}
                  >
                    <span className="verify-kind-head">
                      <VerifyMark kind={k} size="lg" />
                      <b>{meta.label}</b>
                      <span className="small muted">{meta.desc}</span>
                    </span>
                    <span className="verify-kind-hint">{meta.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="verify-grid">
            <label className="field">
              <span>{kind === 'red' ? '机构全称' : '真实身份 / 常用署名'}</span>
              <input
                className="input"
                value={subject}
                maxLength={40}
                placeholder={kind === 'red' ? '例如：云轨社区运营组' : '例如：云轨小北（B 站 UP 主）'}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>类别</span>
              <select
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {VERIFY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>证明材料（至少 10 字，务必附链接）</span>
            <textarea
              className="input textarea"
              rows={3}
              maxLength={500}
              value={evidence}
              placeholder={
                kind === 'red'
                  ? '例如：公会主页 https://…；组队记录与成员名单见 https://…'
                  : '例如：站内作品列表 https://…；B 站主页 https://…'
              }
              onChange={(e) => setEvidence(e.target.value)}
            />
          </label>

          <label className="field">
            <span>联系方式（可空，仅在需要补充材料时联系你）</span>
            <input
              className="input"
              value={contact}
              maxLength={60}
              placeholder="邮箱 / QQ / 其他"
              onChange={(e) => setContact(e.target.value)}
            />
          </label>

          <div className="verify-preview-line">
            <span className="composer-meta-label">预览</span>
            <b className="verify-preview-name">{subject.trim() || '你的昵称'}</b>
            <VerifyMark kind={kind} size="lg" />
            <span className="small muted">认证说明：{subject.trim() || '认证主体'}</span>
          </div>

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
              disabled={!canSubmit}
            >
              {busy ? '提交中…' : '提交申请'}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              取消
            </button>
            <span className="small muted">审核通常几天内处理，结果会发站内信。</span>
          </div>
        </div>
      )}

      {!pending && requests.length > 0 && (
        <ul className="verify-history">
          {requests.slice(0, 3).map((r) => (
            <li key={r.id}>
              <VerifyMark kind={r.kind} />
              <span className="verify-history-name">{r.subject}</span>
              <span
                className={
                  'badge ' +
                  (r.status === 'approved'
                    ? 'badge-ok'
                    : r.status === 'rejected'
                      ? 'badge-danger'
                      : 'badge-ghost')
                }
              >
                {VERIFY_STATUS_LABEL[r.status]}
              </span>
              <span className="small muted">
                {new Date(r.createdAt).toISOString().slice(0, 10)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
