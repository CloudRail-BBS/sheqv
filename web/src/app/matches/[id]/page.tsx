import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRequestCaps } from '@/lib/request-caps';
import { GAME_LABEL, MATCHES, MATCH_STATUS_LABEL } from '@/lib/data';
import { MatchActions } from '@/components/match-actions';
import { isTrustSigned } from '@/lib/agreement-state';
import { buildMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = MATCHES.find((m) => m.id === id);
  if (!match) return buildMetadata({ title: '约战', path: `/matches/${id}`, noIndex: true });
  return buildMetadata({ title: '约战详情', path: `/matches/${id}` });
}

export default async function MatchDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = MATCHES.find((m) => m.id === id);
  if (!match) notFound();

  const caps = await getRequestCaps();
  const trustSigned = await isTrustSigned();
  const { evidenceVideoUpload } = caps.capabilities.match;

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
              <span className={'badge ' + (match.game === 'mc' ? 'badge-mc' : 'badge-rw')}>{GAME_LABEL[match.game]}</span>
              <span className="badge">{match.format}</span>
              <span
                className={
                  'badge ' +
                  (match.status === 'disputed' ? 'badge-danger' : match.status === 'confirmed' ? 'badge-live' : 'badge-warn')
                }
              >
                {MATCH_STATUS_LABEL[match.status]}
              </span>
            </div>
            <span className="small muted">{match.deadline}</span>
          </div>

          <div className="scoreboard">
            <div className="side">
              <div className="crest a">{match.guildA.tag}</div>
              <div>
                <div className="side-name">{match.guildA.name}</div>
                <div className="side-sub">{match.guildA.submitted ? '已提交结果' : '未提交'}</div>
              </div>
            </div>

            <div className="score">
              {match.guildA.score ?? '–'}
              <span>:</span>
              {match.guildB.score ?? '–'}
            </div>

            <div className="side right">
              <div>
                <div className="side-name">{match.guildB.name}</div>
                <div className="side-sub">{match.guildB.submitted ? '已提交结果' : '未提交'}</div>
              </div>
              <div className="crest b">{match.guildB.tag}</div>
            </div>
          </div>

          <div
            className="row wrap small muted"
            style={{ gap: 16, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line-soft)' }}
          >
            <span>开赛 {match.scheduledAt}</span>
            <span>地图 {match.maps.join(' / ')}</span>
            {match.rosterLockedAt && <span>名单锁定 {match.rosterLockedAt}</span>}
          </div>
        </div>

        {match.rounds && (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
              <h3 style={{ fontSize: 13 }}>分局结果</h3>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>地图</th>
                  <th>{match.guildA.name}</th>
                  <th>{match.guildB.name}</th>
                </tr>
              </thead>
              <tbody>
                {match.rounds.map((r) => (
                  <tr key={r.map}>
                    <td className="dim">{r.map}</td>
                    <td className="mono" style={{ color: r.scoreA > r.scoreB ? 'var(--accent)' : undefined }}>
                      {r.scoreA}
                    </td>
                    <td className="mono" style={{ color: r.scoreB > r.scoreA ? 'var(--accent)' : undefined }}>
                      {r.scoreB}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card card-pad">
          <h3 style={{ fontSize: 13, marginBottom: 14 }}>比赛时间线</h3>
          <div className="timeline">
            {match.timeline.map((t, i) => (
              <div key={i} className="tl-item" data-state={t.state}>
                <span className="tl-dot" />
                <div className="tl-time">{t.at}</div>
                <div className="tl-title">{t.title}</div>
                <div className="tl-detail">{t.detail}</div>
                <div className="tl-actor">{t.actor}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside className="rail">
        {!trustSigned ? (
          <div className="card card-pad">
            <h3 style={{ fontSize: 13, marginBottom: 8 }}>先签署《诚信公约》</h3>
            <p className="small dim" style={{ lineHeight: 1.7 }}>
              提交比分、确认结果与发起争议都需要先签署诚信公约。公约版本更新后需要重新签署。
            </p>
            <Link href="/agreements" className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 12 }}>
              去签署
            </Link>
          </div>
        ) : match.status === 'submitted' || match.status === 'disputed' || match.status === 'locked' ? (
          <MatchActions
            canVideo={evidenceVideoUpload}
            evidenceVideoBytes={caps.limits.evidenceVideoBytes}
            evidenceImageBytes={caps.limits.evidenceImageBytes}
            initialStatus={match.status === 'locked' ? 'locked' : match.status === 'disputed' ? 'disputed' : 'submitted'}
          />
        ) : (
          <div className="card card-pad">
            <h3 style={{ fontSize: 13, marginBottom: 8 }}>结果已确认</h3>
            <p className="small dim">
              本场结果已锁定并计入 {match.guildA.name} 的公会战绩。7 天内可申请一次更正，由仲裁复核。
            </p>
          </div>
        )}

        <div className="card rail-card">
          <div className="rail-title">名单快照</div>
          <dl className="kv">
            <dt>状态</dt>
            <dd>{match.rosterLockedAt ? '已锁定（只读）' : '未锁定'}</dd>
            <dt>哈希</dt>
            <dd className="mono">7f3a…c21</dd>
            <dt>我的身份</dt>
            <dd>{match.guildA.name} · 队长</dd>
          </dl>
          <p className="small muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
            名单外人员参赛会判定违约，计入信誉记录。
          </p>
        </div>
      </aside>
    </div>
  );
}
