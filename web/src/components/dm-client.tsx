'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  differentDay,
  dmClock,
  dmDayLabel,
  dmInitial,
  dmListTime,
  type DmConversation,
  type DmMessage,
  type DmPeer,
} from '@/lib/dm-types';

/**
 * 私聊界面：左边会话列表、右边对话。
 *
 * 三条规则：
 * 1. 只有「选中会话」才拉消息并标已读——列表页不该顺手清掉未读。
 * 2. 轮询只在页面可见时跑（`document.hidden` 就跳过），避免后台标签页空转。
 * 3. 发送是乐观的：先上屏一条 pending 气泡，失败再标红，不让输入框卡住。
 */
export function DmClient({
  initial,
  initialPeer,
}: {
  initial: DmConversation[];
  initialPeer?: string;
}) {
  const [items, setItems] = useState<DmConversation[]>(initial);
  const [peerId, setPeerId] = useState<string | null>(initialPeer || initial[0]?.peer.id || null);
  const [peer, setPeer] = useState<DmPeer | null>(
    initial.find((c) => c.peer.id === (initialPeer || initial[0]?.peer.id))?.peer ?? null,
  );
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'thread'>(initialPeer ? 'thread' : 'list');

  const bottomRef = useRef<HTMLDivElement | null>(null);
  /** 每个会话最后一条「已上报已读」的消息 id，避免每 6 秒都写一次库 */
  const readMark = useRef<Map<string, string>>(new Map());
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const totalUnread = useMemo(() => items.reduce((n, c) => n + c.unread, 0), [items]);

  const scrollToBottom = useCallback((smooth = false) => {
    const box = listRef.current;
    if (!box) return;
    box.scrollTo({ top: box.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  /* ── 拉会话列表 ───────────────────────── */
  const refreshList = useCallback(async () => {
    const res = await fetch('/api/v1/dm', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { items?: DmConversation[] };
    setItems(data.items ?? []);
  }, []);

  /* ── 打开一个对话 ─────────────────────── */
  const openThread = useCallback(
    async (id: string, opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      const res = await fetch(`/api/v1/dm/${encodeURIComponent(id)}`, { cache: 'no-store' }).catch(
        () => null,
      );
      if (!res?.ok) {
        setLoading(false);
        if (!opts.silent) setError('这个对话暂时打不开');
        return;
      }
      const data = (await res.json()) as { peer: DmPeer; messages: DmMessage[] };
      setPeer(data.peer);
      setMessages((prev) => {
        const next = data.messages ?? [];
        // 还在发送中的本地气泡不要被服务端结果冲掉
        const pending = prev.filter((m) => m.pending);
        return [...next, ...pending];
      });
      setLoading(false);

      // 只有「最后一条不是我发的」且没上报过，才推进已读位点
      const last = (data.messages ?? []).at(-1);
      if (last && !last.mine && readMark.current.get(id) !== last.id) {
        readMark.current.set(id, last.id);
        void fetch(`/api/v1/dm/${encodeURIComponent(id)}/read`, { method: 'POST' }).catch(
          () => null,
        );
        setItems((prev) => prev.map((c) => (c.peer.id === id ? { ...c, unread: 0 } : c)));
      }
    },
    [],
  );

  useEffect(() => {
    if (!peerId) return;
    void openThread(peerId);
  }, [peerId, openThread]);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages.length, scrollToBottom]);

  /* ── 轮询 ─────────────────────────────── */
  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      void refreshList();
      if (peerId) void openThread(peerId, { silent: true });
    };
    const timer = setInterval(tick, 6000);
    return () => clearInterval(timer);
  }, [peerId, refreshList, openThread]);

  /* ── 发送 ─────────────────────────────── */
  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !peerId || sending) return;

    const tempId = `tmp-${Date.now()}`;
    const optimistic: DmMessage = { id: tempId, body: text, at: Date.now(), mine: true, pending: true };
    setMessages((m) => [...m, optimistic]);
    setDraft('');
    setSending(true);
    setError('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    const res = await fetch(`/api/v1/dm/${encodeURIComponent(peerId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: text }),
    }).catch(() => null);
    setSending(false);

    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      setMessages((m) => m.filter((x) => x.id !== tempId));
      setDraft(text);
      setError(data?.message ?? '发送失败，请稍后再试');
      return;
    }
    const data = (await res.json()) as { message: DmMessage };
    setMessages((m) => m.map((x) => (x.id === tempId ? data.message : x)));
    void refreshList();
  }, [draft, peerId, sending, refreshList]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 中文输入法正在选词时回车不能当发送
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  const pick = (id: string) => {
    setPeerId(id);
    setView('thread');
    setMessages([]);
    setPeer(items.find((c) => c.peer.id === id)?.peer ?? null);
  };

  return (
    <>
      <span className="sr-only" role="status" aria-atomic="true">
        {totalUnread > 0 ? `${totalUnread} 条未读私信` : ''}
      </span>

      <div className="dm-shell" data-view={view}>
        {/* 会话列表 */}
        <section className="card dm-list" aria-label="会话列表">
          <header className="dm-list-head">
            <b>私信</b>
            {totalUnread > 0 && <span className="dm-count">{totalUnread} 未读</span>}
          </header>

          {items.length === 0 ? (
            <div className="dm-list-empty">
              <p>还没有私信。</p>
              <p className="muted">在帖子或资源里点作者名，卡片上有「发私信」。</p>
            </div>
          ) : (
            <ul className="dm-items">
              {items.map((c) => (
                <li key={c.peer.id}>
                  <button
                    type="button"
                    className="dm-item"
                    data-active={c.peer.id === peerId}
                    aria-current={c.peer.id === peerId ? 'true' : undefined}
                    onClick={() => pick(c.peer.id)}
                  >
                    <span className="dm-avatar">
                      {c.peer.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.peer.avatar} alt="" loading="lazy" decoding="async" />
                      ) : (
                        dmInitial(c.peer.nickname)
                      )}
                    </span>
                    <span className="dm-item-main">
                      <span className="dm-item-top">
                        <b>{c.peer.nickname}</b>
                        <time>{dmListTime(c.lastAt)}</time>
                      </span>
                      <span className="dm-item-sub">
                        {c.lastMine && <i>我：</i>}
                        {c.lastPreview || '还没有消息'}
                      </span>
                    </span>
                    {c.unread > 0 && (
                      <span className="dm-badge" aria-label={`${c.unread} 条未读`}>
                        {c.unread > 99 ? '99+' : c.unread}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 对话 */}
        <section className="card dm-thread" aria-label={peer ? `与 ${peer.nickname} 的对话` : '对话'}>
          {!peerId ? (
            <div className="dm-placeholder">
              <p>选择一个会话开始聊天</p>
              <p className="muted">私信只有你和对方能看到。</p>
            </div>
          ) : (
            <>
              <header className="dm-thread-head">
                <button
                  type="button"
                  className="dm-back"
                  aria-label="返回会话列表"
                  onClick={() => setView('list')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <span className="dm-avatar sm">
                  {peer?.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={peer.avatar} alt="" loading="lazy" decoding="async" />
                  ) : (
                    dmInitial(peer?.nickname ?? '?')
                  )}
                </span>
                <b>{peer?.nickname ?? '对话'}</b>
              </header>

              <div className="dm-messages" ref={listRef} role="log" aria-live="polite" aria-relevant="additions">
                {loading && messages.length === 0 && <p className="dm-tip">正在加载…</p>}
                {!loading && messages.length === 0 && (
                  <p className="dm-tip">还没有消息，先打个招呼吧。</p>
                )}
                {messages.map((m, i) => {
                  const prev = messages[i - 1];
                  const showDay = !prev || differentDay(prev.at, m.at);
                  return (
                    <div key={m.id}>
                      {showDay && <div className="dm-day">{dmDayLabel(m.at)}</div>}
                      <div className="dm-row" data-mine={m.mine}>
                        <div className="dm-bubble" data-pending={m.pending || undefined}>
                          {m.body}
                          <time>{dmClock(m.at)}</time>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {error && <p className="dm-error">{error}</p>}

              <div className="dm-composer">
                <textarea
                  ref={inputRef}
                  className="dm-input"
                  rows={1}
                  value={draft}
                  maxLength={2000}
                  placeholder="说点什么…（Enter 发送 / Shift+Enter 换行）"
                  aria-label="消息内容"
                  onChange={(e) => {
                    setDraft(e.target.value);
                    const el = e.currentTarget;
                    el.style.height = 'auto';
                    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                  }}
                  onKeyDown={onKeyDown}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm dm-send"
                  disabled={sending || !draft.trim()}
                  onClick={() => void send()}
                >
                  发送
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
