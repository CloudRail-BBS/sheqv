'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin', label: '概览' },
  { href: '/admin/users', label: '用户' },
  { href: '/admin/posts', label: '帖子' },
  { href: '/admin/announcements', label: '公告' },
  { href: '/admin/slides', label: '轮播' },
  { href: '/admin/agreements', label: '公约' },
  { href: '/admin/sponsors', label: '赞助' },
  { href: '/admin/settings', label: '设置' },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="admin-nav">
      {TABS.map((t) => {
        const active = t.href === '/admin' ? pathname === '/admin' : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className="admin-tab" data-active={active}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
