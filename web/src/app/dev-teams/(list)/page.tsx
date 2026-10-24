import Link from 'next/link';
import { getCurrentUser } from '@/lib/current-user';
import { listDevTeams, listMyDevTeams } from '@/lib/dev-team-store';
import { getDeveloperBoard } from '@/lib/resource-store';
import { DevTeamCard } from '@/components/dev-team-card';
import { DevTeamCreate } from '@/components/dev-team-create';
import { EmptyState } from '@/components/empty-state';
import { buildMetadata } from '@/lib/seo';
import { fmtNum } from '@/lib/resource-types';

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
  const [user, teams, board] = await Promise.all([
    getCurrentUser(),
    listDevTeams(q),
    getDeveloperBoard(),
  ]);
  const myTeams = user ? await listMyDevTeams() : [];
  const ownedTeam = myTeams.find((t) => t.ownerId === user?.id);

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">开发团队</h1>
            <p className="small muted" style={{ marginTop: 4, lineHeight: 1.8 }}>
              面向资源作者的团队：成员共同维护作品，团队单独上开发者榜。
              与公会、约战战队是三套独立实体，互不隶属。
            </p>
          </div>
          <form action="/dev-teams" className="search" style={{ width: 220 }}>
            <input name="q" defaultValue={q ?? ''} placeholder="搜索团队" aria-label="搜索开发团队" />
          </form>
        </div>

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
          <div className="rail-title">团队榜</div>
          {board.teams.length === 0 ? (
            <p className="small muted" style={{ lineHeight: 1.75 }}>
              团队有作品后才会进入榜单。
            </p>
          ) : (
            <div className="rail-list">
              {board.teams.slice(0, 5).map((t) => (
                <Link key={t.teamId} href={`/dev-teams/${t.teamId}`} className="rail-item">
                  <span className="idx">{t.rank}</span>
                  <span className="crest a" style={{ width: 24, height: 24, fontSize: 9, borderRadius: 6, background: t.color }}>
                    {t.tag}
                  </span>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.name}
                  </span>
                  <span className="mono small muted" style={{ marginLeft: 'auto' }}>
                    {fmtNum(t.downloads)}
                  </span>
                </Link>
              ))}
            </div>
          )}
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
