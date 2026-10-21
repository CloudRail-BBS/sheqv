'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const I = {
  home: <path d="M3 10.5 12 3l9 7.5V21H3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  box: <path d="M4 5h16v14H4zM4 9h16M9 9v10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  sword: <path d="M5 4v6a7 7 0 0 0 14 0V4M8 4h8M12 17v3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />,
  shield: <path d="M12 3 4 7v5c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V7z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  users: <path d="M16 17v-1.6a3.4 3.4 0 0 0-3.4-3.4H7.4A3.4 3.4 0 0 0 4 15.4V17M10 8.6a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 17v-1.6a3.4 3.4 0 0 0-2.6-3.3M15.4 3.1a3 3 0 0 1 0 5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />,
  grid: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  layers: <path d="m12 3 8 4-8 4-8-4zM4 12l8 4 8-4M4 17l8 4 8-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  tool: <path d="M14 3a5 5 0 0 0-4.6 7L3 16.4V21h4.6l6.4-6.4A5 5 0 1 0 14 3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  cog: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 8.4l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 4.6V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />,
  code: <path d="m8 6-5 6 5 6M16 6l5 6-5 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4.5 20.5a7.5 7.5 0 0 1 15 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />,
  doc: <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />,
  heart: <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  bell: <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
};

function Ico({ children }: { children: React.ReactNode }) {
  return (
    <svg className="side-ico" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

interface Props {
  adminVisible: boolean;
  form: 'desktop' | 'mobile';
}

export function Sidebar({ adminVisible, form }: Props) {
  const pathname = usePathname();
  const on = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href.split('?')[0]));

  return (
    <aside className="sidebar">
      <div className="side-group">
        <div className="side-label">浏览</div>
        <Link href="/" className="side-item" data-active={on('/')}>
          <Ico>{I.home}</Ico>首页
        </Link>
        <Link href="/guilds" className="side-item" data-active={on('/guilds')}>
          <Ico>{I.shield}</Ico>公会
        </Link>
        <Link href="/teams" className="side-item" data-active={on('/teams')}>
          <Ico>{I.users}</Ico>战队
        </Link>
        <Link href="/matches" className="side-item" data-active={on('/matches')}>
          <Ico>{I.sword}</Ico>约战
        </Link>
        <Link href="/resources" className="side-item" data-active={on('/resources')}>
          <Ico>{I.box}</Ico>资源库
        </Link>
        <Link href="/leaderboard" className="side-item" data-active={on('/leaderboard')}>
          <Ico>{I.chart}</Ico>排行榜
        </Link>
      </div>

      <div className="side-group">
        <div className="side-label">分区</div>
        <Link href="/resources" className="side-item">
          <Ico>{I.grid}</Ico>Minecraft
        </Link>
        <Link href="/resources" className="side-item">
          <Ico>{I.grid}</Ico>Roblox
        </Link>
        <Link href="/resources" className="side-item">
          <Ico>{I.layers}</Ico>整合包
        </Link>
        <Link href="/resources" className="side-item">
          <Ico>{I.tool}</Ico>工具
        </Link>
      </div>

      <div className="side-group">
        <div className="side-label">工作台</div>
        <Link href="/me" className="side-item" data-active={on('/me')}>
          <Ico>{I.user}</Ico>我的
        </Link>
        <Link href="/announcements" className="side-item" data-active={on('/announcements')}>
          <Ico>{I.bell}</Ico>公告
        </Link>
        <Link href="/sponsors" className="side-item" data-active={on('/sponsors')}>
          <Ico>{I.heart}</Ico>赞助者
        </Link>
        <Link href="/agreements" className="side-item" data-active={on('/agreements')}>
          <Ico>{I.doc}</Ico>公约
        </Link>
        {adminVisible && (
          <Link href="/admin" className="side-item" data-active={on('/admin')}>
            <Ico>{I.cog}</Ico>管理后台
          </Link>
        )}
      </div>

      <div className="side-cta">
        当前形态 <b>{form === 'mobile' ? '移动' : '桌面'}</b> · 同一套页面
        <br />
        社区规则 · 发帖前请阅读
      </div>
    </aside>
  );
}
