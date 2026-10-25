import Link from 'next/link';
import { getCurrentUser } from '@/lib/current-user';
import { getSettings } from '@/lib/settings';
import { leaderboard } from '@/lib/orgs';
import {
  GAMES,
  KIND_LABEL,
  gameBadgeClass,
  gameLabel,
  gameShort,
  played,
  rankClass,
  toShareRow,
  winRateText,
  type Org,
  type OrgKind,
} from '@/lib/org-types';
import { LeaderboardShare } from '@/components/leaderboard-share';
import { EmptyState } from '@/components/empty-state';
import { buildMetadata } from '@/lib/seo';
import { getDeveloperBoard } from '@/lib/resource-store';
import { fmtNum } from '@/lib/resource-types';
import { DevTeamAvatar } from '@/components/dev-team-avatar';
import { DevTeamShare } from '@/components/dev-team-share';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({
    title: '排行榜',
    description: '公会榜与战队榜分开统计，支持按游戏筛选，可一键导出榜单分享图。',
    path: '/leaderboard',
  });
}

const BOARD_HINT: Record<OrgKind, string> = {
  guild: '按积分排序，同分看胜场',
  team: '战队独立于公会，单独排名',
};

function Board({
  kind,
  orgs,
  brand,
  scope,
}: {
  kind: OrgKind;
  orgs: Org[];
  brand: string;
  scope: string;
}) {
  const base = kind === 'guild' ? '/guilds' : '/teams';
  const label = KIND_LABEL[kind];
  const rows = orgs.map((o, i) => toShareRow(o, i + 1, gameShort(o.game)));
  const podium = kind === 'guild' ? orgs.slice(0, 3) : [];
  const tableRows = kind === 'guild' ? orgs.slice(3) : orgs;

  return (
    <section id={kind === 'guild' ? 'guild-board' : 'team-board'}>
      <div className="section-h" style={{ marginTop: kind === 'team' ? 22 : 0 }}>
        <h2>{label}榜</h2>
        <span className="hint">{BOARD_HINT[kind]}</span>
        <div className="row" style={{ marginLeft: 'auto', gap: 6 }}>
          <LeaderboardShare kind={kind} gameLabel={scope} rows={rows} brand={brand} />
          <Link href={base} className="more">
            全部{label} →
          </Link>
        </div>
      </div>

      {orgs.length === 0 ? (
        <EmptyState
          title={`${label}榜还没有数据`}
          desc={`${scope}还没有${label}。去${label}页创建一个，创建后立刻上榜。`}
          actionHref={base}
          actionLabel={`去创建${label}`}
          icon={kind === 'guild' ? 'users' : 'sword'}
        />
      ) : (
        <>
          {podium.length > 0 && (
            <div className="podium">
              {podium.map((o, i) => (
                <Link
                  key={o.id}
                  href={`${base}/${o.id}`}
                  className={'card pcard' + (i === 0 ? ' top' : '')}
                >
                  <span className="rk">#{i + 1}</span>
                  <div className="crest a cr">{o.tag}</div>
                  <div className="nm">{o.name}</div>
                  <div className="sub">
                    {gameLabel(o.game)} · {played(o)} 场 · {winRateText(o)}
                  </div>
                  <div className="pt mono">{o.points}</div>
                </Link>
              ))}
            </div>
          )}

          {tableRows.length > 0 && (
            <div className="card" style={{ overflow: 'hidden', marginTop: podium.length ? 12 : 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>#</th>
                    <th>{label}</th>
                    <th>游戏</th>
                    <th className="num">场次</th>
                    <th className="num">胜率</th>
                    <th className="num">积分</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((o, i) => {
                    const rank = podium.length + i + 1;
                    return (
                      <tr key={o.id}>
                        <td>
                          <span className={'rk-badge ' + rankClass(rank - 1)}>{rank}</span>
                        </td>
                        <td>
                          <Link href={`${base}/${o.id}`} className="name-cell">
                            <span
                              className="crest a"
                              style={{ width: 24, height: 24, fontSize: 8.5, borderRadius: 6 }}
                            >
                              {o.tag}
                            </span>
                            <b>{o.name}</b>
                          </Link>
                        </td>
                        <td>
                          <span className={gameBadgeClass(o.game)}>{gameLabel(o.game)}</span>
                        </td>
                        <td className="num">{played(o)}</td>
                        <td className="num">{winRateText(o)}</td>
                        <td className="num">{o.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game } = await searchParams;
  const activeGame = GAMES.find((g) => g.key === game);
  const [data, user, settings, dev] = await Promise.all([
    leaderboard(activeGame?.key),
    getCurrentUser(),
    getSettings(),
    getDeveloperBoard(),
  ]);

  const brand = `${settings.siteName || '云轨社区'} · 排行榜`;
  const scope = activeGame ? activeGame.label : '全部游戏';

  // 「我的排名」：只认负责人身份，成员关系还没做
  const mine: { kind: OrgKind; item: Org }[] = user
    ? [
        { kind: 'guild' as const, item: data.guilds.find((o) => o.ownerId === user.id) },
        { kind: 'team' as const, item: data.teams.find((o) => o.ownerId === user.id) },
      ].filter((x): x is { kind: OrgKind; item: Org } => Boolean(x.item))
    : [];

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">排行榜</h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              {settings.leaderboardHint || '只统计双方确认或仲裁裁定的比赛 · 公会榜与战队榜分开计算'}
            </p>
          </div>
          <span className="badge">
            {scope} · {data.guilds.length + data.teams.length} 条
          </span>
        </div>

        <div className="row wrap" style={{ gap: 6 }}>
          <Link href="/leaderboard" className="chip" data-on={!activeGame}>
            全部游戏
          </Link>
          {GAMES.map((g) => (
            <Link
              key={g.key}
              href={`/leaderboard?game=${g.key}`}
              className="chip"
              data-on={activeGame?.key === g.key}
            >
              {g.label}
            </Link>
          ))}
          <span className="sort" style={{ marginLeft: 'auto' }}>
            每次筛选都能单独导出分享图
          </span>
        </div>

        <Board kind="guild" orgs={data.guilds} brand={brand} scope={scope} />
        <Board kind="team" orgs={data.teams} brand={brand} scope={scope} />

        <section id="developers" style={{ marginTop: 26 }}>
          <div className="section-h">
            <h2>开发者榜</h2>
            <span className="hint">下载量 + 点赞量 × 3 · 资源数 × 4 计入团队分</span>
            <Link href="/resources" className="more" style={{ marginLeft: 'auto' }}>
              去资源库 →
            </Link>
          </div>

          <div className="dev-board-grid">
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
                <b style={{ fontSize: 13 }}>开发者个人</b>
                <span className="small muted">{dev.developers.length} 人</span>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>开发者</th>
                    <th>资源</th>
                    <th>下载</th>
                    <th>点赞</th>
                    <th>积分</th>
                  </tr>
                </thead>
                <tbody>
                  {dev.developers.map((d) => (
                    <tr key={d.userId}>
                      <td><span className={'rk-badge ' + rankClass(d.rank - 1)}>{d.rank}</span></td>
                      <td>
                        <div className="small" style={{ fontWeight: 550 }}>{d.nickname}</div>
                        {d.teamName && <div className="small muted">{d.teamName}</div>}
                      </td>
                      <td className="mono">{d.resources}</td>
                      <td className="mono">{fmtNum(d.downloads)}</td>
                      <td className="mono">{fmtNum(d.likes)}</td>
                      <td className="mono" style={{ fontWeight: 600 }}>{fmtNum(d.score)}</td>
                    </tr>
                  ))}
                  {dev.developers.length === 0 && (
                    <tr><td colSpan={6} className="small muted">还没有开发者，发布第一个资源就能上榜</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="between" style={{ padding: '10px 16px', borderBottom: '1px solid var(--line-soft)' }}>
                <b style={{ fontSize: 13 }}>开发团队</b>
                <span className="row" style={{ gap: 6 }}>
                  <DevTeamShare rows={dev.teams} brand={brand} label="分享图" />
                  <span className="small muted">{dev.teams.length} 个</span>
                </span>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>团队</th>
                    <th>成员</th>
                    <th>资源</th>
                    <th>下载</th>
                    <th>积分</th>
                  </tr>
                </thead>
                <tbody>
                  {dev.teams.map((t) => (
                    <tr key={t.teamId}>
                      <td><span className={'rk-badge ' + rankClass(t.rank - 1)}>{t.rank}</span></td>
                      <td>
                        <Link href={`/dev-teams/${t.teamId}`} className="dev-team-cell">
                          <DevTeamAvatar
                            team={{ name: t.name, tag: t.tag, color: t.color, logo: t.logo }}
                            size={26}
                          />
                          <span className="dtc-name">{t.name}</span>
                          <span className="dtc-tag">{t.tag}</span>
                        </Link>
                      </td>
                      <td className="mono">{t.members}</td>
                      <td className="mono">{t.resources}</td>
                      <td className="mono">{fmtNum(t.downloads)}</td>
                      <td className="mono dev-score-cell">
                        <b>{fmtNum(t.score)}</b>
                        <span className="dev-score-bar">
                          <i style={{ width: `${Math.max(6, Math.round((t.score / (dev.teams[0]?.score || 1)) * 100))}%` }} />
                        </span>
                      </td>
                    </tr>
                  ))}
                  {dev.teams.length === 0 && (
                    <tr><td colSpan={6} className="small muted">还没有团队作品</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">我的排名</div>
          {mine.length === 0 ? (
            <p className="small muted" style={{ lineHeight: 1.8 }}>
              {user
                ? '你还没有负责的公会或战队。创建后这里会显示各自的榜单位置。'
                : '登录后可以看到自己负责的公会与战队排名。'}
            </p>
          ) : (
            <div className="rail-list">
              {mine.map(({ kind, item }) => {
                const list = kind === 'guild' ? data.guilds : data.teams;
                const rank = list.findIndex((o) => o.id === item.id) + 1;
                return (
                  <Link key={item.id} href={`/${kind}s/${item.id}`} className="rail-item">
                    <span
                      className="crest a"
                      style={{ width: 26, height: 26, fontSize: 8.5, borderRadius: 6, flex: 'none' }}
                    >
                      {item.tag}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="small" style={{ display: 'block' }}>
                        {item.name}
                      </span>
                      <span className="small muted">{KIND_LABEL[kind]}</span>
                    </span>
                    <span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
                      #{rank}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="card rail-card">
          <div className="rail-title">计分规则</div>
          <div className="rule-list">
            <div className="rule-row">
              <span className="n">1</span>
              <span>胜一场 +3 分，负一场 −1 分，确认后才结算</span>
            </div>
            <div className="rule-row">
              <span className="n">2</span>
              <span>未确认或作废的比赛不计入任何榜单</span>
            </div>
            <div className="rule-row">
              <span className="n">3</span>
              <span>公会与战队分开排名，互相不占名额</span>
            </div>
          </div>
        </div>

        <div className="card rail-card">
          <div className="rail-title">开发者榜</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            资源下载 1 分、点赞 3 分；团队另加每个资源 4 分。
            个人榜只算个人署名的资源，团队榜只算挂在团队名下的资源。
          </p>
          <Link href="/resources" className="btn btn-sm btn-ghost" style={{ marginTop: 10, width: '100%' }}>
            去资源库
          </Link>
        </div>

        <div className="card rail-card">
          <div className="rail-title">分享图</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            点榜单右上角「生成分享图」，会按当前游戏筛选导出 1080×1440 的 PNG（含前 8 名）。
          </p>
        </div>
      </aside>
    </div>
  );
}
