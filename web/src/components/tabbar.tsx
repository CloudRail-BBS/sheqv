'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { isNavActive, navItem, normalizeTabbar } from '@/lib/nav-config';

const ICONS: Record<string, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V21H3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  guilds: (
    <path d="M12 3 4 7v5c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V7z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  ),
  teams: (
    <path
      d="M16 17v-1.6a3.4 3.4 0 0 0-3.4-3.4H7.4A3.4 3.4 0 0 0 4 15.4V17M10 8.6a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 17v-1.6a3.4 3.4 0 0 0-2.6-3.3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  matches: (
    <path d="M5 4v6a7 7 0 0 0 14 0V4M8 4h8M12 17v3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  ),
  me: (
    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4.5 20.5a7.5 7.5 0 0 1 15 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  ),
  resources: <path d="M4 5h16v14H4zM4 9h16M9 9v10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  'dev-teams': (
    <path d="M16 17v-1.6a3.4 3.4 0 0 0-3.4-3.4H7.4A3.4 3.4 0 0 0 4 15.4V17M10 8.6a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 17v-1.6a3.4 3.4 0 0 0-2.6-3.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  ),
  leaderboard: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />,
  servers: <path d="M4 4h16v6H4zM4 14h16v6H4zM7.5 7h.01M7.5 17h.01" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />,
  points: <path d="m12 3.6 2.5 5.2 5.6.8-4 3.9 1 5.5-5.1-2.7-5.1 2.7 1-5.5-4-3.9 5.6-.8z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  rewards: <path d="M4 9h16v11H4zM3 5h18v4H3zM12 5v15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  groups: <path d="M4 4h7l9 9-7 7-9-9z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  announcements: <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  sponsors: <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  agreements: <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />,
  policies: <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />,
  mc: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  rw: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  modpacks: <path d="m12 3 8 4-8 4-8-4zM4 12l8 4 8-4M4 17l8 4 8-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  tools: <path d="M14 3a5 5 0 0 0-4.6 7L3 16.4V21h4.6l6.4-6.4A5 5 0 1 0 14 3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
};

/** 移动端底部栏：后台配置 key 列表，固定 5 格；未知/不足自动补齐 */
export function TabBar({ items }: { items?: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const keys = normalizeTabbar(items);
  const fits = keys.length <= 5;

  // 当前 tab 的高亮块：量一下图标胶囊的位置，切 tab 时滑动过去
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const navRef = useRef<HTMLElement | null>(null);
  const [glide, setGlide] = useState({ left: 0, top: 0, width: 42, height: 26, ready: false });

  const measure = () => {
    const nav = navRef.current;
    const activeKey = keys.find((k) => {
      const it = navItem(k);
      return it ? isNavActive(pathname, search, it.href) : false;
    });
    const el = activeKey ? itemRefs.current[activeKey] : null;
    const pill = el?.querySelector<HTMLElement>('.tab-pill');
    if (!nav || !pill) {
      setGlide((g) => ({ ...g, ready: false }));
      return;
    }
    // 注意：pill 的 offsetParent 是外层 <a>，offsetLeft/Top 只能算「相对链接」的位置。
    // 高亮块是相对 .tabbar 定位的，必须用两者的矩形差，否则永远贴在左上角。
    const navRect = nav.getBoundingClientRect();
    const pillRect = pill.getBoundingClientRect();
    setGlide({
      left: pillRect.left - navRect.left - nav.clientLeft + nav.scrollLeft,
      top: pillRect.top - navRect.top - nav.clientTop + nav.scrollTop,
      width: pillRect.width,
      height: pillRect.height,
      ready: true,
    });
  };

  useLayoutEffect(measure, [pathname, search, items]);

  // 横竖屏切换 / 窗口缩放后胶囊位置会变，重新量一次
  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    navRef.current?.addEventListener('scroll', measure, { passive: true });
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      navRef.current?.removeEventListener('scroll', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search, items]);

  return (
    <nav className="tabbar" aria-label="主导航" data-fits={fits} ref={navRef}>
      <span
        className="tab-glider"
        aria-hidden="true"
        data-ready={glide.ready}
        style={{ left: glide.left, top: glide.top, width: glide.width, height: glide.height }}
      />
      {keys.map((key) => {
        const item = navItem(key);
        if (!item) return null;
        const active = isNavActive(pathname, search, item.href);
        return (
          <Link
            key={key}
            href={item.href}
            data-active={active}
            ref={(el) => {
              itemRefs.current[key] = el;
            }}
          >
            <span className="tab-pill">
              <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
                {ICONS[key] ?? ICONS.home}
              </svg>
            </span>
            <span className="tab-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
