import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';
import { getSettings } from '@/lib/settings';
import { getOrg, leaderboard, rankOf } from '@/lib/orgs';
import {
  gameBadgeClass,
  gameLabel,
  statusLabel,
  fmtDay,
  played,
  winRateText,
  type OrgKind,
} from '@/lib/org-types';
import { OrgOwnerPanel } from '@/components/org-owner-panel';

const COPY = {
  guild: { title: '公会', base: '/guilds', other: '战队', otherBase: '/teams' },
  team: { title: '战队', base: '/teams', other: '公会', otherBase: '/guilds' },
} as const;

/**
 * 公会 / 战队详情。两个页面共用，因为除了文案与链接，结构完全一致；
 * 但数据是各自取的——战队详情里不会出现「所属公会」，因为它不属于公会。
 */
export async function OrgDetail({ kind, id }: { kind: OrgKind; id: string }) {
  const org = await getOrg(kind, id);
  if (!org) notFound();

  const [user, settings, board] = await Promise.all([
    getCurrentUser(),
    getSettings(),
    leaderboard(org.game),
  ]);
  const copy = COPY[kind];
  const items = kind === 'guild' ? board.guilds : board.teams;
  const rank = rankOf(items, org.id);
  const isOwner = Boolean(user && org.ownerId === user.id);
  const isAdmin = Boolean(user?.isAdmin);
  const games = board.guilds.length + board.teams.length;

  return (
    <div className="cols">
      <div className="col-main">
        <div className="crumb">
          <Link href={copy.base}>{copy.title}</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <span>{org.name}</span>
        </div>

        <div className="card card-pad org-hero">
          <div className="org-hero-top">
            <div className="crest a org-crest">{org.tag}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="row wrap" style={{ gap: 8 }}>
                <h1 className="page-title" style={{ fontSize: 22 }}>
                  {org.name}
                </h1>
                <span className={gameBadgeClass(org.game)}>{gameLabel(org.game)}</span>
                <span className={'badge ' + (org.status === 'recruiting' ? 'badge-live' : 'badge-ghost')}>
                  {statusLabel(org.status)}
                </span>
              </div>
              <div className="org-meta">
                <span>负责人 {org.owner || '已注销'}</span>
                <span>·</span>
                <span>成立于 {fmtDay(org.createdAt)}</span>
                <span>·</span>
                <span className="mono">编号 {org.id.toUpperCase()}</span>
              </div>
            </div>
            {rank && (
              <div className="org-rank">
                <b className="mono">#{rank}</b>
                <span>{gameLabel(org.game)} · {copy.title}榜</span>
              </div>
            )}
          </div>

          <p className="org-intro-full">{org.intro || `这个${copy.title}还没有写简介。`}</p>

          <div className="org-stats">
            <div>
              <b className="mono">{org.points}</b>
              <span>积分</span>
            </div>
            <div>
              <b className="mono">
                {org.wins}
                <i className="muted">胜</i>
                {org.losses}
                <i className="muted">负</i>
              </b>
              <span>战绩</span>
            </div>
            <div>
              <b className="mono">{winRateText(org)}</b>
              <span>胜率</span>
            </div>
            <div>
              <b className="mono">{org.members}</b>
              <span>成员</span>
            </div>
            <div>
              <b className="mono">{played(org)}</b>
              <span>已确认场次</span>
            </div>
          </div>
        </div>

        <div className="card card-pad">
          <h3 style={{ fontSize: 13, marginBottom: 8 }}>战绩怎么算</h3>
          <p className="small muted" style={{ lineHeight: 1.85 }}>
            只有双方确认或仲裁裁定的比赛才计入积分与胜率，负责人不能自行修改。
            目前站内比赛系统尚未接入，积分为后台按历史战绩校准的结果；
            接入后每一场都会自动结算。
          </p>
        </div>
      </div>

      <aside className="rail">
        <OrgOwnerPanel
          org={org}
          brand={settings.siteName || '方块竞技场'}
          isOwner={isOwner}
          isAdmin={isAdmin}
        />

        <div className="card rail-card">
          <div className="rail-title">榜单位置</div>
          {rank ? (
            <>
              <div className="row" style={{ alignItems: 'baseline', gap: 6 }}>
                <span className="mono" style={{ fontSize: 26, color: 'var(--accent)' }}>
                  #{rank}
                </span>
                <span className="small muted">/ 共 {items.length} 个</span>
              </div>
              <p className="small muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
                {gameLabel(org.game)} · {copy.title}榜（{games} 条记录参与统计）
              </p>
            </>
          ) : (
            <p className="small muted">还没有进入榜单。</p>
          )}
          <Link
            href={`/leaderboard?game=${org.game}`}
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', marginTop: 10 }}
          >
            看完整榜单
          </Link>
        </div>

        <div className="card rail-card">
          <div className="rail-title">换个视角</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            {kind === 'guild'
              ? '战队独立于公会：想组队打比赛请单独建战队，两边互不隶属。'
              : '战队不属于任何公会：加入公会不影响战队归属，换个公会也不会带走战队。'}
          </p>
          <Link href={copy.otherBase} className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 10 }}>
            去看看{copy.other}
          </Link>
        </div>
      </aside>
    </div>
  );
}
