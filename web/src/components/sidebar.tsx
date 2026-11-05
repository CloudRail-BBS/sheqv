'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

  // 当前项的高亮块用一块「游标」画，切换页面时滑过去而不是跳过去
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const boxRef = useRef<HTMLElement | null>(null);
  const [glide, setGlide] = useState({ top: 0, height: 0, ready: false });
  // 侧栏自己滚动时把「第一组标题」藏起来：它会正好卡在上沿，露半截很难看
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onScroll = () => setScrolled(box.scrollTop > 8);
    box.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => box.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    const activeKey = NAV_GROUPS.flatMap((g) => g.items).find((it) => on(it.href))?.key;
    const el = activeKey ? itemRefs.current[activeKey] : null;
    if (!el) {
      setGlide((g) => ({ ...g, ready: false }));
      return;
    }
    setGlide({ top: el.offsetTop, height: el.offsetHeight, ready: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search, items]);

  return (
    <aside
      className="sidebar"
      ref={boxRef}
      data-scrolled={scrolled ? 'true' : 'false'}
    >
      <span
        className="side-glider"
        aria-hidden="true"
        data-ready={glide.ready}
        style={{ top: glide.top, height: glide.height }}
      />
      {NAV_GROUPS.map((group) => {
        // 组内顺序必须按后端存的 keys 走：原来用 group.items.filter()
        // 等于永远按注册表顺序渲染，后台怎么调 ↑↓ 都不会变
        const visible = keys
          .map((key) => group.items.find((item) => item.key === key))
          .filter((item): item is (typeof group.items)[number] => Boolean(item));
        if (visible.length === 0) return null;
        return (
          <div key={group.id} className="side-group">
            <div className="side-label">{group.label}</div>
            {visible.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="side-item"
                data-active={on(item.href)}
                ref={(el) => {
                  itemRefs.current[item.key] = el;
                }}
              >
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
