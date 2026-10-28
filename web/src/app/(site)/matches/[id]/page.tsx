import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';
import { isTrustSigned } from '@/lib/agreement-state';
import { getOrg } from '@/lib/orgs';
import { getMatch } from '@/lib/match-store';
import { MATCH_GAME_LABEL, MATCH_STATUS_LABEL, fmtMatchTime } from '@/lib/match-types';
import { MatchAccept } from '@/components/match-accept';
import { buildMetadata } from '@/lib/seo';
import { initialOf } from '@/lib/initials';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await getMatch(id);
  if (!match) return buildMetadata({ title: '约战', path: `/matches/${id}`, noIndex: true });
  return buildMetadata({ title: match.title, path: `/matches/${id}` });
}

export default async function MatchDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [match, user, trustSigned] = await Promise.all([
    getMatch(id),
    getCurrentUser(),
    isTrustSigned(),
  ]);
  if (!match) notFound();

  const opponent = await getOrg(match.opponentKind, match.opponentOrgId);
  const canAccept =
    Boolean(user) && opponent?.ownerId === user?.id && match.status === 'pending_accept';
  const isCreator = user?.id === match.creatorId;

  return (
    <div className="cols">
      <div className="col-main">
        <div className="crumb">
          <Link href="/matches">约战</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <span className="mono">{match.id}</span>
        </div>

        <div className="card match-head">
          <div className="between">
            <div className="row wrap" style={{ gap: 6 }}>
              <span className={'badge ' + (match.game === 'minecraft' ? 'badge-mc' : 'badge-rw')}>
                {MATCH_GAME_LABEL[match.game] ?? match.game}
              </span>
              <span className="badge">{match.format}</span>
              <span className="badge badge-warn">{MATCH_STATUS_LABEL[match.status]}</span>
            </div>
            <span className="small muted">创建于 {fmtMatchTime(match.createdAt)}</span>
          </div>

          <h1 className="page-title" style={{ fontSize: 22, marginTop: 14 }}>
            {match.title}
          </h1>

          <div className="scoreboard" style={{ marginTop: 14 }}>
            <div className="side">
              <div className="crest a">{initialOf(match.creatorTag)}</div>
              <div>
                <div className="side-name">{match.creatorName}</div>
                <div className="side-sub">{isCreator ? '发起方 · 你' : '发起方'}</div>
              </div>
            </div>

            <div className="score">VS</div>

            <div className="side right">
              <div>
                <div className="side-name">{match.opponentName}</div>
                <div className="side-sub">
                  {opponent?.ownerId === user?.id ? '应战方 · 你' : '应战方'}
                </div>
              </div>
              <div className="crest b">{initialOf(match.opponentTag)}</div>
            </div>
          </div>

          <div
            className="row wrap small muted"
            style={{ gap: 16, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line-soft)' }}
          >
            <span>开赛 {fmtMatchTime(match.scheduledAt)}</span>
            <span>地图 {match.maps.length > 0 ? match.maps.join(' / ') : '待定'}</span>
            {match.acceptedAt && <span>名单锁定 {fmtMatchTime(match.acceptedAt)}</span>}
          </div>
        </div>

        {match.note && (
          <div className="card card-pad">
            <h3 style={{ fontSize: 13, marginBottom: 8 }}>备注</h3>
            <p className="small dim" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
              {match.note}
            </p>
          </div>
        )}

        <div className="card card-pad">
          <h3 style={{ fontSize: 13, marginBottom: 14 }}>比赛时间线</h3>
          <div className="timeline">
            <div className="tl-item" data-state="done">
              <span className="tl-dot" />
              <div className="tl-time">{fmtMatchTime(match.createdAt)}</div>
              <div className="tl-title">约战已发起</div>
              <div className="tl-detail">{match.creatorName} 向 {match.opponentName} 发出约战申请</div>
              <div className="tl-actor">系统</div>
            </div>
            {match.acceptedAt ? (
              <div className="tl-item" data-state="done">
                <span className="tl-dot" />
                <div className="tl-time">{fmtMatchTime(match.acceptedAt)}</div>
                <div className="tl-title">对方已接受</div>
                <div className="tl-detail">名单已锁定，等待双方按约定时间开赛</div>
                <div className="tl-actor">{match.opponentName}</div>
              </div>
            ) : (
              <div className="tl-item" data-state="waiting">
                <span className="tl-dot" />
                <div className="tl-time">等待中</div>
                <div className="tl-title">等待应战方接受</div>
                <div className="tl-detail">对方负责人接受后会锁定名单</div>
                <div className="tl-actor">{match.opponentName}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <aside className="rail">
        {!trustSigned ? (
          <div className="card card-pad">
            <h3 style={{ fontSize: 13, marginBottom: 8 }}>先签署《诚信公约》</h3>
            <p className="small dim" style={{ lineHeight: 1.7 }}>
              发起、接受约战与后续结果确认都需要先签署诚信公约。
            </p>
            <Link href="/agreements" className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 12 }}>
              去签署
            </Link>
          </div>
        ) : canAccept ? (
          <MatchAccept id={match.id} />
        ) : (
          <div className="card card-pad">
            <h3 style={{ fontSize: 13, marginBottom: 8 }}>
              {match.status === 'pending_accept'
                ? isCreator
                  ? '等待对方接受'
                  : '等待应战方负责人处理'
                : '名单已锁定'}
            </h3>
            <p className="small dim" style={{ lineHeight: 1.7 }}>
              {match.status === 'pending_accept'
                ? '对方负责人接受后，名单会锁定并进入比赛阶段。'
                : '双方按约定时间开赛，结果将由双方独立提交。'}
            </p>
          </div>
        )}

        <div className="card rail-card">
          <div className="rail-title">名单快照</div>
          <dl className="kv">
            <dt>状态</dt>
            <dd>{match.acceptedAt ? '已锁定（只读）' : '未锁定'}</dd>
            <dt>发起方</dt>
            <dd>{match.creatorName}</dd>
            <dt>应战方</dt>
            <dd>{match.opponentName}</dd>
          </dl>
          <p className="small muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
            名单外人员参赛会判定违约，计入信誉记录。
          </p>
        </div>
      </aside>
    </div>
  );
}
