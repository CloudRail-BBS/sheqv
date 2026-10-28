'use client';

import { useEffect, useMemo, useState } from 'react';

interface UserLite {
  id: string;
  nickname: string;
  username: string;
}

interface SentItem {
  id: string;
  userId: string;
  nickname: string;
  title: string;
  body: string;
  href: string;
  createdAt: number;
  read: boolean;
}

const day = (ts: number) => new Date(ts).toISOString().slice(0, 16).replace('T', ' ');

/**
 * 后台系统消息。
 *
 * 复用站内信（notifications, kind=system）：可以发给单个用户，也可以全站群发；
 * 全站会跳过已封禁账号。发送后用户端铃铛与通知页立即可见。
 */
export function AdminMessages() {
  const [audience, setAudience] = useState<'all' | 'one'>('one');
  const [users, setUsers] = useState<UserLite[]>([]);
  const [q, setQ] = useState('');
  const [userId, setUserId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [href, setHref] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sent, setSent] = useState<SentItem[]>([]);

  async function loadSent() {
    const res = await fetch('/api/v1/admin/messages', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { items: SentItem[] };
    setSent(data.items ?? []);
  }

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/v1/admin/users', { cache: 'no-store' }).catch(() => null);
      if (res?.ok) {
        const data = (await res.json()) as { items: UserLite[] };
        setUsers(data.items ?? []);
      }
      void loadSent();
    })();
  }, []);

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return users.slice(0, 40);
    return users
      .filter((u) => u.nickname.toLowerCase().includes(key) || u.username.toLowerCase().includes(key))
      .slice(0, 40);
  }, [users, q]);

  async function send() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/v1/admin/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: audience === 'one' ? userId : '',
        title,
        body,
        href,
      }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { count?: number; message?: string }
      | null;
    setBusy(false);
    if (!res?.ok) {
      setMsg({ ok: false, text: data?.message ?? '发送失败' });
      return;
    }
    setMsg({
      ok: true,
      text: audience === 'all' ? `已发送给 ${data?.count ?? 0} 个账号` : '已发送',
    });
    setTitle('');
    setBody('');
    setHref('');
    void loadSent();
  }

  const canSend =
    title.trim().length >= 2 &&
    body.trim().length >= 2 &&
    (audience === 'all' || Boolean(userId)) &&
    !busy;

  return (
    <>
      <div className="card card-pad">
        <div className="row wrap" style={{ gap: 6 }}>
          <button
            type="button"
            className="chip"
            data-on={audience === 'one'}
            onClick={() => setAudience('one')}
          >
            发给单个用户
          </button>
          <button
            type="button"
            className="chip"
            data-on={audience === 'all'}
            onClick={() => setAudience('all')}
          >
            全站群发
          </button>
          {audience === 'all' && (
            <span className="small muted">会跳过已封禁账号；大站点请分批发送。</span>
          )}
        </div>

        <div className="adm-form" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
          {audience === 'one' && (
            <>
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
                <span>收件人</span>
                <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
                  <option value="">— 请选择 —</option>
                  {filtered.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nickname}（@{u.username}）
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="field" style={{ gridColumn: audience === 'all' ? '1 / -1' : undefined }}>
            <span>标题（2–40 字）</span>
            <input
              className="input"
              value={title}
              maxLength={40}
              placeholder="例如：本周六晚维护通知"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>正文（2–300 字）</span>
            <textarea
              className="input textarea"
              rows={3}
              maxLength={300}
              value={body}
              placeholder="写清楚时间、影响与需要用户做什么"
              onChange={(e) => setBody(e.target.value)}
            />
          </label>

          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>跳转地址（可空，站内路径）</span>
            <input
              className="input mono"
              value={href}
              maxLength={200}
              placeholder="/announcements/xxx"
              onChange={(e) => setHref(e.target.value)}
            />
          </label>
        </div>

        {msg && (
          <p className="small" style={{ color: msg.ok ? 'var(--ok)' : 'var(--danger)', marginTop: 8 }}>
            {msg.text}
          </p>
        )}

        <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-primary" onClick={send} disabled={!canSend}>
            {busy ? '发送中…' : audience === 'all' ? '全站发送' : '发送'}
          </button>
        </div>
      </div>

      <h3 style={{ fontSize: 13, margin: '16px 0 8px' }}>最近发送</h3>
      {sent.length === 0 ? (
        <div className="card empty-state">
          <b>还没有发送记录</b>
          <p>发送后这里会按收件人列出最近 50 条。</p>
        </div>
      ) : (
        <div className="card adm-msg-list">
          {sent.map((m) => (
            <div key={m.id} className="adm-msg-row">
              <div className="adm-msg-main">
                <b>{m.title}</b>
                <p className="small muted">{m.body}</p>
              </div>
              <div className="adm-msg-side">
                <span className="small">{m.nickname}</span>
                <span className="small muted mono">{day(m.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
