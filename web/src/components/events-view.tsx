'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  EVENT_STATUS_LABEL,
  fmtEventRange,
  type EventItem,
} from '@/lib/event-types';

/**
 * 活动列表：卡片 + 一键参加。
 *
 * 参加不弹窗、不跳页——点一下变成「已参加」，人数立刻 +1。
 * 活动正文在详情页，列表只放摘要，避免一屏塞满长文。
 */
export function EventsView({ initial, loggedIn }: { initial: EventItem[]; loggedIn: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function toggle(item: EventItem) {
    if (busy) return;
    setBusy(item.id);
    setMsg(null);
    const res = await fetch(`/api/v1/events/${encodeURIComponent(item.id)}/join`, {
      method: item.joined ? 'DELETE' : 'POST',
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setMsg({ kind: 'err', text: data?.message ?? '操作失败，稍后再试' });
      return;
    }
    setItems((prev) =>
      prev.map((x) =>
        x.id === item.id
          ? { ...x, joined: !x.joined, entryCount: x.entryCount + (x.joined ? -1 : 1) }
          : x,
      ),
    );
    setMsg({ kind: 'ok', text: item.joined ? '已取消参加' : '已参加，活动开始前会收到提醒' });
    router.refresh();
  }

  return (
    <div className="col-main">
      <div className="ev-head">
        <div>
          <span className="rw-kicker">EVENTS</span>
          <h1 className="page-title">社区活动</h1>
          <p className="rw-sub">限时活动与福利发放。点「参加」登记，结束后按活动说明领取奖励。</p>
        </div>
      </div>

      {msg && <p className={`small ${msg.kind === 'err' ? 'auth-err' : 'ok-text'}`}>{msg.text}</p>}

      {items.length === 0 ? (
        <div className="card rw-empty">
          <b>最近没有活动</b>
          <p>有新的活动时会出现在这里，也可以先去任务中心看看日常。</p>
        </div>
      ) : (
        <div className="ev-list">
          {items.map((item) => (
            <article key={item.id} className="card ev-card" data-status={item.status}>
              {item.cover && (
                <Link href={`/events/${item.id}`} className="ev-cover" tabIndex={-1} aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.cover} alt="" loading="lazy" decoding="async" />
                </Link>
              )}
              <div className="ev-body">
                <div className="ev-top">
                  <span className="ev-badge" data-status={item.status}>
                    {EVENT_STATUS_LABEL[item.status]}
                  </span>
                  <span className="ev-time">{fmtEventRange(item.startsAt, item.endsAt)}</span>
                  <span className="ev-count">{item.entryCount} 人参加</span>
                </div>
                <Link href={`/events/${item.id}`} className="ev-title">
                  {item.title}
                </Link>
                {item.summary && <p className="ev-summary">{item.summary}</p>}
                <div className="ev-foot">
                  {item.reward && <span className="ev-reward">奖励 · {item.reward}</span>}
                  <button
                    type="button"
                    className={`btn btn-sm ${item.joined ? 'btn-ghost' : 'btn-primary'}`}
                    disabled={!loggedIn || item.status !== 'open' || busy === item.id}
                    onClick={() => void toggle(item)}
                  >
                    {busy === item.id
                      ? '处理中…'
                      : !loggedIn
                        ? '登录后参加'
                        : item.status !== 'open'
                          ? EVENT_STATUS_LABEL[item.status]
                          : item.joined
                            ? '已参加'
                            : '参加'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
