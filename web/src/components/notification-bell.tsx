'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Note } from '@/lib/notifications';

interface Props {
  initial: Note[];
  unread: number;
  loggedIn: boolean;
}

const ago = (at: number) => {
  if (!at) return '';
  const diff = Math.max(0, Date.now() - at);
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  return `${Math.floor(hour / 24)} 天前`;
};

/**
 * 顶栏站内信：点开是快捷面板，不跳页也能看完最近几条。
 * 首屏数据由服务端传入，打开面板时再拉一次最新的。
 */
export function NotificationBell({ initial, unread: initialUnread, loggedIn }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Note[]>(initial);
  const [unread, setUnread] = useState(initialUnread);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    let alive = true;
    fetch('/api/v1/notifications', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { items?: Note[]; unread?: number }) => {
        if (!alive) return;
        if (Array.isArray(d.items)) setItems(d.items.slice(0, 8));
        if (typeof d.unread === 'number') setUnread(d.unread);
      })
      .catch(() => null);

    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);

    return () => {
      alive = false;
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function readAll() {
    setBusy(true);
    await fetch('/api/v1/notifications/read', { method: 'POST' }).catch(() => null);
    setBusy(false);
    setUnread(0);
    setItems((list) => list.map((n) => ({ ...n, unread: false })));
    router.refresh();
  }

  return (
    <div className="notif-wrap" ref={box}>
      <button
        className="icon-btn"
        aria-label={unread > 0 ? `通知，${unread} 条未读` : '通知'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-open={open}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {unread > 0 && <i className="dot num">{unread > 99 ? '99+' : unread}</i>}
      </button>

      {open && (
        <div className="notif-pop" role="dialog" aria-label="站内信">
          <div className="notif-head">
            <b>站内信</b>
            <span className="small muted">{unread > 0 ? `${unread} 条未读` : '全部已读'}</span>
            {loggedIn && unread > 0 && (
              <button className="btn btn-sm btn-ghost" onClick={readAll} disabled={busy} style={{ marginLeft: 'auto' }}>
                {busy ? '处理中…' : '全部已读'}
              </button>
            )}
          </div>

          <div className="notif-list">
            {items.length === 0 ? (
              <p className="notif-empty">暂时没有新消息。有人评论你的帖子时会出现在这里。</p>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  href={n.href}
                  className="notif-item"
                  data-unread={n.unread}
                  onClick={() => setOpen(false)}
                >
                  <span className="notif-dot" aria-hidden="true" />
                  <span className="notif-body">
                    <span className="notif-title">
                      {n.title}
                      {n.badge && <span className="badge badge-warn notif-badge">{n.badge}</span>}
                    </span>
                    <span className="notif-text">{n.text}</span>
                  </span>
                  <span className="notif-time">{n.kind === 'match' ? '待处理' : ago(n.at)}</span>
                </Link>
              ))
            )}
          </div>

          <div className="notif-foot">
            <Link href="/notifications" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)} style={{ flex: 1 }}>
              查看全部
            </Link>
            {!loggedIn && (
              <Link href="/login" className="btn btn-sm btn-primary" onClick={() => setOpen(false)} style={{ flex: 1 }}>
                登录
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 通知页的「全部已读」按钮 */
export function MarkAllRead({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      className="btn btn-sm btn-ghost"
      disabled={busy || disabled}
      onClick={async () => {
        setBusy(true);
        await fetch('/api/v1/notifications/read', { method: 'POST' }).catch(() => null);
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? '处理中…' : disabled ? '已全部读完' : '全部标为已读'}
    </button>
  );
}
