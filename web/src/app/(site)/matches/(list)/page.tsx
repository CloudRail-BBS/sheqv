import Link from 'next/link';
import { getRequestCaps } from '@/lib/request-caps';
import { getCurrentUser } from '@/lib/current-user';
import { isTrustSigned } from '@/lib/agreement-state';
import { listOrgs } from '@/lib/orgs';
import { listMatches } from '@/lib/match-store';
import { MATCH_GAME_LABEL, MATCH_STATUS_LABEL, fmtMatchTime, type MatchStatus } from '@/lib/match-types';
import { MatchCreate } from '@/components/match-create';
import { EmptyState } from '@/components/empty-state';
import { buildMetadata } from '@/lib/seo';
import { getSettings } from '@/lib/settings';
import { initialOf } from '@/lib/initials';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({
    title: '约战',
    description: '公会与战队之间的约战：发起、接受、名单锁定与赛事记录。',
    path: '/matches',
  });
}

const STATUS_BADGE: Record<MatchStatus, string> = {
  pending_accept: 'badge',
  locked: 'badge badge-warn',
  declined: 'badge badge-danger',
};

const TABS = [
  { key: '', label: '全部' },
  { key: 'pending_accept', label: '待接受' },
  { key: 'locked', label: '已锁定' },
  { key: 'declined', label: '已拒绝' },
];

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = '' } = await searchParams;
  const [caps, user, trustSigned, guilds, teams, matches, settings] = await Promise.all([
    getRequestCaps(),
    getCurrentUser(),
    isTrustSigned(),
    listOrgs('guild'),
    listOrgs('team'),
    listMatches(status || undefined),
    getSettings(),
  ]);

  const allOrgs = [...guilds, ...teams];
  const myOrgs = user ? allOrgs.filter((o) => o.ownerId === user.id) : [];
  const ownerOf = (kind: string, id: string) =>
    allOrgs.find((o) => o.kind === kind && o.id === id)?.ownerId;
  const pendingForMe = user
    ? matches.filter(
        (m) => m.status === 'pending_accept' && ownerOf(m.opponentKind, m.opponentOrgId) === user.id,
      )
    : [];

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">约战</h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              {settings.matchesHint || '发起申请 → 对方接受并锁定名单 → 比赛与结果确认'}
            </p>
          </div>
          <MatchCreate user={user} trustSigned={trustSigned} myOrgs={myOrgs} allOrgs={allOrgs} />
        </div>

        <div className="feed-tabs">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key ? `/matches?status=${t.key}` : '/matches'}
              className="feed-tab"
              data-on={status === t.key}
            >
              {t.label}
            </Link>
          ))}
          <span className="sort">{matches.length} 场</span>
        </div>

        <div className="match-list">
          {matches.length === 0 && (
            <EmptyState
              title="还没有约战"
              desc={
                trustSigned
                  ? '选择自己的公会/战队和对手即可发起约战；对方负责人接受后锁定名单。'
                  : '发起约战需要先签署《诚信公约》。比赛结果由双方确认，争议进入仲裁。'
              }
              actionHref={trustSigned ? '/guilds' : '/agreements'}
              actionLabel={trustSigned ? '先创建公会/战队' : '去签公约'}
              icon="sword"
            />
          )}

          {matches.map((m) => (
            <Link key={m.id} href={`/matches/${m.id}`} className="card match-row">
              <div className="crest a" style={{ width: 34, height: 34, fontSize: 16 }}>
                {initialOf(m.creatorTag)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="title">{m.title}</div>
                <div className="sub">
                  {MATCH_GAME_LABEL[m.game] ?? m.game} · {m.format} · {fmtMatchTime(m.scheduledAt)}
                </div>
                <div className="small muted" style={{ marginTop: 3 }}>
                  {m.creatorName} vs {m.opponentName}
                </div>
              </div>
              <span className={STATUS_BADGE[m.status]} style={{ marginLeft: 6 }}>
                {MATCH_STATUS_LABEL[m.status]}
              </span>
              <div className="sc" style={{ fontSize: 12, color: 'var(--muted)' }}>
                VS
              </div>
            </Link>
          ))}
        </div>

        {!caps.capabilities.realtime.backgroundPush && (
          <div className="notice">
            <span>
              当前形态没有系统推送：待接受的约战只出现在站内提醒里
              {caps.isWeChat ? '，微信内不会主动提醒' : '，建议开启桌面通知或安装 App'}。
            </span>
          </div>
        )}
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">待我处理</div>
          <div className="rail-list">
            {pendingForMe.length === 0 && <p className="small muted">没有待接受的约战。</p>}
            {pendingForMe.map((m) => (
              <Link key={m.id} href={`/matches/${m.id}`} className="rail-item">
                <span className="badge badge-warn" style={{ flex: 'none' }}>
                  待接受
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.creatorName} vs {m.opponentName}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card rail-card">
          <div className="rail-title">确权流程</div>
          <ol className="steps" style={{ margin: 0 }}>
            <li>发起约战，约定赛制与地图</li>
            <li>对方接受后锁定名单快照</li>
            <li>双方独立提交比分与证据</li>
            <li>一致自动确认，不一致转争议</li>
            <li>仲裁裁定后计入战绩</li>
          </ol>
        </div>

        <div className="card rail-card">
          <div className="rail-title">我的组织</div>
          <div className="rail-list">
            {myOrgs.length === 0 && (
              <p className="small muted">
                还没有公会或战队。
                <Link href="/guilds" style={{ color: 'var(--blue)' }}> 去创建</Link>
              </p>
            )}
            {myOrgs.map((o) => (
              <Link key={`${o.kind}:${o.id}`} href={`/${o.kind}s/${o.id}`} className="rail-item">
                <span className="crest a" style={{ width: 22, height: 22, fontSize: 11, borderRadius: 6 }}>
                  {initialOf(o.tag || o.name)}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.name}
                </span>
                <span className="badge" style={{ marginLeft: 'auto' }}>
                  {o.kind === 'guild' ? '公会' : '战队'}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
