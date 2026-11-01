'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { NAV_GROUPS, SIDEBAR_DEFAULT, isNavActive, parseNav } from '@/lib/nav-config';
import { NavGlyph } from './nav-icons';

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
export function Sidebar({ items, dmUnread = 0 }: { items?: string; dmUnread?: number }) {
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
                <Ico>
                  <NavGlyph k={item.key} />
                </Ico>
                {item.label}
                {item.key === 'messages' && dmUnread > 0 && (
                  <span className="cnt dm-cnt">{dmUnread > 99 ? '99+' : dmUnread}</span>
                )}
              </Link>
            ))}
          </div>
        );
      })}
    </aside>
  );
}
