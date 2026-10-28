import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTournament } from '@/lib/tournament-store';
import { getSettings } from '@/lib/settings';
import { getBaseUrl } from '@/lib/base-url';
import { TournamentShare } from '@/components/tournament-share';
import { TournamentStatusBadge } from '@/components/tournament-status';
import { getCurrentUser } from '@/lib/current-user';
import { TournamentSignup } from '@/components/tournament-signup';
import { Markdown, markdownToText } from '@/lib/markdown';
import { buildMetadata } from '@/lib/seo';
import { gameLabel } from '@/lib/resource-types';
import { TOURNAMENT_STATUS_LABEL, fmtDay } from '@/lib/task-types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getTournament(id);
  if (!detail) return buildMetadata({ title: '赛事', path: `/tournaments/${id}`, noIndex: true });
  return buildMetadata({
    title: detail.item.title,
    description: markdownToText(detail.item.body || detail.item.summary).slice(0, 120),
    path: `/tournaments/${id}`,
  });
}

export default async function TournamentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, user, settings, site] = await Promise.all([
    getTournament(id),
    getCurrentUser(),
    getSettings(),
    getBaseUrl(),
  ]);
  if (!detail) notFound();

  const { item, entries, myEntry } = detail;
  const status = TOURNAMENT_STATUS_LABEL[item.status];
  const brand = settings.siteName || '云轨社区';
  const hostLabel = item.hostName || brand;
  const isHost = Boolean(user && item.hostUserId && item.hostUserId === user.id);
  const canEntryCert = myEntry?.status === 'approved';

  return (
    <div className="cols">
      <div className="col-main">
        <div className="crumb">
          <Link href="/tournaments">赛事</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <span>{item.title}</span>
        </div>

        <article className="card tn-detail">
          <div
            className="tn-hero"
            data-tone={item.game}
            style={item.cover ? { backgroundImage: `url(${item.cover})` } : undefined}
          >
            <TournamentStatusBadge status={item.status} size="lg" />
          </div>

          <div className="tn-detail-body">
            <div className="tn-kicker">
              {gameLabel(item.game)}
              {item.mode ? ` · ${item.mode}` : ''}
              {` · 主办 ${hostLabel}`}
            </div>
            <h1 className="page-title" style={{ margin: '4px 0 8px' }}>{item.title}</h1>
            {item.summary && <p className="tn-lead">{item.summary}</p>}

            {item.body ? (
              <Markdown text={item.body} className="md-body" />
            ) : (
              <p className="small muted">主办方还没有写赛程说明。</p>
            )}
          </div>
        </article>

        <section className="card card-pad">
          <div className="between" style={{ marginBottom: 10 }}>
            <b style={{ fontSize: 13.5 }}>参赛队伍</b>
            <span className="small muted">
              {entries.length} 队{item.maxEntries > 0 ? ` · 上限 ${item.maxEntries}` : ''}
            </span>
          </div>
          {entries.length === 0 ? (
            <p className="small muted">还没有通过审核的队伍，报名后由管理员确认。</p>
          ) : (
            <div className="tn-entries">
              {entries.map((e, i) => (
                <div key={e.id} className="tn-entry-row">
                  <span className="tn-entry-idx mono">{String(i + 1).padStart(2, '0')}</span>
                  <span className="tn-entry-team">{e.teamName}</span>
                  <span className="small muted">{e.nickname}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <TournamentSignup tournament={item} myEntry={myEntry} loggedIn={Boolean(user)} />
        </div>

        {(isHost || canEntryCert) && (
          <div className="card rail-card">
            <div className="rail-title">证书</div>
            <p className="small muted" style={{ lineHeight: 1.75 }}>
              {isHost && canEntryCert
                ? '你既是这场赛事的主办，也带着队伍参赛，两张证书都能领。'
                : isHost
                  ? '主办这场赛事的账号可以领取主办证书。'
                  : '报名已通过审核，可以领取参赛证书。'}
            </p>
            <Link
              href={`/tournaments/${item.id}/certificate`}
              className="btn btn-primary btn-sm"
              style={{ width: '100%', marginTop: 8 }}
            >
              领取证书
            </Link>
          </div>
        )}

        <div className="card rail-card">
          <div className="rail-title">赛程与信息</div>
          <dl className="kv">
            <dt>状态</dt>
            <dd>{status}</dd>
            <dt>报名</dt>
            <dd>
              {fmtDay(item.signupStart)} – {fmtDay(item.signupEnd)}
            </dd>
            <dt>比赛</dt>
            <dd>
              {fmtDay(item.startAt)}
              {item.endAt ? ` – ${fmtDay(item.endAt)}` : ''}
            </dd>
            <dt>名额</dt>
            <dd>{item.maxEntries > 0 ? `${item.maxEntries} 队` : '不限'}</dd>
            <dt>赛制</dt>
            <dd>{item.mode || '待定'}</dd>
            <dt>主办</dt>
            <dd>{hostLabel}</dd>
          </dl>
        </div>

        {item.prize && (
          <div className="card rail-card">
            <div className="rail-title">奖品</div>
            <p className="small" style={{ lineHeight: 1.85, color: 'var(--text-2)' }}>{item.prize}</p>
          </div>
        )}

        <div className="card rail-card">
          <div className="rail-title">分享与宣传</div>
          <TournamentShare tournament={item} brand={brand} site={site} />
        </div>
      </aside>
    </div>
  );
}
