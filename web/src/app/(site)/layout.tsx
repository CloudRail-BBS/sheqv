import Link from 'next/link';
import { organizationJsonLd } from '@/lib/seo';
import { listAnnouncements } from '@/lib/announcement-store';
import { AnnouncementBar } from '@/components/announcement-bar';
import { AnnouncementModal } from '@/components/announcement-modal';
import { Sidebar } from '@/components/sidebar';
import { TabBar } from '@/components/tabbar';
import { ScrollReset } from '@/components/scroll-reset';
import { ThemeToggle } from '@/components/theme-toggle';
import { getCurrentUser } from '@/lib/current-user';
import { isCommunitySigned } from '@/lib/agreement-state';
import { getSettings } from '@/lib/settings';
import { flatten } from '@/lib/notifications';
import { getChrome } from '@/lib/chrome';
import { NotificationBell } from '@/components/notification-bell';
import { UserBadge } from '@/components/user-badge';
import { VerifyMark } from '@/components/verify-mark';
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

/** 页脚「联系我们」：每行「标签|内容|链接」，链接可省；最多 6 条 */
function parseFooterContacts(raw: string): { label: string; value: string; href: string }[] {
  const out: { label: string; value: string; href: string }[] = [];
  for (const line of (raw || '').split('\n')) {
    const [label, value, href = ''] = line.split('|').map((v) => v.trim());
    if (!label || !value) continue;
    if (href && !/^(https?:\/\/|\/|mailto:|tel:)/i.test(href)) continue;
    out.push({ label, value, href });
    if (out.length >= 6) break;
  }
  return out;
}

/** 页脚图标：16px 描边，和站内其它图标同一套画法 */
const FOOTER_ICONS = {
  grid: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4M12 16.6v.1" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.2" />
      <path d="m4 7.5 7.3 5a1.2 1.2 0 0 0 1.4 0l7.3-5" />
    </>
  ),
  resource: (
    <>
      <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </>
  ),
  server: (
    <>
      <rect x="3.5" y="4.5" width="17" height="6" rx="1.8" />
      <rect x="3.5" y="13.5" width="17" height="6" rx="1.8" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </>
  ),
  wiki: (
    <>
      <path d="M5 4.5h9.5A2.5 2.5 0 0 1 17 7v13H7.5A2.5 2.5 0 0 1 5 17.5z" />
      <path d="M9 8.5h4M9 12h4" />
    </>
  ),
  news: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M7 9h6M7 12.5h6M7 16h4M16.5 9v7" />
    </>
  ),
  shield: <path d="M12 3.5 19 6v6c0 4-3 7-7 8.5C8 19 5 16 5 12V6z" />,
  doc: (
    <>
      <path d="M6 3.5h7l5 5v12H6z" />
      <path d="M13 3.5V9h5M9 13h6M9 16.5h4" />
    </>
  ),
  gift: (
    <>
      <path d="M4 9.5h16v3H4zM5.5 12.5V20h13v-7.5M12 9.5V20" />
      <path d="M12 9.5C9.5 9.5 8 8.4 8 6.9 8 5.6 9 5 10 5c1.6 0 2 2 2 4.5ZM12 9.5c2.5 0 4-1.1 4-2.6C16 5.6 15 5 14 5c-1.6 0-2 2-2 4.5Z" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v9m0 0 3.5-3.5M12 13 8.5 9.5M5 17.5v1A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-1" />
    </>
  ),
  about: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8v.1" />
    </>
  ),
  feed: <path d="M5 6.5h14M5 12h14M5 17.5h9" />,
  github: (
    <path d="M9 20v-2.6c-3 .5-3.7-1.4-3.7-1.4-.5-1.2-1.2-1.6-1.2-1.6-1-.7 0-.7 0-.7 1.1 0 1.7 1.1 1.7 1.1 1 1.7 2.6 1.2 3.3.9.1-.8.4-1.3.7-1.6-2.4-.3-4.4-1.2-4.4-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.6 0 0 1-.3 3.1 1.1a8 8 0 0 1 4.4 0c2.1-1.4 3.1-1.1 3.1-1.1.5 1.3.2 2.3.1 2.6.6.7 1 1.6 1 2.7 0 3.8-2 4.7-4.4 5 .4.3.7 1 .7 2V20" />
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.4" />
      <path d="M5 20v-1.2A4.8 4.8 0 0 1 9.8 14h4.4a4.8 4.8 0 0 1 4.8 4.8V20" />
    </>
  ),
} as const;

function FooterIcon({ name }: { name: keyof typeof FOOTER_ICONS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {FOOTER_ICONS[name]}
    </svg>
  );
}

/** 页脚导航列：社区 / 帮助。顺序固定，改链接请改这里 */
const FOOTER_NAV: { title: string; icon: 'grid' | 'help'; links: { label: string; href: string; icon: keyof typeof FOOTER_ICONS }[] }[] = [
  {
    title: '社区',
    icon: 'grid',
    links: [
      { label: '资源库', href: '/resources', icon: 'resource' },
      { label: '联机大厅', href: '/servers', icon: 'server' },
      { label: '百科', href: '/wiki', icon: 'wiki' },
      { label: '社区报刊', href: '/news', icon: 'news' },
      { label: '排行榜', href: '/leaderboard', icon: 'grid' },
    ],
  },
  {
    title: '帮助',
    icon: 'help',
    links: [
      { label: '社区公约', href: '/agreements', icon: 'shield' },
      { label: '政策', href: '/policies', icon: 'doc' },
      { label: '工单与反馈', href: '/tickets', icon: 'help' },
      { label: '赞助者', href: '/sponsors', icon: 'gift' },
      { label: '关于社区', href: '/about', icon: 'about' },
    ],
  },
];

/** 前台外壳：顶栏 + 侧栏 + 内容 + 页脚 + 移动端底部栏 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // 设置与顶栏数据并行；站内信 + 积分合并成一个接口，登录用户每页少一跳
  const [settings, chrome, communitySigned, announcements] = await Promise.all([
    getSettings(),
    getChrome(user),
    user ? isCommunitySigned() : Promise.resolve(false),
    // 全站公告条：取最新几条，客户端按本地已读决定展示哪一条
    listAnnouncements({ publishedOnly: true, limit: 3 }),
  ]);
  const customLinks = parseFooterLinks(settings.footerLinks);
  const year = new Date().getFullYear();
  // 后台的页脚文案常常写成「站名 · 一句话」，页脚已经把站名单独列出来了，这里只留后半句
  // 版权行也交给后台：{year} / {site} 占位，留空就用默认
  const copyright = ((settings.footerCopyright || '').trim() || '© {year} {site}')
    .split('{year}')
    .join(String(year))
    .split('{site}')
    .join(settings.siteName);

  const contacts = parseFooterContacts(settings.footerContacts);
  const desc =
    (settings.footerDesc || '').trim() ||
    `${settings.siteName} 由玩家自己维护：发帖、发布资源、约战与报名赛事，都在这里。`;

  let tagline = (settings.footerText || '').trim() || '玩家社区与赛事确权';
  if (settings.siteName && tagline.startsWith(settings.siteName)) {
    tagline =
      tagline
        .slice(settings.siteName.length)
        .replace(/^[\s·•|\-]+/, '')
        .trim() || '玩家社区与赛事确权';
  }
  const notes = flatten({ comments: chrome.items, pending: [], unread: chrome.unread });
  const pointsChip = user ? { points: chrome.points, todayDone: chrome.todayDone } : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: await organizationJsonLd() }}
      />
      <div className="site-scroll">
        <header className="topbar">
          <div className="topbar-in">
            <MobileMenu
              items={settings.sidebarItems}
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
                  <VerifyMark kind={user.verifyKind} label={user.verifyLabel} />
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

        <AnnouncementBar
          items={announcements.map((a) => ({ id: a.id, title: a.title, kind: a.kind }))}
        />

        {/* 最新一条公告进站弹一次；同一条只弹一次，关掉后顶栏那条还在 */}
        {announcements[0] && (
          <AnnouncementModal
            item={{
              id: announcements[0].id,
              title: announcements[0].title,
              body: announcements[0].body,
              kind: announcements[0].kind,
            }}
          />
        )}

        <div className="app">
          <Sidebar items={settings.sidebarItems} dmUnread={chrome.dmUnread} />
          <div className="content">{children}</div>
        </div>

        <footer className="footer">
          <div className="footer-grid">
            <div className="footer-col footer-brand-col">
              <Link href="/" className="footer-brand">
                <BrandMark settings={settings} />
                <span className="footer-brand-text">
                  <b>{settings.siteName}</b>
                  <span className="footer-tagline">{tagline}</span>
                </span>
              </Link>

              <p className="footer-desc">{desc}</p>

              <div className="footer-follow">
                <span>关注我们</span>
                <a
                  href="https://github.com/CloudRail-BBS"
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label="GitHub 组织"
                  title="GitHub"
                >
                  <FooterIcon name="github" />
                </a>
                <Link href="/download" aria-label="客户端下载" title="客户端下载">
                  <FooterIcon name="download" />
                </Link>
              </div>
            </div>

            {FOOTER_NAV.map((group) => {
              // 后台配了自定义链接就接管「帮助」这一列，没配就用内置导航
              const links =
                group.title === '帮助' && customLinks.length > 0
                  ? customLinks.map((l) => ({ ...l, icon: 'feed' as const }))
                  : group.links;
              return (
                <div className="footer-col" key={group.title}>
                  <h3 className="footer-head">
                    <FooterIcon name={group.icon} />
                    {group.title}
                  </h3>
                  <ul className="footer-list">
                    {links.map((l) => (
                      <li key={l.label + l.href}>
                        <a
                          href={l.href}
                          {...(l.href.startsWith('http')
                            ? { target: '_blank', rel: 'noreferrer noopener' }
                            : {})}
                        >
                          <FooterIcon name={l.icon} />
                          {l.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            <div className="footer-col">
              <h3 className="footer-head">
                <FooterIcon name="mail" />
                联系我们
              </h3>

              {contacts.length > 0 ? (
                <ul className="footer-contacts">
                  {contacts.map((c) => (
                    <li key={c.label + c.value}>
                      <FooterIcon name="feed" />
                      <span className="footer-contact-label">{c.label}</span>
                      {c.href ? <a href={c.href}>{c.value}</a> : <b>{c.value}</b>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="footer-desc">
                  遇到问题可以在社区发帖，或给管理员发私信。
                </p>
              )}

              <Link
                href={user ? '/me' : '/register'}
                className="btn btn-primary footer-cta"
              >
                <FooterIcon name="user" />
                {user ? '进入我的主页' : '立即注册'}
              </Link>
            </div>
          </div>

          <div className="footer-bottom">
            <span>{copyright}</span>
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
            <Link href="/changelog" className="footer-bottom-link">
              更新日志
            </Link>
          </div>
        </footer>
      </div>

      <ScrollReset />
      <TabBar items={settings.tabbarItems} />
    </>
  );
}
