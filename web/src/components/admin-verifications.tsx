'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  VERIFY_KIND_META,
  VERIFY_STATUS_LABEL,
  verifyKindLabel,
  type VerifyKind,
  type VerifyRequest,
  type VerifyStatus,
} from '@/lib/verify-types';
import { VerifyMark } from './verify-mark';

const FILTERS: { key: string; label: string }[] = [
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '未通过' },
  { key: '', label: '全部' },
];

const day = (ts: number) => new Date(ts).toISOString().slice(0, 16).replace('T', ' ');

interface AdminUserLite {
  id: string;
  nickname: string;
  username: string;
  verifyKind?: string;
  verifyLabel?: string;
}

/**
 * 认证审核。
 *
 * 两块：上半是用户提交的申请（可改类型与对外说明），
 * 下半是「直接授予」——官方账号、合作方不会自己来提申请，管理员要能一句话点亮。
 */
export function AdminVerifications() {
  const [status, setStatus] = useState('pending');
  const [items, setItems] = useState<VerifyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState<
    Record<string, { kind: VerifyKind; label: string; note: string }>
  >({});

  const load = useCallback(async (next: string) => {
    setLoading(true);
    const res = await fetch(
      `/api/v1/admin/verification-requests?status=${encodeURIComponent(next)}`,
      { cache: 'no-store' },
    ).catch(() => null);
    if (!res?.ok) {
      setMsg({ ok: false, text: '读取失败（需要管理员权限）' });
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { items: VerifyRequest[] };
    setItems(data.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(status);
  }, [load, status]);

  function patchOf(item: VerifyRequest) {
    return draft[item.id] ?? { kind: item.kind, label: item.label || item.subject, note: '' };
  }

  function edit(
    id: string,
    item: VerifyRequest,
    next: Partial<{ kind: VerifyKind; label: string; note: string }>,
  ) {
    setDraft((d) => ({ ...d, [id]: { ...patchOf(item), ...next } }));
  }

  async function review(item: VerifyRequest, next: VerifyStatus) {
    if (busy) return;
    const p = patchOf(item);
    setBusy(item.id);
    setMsg(null);
    const res = await fetch(`/api/v1/admin/verification-requests/${item.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: next, kind: p.kind, label: p.label.trim(), note: p.note.trim() }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setMsg({ ok: false, text: '操作失败，稍后再试' });
      return;
    }
    setMsg({
      ok: true,
      text: next === 'approved' ? `已通过，${verifyKindLabel(p.kind)}已生效` : '已拒绝',
    });
    void load(status);
  }

  /* ── 直接授予 ─────────────────────────── */

  const [grantOpen, setGrantOpen] = useState(false);
  const [users, setUsers] = useState<AdminUserLite[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState('');
  const [grantKind, setGrantKind] = useState<VerifyKind | ''>('blue');
  const [grantLabel, setGrantLabel] = useState('');
  const [grantBusy, setGrantBusy] = useState(false);

  useEffect(() => {
    if (!grantOpen || usersLoaded) return;
    void (async () => {
      const res = await fetch('/api/v1/admin/users', { cache: 'no-store' }).catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { items: AdminUserLite[] };
      setUsers(data.items ?? []);
      setUsersLoaded(true);
    })();
  }, [grantOpen, usersLoaded]);

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return users.slice(0, 30);
    return users
      .filter(
        (u) =>
          u.nickname.toLowerCase().includes(key) || u.username.toLowerCase().includes(key),
      )
      .slice(0, 30);
  }, [users, q]);

  const picked = users.find((u) => u.id === pick);

  function choose(id: string) {
    setPick(id);
    const u = users.find((x) => x.id === id);
    setGrantKind(u?.verifyKind === 'red' ? 'red' : u?.verifyKind === 'blue' ? 'blue' : 'blue');
    setGrantLabel(u?.verifyLabel ?? '');
  }

  async function grant(kind: VerifyKind | '') {
    if (!pick || grantBusy) return;
    setGrantBusy(true);
    setMsg(null);
    const res = await fetch('/api/v1/admin/users', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: pick, verifyKind: kind, verifyLabel: kind ? grantLabel : '' }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setGrantBusy(false);
    if (!res?.ok) {
      setMsg({ ok: false, text: data?.message ?? '操作失败' });
      return;
    }
    setUsers((list) =>
      list.map((u) =>
        u.id === pick
          ? { ...u, verifyKind: kind || '', verifyLabel: kind ? grantLabel : '' }
          : u,
      ),
    );
    setMsg({ ok: true, text: kind ? `已授予${verifyKindLabel(kind)}` : '已取消认证' });
  }

  return (
    <>
      <div className="card card-pad verify-grant">
        <div className="between">
          <div>
            <b>直接授予</b>
            <p className="small muted" style={{ marginTop: 2 }}>
              官方账号、合作方不必走申请；授予后立即生效并发站内信。
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            aria-expanded={grantOpen}
            onClick={() => setGrantOpen((v) => !v)}
          >
            {grantOpen ? '收起' : '展开'}
          </button>
        </div>

        {grantOpen && (
          <div className="verify-grant-form">
            <div className="verify-grid">
              <label className="field">
                <span>搜索用户</span>
                <input
                  className="input"
                  value={q}
                  placeholder="昵称或用户名"
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
              <label className="field">
                <span>选择账号</span>
                <select className="input" value={pick} onChange={(e) => choose(e.target.value)}>
                  <option value="">— 请选择 —</option>
                  {filtered.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nickname}（@{u.username}）
                      {u.verifyKind ? ` · 已有${verifyKindLabel(u.verifyKind)}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>认证类型</span>
                <select
                  className="input"
                  value={grantKind}
                  onChange={(e) => setGrantKind(e.target.value as VerifyKind | '')}
                >
                  <option value="blue">蓝标 · 个人</option>
                  <option value="red">红标 · 机构</option>
                  <option value="">取消认证</option>
                </select>
              </label>
              <label className="field">
                <span>认证说明（≤20 字）</span>
                <input
                  className="input"
                  value={grantLabel}
                  maxLength={20}
                  disabled={!grantKind}
                  placeholder="例如：云轨社区运营组"
                  onChange={(e) => setGrantLabel(e.target.value)}
                />
              </label>
            </div>

            <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={!pick || grantBusy}
                onClick={() => grant(grantKind)}
              >
                {grantBusy ? '保存中…' : grantKind ? '授予' : '取消认证'}
              </button>
              {picked && (
                <span className="verify-grant-preview">
                  {picked.nickname}
                  {grantKind ? <VerifyMark kind={grantKind} label={grantLabel} size="lg" /> : null}
                  {picked.verifyKind && (
                    <span className="small muted">
                      当前：{verifyKindLabel(picked.verifyKind)}
                      {picked.verifyLabel ? ` · ${picked.verifyLabel}` : ''}
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="row wrap" style={{ gap: 6, margin: '14px 0 10px' }}>
        {FILTERS.map((f) => (
          <button
            key={f.key || 'all'}
            type="button"
            className="chip"
            data-on={status === f.key}
            onClick={() => setStatus(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {msg && (
        <p
          className="small"
          style={{ color: msg.ok ? 'var(--ok)' : 'var(--danger)', marginBottom: 8 }}
        >
          {msg.text}
        </p>
      )}

      {loading ? (
        <p className="small muted">读取中…</p>
      ) : items.length === 0 ? (
        <div className="card empty-state">
          <b>没有对应的申请</b>
          <p>用户在「我的 → 认证」提交后会出现在这里。</p>
        </div>
      ) : (
        <div className="verify-review">
          {items.map((item) => {
            const p = patchOf(item);
            return (
              <div key={item.id} className="card card-pad verify-review-row">
                <div className="verify-review-head">
                  <span className="verify-review-avatar">
                    {item.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.avatar} alt="" />
                    ) : (
                      (item.nickname ?? '?').slice(0, 1)
                    )}
                  </span>
                  <b>{item.nickname}</b>
                  <span className="verify-review-requested">
                    <VerifyMark kind={item.kind} size="lg" />
                    {VERIFY_KIND_META[item.kind].label}
                  </span>
                  {item.currentKind && (
                    <span className="small muted">
                      当前：{verifyKindLabel(item.currentKind)}
                    </span>
                  )}
                  <span
                    className={
                      'badge ' +
                      (item.status === 'approved'
                        ? 'badge-ok'
                        : item.status === 'rejected'
                          ? 'badge-danger'
                          : 'badge-warn')
                    }
                  >
                    {VERIFY_STATUS_LABEL[item.status]}
                  </span>
                  <span className="small muted mono" style={{ marginLeft: 'auto' }}>
                    {day(item.createdAt)}
                  </span>
                </div>

                <dl className="verify-review-meta">
                  <div>
                    <dt>认证主体</dt>
                    <dd>{item.subject}</dd>
                  </div>
                  <div>
                    <dt>类别</dt>
                    <dd>{item.category || '—'}</dd>
                  </div>
                  <div>
                    <dt>联系方式</dt>
                    <dd>{item.contact || '—'}</dd>
                  </div>
                </dl>

                <p className="verify-review-evidence">{item.evidence}</p>
                {item.label && item.status === 'approved' && (
                  <p className="small muted">对外说明：{item.label}</p>
                )}
                {item.reviewNote && <p className="small muted">审核备注：{item.reviewNote}</p>}

                {item.status === 'pending' && (
                  <>
                    <div className="verify-review-controls">
                      <label className="field">
                        <span>类型</span>
                        <select
                          className="input"
                          value={p.kind}
                          onChange={(e) => edit(item.id, item, { kind: e.target.value as VerifyKind })}
                        >
                          <option value="blue">蓝标 · 个人</option>
                          <option value="red">红标 · 机构</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>对外说明（≤20 字）</span>
                        <input
                          className="input"
                          value={p.label}
                          maxLength={20}
                          placeholder={item.subject}
                          onChange={(e) => edit(item.id, item, { label: e.target.value })}
                        />
                      </label>
                      <label className="field" style={{ gridColumn: '1 / -1' }}>
                        <span>备注（拒绝时会展示给用户）</span>
                        <input
                          className="input"
                          value={p.note}
                          maxLength={100}
                          placeholder="可空"
                          onChange={(e) => edit(item.id, item, { note: e.target.value })}
                        />
                      </label>
                    </div>
                    <div className="row" style={{ gap: 8, marginTop: 10 }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => review(item, 'approved')}
                        disabled={busy === item.id}
                      >
                        {busy === item.id ? '处理中…' : '通过并亮标'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => review(item, 'rejected')}
                        disabled={busy === item.id}
                      >
                        拒绝
                      </button>
                      {p.kind !== item.kind && (
                        <span className="small muted">
                          将按{verifyKindLabel(p.kind)}通过（原申请 {VERIFY_KIND_META[item.kind].short}）
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
