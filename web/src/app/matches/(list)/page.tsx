import Link from 'next/link';
import { getRequestCaps } from '@/lib/request-caps';
import { MATCHES, MATCH_STATUS_LABEL, GAME_LABEL, type MatchStatus } from '@/lib/data';
import { EmptyState } from '@/components/empty-state';

const STATUS_BADGE: Record<MatchStatus, string> = {
  pending_accept: 'badge',
  locked: 'badge badge-warn',
  live: 'badge badge-live',
  submitted: 'badge badge-warn',
  disputed: 'badge badge-danger',
  confirmed: 'badge badge-live',
};

export default async function MatchesPage() {
  const caps = await getRequestCaps();
  const pending = MATCHES.filter((m) => m.status === 'submitted' || m.status === 'disputed');

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">约战</h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              名单锁定 → 双方独立提交 → 一致即确认，不一致进入争议
            </p>
          </div>
          <button className="btn btn-primary">发起约战</button>
        </div>

        <div className="feed-tabs">
          <button className="feed-tab" data-on="true">全部</button>
          <button className="feed-tab">待确认</button>
          <button className="feed-tab">争议中</button>
          <button className="feed-tab">已确认</button>
          <span className="sort">{MATCHES.length} 场</span>
        </div>

        <div className="match-list">
          {MATCHES.length === 0 && (
          <EmptyState title="还没有约战" desc="发起约战需要先签署《诚信公约》。比赛结果由双方确认，争议进入仲裁。" actionHref="/agreements" actionLabel="去签公约" icon="sword" />
        )}

        {MATCHES.map((m) => (
            <Link key={m.id} href={`/matches/${m.id}`} className="card match-row">
              <div className="crest a" style={{ width: 34, height: 34, fontSize: 11 }}>
                {m.guildA.tag}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="title">{m.title}</div>
                <div className="sub">
                  {GAME_LABEL[m.game]} · {m.format} · {m.scheduledAt}
                </div>
              </div>
              <span className={STATUS_BADGE[m.status]} style={{ marginLeft: 6 }}>
                {MATCH_STATUS_LABEL[m.status]}
              </span>
              <div className="sc">
                {m.guildA.score ?? '–'} <span className="muted">:</span> {m.guildB.score ?? '–'}
              </div>
            </Link>
          ))}
        </div>

        {!caps.capabilities.realtime.backgroundPush && (
          <div className="notice">
            <span>
              当前形态没有系统推送：待确认与新争议只出现在站内红点里
              {caps.isWeChat ? '，微信内不会主动提醒' : '，建议开启桌面通知或安装 App'}。
            </span>
          </div>
        )}
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">待我处理</div>
          <div className="rail-list">
            {pending.map((m) => (
              <Link key={m.id} href={`/matches/${m.id}`} className="rail-item">
                <span className="badge badge-warn" style={{ flex: 'none' }}>
                  {MATCH_STATUS_LABEL[m.status]}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.guildA.name} vs {m.guildB.name}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card rail-card">
          <div className="rail-title">确权流程</div>
          <ol className="steps" style={{ margin: 0 }}>
            <li>发起约战，约定赛制与地图</li>
            <li>接受后锁定名单快照</li>
            <li>双方独立提交比分与证据</li>
            <li>一致自动确认，不一致转争议</li>
            <li>仲裁裁定后计入战绩</li>
          </ol>
        </div>

        <div className="card rail-card">
          <div className="rail-title">我的信誉</div>
          <div className="mini-stats">
            <div className="mini-stat">
              <b>98</b>
              <span>信誉分</span>
            </div>
            <div className="mini-stat">
              <b>0</b>
              <span>违约次数</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
