'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import type { PublicUser } from '@/lib/users';

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const I = {
  home: 'M3 10.5 12 3l9 7.5V21H3z',
  box: 'M4 5h16v14H4zM4 9h16M9 9v10',
  server: 'M4 4h16v6H4zM4 14h16v6H4zM7.5 7h.01M7.5 17h.01',
  shield: 'M12 3 4 7v5c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V7z',
  users:
    'M16 17v-1.6a3.4 3.4 0 0 0-3.4-3.4H7.4A3.4 3.4 0 0 0 4 15.4V17M10 8.6a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 17v-1.6a3.4 3.4 0 0 0-2.6-3.3M15.4 3.1a3 3 0 0 1 0 5.5',
  sword: 'M5 4v6a7 7 0 0 0 14 0V4M8 4h8M12 17v3',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4.5 20.5a7.5 7.5 0 0 1 15 0',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0',
  star: 'm12 3.6 2.5 5.2 5.6.8-4 3.9 1 5.5-5.1-2.7-5.1 2.7 1-5.5-4-3.9 5.6-.8z',
  code: 'm8 6-5 6 5 6M16 6l5 6-5 6',
  cog:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.6-1.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 4.6V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  tag: 'M4 4h7l9 9-7 7-9-9zM8.2 8.2h.01',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
};

export function MobileMenu({
  siteName,
  user,
  points,
  unread,
}: {
  siteName: string;
  user: PublicUser | null;
  points: number;
  unread: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = (href: string, label: string, d: string, extra?: React.ReactNode) => {
    const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
    return (
      <Link href={href} className="mobile-drawer-item" data-active={active} onClick={() => setOpen(false)}>
        <Icon d={d} />
        <span>{label}</span>
        {extra}
      </Link>
    );
  };

  return (
    <>
      <button
        type="button"
        className="icon-btn mobile-menu-btn"
        aria-label="打开快捷菜单"
        onClick={() => setOpen(true)}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {mounted && open && createPortal(
        <div className="mobile-drawer-mask" onClick={() => setOpen(false)}>
          <aside className="mobile-drawer" onClick={(e) => e.stopPropagation()} aria-label="快捷菜单">
            <div className="mobile-drawer-head">
              <div>
                <b>{siteName}</b>
                <span>快捷菜单</span>
              </div>
              <button type="button" className="icon-btn" aria-label="关闭菜单" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>

            <div className="mobile-drawer-user">
              <span className="mobile-drawer-avatar">
                {user?.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatar} alt="" />
                ) : (
                  (user?.nickname ?? '?').slice(0, 1)
                )}
              </span>
              <div>
                <b>{user?.nickname ?? '未登录'}</b>
                <span>{user ? `${points} 积分` : '登录后参与社区'}</span>
              </div>
              {!user && (
                <Link href="/login" className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>
                  登录
                </Link>
              )}
            </div>

            <div className="mobile-drawer-section">
              <div className="mobile-drawer-label">快捷</div>
              {item('/', '首页', I.home)}
              {item('/resources', '资源库', I.box)}
              {item('/servers', '联机大厅', I.server)}
              {item('/guilds', '公会', I.shield)}
              {item('/teams', '战队', I.users)}
              {item('/matches', '约战', I.sword)}
              {item('/leaderboard', '排行榜', I.chart)}
            </div>

            <div className="mobile-drawer-section">
              <div className="mobile-drawer-label">我的</div>
              {item('/me', '我的主页', I.user)}
              {item(
                '/notifications',
                '站内消息',
                I.bell,
                unread > 0 ? <span className="mobile-drawer-count">{unread}</span> : null,
              )}
              {item('/points', '积分与签到', I.star)}
              {item('/download', '客户端下载', I.code)}
            </div>

            <div className="mobile-drawer-section">
              <div className="mobile-drawer-label">分类</div>
              {item('/resources?game=minecraft', 'Minecraft', I.tag)}
              {item('/resources?game=rusted_warfare', 'Rusted Warfare', I.tag)}
              {item('/resources?category=整合包', '整合包', I.box)}
              {item('/resources?category=工具', '工具', I.box)}
            </div>

            <div className="mobile-drawer-section">
              <div className="mobile-drawer-label">站内</div>
              {item('/policies', '政策与协议', I.doc)}
              {item('/agreements', '公约与签署', I.doc)}
            </div>

            {user && (
              <div className="mobile-drawer-foot">
                <Link href="/me" onClick={() => setOpen(false)}>
                  账号与资料
                </Link>
                <span>v0.1</span>
              </div>
            )}
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}
