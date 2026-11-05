'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 运营面板 · 成员与禁言。
 *
 * 只展示「会不会被禁言」的字段（昵称、用户名、角色、禁言状态），
 * 看不到邮箱与登录信息——运营处理骚扰不需要这些。
 *
 * 时长用固定档位而不是让运营填数字：1 分钟这种档位容易误伤，
 * 最长 30 天，到期自动失效，不用记得回来解禁。
 */
interface Member {
  id: string;
  username: string;
  nickname: string;
  role: string;
  mutedUntil?: number | null;
  muteReason?: string;
}

const DURATIONS: { label: string; minutes: number }[] = [
  { label: '10 分钟', minutes: 10 },
  { label: '1 小时', minutes: 60 },
  { label: '6 小时', minutes: 360 },
  { label: '1 天', minutes: 1440 },
  { label: '7 天', minutes: 10080 },
  { label: '30 天', minutes: 43200 },
];

const fmt = (ms: number) => {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function OpsMembers() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [target, setTarget] = useState<Member | null>(null);
  const [minutes, setMinutes] = useState(60);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    const res = await fetch(`/api/v1/ops/users?q=${encodeURIComponent(key)}`, {
      cache: 'no-store',
    }).catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      setMsg({ ok: false, text: '读取成员列表失败（需要「禁言成员」权限）' });
      return;
    }
    const data = (await res.json()) as { items?: Member[] };
    setItems(data.items ?? []);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q.trim()), 260);
    return () => clearTimeout(t);
  }, [q, load]);

  async function submitMute() {
    if (!target || busy) return;
    if (!reason.trim()) {
      setMsg({ ok: false, text: '请填写禁言原因' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/v1/ops/users/${encodeURIComponent(target.id)}/mute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ minutes, reason: reason.trim() }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { message?: string; mutedUntil?: number; muteReason?: string }
      | null;
    setBusy(false);
    if (!res?.ok) {
      setMsg({ ok: false, text: data?.message ?? '操作失败' });
      return;
    }
    setItems((list) =>
      list.map((m) =>
        m.id === target.id
          ? { ...m, mutedUntil: data?.mutedUntil ?? null, muteReason: data?.muteReason ?? '' }
          : m,
      ),
    );
    setMsg({ ok: true, text: `已禁言 ${target.nickname}，到期自动恢复` });
    setTarget(null);
    setReason('');
  }

  async function unmute(m: Member) {
    const res = await fetch(`/api/v1/ops/users/${encodeURIComponent(m.id)}/mute`, {
      method: 'DELETE',
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    if (!res?.ok) {
      setMsg({ ok: false, text: data?.message ?? '解除失败' });
      return;
    }
    setItems((list) =>
      list.map((x) => (x.id === m.id ? { ...x, mutedUntil: null, muteReason: '' } : x)),
    );
    setMsg({ ok: true, text: `已解除 ${m.nickname} 的禁言` });
  }

  return (
    <>
      <div className="ops-toolbar">
        <input
          className="input"
          value={q}
          placeholder="搜昵称或用户名"
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="small muted">{loading ? '读取中…' : `${items.length} 人`}</span>
      </div>

      {msg && (
        <div className="hint-box" data-tone={msg.ok ? 'ok' : 'warn'}>
          {msg.text}
        </div>
      )}

      <div className="card ops-members">
        {items.length === 0 && !loading ? (
          <p className="small muted" style={{ padding: '10px 2px' }}>
            没有匹配的成员。
          </p>
        ) : (
          <ul className="ops-member-list">
            {items.map((m) => {
              const muted = (m.mutedUntil ?? 0) > Date.now();
              return (
                <li key={m.id} className="ops-member" data-muted={muted}>
                  <span className="ops-member-ava">{m.nickname.slice(0, 1)}</span>
                  <div className="ops-member-main">
                    <div className="ops-member-name">
                      {m.nickname}
                      {m.role === 'admin' && <span className="badge badge-ghost">管理员</span>}
                    </div>
                    <div className="ops-member-sub">
                      @{m.username}
                      {muted && (
                        <span className="ops-mute-tag">
                          禁言至 {fmt(m.mutedUntil!)} · {m.muteReason || '未填原因'}
                        </span>
                      )}
                    </div>
                  </div>
                  {m.role === 'admin' ? (
                    <span className="small muted">不可操作</span>
                  ) : muted ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => void unmute(m)}
                    >
                      解除禁言
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => {
                        setTarget(m);
                        setMinutes(60);
                        setReason('');
                      }}
                    >
                      禁言
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="small muted" style={{ lineHeight: 1.8 }}>
        禁言期间不能发帖、评论与发私信；到期自动恢复，不需要手动解禁。
        重复禁言会以新的到期时间为准。
      </p>

      {mounted &&
        target &&
        createPortal(
          <div className="modal-mask" role="presentation" onClick={() => !busy && setTarget(null)}>
            <div
              className="modal ext-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mute-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                <h2 id="mute-title" style={{ margin: 0, fontSize: 15.5, fontWeight: 650 }}>
                  禁言 {target.nickname}
                </h2>
                <p className="small muted" style={{ marginTop: 4 }}>
                  到期自动恢复；对方会收到站内信说明时长与原因。
                </p>
              </div>

              <label className="field">
                <span>时长</span>
                <div className="row wrap" style={{ gap: 6 }}>
                  {DURATIONS.map((d) => (
                    <button
                      key={d.minutes}
                      type="button"
                      className="chip"
                      data-on={minutes === d.minutes}
                      onClick={() => setMinutes(d.minutes)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </label>

              <label className="field">
                <span>原因（必填，会随站内信发给对方）</span>
                <input
                  className="input"
                  value={reason}
                  maxLength={120}
                  placeholder="例如：多次发布广告 / 人身攻击"
                  onChange={(e) => setReason(e.target.value)}
                />
                <em className="small muted" style={{ fontStyle: 'normal', marginTop: 4 }}>
                  写清楚原因，对方在「站内信」里能看到；空的存不进去。
                </em>
              </label>

              <div className="ext-foot">
                <button type="button" className="btn btn-ghost" onClick={() => setTarget(null)}>
                  取消
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || reason.trim().length === 0}
                  onClick={() => void submitMute()}
                >
                  {busy ? '处理中…' : '确认禁言'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
