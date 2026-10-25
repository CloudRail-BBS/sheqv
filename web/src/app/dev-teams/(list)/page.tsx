import Link from 'next/link';
import { getCurrentUser } from '@/lib/current-user';
import { listDevTeams, listMyDevTeams } from '@/lib/dev-team-store';
import { getDeveloperBoard } from '@/lib/resource-store';
import { DevTeamCard } from '@/components/dev-team-card';
import { DevTeamAvatar } from '@/components/dev-team-avatar';
import { DevTeamShare } from '@/components/dev-team-share';
import { DevTeamCreate } from '@/components/dev-team-create';
import { EmptyState } from '@/components/empty-state';
import { buildMetadata } from '@/lib/seo';
import { fmtNum } from '@/lib/resource-types';
import { rankClass } from '@/lib/org-types';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({
    title: '开发团队',
    description: '云轨社区的开发团队：面向资源作者，与公会、约战战队互相独立，按作品下载与点赞排名。',
    path: '/dev-teams',
  });
}

export default async function DevTeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [user, teams, board, settings] = await Promise.all([
    getCurrentUser(),
    listDevTeams(q),
    getDeveloperBoard(),
    getSettings(),
  ]);
  const brand = settings.siteName || '云轨社区';
  const topScore = board.teams[0]?.score || 1;
  const myTeams = user ? await listMyDevTeams() : [];
  const ownedTeam = myTeams.find((t) => t.ownerId === user?.id);

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between page-head" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">开发团队</h1>
            <p className="small muted" style={{ marginTop: 4, lineHeight: 1.8 }}>
              面向资源作者的团队：成员共同维护作品，团队单独上开发者榜。
              与公会、约战战队是三套独立实体，互不隶属。
            </p>
          </div>
          <form action="/dev-teams" className="search page-search" style={{ width: 220 }}>
            <input name="q" defaultValue={q ?? ''} placeholder="搜索团队" aria-label="搜索开发团队" />
          </form>
        </div>

        {board.teams.length > 0 && (
          <section className="card dev-rank-card">
            <div className="dev-rank-head">
              <div>
                <div className="rail-title" style={{ margin: 0 }}>团队榜</div>
                <p className="small muted" style={{ marginTop: 3 }}>
                  下载 + 点赞 × 3 · 资源数 × 4 计入团队分
                </p>
              </div>
              <DevTeamShare rows={board.teams} brand={brand} />
            </div>
            <div className="dev-rank-list">
              {board.teams.slice(0, 5).map((t) => (
                <Link key={t.teamId} href={`/dev-teams/${t.teamId}`} className="dev-rank-row">
                  <span className={'rk-badge ' + rankClass(t.rank - 1)}>{t.rank}</span>
                  <DevTeamAvatar
                    team={{ name: t.name, tag: t.tag, color: t.color, logo: t.logo }}
                    size={34}
                  />
                  <div className="dr-main">
                    <div className="dr-name">{t.name}</div>
                    <div className="dr-sub">
                      {t.tag} · {t.members} 成员 · {t.resources} 资源 · ↓{fmtNum(t.downloads)} · ♥{fmtNum(t.likes)}
                    </div>
                  </div>
                  <div className="dr-score">
                    <b className="mono">{fmtNum(t.score)}</b>
                    <span>团队分</span>
                  </div>
                  <span className="dr-bar" aria-hidden="true">
                    <i style={{ width: `${Math.max(6, Math.round((t.score / topScore) * 100))}%` }} />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="dt-create-wrap">
          <DevTeamCreate
            isDeveloper={Boolean(user?.developer)}
            ownsTeam={ownedTeam ? { id: ownedTeam.id, name: ownedTeam.name } : null}
          />
        </div>

        {teams.length === 0 ? (
          <div className="card" style={{ padding: 8 }}>
            <EmptyState
              title={q ? '没有匹配的团队' : '还没有开发团队'}
              desc={q ? '换个关键词试试。' : '发布第一个资源成为开发者，然后创建你的团队。'}
              actionHref="/resources/new"
              actionLabel="发布资源"
              icon="users"
            />
          </div>
        ) : (
          <div className="dev-team-grid">
            {teams.map((t) => (
              <DevTeamCard key={t.id} team={t} />
            ))}
          </div>
        )}
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">团队分怎么算</div>
          <dl className="kv">
            <dt>资源数</dt>
            <dd className="mono">× 4</dd>
            <dt>下载量</dt>
            <dd className="mono">× 1</dd>
            <dt>点赞量</dt>
            <dd className="mono">× 3</dd>
          </dl>
          <p className="small muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
            与开发者个人榜同一套口径；只有挂在团队名下的资源才计入团队分。
          </p>
          <Link href="/leaderboard#developers" className="btn btn-sm btn-ghost" style={{ marginTop: 10, width: '100%' }}>
            完整开发者榜
          </Link>
        </div>

        <div className="card rail-card">
          <div className="rail-title">三种组织别混</div>
          <dl className="kv">
            <dt>公会</dt>
            <dd>社区组织，按积分上公会榜</dd>
            <dt>战队</dt>
            <dd>打约战，按胜负积分排名</dd>
            <dt>开发团队</dt>
            <dd>做资源，按下载与点赞排名</dd>
          </dl>
          <p className="small muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
            加入其中一个，不影响另外两个的身份。
          </p>
        </div>
      </aside>
    </div>
  );
}
