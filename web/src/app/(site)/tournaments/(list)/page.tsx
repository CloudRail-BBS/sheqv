import Link from 'next/link';
import { listTournaments } from '@/lib/tournament-store';
import { EmptyState } from '@/components/empty-state';
import { buildMetadata } from '@/lib/seo';
import {
  TOURNAMENT_STATUS_LABEL,
  fmtDay,
  type Tournament,
} from '@/lib/task-types';
import { gameLabel } from '@/lib/resource-types';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({
    title: '赛事',
    description: '官方赛事与社区比赛：报名、赛程与结果。',
    path: '/tournaments',
  });
}

const STATUS_TONE: Record<Tournament['status'], string> = {
  draft: 'badge-ghost',
  signup: 'badge-live',
  running: 'badge-warn',
  ended: 'badge-ghost',
};

function TournamentCard({ item }: { item: Tournament }) {
  return (
    <Link href={`/tournaments/${item.id}`} className="card tn-card">
      <div
        className="tn-cover"
        data-tone={item.game}
        style={item.cover ? { backgroundImage: `url(${item.cover})` } : undefined}
      >
        <span className={'badge ' + STATUS_TONE[item.status]}>
          {TOURNAMENT_STATUS_LABEL[item.status]}
        </span>
      </div>
      <div className="tn-body">
        <div className="tn-kicker">
          {gameLabel(item.game)}
          {item.mode ? ` · ${item.mode}` : ''}
        </div>
        <h2 className="tn-title">{item.title}</h2>
        {item.summary && <p className="tn-summary">{item.summary}</p>}
        <div className="tn-meta">
          <span className="mono">
            {item.startAt ? fmtDay(item.startAt) : item.signupEnd ? `报名至 ${fmtDay(item.signupEnd)}` : '时间待定'}
          </span>
          <span>
            {item.entryCount} 队{item.maxEntries > 0 ? ` / ${item.maxEntries}` : ''}
          </span>
        </div>
        {item.prize && (
          <div className="tn-prize">
            <span>奖品</span>
            {item.prize}
          </div>
        )}
      </div>
    </Link>
  );
}

export default async function TournamentsPage() {
  const items = await listTournaments();
  const live = items.filter((t) => t.status === 'signup' || t.status === 'running');
  const past = items.filter((t) => t.status === 'ended');

  return (
    <div className="col-main">
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <span className="rw-kicker">TOURNAMENTS</span>
          <h1 className="page-title">赛事</h1>
          <p className="rw-sub">官方组织的比赛：报名、赛程与结果都在这里。个人赛与团队赛共用一套报名。</p>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="badge badge-live">{live.length} 场进行中</span>
          <span className="badge">{items.length} 场赛事</span>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="还没有赛事"
          desc="管理员在后台创建赛事并开放报名后，会出现在这里。"
          icon="trophy"
        />
      ) : (
        <>
          <div className="tn-grid">
            {live.map((t) => (
              <TournamentCard key={t.id} item={t} />
            ))}
          </div>
          {past.length > 0 && (
            <>
              <div className="tn-section-title">已结束</div>
              <div className="tn-grid tn-grid-past">
                {past.map((t) => (
                  <TournamentCard key={t.id} item={t} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
