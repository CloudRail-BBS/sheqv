import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { TabBar } from '@/components/tabbar';
import { ThemeToggle } from '@/components/theme-toggle';
import { getCurrentUser } from '@/lib/current-user';
import { isCommunitySigned } from '@/lib/agreement-state';
import { getSettings } from '@/lib/settings';
import { flatten } from '@/lib/notifications';
import { getChrome } from '@/lib/chrome';
import { NotificationBell } from '@/components/notification-bell';
import { UserBadge } from '@/components/user-badge';
import { GroupTag } from '@/components/group-tag';
import { BrandMark } from '@/components/brand-mark';
import { MobileMenu } from '@/components/mobile-menu';
import { ComposerTrigger } from '@/components/composer-trigger';
import { badgeOf } from '@/lib/badges';

/** 页脚自定义链接：每行「名称|地址」，只放行站内路径与 http(s) */
function parseFooterLinks(raw: string): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  for (const line of (raw || '').split('\n')) {
    const [label, href] = line.split('|').map((v) => v.trim());
    if (!label || !href) continue;
    if (!/^(https?:\/\/|\/)/i.test(href)) continue;
    out.push({ label, href });
    if (out.length >= 6) break;
  }
  return out;
}

/** 前台外壳：顶栏 + 侧栏 + 内容 + 页脚 + 移动端底部栏 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // 设置与顶栏数据并行；站内信 + 积分合并成一个接口，登录用户每页少一跳
  const [settings, chrome, communitySigned] = await Promise.all([
    getSettings(),
    getChrome(user),
    user ? isCommunitySigned() : Promise.resolve(false),
  ]);
  const customLinks = parseFooterLinks(settings.footerLinks);
  const notes = flatten({ comments: chrome.items, pending: [], unread: chrome.unread });
  const pointsChip = user ? { points: chrome.points, todayDone: chrome.todayDone } : null;

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <MobileMenu
            siteName={settings.siteName}
            user={user}
            points={pointsChip?.points ?? 0}
            unread={chrome.unread}
          />
          <Link href="/" className="brand">
            <BrandMark settings={settings} />
            {settings.siteName}
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
            <Link href="/search" className="icon-btn only-mobile" aria-label="搜索">
              <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </Link>

            <ThemeToggle />

            {/* 未登录时不显示「发帖」：点了也是去登录，只会和「注册」抢注意力 */}
            {user && (
              <ComposerTrigger
                loggedIn
                signed={communitySigned}
                className="btn btn-primary btn-sm hide-mobile"
              />
            )}

            {pointsChip && (
              <Link href="/points" className="points-chip" title="积分与签到">
                <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="m12 3.6 2.5 5.2 5.6.8-4 3.9 1 5.5-5.1-2.7-5.1 2.7 1-5.5-4-3.9 5.6-.8z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="mono">{pointsChip.points}</span>
                {!pointsChip.todayDone && <i className="points-dot" aria-label="今日未签到" />}
              </Link>
            )}

            <NotificationBell initial={notes} unread={chrome.unread} loggedIn={Boolean(user)} />

            <Link href={user ? '/me' : '/login'} className="icon-btn" aria-label={user ? '我的' : '登录'}>
              <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <path d="M4.5 20a7.5 7.5 0 0 1 15 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </Link>

            {user ? (
              <Link href="/me" className="user-chip hide-mobile">
                <span className="user-dot">
                  {user.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar} alt="" />
                  ) : (
                    user.nickname.slice(0, 1)
                  )}
                </span>
                <span className="user-name">{user.nickname}</span>
                <UserBadge badge={badgeOf(user)} size="sm" />
                <GroupTag group={user.group} size="sm" />
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
        <Sidebar items={settings.sidebarItems} />
        <div className="content">{children}</div>
      </div>

      <footer className="footer">
        <div className="footer-in">
          <span>{settings.footerText || `${settings.siteName} · 玩家社区与赛事确权`}</span>
          {settings.footerIcp && (
            <a
              className="mono"
              href="https://beian.miit.gov.cn"
              target="_blank"
              rel="noreferrer noopener"
            >
              {settings.footerIcp}
            </a>
          )}
          <span style={{ marginLeft: 'auto' }} className="row">
            {customLinks.length > 0
              ? customLinks.map((l, i) => (
                  <a
                    key={l.href + l.label}
                    href={l.href}
                    style={{ marginLeft: i === 0 ? 0 : 12 }}
                    {...(l.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
                  >
                    {l.label}
                  </a>
                ))
              : (
                <>
                  <Link href="/sponsors">赞助者</Link>
                  <Link href="/agreements" style={{ marginLeft: 12 }}>
                    公约
                  </Link>
                  <Link href="/policies" style={{ marginLeft: 12 }}>
                    政策
                  </Link>
                  <Link href="/download" style={{ marginLeft: 12 }}>
                    客户端
                  </Link>
                  <Link href="/login" style={{ marginLeft: 12 }}>
                    登录
                  </Link>
                </>
              )}
          </span>
        </div>
      </footer>

      <TabBar items={settings.tabbarItems} />
    </>
  );
}
