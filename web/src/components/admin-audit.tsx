'use client';

import { useCallback, useEffect, useState } from 'react';

interface PendingPost {
  id: string;
  title: string | null;
  body: string;
  author: string;
  createdAt: number;
  aiReason: string | null;
  aiScore: number | null;
  aiLabels: string[] | null;
}

function ago(ts: number, now: number): string {
  const min = Math.floor(Math.max(0, now - ts) / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

interface PendingResource {
  id: string;
  title: string;
  summary: string;
  author: string;
  game: string;
  category: string;
  createdAt: number;
  aiReason: string | null;
}

export function AdminAudit() {
  const [tab, setTab] = useState<'post' | 'resource'>('post');
  const [resItems, setResItems] = useState<PendingResource[]>([]);
  const [resCount, setResCount] = useState(0);
  const [resBusy, setResBusy] = useState<string | null>(null);
  const [resRejecting, setResRejecting] = useState<string | null>(null);
  const [resReason, setResReason] = useState('');
  const [items, setItems] = useState<PendingPost[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    const [postRes, resRes] = await Promise.all([
      fetch('/api/v1/admin/audit/posts', { cache: 'no-store' }).catch(() => null),
      fetch('/api/v1/admin/audit/resources', { cache: 'no-store' }).catch(() => null),
    ]);
    if (!postRes?.ok) {
      setMsg({ kind: 'err', text: '读取待审队列失败（需要审核权限）' });
      return;
    }
    const data = (await postRes.json()) as {
      items: PendingPost[];
      pendingCount: number;
      now: number;
    };
    setItems(data.items);
    setPendingCount(data.pendingCount);
    setNow(data.now);

    if (resRes?.ok) {
      const r = (await resRes.json()) as { items: PendingResource[]; pendingCount: number };
      setResItems(r.items ?? []);
      setResCount(r.pendingCount ?? 0);
    }
  }, []);

  async function reviewResource(id: string, approve: boolean, why?: string) {
    setResBusy(id);
    setMsg(null);
    const res = await fetch(`/api/v1/admin/audit/resources/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approve, reason: why }),
    }).catch(() => null);
    setResBusy(null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setMsg({ kind: 'err', text: data?.message ?? '操作失败' });
      return;
    }
    setResRejecting(null);
    setResReason('');
    setMsg({ kind: 'ok', text: approve ? '已通过，资源已公开' : '已驳回，作者会收到原因' });
    void load();
  }

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, approve: boolean, why?: string) {
    setBusy(id);
    setMsg(null);

    const res = await fetch(`/api/v1/admin/audit/posts/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approve, reason: why }),
    }).catch(() => null);

    setBusy(null);

    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setMsg({ kind: 'err', text: data?.message ?? '操作失败' });
      return;
    }

    setRejecting(null);
    setReason('');
    setMsg({ kind: 'ok', text: approve ? '已通过，帖子现在对外可见' : '已拒绝，作者会看到原因' });
    void load();
  }

  async function testAi() {
    setTesting(true);
    setMsg(null);
    const res = await fetch('/api/v1/admin/audit/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }).catch(() => null);
    setTesting(false);

    const data = (await res?.json().catch(() => null)) as
      | { verdict?: { risky: boolean; score: number; reason: string }; message?: string }
      | null;

    if (!res?.ok) {
      setMsg({ kind: 'err', text: data?.message ?? 'AI 调用失败' });
      return;
    }
    const v = data?.verdict;
    setMsg({
      kind: 'ok',
      text: `AI 可用：risky=${v?.risky}，score=${v?.score?.toFixed(2)}，${v?.reason || '无说明'}`,
    });
  }

  return (
    <>
      <div className="between" style={{ marginTop: 14 }}>
        <h3 style={{ fontSize: 13 }}>
          待审队列{' '}
          <span className="badge">{tab === 'post' ? pendingCount : resCount}</span>
        </h3>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-sm btn-ghost" onClick={testAi} disabled={testing}>
            {testing ? '测试中…' : '测试 AI 配置'}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => void load()}>
            刷新
          </button>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
        <button type="button" className="chip" data-on={tab === 'post'} onClick={() => setTab('post')}>
          帖子
        </button>
        <button
          type="button"
          className="chip"
          data-on={tab === 'resource'}
          onClick={() => setTab('resource')}
        >
          资源
        </button>
      </div>

      {msg && (
        <p className={`small ${msg.kind === 'err' ? 'auth-err' : 'muted'}`} style={{ marginTop: 10 }}>
          {msg.text}
        </p>
      )}

      <div style={{ display: tab === 'post' ? undefined : 'none' }}>
      {items.length === 0 ? (
        <div className="card card-pad" style={{ marginTop: 10 }}>
          <p className="small muted">没有待审内容。开启审核后，新帖会先出现在这里。</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          {items.map((p) => (
            <div key={p.id} className="card card-pad">
              <div className="between">
                <b style={{ fontSize: 14 }}>{p.title || '（无标题）'}</b>
                <span className="small muted">
                  {p.author} · {ago(p.createdAt, now)}
                </span>
              </div>

              <p className="small" style={{ marginTop: 8, lineHeight: 1.75, color: 'var(--text-2)' }}>
                {p.body.length > 220 ? `${p.body.slice(0, 220)}…` : p.body}
              </p>

              {p.aiReason && (
                <p className="small muted" style={{ marginTop: 8 }}>
                  AI 判定：
                  {typeof p.aiScore === 'number' && `风险 ${p.aiScore.toFixed(2)} · `}
                  {p.aiReason}
                  {p.aiLabels && p.aiLabels.length > 0 && `（${p.aiLabels.join('、')}）`}
                </p>
              )}

              {rejecting === p.id ? (
                <div style={{ marginTop: 10 }}>
                  <label className="field">
                    <span>拒绝原因（作者可见，必填）</span>
                    <input
                      className="input"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="例如：含未经允许的广告链接"
                      maxLength={200}
                    />
                  </label>
                  <div className="row" style={{ gap: 8, marginTop: 8 }}>
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={busy === p.id || !reason.trim()}
                      onClick={() => review(p.id, false, reason)}
                    >
                      确认拒绝
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => { setRejecting(null); setReason(''); }}>
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="row" style={{ gap: 8, marginTop: 12 }}>
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={busy === p.id}
                    onClick={() => review(p.id, true)}
                  >
                    通过
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => { setRejecting(p.id); setReason(''); }}>
                    拒绝
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </div>

      <div style={{ display: tab === 'resource' ? undefined : 'none', marginTop: 10 }}>
        {resItems.length === 0 ? (
          <div className="card card-pad">
            <p className="small muted">没有待审资源。开启审核后，新资源会先出现在这里。</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {resItems.map((r) => (
              <div key={r.id} className="card card-pad">
                <div className="between">
                  <b style={{ fontSize: 14 }}>{r.title}</b>
                  <span className="small muted">
                    {r.author} · {ago(r.createdAt, now)}
                  </span>
                </div>
                <p className="small" style={{ marginTop: 6, color: 'var(--text-2)' }}>
                  {r.game} · {r.category}
                  {r.summary ? ` · ${r.summary.slice(0, 120)}` : ''}
                </p>
                {r.aiReason && <p className="small muted" style={{ marginTop: 6 }}>AI 判定：{r.aiReason}</p>}

                {resRejecting === r.id ? (
                  <div style={{ marginTop: 10 }}>
                    <label className="field">
                      <span>驳回原因（作者可见，必填）</span>
                      <input
                        className="input"
                        value={resReason}
                        onChange={(e) => setResReason(e.target.value)}
                        placeholder="例如：附件与描述不符"
                        maxLength={200}
                      />
                    </label>
                    <div className="row" style={{ gap: 8, marginTop: 8 }}>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={resBusy === r.id || !resReason.trim()}
                        onClick={() => reviewResource(r.id, false, resReason)}
                      >
                        确认驳回
                      </button>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => {
                          setResRejecting(null);
                          setResReason('');
                        }}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="row" style={{ gap: 8, marginTop: 12 }}>
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={resBusy === r.id}
                      onClick={() => reviewResource(r.id, true)}
                    >
                      通过
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => {
                        setResRejecting(r.id);
                        setResReason('');
                      }}
                    >
                      驳回
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
