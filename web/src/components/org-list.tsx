import Link from 'next/link';
import { getCurrentUser } from '@/lib/current-user';
import { listOrgs } from '@/lib/orgs';
import {
  GAMES,
  gameBadgeClass,
  gameLabel,
  statusLabel,
  winRateText,
  fmtDay,
  played,
  type OrgKind,
} from '@/lib/org-types';
import { OrgCreate } from '@/components/org-create';
import { EmptyState } from '@/components/empty-state';

const COPY = {
  guild: {
    title: '公会',
    lead: '公会是自己独立的社区单元：负责人、招募状态、战绩与榜单都只算公会自己。',
    emptyTitle: '还没有公会',
    emptyDesc: '公会由玩家自行创建，创建后就是负责人——可以导出证书和分享图，也能参与公会榜。',
    board: '公会榜',
  },
  team: {
    title: '战队',
    lead: '战队独立于公会：不隶属于任何公会，有自己的负责人、自己的战绩、单独一张榜。',
    emptyTitle: '还没有战队',
    emptyDesc: '战队是约战的最小单位，和公会没有从属关系。创建后你即为负责人，可导出证书与分享图。',
    board: '战队榜',
  },
} as const;

/**
 * 公会 / 战队列表。两个页面共用这份实现，但**数据与榜单各自独立**——
 * 共用的是排版代码，不是实体关系。
 */
export async function OrgList({ kind, game }: { kind: OrgKind; game?: string }) {
  const copy = COPY[kind];
  const [orgs, user] = await Promise.all([listOrgs(kind, game), getCurrentUser()]);
  const activeGame = GAMES.find((g) => g.key === game);
  const base = kind === 'guild' ? '/guilds' : '/teams';

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">{copy.title}</h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              {copy.lead}
            </p>
          </div>
          <Link href={`/leaderboard${activeGame ? `?game=${activeGame.key}` : ''}`} className="btn btn-sm btn-ghost">
            看{copy.board}
          </Link>
        </div>

        <div className="row wrap" style={{ gap: 6 }}>
          <Link href={base} className="chip" data-on={!activeGame}>
            全部
          </Link>
          {GAMES.map((g) => (
            <Link
              key={g.key}
              href={`${base}?game=${g.key}`}
              className="chip"
              data-on={activeGame?.key === g.key}
            >
              {g.label}
            </Link>
          ))}
          <span className="sort" style={{ marginLeft: 'auto' }}>
            {orgs.length} 个
          </span>
        </div>

        {orgs.length === 0 ? (
          <EmptyState
            title={copy.emptyTitle}
            desc={copy.emptyDesc}
            icon={kind === 'guild' ? 'users' : 'sword'}
          />
        ) : (
          <div className="gcard-grid">
            {orgs.map((o, i) => (
              <Link key={o.id} href={`${base}/${o.id}`} className="card gcard org-card">
                <div className="gcard-top">
                  <div className="crest a">{o.tag}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="side-name">{o.name}</div>
                    <div className="gcard-sub">
                      <span className={gameBadgeClass(o.game)}>{gameLabel(o.game)}</span>
                      <span className={'badge ' + (o.status === 'recruiting' ? 'badge-live' : 'badge-ghost')}>
                        {statusLabel(o.status)}
                      </span>
                    </div>
                  </div>
                  <span className="gcard-rank mono">#{i + 1}</span>
                </div>

                <p className="small dim org-intro">
                  {o.intro || `这个${copy.title}还没有写简介。`}
                </p>

                <div className="gstat">
                  <div>
                    <b className="mono">{o.points}</b>
                    积分
                  </div>
                  <div>
                    <b className="mono">
                      {o.wins}
                      <span className="muted">-</span>
                      {o.losses}
                    </b>
                    战绩
                  </div>
                  <div>
                    <b className="mono">{winRateText(o)}</b>
                    胜率
                  </div>
                  <div>
                    <b className="mono">{o.members}</b>
                    成员
                  </div>
                </div>

                <div className="org-foot">
                  <span className="small muted">负责人 {o.owner || '已注销'}</span>
                  <span className="small muted mono">
                    {played(o) > 0 ? `${played(o)} 场` : '暂无比赛'} · {fmtDay(o.createdAt)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <aside className="rail">
        <OrgCreate kind={kind} loggedIn={Boolean(user)} />

        <div className="card rail-card">
          <div className="rail-title">规则</div>
          <div className="rule-list">
            <div className="rule-row">
              <span className="n">1</span>
              <span>每个账号最多负责一个公会、一个战队，两者互不影响</span>
            </div>
            <div className="rule-row">
              <span className="n">2</span>
              <span>名称与简称在同一游戏内唯一，游戏所属创建后不可改</span>
            </div>
            <div className="rule-row">
              <span className="n">3</span>
              <span>战绩由仲裁确认比赛后计入，负责人不能自己改分</span>
            </div>
          </div>
        </div>

        <div className="card rail-card">
          <div className="rail-title">{kind === 'guild' ? '公会与战队' : '战队与公会'}</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            {kind === 'guild'
              ? '战队独立于公会：一个人可以同时是某公会的成员和某战队的负责人，两边不互相绑定。'
              : '战队不是「公会下属队伍」。加入公会不影响你的战队归属，退会也不会带走战队。'}
          </p>
        </div>
      </aside>
    </div>
  );
}
