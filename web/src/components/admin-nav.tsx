'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin', label: '概览' },
  { href: '/admin/users', label: '用户' },
  { href: '/admin/groups', label: '身份组' },
  { href: '/admin/posts', label: '帖子' },
  { href: '/admin/audit', label: '审核' },
  { href: '/admin/orgs', label: '公会/战队' },
  { href: '/admin/resources', label: '资源' },
  { href: '/admin/rewards', label: '福利' },
  { href: '/admin/servers', label: '联机大厅' },
  { href: '/admin/announcements', label: '公告' },
  { href: '/admin/slides', label: '轮播' },
  { href: '/admin/agreements', label: '公约' },
  { href: '/admin/sponsors', label: '赞助' },
  { href: '/admin/changelog', label: '更新日志' },
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
