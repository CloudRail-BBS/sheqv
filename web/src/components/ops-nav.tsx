'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * 运营面板的标签导航。
 *
 * 只有四项，做成横向标签而不是后台那种侧栏：
 * 运营同事多数时间在审核页，横向标签在手机上也不会被抽屉挡住。
 */
const ITEMS: { href: string; label: string; queue?: string }[] = [
  { href: '/ops', label: '概览' },
  { href: '/ops/review', label: '帖子审核', queue: 'posts' },
  { href: '/ops/verifications', label: '认证', queue: 'verifications' },
  { href: '/ops/titles', label: '头衔', queue: 'titles' },
];

export function OpsNav({ badges = {} }: { badges?: Record<string, number> }) {
  const pathname = usePathname();

  return (
    <nav className="ops-tabs" aria-label="运营面板导航">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        const count = item.queue ? (badges[item.queue] ?? 0) : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="ops-tab"
            data-on={active}
            aria-current={active ? 'page' : undefined}
          >
            {item.label}
            {count > 0 && <b className="ops-tab-dot">{count > 99 ? '99+' : count}</b>}
          </Link>
        );
      })}
    </nav>
  );
}
