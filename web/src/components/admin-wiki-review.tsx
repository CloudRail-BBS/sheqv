'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Markdown } from '@/lib/markdown';
import { SUBMISSION_STATUS } from '@/lib/wiki-types';
import { catLabel, type ContentCategory } from '@/lib/category-types';
import type { WikiSubmission, WikiSubmissionBrief } from '@/lib/wiki-types';

/**
 * 百科投稿审核。
 *
 * 列表只带摘要，点「查看」再拉正文：审核队列可能有几十条，
 * 一次把 20000 字的正文全塞进列表并不划算。
 */
export function AdminWikiReview({
  categories = [],
}: {
  categories?: ContentCategory[];
}) {
  const [items, setItems] = useState<WikiSubmissionBrief[]>([]);
  const [pending, setPending] = useState(0);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | ''>('pending');
  const [detail, setDetail] = useState<WikiSubmission | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    const qs = filter ? `?status=${filter}` : '';
    const res = await fetch(`/api/v1/admin/wiki/submissions${qs}`).catch(() => null);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '读取投稿失败' });
      return;
    }
    const d = (await res.json()) as { items?: WikiSubmissionBrief[]; pending?: number };
    setItems(d.items ?? []);
    setPending(d.pending ?? 0);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(id: string) {
    setDetail(null);
    const res = await fetch(`/api/v1/admin/wiki/submissions/${id}`).catch(() => null);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '读取正文失败' });
      return;
    }
    const d = (await res.json()) as { submission?: WikiSubmission };
    if (d.submission) setDetail(d.submission);
  }

  async function review(id: string, status: 'approved' | 'rejected', note = '') {
    setBusy(id);
    const res = await fetch(`/api/v1/admin/wiki/submissions/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status, note }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: status === 'approved' ? '通过失败' : '驳回失败' });
      return;
    }
    setMsg({ kind: 'ok', text: status === 'approved' ? '已通过并发布' : '已驳回' });
    setRejecting(null);
    setReason('');
    setDetail(null);
    void load();
  }

  return (
    <section className="card card-pad admin-wiki-review">
      <div className="between" style={{ alignItems: 'flex-end', marginBottom: 10 }}>
        <div>
          <h2 className="console-h3">投稿审核</h2>
          <p className="small muted" style={{ marginTop: 3 }}>
            通过后会写入词条（修改稿还会留一条历史版本）；驳回请写清原因，作者能在「我的投稿」里看到。
          </p>
        </div>
        {pending > 0 && <span className="badge" data-tone="warn">{pending} 条待审</span>}
      </div>

      <div className="row wrap" style={{ gap: 6 }}>
        {(
          [
            ['pending', '待审核'],
            ['approved', '已通过'],
            ['rejected', '已驳回'],
            ['', '全部'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={label}
            type="button"
            className="chip"
            data-on={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {msg && (
        <p className="small" style={{ marginTop: 8, color: msg.kind === 'ok' ? 'var(--blue)' : 'var(--danger)' }}>
          {msg.text}
        </p>
      )}

      {items.length === 0 ? (
        <p className="small muted" style={{ marginTop: 12 }}>这里还没有投稿。</p>
      ) : (
        <div className="wiki-review-list">
          {items.map((it) => {
            const st = SUBMISSION_STATUS[it.status];
            return (
              <article key={it.id} className="wiki-review-item">
                <div className="wiki-review-main">
                  <div className="wiki-review-title">
                    <b>{it.title}</b>
                    <span className="badge" data-tone={st.tone}>{st.label}</span>
                    <span className="badge badge-ghost">{catLabel(categories, it.category)}</span>
                    {it.entrySlug ? <span className="badge badge-ghost">修改词条</span> : <span className="badge badge-ghost">新词条</span>}
                  </div>
                  <div className="wiki-review-meta">
                    <span>{it.author}</span>
                    <span>·</span>
                    <span>{new Date(it.createdAt).toLocaleString('zh-CN', { hour12: false })}</span>
                    {it.summary && <span className="wiki-review-sum">· {it.summary}</span>}
                  </div>
                  {it.note && <p className="small muted" style={{ marginTop: 4 }}>意见：{it.note}</p>}
                </div>
                <div className="wiki-review-acts">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => void open(it.id)}>
                    查看
                  </button>
                  {it.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={busy === it.id}
                        onClick={() => void review(it.id, 'approved')}
                      >
                        通过
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => { setRejecting(it.id); setReason(''); }}
                      >
                        驳回
                      </button>
                    </>
                  )}
                  {it.entrySlug && it.status === 'approved' && (
                    <Link href={`/wiki/${it.entrySlug}`} className="btn btn-sm btn-ghost">
                      看词条
                    </Link>
                  )}
                </div>
                {rejecting === it.id && (
                  <div className="wiki-reject-row">
                    <input
                      className="input"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={200}
                      placeholder="驳回原因（会展示给作者）"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={busy === it.id || !reason.trim()}
                      onClick={() => void review(it.id, 'rejected', reason)}
                    >
                      确认驳回
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRejecting(null)}>
                      取消
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {detail && (
        <div className="wiki-review-modal" role="dialog" aria-modal="true">
          <button
            type="button"
            className="wiki-review-mask"
            aria-label="关闭"
            onClick={() => setDetail(null)}
          />
          <div className="card wiki-review-sheet">
            <div className="between" style={{ alignItems: 'flex-start' }}>
              <div>
                <h3 className="console-h3">{detail.title}</h3>
                <p className="small muted" style={{ marginTop: 3 }}>
                  {detail.author} · {catLabel(categories, detail.category)} ·{' '}
                  {detail.entrySlug ? `修改 /wiki/${detail.entrySlug}` : '新词条'}
                </p>
              </div>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDetail(null)}>
                关闭
              </button>
            </div>
            {detail.summary && <p className="wiki-review-lead">{detail.summary}</p>}
            <div className="wiki-review-body">
              <Markdown text={detail.body} className="md-body" />
            </div>
            {detail.status === 'pending' && (
              <div className="row" style={{ gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy === detail.id}
                  onClick={() => void review(detail.id, 'approved')}
                >
                  通过并发布
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => { setRejecting(detail.id); setReason(''); setDetail(null); }}
                >
                  驳回
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
