import Link from 'next/link';
import { getCurrentUser } from '@/lib/current-user';
import { getPoints } from '@/lib/points';
import { CHECKIN_BASE, STREAK_BONUS_MAX, fmtTime, reasonLabel } from '@/lib/point-types';
import { CheckinCard } from '@/components/checkin-card';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({
    title: '积分与签到',
    description: '每日签到、发帖、评论都能获得积分，这里可以查看余额、连签记录与社区积分榜。',
    path: '/points',
  });
}

export default async function PointsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="col-main">
        <h1 className="page-title">我的积分</h1>
        <div className="card card-pad" style={{ marginTop: 14 }}>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            积分与签到需要登录后才能使用。登录后每天签到、发帖、评论都会累计积分。
          </p>
          <Link href="/login" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
            去登录
          </Link>
        </div>
      </div>
    );
  }

  const snap = await getPoints();

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">我的积分</h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              签到与社区行为都会累计积分，明细只增不减地记在下面
            </p>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <span className="badge badge-live">{snap.points} 积分</span>
            {snap.myRank > 0 && <span className="badge">第 {snap.myRank} 名</span>}
          </div>
        </div>

        <CheckinCard initial={snap} />

        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
            <h3 style={{ fontSize: 13 }}>积分明细</h3>
            <span className="small muted">最近 20 条</span>
          </div>

          {snap.log.length === 0 ? (
            <p className="small muted" style={{ padding: '18px 16px', lineHeight: 1.8 }}>
              还没有积分记录。签到一次就能看到第一条。
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>来源</th>
                  <th className="num" style={{ width: 90 }}>
                    积分
                  </th>
                </tr>
              </thead>
              <tbody>
                {snap.log.map((l) => (
                  <tr key={l.id}>
                    <td className="mono small muted">{fmtTime(l.at)}</td>
                    <td>{reasonLabel(l.reason)}</td>
                    <td className="num mono" style={{ color: l.delta >= 0 ? 'var(--blue)' : 'var(--danger)' }}>
                      {l.delta >= 0 ? `+${l.delta}` : l.delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
            <h3 style={{ fontSize: 13 }}>积分榜</h3>
            <span className="small muted">前 10 名</span>
          </div>
          {snap.rank.length === 0 ? (
            <p className="small muted" style={{ padding: '18px 16px' }}>
              还没有人拿到积分，签到一次就是第一名。
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 52 }}>#</th>
                  <th>用户</th>
                  <th className="num">积分</th>
                </tr>
              </thead>
              <tbody>
                {snap.rank.map((r) => (
                  <tr key={r.userId} data-me={r.userId === user.id}>
                    <td>
                      <span className={'rk-badge ' + (r.rank <= 3 ? `top${r.rank}` : '')}>{r.rank}</span>
                    </td>
                    <td>
                      <div className="name-cell">
                        <span className="post-avatar" style={{ width: 24, height: 24, fontSize: 10.5, borderRadius: 7 }}>
                          {r.nickname.slice(0, 1)}
                        </span>
                        <b>{r.nickname}</b>
                        {r.userId === user.id && <span className="badge badge-ghost">我</span>}
                      </div>
                    </td>
                    <td className="num mono">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">怎么拿积分</div>
          <div className="rule-list">
            <div className="rule-row">
              <span className="n">1</span>
              <span>每日签到 +{CHECKIN_BASE} 起，连签每天多 1 分，最高 +{CHECKIN_BASE + STREAK_BONUS_MAX}</span>
            </div>
            <div className="rule-row">
              <span className="n">2</span>
              <span>发一篇帖子 +5，发一条评论 +2</span>
            </div>
            <div className="rule-row">
              <span className="n">3</span>
              <span>积分只增不减，管理员可以在后台手动调整</span>
            </div>
          </div>
        </div>

        <div className="card rail-card">
          <div className="rail-title">连签规则</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            断签后从第 1 天重新算；连签按上海时区的自然日统计，
            凌晨 0 点后签到才算新的一天。
          </p>
          <p className="small muted" style={{ lineHeight: 1.8, marginTop: 8 }}>
            当前连签 <b style={{ color: 'var(--text)' }}>{snap.streak}</b> 天，
            {snap.todayDone ? '今天已签到。' : `今天签到可得 ${snap.nextReward} 分。`}
          </p>
        </div>
      </aside>
    </div>
  );
}
