import Link from 'next/link';
import { getRequestCaps } from '@/lib/request-caps';
import { GUILDS, MATCHES, MATCH_STATUS_LABEL, TEAMS } from '@/lib/data';
import { listPosts } from '@/lib/forum-store';
import { isCommunitySigned } from '@/lib/agreement-state';
import { getCurrentUser } from '@/lib/current-user';
import { getSnapshot as getSponsorSnapshot, formatAmount } from '@/lib/sponsor-store';
import { countUsers, getBadgeMap } from '@/lib/users';
import { resolveBadge } from '@/lib/badges';
import { getAchievementMap, findBadges } from '@/lib/achievements';
import { getSettings } from '@/lib/settings';
import { listAnnouncements } from '@/lib/announcement-store';
import { listSlides } from '@/lib/slide-store';
import { forumStats } from '@/lib/forum-store';
import { afdianPageUrl } from '@/lib/afdian';
import { Composer } from '@/components/composer';
import { PostCard } from '@/components/post-card';
import { Carousel } from '@/components/carousel';

const TAGS = ['地图', '整合包', '材质', '约战', '招募', '红石', 'PvP', '公告'];

export default async function HomePage() {
  const caps = await getRequestCaps();
  const { backgroundPush } = caps.capabilities.realtime;
  const posts = await listPosts();
  const user = await getCurrentUser();
  const sponsors = await getSponsorSnapshot();
  const [userTotal, stats, settings, news, slides, badges, achievements] = await Promise.all([
    countUsers(),
    forumStats(),
    getSettings(),
    listAnnouncements({ publishedOnly: true, limit: 3 }),
    listSlides({ activeOnly: true }),
    getBadgeMap(),
    getAchievementMap(),
  ]);
  const pendingCount = MATCHES.filter((m) => m.status === 'submitted' || m.status === 'disputed').length;
  const sponsorUrl = await afdianPageUrl();
  const communitySigned = await isCommunitySigned();
  const live = MATCHES[0] ?? null;

  return (
    <div className="cols">
      <div className="col-main">
        <Carousel slides={slides} />

        <div id="composer">
          <Composer nickname={user?.nickname ?? null} signed={communitySigned} />
        </div>

        <div className="feed-tabs">
          <button className="feed-tab" data-on="true">推荐</button>
          <button className="feed-tab">最新</button>
          <button className="feed-tab">关注</button>
          <button className="feed-tab">我参与的</button>
          <span className="sort">按热度排序</span>
        </div>

        {!backgroundPush && (
          <div className="notice">
            <span>
              {caps.isWeChat
                ? '微信内没有系统推送：待确认的比赛与新争议只会出现在站内红点里，建议在浏览器打开或安装 App。'
                : '当前形态无系统推送，约战与争议提醒以站内红点呈现。'}
            </span>
          </div>
        )}

        {posts.length === 0 && (
          <div className="card empty-state">
            <div className="empty-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26">
                <path
                  d="M4 5h16v11H8l-4 4z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3>还没有帖子</h3>
            <p>
              {user
                ? communitySigned
                  ? '成为第一个发帖的人。'
                  : '签署《社区公约》后即可发布第一条内容。'
                : '注册并登录后即可发布第一条内容。'}
            </p>
            <Link href={user ? (communitySigned ? '#composer' : '/agreements') : '/register'} className="btn btn-primary btn-sm">
              {user ? (communitySigned ? '写下第一条' : '去签署公约') : '注册账号'}
            </Link>
          </div>
        )}

        {posts.slice(0, 3).map((f) => (
          <PostCard
            key={f.id}
            item={f}
            badge={resolveBadge(badges, { id: f.authorId, name: f.author })}
            achievements={findBadges(achievements, { id: f.authorId, name: f.author }, 2)}
          />
        ))}

        {live && (
          <div className="card mcard">
            <div className="mcard-top">
              <span className="badge badge-warn">{MATCH_STATUS_LABEL[live.status]}</span>
              <span className="badge">{live.format}</span>
              <span className="small muted" style={{ marginLeft: 'auto' }}>
                {live.deadline}
              </span>
            </div>
            <div className="mcard-teams">
              <span className="t">
                <span className="crest a" style={{ width: 30, height: 30, fontSize: 11, borderRadius: 8 }}>
                  {live.guildA.tag}
                </span>
                {live.guildA.name}
              </span>
              <span className="sc">
                {live.guildA.score} : {live.guildB.score}
              </span>
              <span className="t">
                {live.guildB.name}
                <span className="crest b" style={{ width: 30, height: 30, fontSize: 11, borderRadius: 8 }}>
                  {live.guildB.tag}
                </span>
              </span>
            </div>
            <div className="between">
              <span className="small muted">
                双方已提交 · 比分一致的自动确认，不一致进入争议
              </span>
              <Link href={`/matches/${live.id}`} className="btn btn-sm btn-ghost">
                进入比赛
              </Link>
            </div>
          </div>
        )}

        {posts.slice(3, 9).map((f) => (
          <PostCard
            key={f.id}
            item={f}
            badge={resolveBadge(badges, { id: f.authorId, name: f.author })}
            achievements={findBadges(achievements, { id: f.authorId, name: f.author }, 2)}
          />
        ))}

        <button className="btn btn-ghost" style={{ width: '100%', height: 38 }}>
          加载更多
        </button>
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">社区概览</div>
          <div className="mini-stats">
            <div className="mini-stat">
              <b>{userTotal}</b>
              <span>注册用户</span>
            </div>
            <div className="mini-stat">
              <b>{stats.posts}</b>
              <span>帖子</span>
            </div>
            <div className="mini-stat">
              <b>{stats.comments}</b>
              <span>评论</span>
            </div>
            <div className="mini-stat">
              <b>{pendingCount}</b>
              <span>待确认</span>
            </div>
          </div>
        </div>

        <div className="card rail-card">
          <div className="between" style={{ marginBottom: 10 }}>
            <div className="rail-title" style={{ margin: 0 }}>活跃公会</div>
            <Link href="/guilds" className="small" style={{ color: 'var(--blue)' }}>
              全部
            </Link>
          </div>
          <div className="rail-list">
            {GUILDS.map((g, i) => (
              <Link key={g.tag} href="/guilds" className="rail-item">
                <span className="idx">{i + 1}</span>
                <span className="crest a" style={{ width: 25, height: 25, fontSize: 10, borderRadius: 7, flex: 'none' }}>
                  {g.tag}
                </span>
                <span style={{ width: 30, flex: 'none' }}>{g.name}</span>
                <span className="bar">
                  <i style={{ width: `${g.winRate * 100}%` }} />
                </span>
                <span className="mono" style={{ color: 'var(--muted)' }}>
                  {(g.winRate * 100).toFixed(0)}%
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card rail-card">
          <div className="between" style={{ marginBottom: 10 }}>
            <div className="rail-title" style={{ margin: 0 }}>活跃战队</div>
            <Link href="/teams" className="small" style={{ color: 'var(--blue)' }}>
              全部
            </Link>
          </div>
          <div className="rail-list">
            {TEAMS.length === 0 && (
              <p className="small muted" style={{ padding: '4px 0' }}>
                还没有战队数据。
              </p>
            )}
            {[...TEAMS]
              .sort((a, b) => b.winRate - a.winRate)
              .slice(0, 3)
              .map((t, i) => (
                <Link key={t.id} href="/teams" className="rail-item">
                  <span className="idx">{i + 1}</span>
                  <span className="crest b" style={{ width: 25, height: 25, fontSize: 9, borderRadius: 7, flex: 'none' }}>
                    {t.tag}
                  </span>
                  <span
                    style={{
                      flex: '0 0 56px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.name}
                  </span>
                  <span className="bar">
                    <i style={{ width: `${t.winRate * 100}%` }} />
                  </span>
                  <span className="mono" style={{ color: 'var(--muted)' }}>
                    {(t.winRate * 100).toFixed(0)}%
                  </span>
                </Link>
              ))}
          </div>
        </div>

        {settings.homeShowAnnouncements && (
          <div className="card rail-card">
            <div className="between" style={{ marginBottom: 10 }}>
              <div className="rail-title" style={{ margin: 0 }}>最新公告</div>
              <Link href="/announcements" className="small" style={{ color: 'var(--blue)' }}>
                全部
              </Link>
            </div>
            {news.length === 0 ? (
              <p className="small muted" style={{ lineHeight: 1.7 }}>
                还没有公告。管理员可以在后台「公告」里发布。
              </p>
            ) : (
              <div className="rail-list">
                {news.map((a) => (
                  <Link key={a.id} href={`/announcements/${a.id}`} className="rail-item">
                    <span
                      style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {a.title}
                    </span>
                    <span className="mono small muted" style={{ marginLeft: 'auto' }}>
                      {new Date(a.createdAt).toISOString().slice(5, 10)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="card rail-card">
          <div className="between" style={{ marginBottom: 10 }}>
            <div className="rail-title" style={{ margin: 0 }}>赞助者</div>
            <Link href="/sponsors" className="small" style={{ color: 'var(--blue)' }}>
              全部
            </Link>
          </div>

          {sponsors.count === 0 ? (
            <>
              <p className="small muted" style={{ lineHeight: 1.7 }}>
                还没有赞助记录。赞助用于服务器与赛事奖品，名单公开可查。
              </p>
              <Link href="/sponsors" className="btn btn-sm" style={{ width: '100%', marginTop: 8 }}>
                了解赞助
              </Link>
            </>
          ) : (
            <>
              <div className="rail-list">
                {sponsors.sponsors.slice(0, 3).map((s, i) => (
                  <Link key={s.id} href="/sponsors" className="rail-item">
                    <span className="idx">{i + 1}</span>
                    <span className="sp-face sm" style={{ flex: 'none' }}>
                      {s.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        s.name.slice(0, 1)
                      )}
                    </span>
                    <span
                      style={{
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {s.name}
                    </span>
                    <span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
                      ¥{formatAmount(s.amount)}
                    </span>
                  </Link>
                ))}
              </div>
              <div className="between" style={{ marginTop: 8 }}>
                <span className="small muted">
                  共 {sponsors.count} 人 · ¥{formatAmount(sponsors.totalAmount)}
                </span>
                {sponsorUrl && (
                  <a
                    href={sponsorUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="btn btn-sm"
                  >
                    去支持
                  </a>
                )}
              </div>
            </>
          )}
        </div>

        <div className="card rail-card">
          <div className="rail-title">热门标签</div>
          <div className="tag-cloud">
            {TAGS.map((t) => (
              <Link key={t} href="/resources" className="tag-pill">
                #{t}
              </Link>
            ))}
          </div>
        </div>

        <div className="card rail-card">
          <div className="rail-title">社区规则</div>
          <div className="rule-list">
            <div className="rule-row">
              <span className="n">1</span>
              <span>只有双方确认或仲裁裁定的比赛才计入战绩</span>
            </div>
            <div className="rule-row">
              <span className="n">2</span>
              <span>名单外人员参赛判定违约，记一次信誉事件</span>
            </div>
            <div className="rule-row">
              <span className="n">3</span>
              <span>资源转载需注明许可协议，侵权 48 小时内处理</span>
            </div>
          </div>
          <Link href="/matches" className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 12 }}>
            查看完整规则
          </Link>
        </div>
      </aside>
    </div>
  );
}
