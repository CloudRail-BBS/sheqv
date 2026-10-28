'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 后台导航：左侧固定侧栏 + 移动端抽屉。
 *
 * 分组与顺序在这里定死（后台不开放自定义导航），
 * 每项只出 id，不再维护第二份路由表。
 */

interface ConsoleItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

export const CONSOLE_GROUPS: { label: string; items: ConsoleItem[] }[] = [
  {
    label: '总览',
    items: [{ href: '/admin', label: '概览', icon: 'home' }],
  },
  {
    label: '内容',
    items: [
      { href: '/admin/posts', label: '帖子', icon: 'doc' },
      { href: '/admin/audit', label: '审核', icon: 'check' },
      { href: '/admin/resources', label: '资源', icon: 'box' },
      { href: '/admin/announcements', label: '公告', icon: 'bell' },
      { href: '/admin/slides', label: '轮播', icon: 'image' },
    ],
  },
  {
    label: '社区',
    items: [
      { href: '/admin/users', label: '用户', icon: 'user' },
      { href: '/admin/groups', label: '身份组', icon: 'tag' },
      { href: '/admin/orgs', label: '公会与战队', icon: 'users' },
      { href: '/admin/servers', label: '联机大厅', icon: 'server' },
      { href: '/admin/rewards', label: '福利与抽奖', icon: 'gift' },
      { href: '/admin/sponsors', label: '赞助', icon: 'heart' },
    ],
  },
  {
    label: '站点',
    items: [
      { href: '/admin/agreements', label: '公约', icon: 'shield' },
      { href: '/admin/policies', label: '政策', icon: 'doc' },
      { href: '/admin/about', label: '关于社区', icon: 'users' },
      { href: '/admin/apps', label: '端管理', icon: 'code' },
      { href: '/admin/push', label: '网页推送', icon: 'send' },
      { href: '/admin/settings', label: '设置', icon: 'cog' },
    ],
  },
];

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V21H3z',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  check: 'M4 12.5 9.5 18 20 6.5',
  box: 'M4 5h16v14H4zM4 9h16M9 9v10',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0',
  image: 'M4 5h16v14H4zM4 15l4.5-4.5L13 15l3-3 4 4M9 9.5h.01',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4.5 20.5a7.5 7.5 0 0 1 15 0',
  tag: 'M4 4h7l9 9-7 7-9-9zM8.2 8.2h.01',
  users:
    'M16 17v-1.6a3.4 3.4 0 0 0-3.4-3.4H7.4A3.4 3.4 0 0 0 4 15.4V17M10 8.6a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 17v-1.6a3.4 3.4 0 0 0-2.6-3.3M15.4 3.1a3 3 0 0 1 0 5.5',
  server: 'M4 4h16v6H4zM4 14h16v6H4zM7.5 7h.01M7.5 17h.01',
  gift: 'M4 9h16v11H4zM3 5h18v4H3zM12 5v15',
  heart: 'M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z',
  shield: 'M12 3 4 7v5c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V7z',
  code: 'm8 6-5 6 5 6M16 6l5 6-5 6',
  send: 'M21 3 10.5 13.5M21 3l-6.5 18-4-8-8-4z',
  cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.6-1.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 4.6V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
} as const;

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function isConsoleActive(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
}

/** 当前页面在后台导航里的标题，给顶栏面包屑用 */
export function consoleTitle(pathname: string): string {
  for (const g of CONSOLE_GROUPS) {
    for (const i of g.items) {
      if (isConsoleActive(pathname, i.href)) return i.label;
    }
  }
  return '管理后台';
}

export function ConsoleNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="console-nav" aria-label="后台导航">
      {CONSOLE_GROUPS.map((group) => (
        <div key={group.label} className="console-nav-group">
          <div className="console-nav-label">{group.label}</div>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="console-nav-item"
              data-active={isConsoleActive(pathname, item.href)}
              onClick={onNavigate}
            >
              <Icon d={ICONS[item.icon]} />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

/** 移动端：顶栏汉堡 + 全高抽屉 */
export function ConsoleDrawer() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

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
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <button
        type="button"
        className="console-burger"
        aria-label="打开后台导航"
        onClick={() => setOpen(true)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {mounted && open && createPortal(
        <div className="console-drawer-mask" onClick={() => setOpen(false)}>
          <aside className="console-drawer" onClick={(e) => e.stopPropagation()}>
            <ConsoleNav onNavigate={() => setOpen(false)} />
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}
