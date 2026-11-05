'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import type { PublicUser } from '@/lib/users';
import { NAV_GROUPS, SIDEBAR_DEFAULT, parseNav } from '@/lib/nav-config';
import { NavGlyph } from './nav-icons';
import { LevelPill } from './rank-badges';
import { VerifyMark } from './verify-mark';

const isActive = (pathname: string, href: string) => {
  const base = href.split('?')[0];
  if (base === '/') return pathname === '/';
  return pathname === base || pathname.startsWith(`${base}/`);
};

export function MobileMenu({
  siteName,
  user,
  points,
  unread,
  items,
}: {
  siteName: string;
  user: PublicUser | null;
  points: number;
  unread: number;
  /** 与侧栏同一份后台配置 */
  items?: string;
}) {
  const pathname = usePathname();
  const keys = parseNav(items, SIDEBAR_DEFAULT);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    // 移动端的滚动在 .site-scroll 上（body 已是 overflow:hidden），
    // 只锁 body 拦不住，抽屉打开后背后仍会跟着滑。
    const box = document.querySelector<HTMLElement>('.site-scroll');
    const previousBox = box?.style.overflow ?? '';
    const previousBody = document.body.style.overflow;
    if (box) box.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      if (box) box.style.overflow = previousBox;
      document.body.style.overflow = previousBody;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = (href: string, label: string, key: string, extra?: React.ReactNode) => (
    <Link
      href={href}
      className="mobile-drawer-item"
      data-active={isActive(pathname, href)}
      onClick={() => setOpen(false)}
    >
      <span className="mobile-drawer-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <NavGlyph k={key} />
        </svg>
      </span>
      <span>{label}</span>
      {extra}
    </Link>
  );

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

            <div className="mobile-drawer-user" data-guest={!user}>
              <span className="mobile-drawer-avatar">
                {user?.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatar} alt="" />
                ) : (
                  (user?.nickname ?? '?').slice(0, 1)
                )}
              </span>
              <div className="mobile-drawer-user-main">
                <div className="mobile-drawer-user-name">
                  <b>{user?.nickname ?? '未登录'}</b>
                  <VerifyMark kind={user?.verifyKind} label={user?.verifyLabel} />
                  <LevelPill level={user?.level} />
                </div>
                <span>
                  {user
                    ? `${points} 积分${user.group ? ` · ${user.group.name}` : ''}`
                    : '登录后参与社区'}
                </span>
              </div>
              {!user && (
                <Link href="/login" className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>
                  登录
                </Link>
              )}
            </div>

            {NAV_GROUPS.map((group) => {
              // 组内顺序跟侧栏一致：按后台保存的 keys 排，不能用注册表顺序
              const visible = keys
                .map((key) => group.items.find((i) => i.key === key))
                .filter((i): i is (typeof group.items)[number] => Boolean(i));
              if (visible.length === 0) return null;
              return (
                <div className="mobile-drawer-section" key={group.id}>
                  <div className="mobile-drawer-label">{group.label}</div>
                  {visible.map((i) =>
                    item(
                      i.href,
                      i.label,
                      i.key,
                      i.key === 'notifications' && unread > 0 ? (
                        <span className="mobile-drawer-count">{unread}</span>
                      ) : null,
                    ),
                  )}
                </div>
              );
            })}

            {user && (
              <div className="mobile-drawer-quick">
                <Link href="/points" onClick={() => setOpen(false)}>
                  签到
                </Link>
                <Link href="/tasks" onClick={() => setOpen(false)}>
                  任务
                </Link>
                <Link href="/rewards" onClick={() => setOpen(false)}>
                  福利
                </Link>
              </div>
            )}

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
