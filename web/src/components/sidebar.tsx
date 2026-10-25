'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { NAV_GROUPS, SIDEBAR_DEFAULT, isNavActive, parseNav } from '@/lib/nav-config';

const I: Record<string, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V21H3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  shield: <path d="M12 3 4 7v5c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V7z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  users: <path d="M16 17v-1.6a3.4 3.4 0 0 0-3.4-3.4H7.4A3.4 3.4 0 0 0 4 15.4V17M10 8.6a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 17v-1.6a3.4 3.4 0 0 0-2.6-3.3M15.4 3.1a3 3 0 0 1 0 5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  sword: <path d="M5 4v6a7 7 0 0 0 14 0V4M8 4h8M12 17v3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />,
  server: <path d="M4 4h16v6H4zM4 14h16v6H4zM7.5 7h.01M7.5 17h.01" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />,
  box: <path d="M4 5h16v14H4zM4 9h16M9 9v10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />,
  grid: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  layers: <path d="m12 3 8 4-8 4-8-4zM4 12l8 4 8-4M4 17l8 4 8-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  tool: <path d="M14 3a5 5 0 0 0-4.6 7L3 16.4V21h4.6l6.4-6.4A5 5 0 1 0 14 3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  cog: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 8.4l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 4.6V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />,
  user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4.5 20.5a7.5 7.5 0 0 1 15 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />,
  star: <path d="m12 3.6 2.5 5.2 5.6.8-4 3.9 1 5.5-5.1-2.7-5.1 2.7 1-5.5-4-3.9 5.6-.8z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  tag: <><path d="M4 4h7l9 9-7 7-9-9z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><circle cx="8.2" cy="8.2" r="1.4" fill="currentColor" /></>,
  gift: <><path d="M4 9h16v11H4zM3 5h18v4H3zM12 5v15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M12 5c-1.8 0-4-1-4-2.5S10.5 1 12 5c1.5-4 4-4 4-2.5S13.8 5 12 5Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></>,
  bell: <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  heart: <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  code: <path d="m8 6-5 6 5 6M16 6l5 6-5 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  doc: <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />,
};

const ICON_BY_KEY: Record<string, React.ReactNode> = {
  home: I.home,
  guilds: I.shield,
  teams: I.users,
  matches: I.sword,
  servers: I.server,
  resources: I.box,
  'dev-teams': I.users,
  leaderboard: I.chart,
  mc: I.grid,
  rw: I.grid,
  modpacks: I.layers,
  tools: I.tool,
  me: I.user,
  points: I.star,
  groups: I.tag,
  rewards: I.gift,
  announcements: I.bell,
  sponsors: I.heart,
  agreements: I.doc,
  policies: I.doc,
  download: I.code,
};

function Ico({ children }: { children: React.ReactNode }) {
  return (
    <svg className="side-ico" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

/**
 * 侧边栏。
 *
 * `items` 是后台配置的 key 有序列表；为空时用默认（全部）。
 * 分组顺序固定，组内顺序按配置；未知 key 自动忽略。
 */
export function Sidebar({ adminVisible, items }: { adminVisible: boolean; items?: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const keys = parseNav(items, SIDEBAR_DEFAULT);
  const on = (href: string) => isNavActive(pathname, search, href);

  return (
    <aside className="sidebar">
      {NAV_GROUPS.map((group) => {
        const visible = group.items.filter((item) => keys.includes(item.key));
        if (visible.length === 0) return null;
        return (
          <div key={group.id} className="side-group">
            <div className="side-label">{group.label}</div>
            {visible.map((item) => (
              <Link key={item.key} href={item.href} className="side-item" data-active={on(item.href)}>
                <Ico>{ICON_BY_KEY[item.key] ?? I.box}</Ico>
                {item.label}
              </Link>
            ))}
          </div>
        );
      })}

      {adminVisible && (
        <div className="side-group">
          <div className="side-label">管理</div>
          <Link href="/admin" className="side-item" data-active={on('/admin')}>
            <Ico>{I.cog}</Ico>管理后台
          </Link>
        </div>
      )}
    </aside>
  );
}
