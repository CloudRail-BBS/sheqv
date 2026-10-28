'use client';

import { useCallback, useEffect, useState } from 'react';

interface PushMessage {
  id: string;
  title: string;
  body: string;
  url: string;
  audience: string;
  sent: number;
  failed: number;
  createdAt: number;
}

interface Overview {
  subscriptions: number;
  signedIn: number;
  publicKey: string;
  subject: string;
  recent: PushMessage[];
}

const AUDIENCES = [
  { key: 'all', label: '全部订阅' },
  { key: 'signed_in', label: '仅登录用户' },
  { key: 'admins', label: '仅管理员' },
];

const timeText = (ts: number) =>
  new Date(ts).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });

/**
 * 后台推送面板。
 *
 * 订阅是浏览器生成的，后台只能看到数量与设备信息，看不到具体是谁的设备；
 * 推送内容必须是「对所有人都有意义」的公告类信息，别拿来当站内信群发。
 */
export function AdminPush() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/');
  const [audience, setAudience] = useState('all');

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/admin/push', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '读取失败（需要管理员权限）' });
      setLoading(false);
      return;
    }
    const next = (await res.json()) as Overview;
    setData(next);
    setSubject(next.subject ?? '');
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    if (!title.trim()) {
      setMsg({ kind: 'err', text: '标题不能为空' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/v1/admin/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, body, url, audience }),
    }).catch(() => null);
    setBusy(false);

    if (!res?.ok) {
      const d = await res?.json().catch(() => null);
      setMsg({ kind: 'err', text: d?.message ?? '发送失败' });
      return;
    }
    const d = (await res.json()) as { sent: number; failed: number };
    setMsg({
      kind: 'ok',
      text: `已发送：成功 ${d.sent} 台，失败 ${d.failed} 台${d.sent === 0 ? '（可能是还没有人订阅）' : ''}`,
    });
    setTitle('');
    setBody('');
    void load();
  }

  async function saveSubject() {
    setBusy(true);
    const res = await fetch('/api/v1/admin/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vapidSubject: subject.trim() }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '保存失败' });
      return;
    }
    setMsg({ kind: 'ok', text: '联系主体已保存' });
    void load();
  }

  async function prune() {
    setBusy(true);
    const res = await fetch('/api/v1/admin/push/subscriptions', {
      method: 'DELETE',
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '清理失败' });
      return;
    }
    const d = (await res.json()) as { removed: number };
    setMsg({ kind: 'ok', text: `已清理 ${d.removed} 条连续失败的订阅` });
    void load();
  }

  if (loading) {
    return (
      <div className="card card-pad">
        <p className="small muted">正在读取推送状态…</p>
      </div>
    );
  }

  return (
    <>
      <div className="console-stats">
        <div className="card console-stat">
          <b>{data?.subscriptions ?? 0}</b>
          <span>订阅设备</span>
        </div>
        <div className="card console-stat">
          <b>{data?.signedIn ?? 0}</b>
          <span>已绑定账号</span>
        </div>
        <div className="card console-stat">
          <b>{data?.recent.length ?? 0}</b>
          <span>最近发送</span>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <h3 className="console-h3">发送一条推送</h3>
        <p className="small muted" style={{ marginTop: 4, lineHeight: 1.75 }}>
          只有开启过通知的设备会收到。标题 60 字、正文 160 字以内。
        </p>

        <div className="console-form">
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>标题</span>
            <input
              className="input"
              value={title}
              maxLength={60}
              placeholder="例如：赛季规则更新"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>正文</span>
            <textarea
              className="input textarea"
              rows={3}
              value={body}
              maxLength={160}
              placeholder="一句话说清发生了什么，以及需要用户做什么"
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <label className="field">
            <span>点击后打开</span>
            <input
              className="input mono"
              value={url}
              placeholder="/announcements"
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label className="field">
            <span>发给谁</span>
            <select className="input" value={audience} onChange={(e) => setAudience(e.target.value)}>
              {AUDIENCES.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void send()}>
            {busy ? '发送中…' : '发送推送'}
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void prune()}>
            清理失效订阅
          </button>
          {msg && (
            <span className={msg.kind === 'ok' ? 'console-msg ok' : 'console-msg err'}>{msg.text}</span>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="console-card-head">
          <h3 className="console-h3">发送记录</h3>
        </div>
        {data && data.recent.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>时间</th>
                  <th>内容</th>
                  <th style={{ width: 90 }}>范围</th>
                  <th style={{ width: 100 }}>结果</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((m) => (
                  <tr key={m.id}>
                    <td className="mono small muted">{timeText(m.createdAt)}</td>
                    <td>
                      <b style={{ fontWeight: 600 }}>{m.title}</b>
                      {m.body && (
                        <div className="small muted" style={{ marginTop: 2, lineHeight: 1.6 }}>
                          {m.body}
                        </div>
                      )}
                    </td>
                    <td className="small muted">
                      {AUDIENCES.find((a) => a.key === m.audience)?.label ?? '全部订阅'}
                    </td>
                    <td className="small">
                      成功 {m.sent}
                      {m.failed > 0 && <span className="muted"> · 失败 {m.failed}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="small muted" style={{ padding: '4px 16px 16px' }}>
            还没有发送记录。
          </p>
        )}
      </div>

      <div className="card card-pad">
        <h3 className="console-h3">VAPID 公钥</h3>
        <p className="small muted" style={{ marginTop: 4, lineHeight: 1.75 }}>
          订阅凭据。迁移服务器时请连同数据库一起迁移，否则已订阅的设备会全部失效。
        </p>
        <code className="console-key">{data?.publicKey || '—'}</code>

        <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 260px', minWidth: 0 }}>
            <span>联系主体（VAPID sub）</span>
            <input
              className="input mono"
              value={subject}
              placeholder="mailto:admin@你的域名"
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-sm"
            style={{ alignSelf: 'flex-end' }}
            disabled={busy || subject.trim() === (data?.subject ?? '')}
            onClick={() => void saveSubject()}
          >
            保存
          </button>
        </div>
        <p className="small muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
          推送服务出问题时，对方会按这个地址联系你。建议填真实邮箱，例如
          <code>mailto:admin@example.com</code>。
        </p>
      </div>
    </>
  );
}
