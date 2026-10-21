import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { getRequestCaps, getTheme } from '@/lib/request-caps';
import { CapProvider } from '@/components/cap-provider';
import { Sidebar } from '@/components/sidebar';
import { TabBar } from '@/components/tabbar';
import { ThemeToggle } from '@/components/theme-toggle';
import { getCurrentUser } from '@/lib/current-user';
import { getNotifications, flatten } from '@/lib/notifications';
import { NotificationBell } from '@/components/notification-bell';

export const metadata: Metadata = {
  title: '方块竞技场 · BlockArena',
  description: 'Minecraft / Roblox 玩家社区与赛事确权平台',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0b' },
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [caps, theme, user] = await Promise.all([getRequestCaps(), getTheme(), getCurrentUser()]);
  const feed = await getNotifications(user);
  const notes = flatten(feed);

  return (
    <html
      lang="zh-CN"
      data-theme={theme}
      data-runtime={caps.runtime}
      data-form={caps.form}
      data-wechat={caps.isWeChat ? 'true' : 'false'}
      suppressHydrationWarning
    >
      <body>
        <CapProvider state={caps}>
          <header className="topbar">
            <div className="topbar-in">
              <Link href="/" className="brand">
                <span className="brand-mark">B</span>
                方块竞技场
              </Link>

              <form action="/search" className="search">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <input name="q" placeholder="搜索帖子、资源、公会、比赛" aria-label="搜索" />
                <kbd>⌘K</kbd>
              </form>

              <div className="topbar-right">
                <Link href="/resources" className="icon-btn only-mobile" aria-label="搜索">
                  <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </Link>

                <ThemeToggle />

                <Link href="/#composer" className="btn btn-primary btn-sm hide-mobile">
                  发帖
                </Link>

                <NotificationBell initial={notes} unread={feed.unread} loggedIn={Boolean(user)} />

                <Link href={user ? '/me' : '/login'} className="icon-btn" aria-label={user ? '我的' : '登录'}>
                  <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
                    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                </Link>

                {user ? (
                  <Link href="/me" className="user-chip hide-mobile">
                    <span className="user-dot">{user.nickname.slice(0, 1)}</span>
                    <span className="user-name">{user.nickname}</span>
                    {user.isAdmin && <span className="mini-admin">管理员</span>}
                  </Link>
                ) : (
                  <div className="row hide-mobile" style={{ gap: 6 }}>
                    <Link href="/login" className="btn btn-sm btn-ghost">
                      登录
                    </Link>
                    <Link href="/register" className="btn btn-sm btn-primary">
                      注册
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="app">
            <Sidebar adminVisible={caps.capabilities.admin.console} form={caps.form} />
            <div className="content">{children}</div>
          </div>

          <footer className="footer">
            <div className="footer-in">
              <span>方块竞技场 · 玩家社区与赛事确权</span>
              <span className="mono">自托管部署</span>
              <span style={{ marginLeft: 'auto' }} className="row">
                <Link href="/sponsors">赞助者</Link>
                <Link href="/agreements" style={{ marginLeft: 12 }}>
                  公约
                </Link>
                <Link href="/login" style={{ marginLeft: 12 }}>
                  登录
                </Link>
              </span>
            </div>
          </footer>

          <TabBar />
        </CapProvider>
      </body>
    </html>
  );
}
