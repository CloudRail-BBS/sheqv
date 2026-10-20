import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { getRequestCaps, getTheme } from '@/lib/request-caps';
import { CapProvider } from '@/components/cap-provider';
import { Sidebar } from '@/components/sidebar';
import { TabBar } from '@/components/tabbar';
import { ThemeToggle } from '@/components/theme-toggle';
import { getCurrentUser } from '@/lib/current-user';

export const metadata: Metadata = {
  title: '方块竞技场 · BlockArena',
  description: 'Minecraft / Roblox 玩家社区与赛事确权平台',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#070a0e' },
    { media: '(prefers-color-scheme: light)', color: '#f6f8fa' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [caps, theme, user] = await Promise.all([getRequestCaps(), getTheme(), getCurrentUser()]);

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

                <Link href="/dev/capabilities" className="rt-chip hide-mobile" data-rt={caps.form}>
                  <i className="rt-dot" />
                  {caps.runtime} · {caps.form === 'mobile' ? '移动' : '桌面'}
                  {caps.isWeChat ? ' · 微信' : ''}
                </Link>

                <ThemeToggle />

                <Link href="/resources" className="btn btn-primary btn-sm hide-mobile">
                  发布
                </Link>

                <Link href="/notifications" className="icon-btn" aria-label="通知">
                  <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <i className="dot" />
                </Link>

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
              <span>方块竞技场 · 自托管部署</span>
              <span className="mono">
                {caps.runtime} / {caps.form}
                {caps.isWeChat ? ' / wechat' : ''}
              </span>
              <span className="mono">admin.console={String(caps.capabilities.admin.console)}</span>
              <span style={{ marginLeft: 'auto' }}>
                <Link href="/dev/capabilities">端能力台</Link>
              </span>
            </div>
          </footer>

          <TabBar />
        </CapProvider>
      </body>
    </html>
  );
}
