'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  {
    href: '/',
    label: '首页',
    icon: <path d="M3 10.5 12 3l9 7.5V21H3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  },
  {
    href: '/guilds',
    label: '公会',
    icon: (
      <path d="M12 3 4 7v5c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V7z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    ),
  },
  {
    href: '/teams',
    label: '战队',
    icon: (
      <path
        d="M16 17v-1.6a3.4 3.4 0 0 0-3.4-3.4H7.4A3.4 3.4 0 0 0 4 15.4V17M10 8.6a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 17v-1.6a3.4 3.4 0 0 0-2.6-3.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: '/matches',
    label: '约战',
    icon: (
      <path d="M5 4v6a7 7 0 0 0 14 0V4M8 4h8M12 17v3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    ),
  },
  {
    href: '/me',
    label: '我的',
    icon: (
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4.5 20.5a7.5 7.5 0 0 1 15 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    ),
  },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="主导航">
      {TABS.map((t) => {
        const active = t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} data-active={active}>
            <span className="tab-pill">
              <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
                {t.icon}
              </svg>
            </span>
            <span className="tab-label">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
