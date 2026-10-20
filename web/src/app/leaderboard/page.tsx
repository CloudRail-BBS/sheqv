import Link from 'next/link';
import { getRequestCaps } from '@/lib/request-caps';
import { GUILDS, PLAYERS, TEAMS } from '@/lib/data';

const TREND = {
  up: { cls: 'trend-up', mark: '↑' },
  down: { cls: 'trend-down', mark: '↓' },
  flat: { cls: 'trend-flat', mark: '–' },
} as const;

const rankCls = (i: number) => (i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '');

export default async function LeaderboardPage() {
  const caps = await getRequestCaps();

  const guilds = [...GUILDS].sort((a, b) => b.power - a.power);
  const teams = [...TEAMS].sort((a, b) => b.winRate - a.winRate);
  const players = [...PLAYERS].sort((a, b) => b.points - a.points);

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">排行榜</h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              S3 赛季 · 只统计双方确认或仲裁裁定的比赛
            </p>
          </div>
          <span className="badge badge-live">赛季进行中 · 还剩 21 天</span>
        </div>

        <div className="feed-tabs">
          <a href="#guild-board" className="feed-tab" data-on="true">
            公会榜
          </a>
          <a href="#team-board" className="feed-tab">
            战队榜
          </a>
          <a href="#player-board" className="feed-tab">
            选手榜
          </a>
          <span className="sort">每日 04:00 更新</span>
        </div>

        <section id="guild-board">
          <div className="section-h">
            <h2>公会榜</h2>
            <span className="hint">按战力与胜率加权</span>
            <Link href="/guilds" className="more">
              公会主页 →
            </Link>
          </div>
          <div className="podium">
            {guilds.map((g, i) => (
              <div key={g.tag} className={'card pcard' + (i === 0 ? ' top' : '')}>
                <span className="rk">#{i + 1}</span>
                <div className="crest a cr">{g.tag}</div>
                <div className="nm">{g.name}</div>
                <div className="sub">
                  {g.members} 成员 · 胜率 {(g.winRate * 100).toFixed(0)}%
                </div>
                <div className="pt">{g.power.toLocaleString('zh-CN')}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="team-board">
          <div className="section-h" style={{ marginTop: 6 }}>
            <h2>战队榜</h2>
            <span className="hint">按胜率排序，同胜率看场次</span>
            <Link href="/teams" className="more">
              全部战队 →
            </Link>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <th>战队</th>
                  <th>所属公会</th>
                  <th className="num">场次</th>
                  <th className="num">胜率</th>
                  <th className="num">积分</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t, i) => (
                  <tr key={t.id}>
                    <td>
                      <span className={'rk-badge ' + rankCls(i)}>{i + 1}</span>
                    </td>
                    <td>
                      <div className="name-cell">
                        <span className="crest a" style={{ width: 24, height: 24, fontSize: 8.5, borderRadius: 6 }}>
                          {t.tag}
                        </span>
                        <b>{t.name}</b>
                      </div>
                    </td>
                    <td className="muted">{t.guild}</td>
                    <td className="num">{t.wins + t.losses}</td>
                    <td className="num" style={{ color: 'var(--accent)' }}>
                      {(t.winRate * 100).toFixed(0)}%
                    </td>
                    <td className="num">{t.wins * 3 - t.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="player-board">
          <div className="section-h" style={{ marginTop: 6 }}>
            <h2>选手榜</h2>
            <span className="hint">按积分排序</span>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <th>选手</th>
                  <th>战队</th>
                  <th className="num">场次</th>
                  <th className="num">胜率</th>
                  <th className="num">积分</th>
                  <th className="num">趋势</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => (
                  <tr key={p.id}>
                    <td>
                      <span className={'rk-badge ' + rankCls(i)}>{i + 1}</span>
                    </td>
                    <td>
                      <div className="name-cell">
                        <span className="post-avatar" style={{ width: 24, height: 24, fontSize: 10.5, borderRadius: 7 }}>
                          {p.name.slice(0, 1)}
                        </span>
                        <b>{p.name}</b>
                      </div>
                    </td>
                    <td className="muted">{p.team}</td>
                    <td className="num">{p.matches}</td>
                    <td className="num">{(p.rate * 100).toFixed(0)}%</td>
                    <td className="num" style={{ color: 'var(--text)' }}>
                      {p.points}
                    </td>
                    <td className={'num ' + TREND[p.trend].cls}>{TREND[p.trend].mark}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">我的排名</div>
          <div className="row" style={{ gap: 10 }}>
            <span className="post-avatar" style={{ width: 34, height: 34, borderRadius: 10 }}>
              风
            </span>
            <div>
              <div className="small" style={{ fontWeight: 550 }}>
                风蚀
              </div>
              <div className="small muted">星轨一队 · 队长</div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div className="mono" style={{ fontSize: 18, color: 'var(--accent)' }}>#2</div>
              <div className="small muted">72 分</div>
            </div>
          </div>
          <div className="gstat" style={{ gap: 18 }}>
            <div>
              <b>31</b>场次
            </div>
            <div>
              <b>77%</b>胜率
            </div>
            <div>
              <b style={{ color: "var(--accent)" }}>↑1</b>较昨日
            </div>
          </div>
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
              <span>违约扣分，赛季内 3 次违约移出榜单</span>
            </div>
          </div>
        </div>

        <div className="card rail-card">
          <div className="rail-title">当前形态</div>
          <p className="small muted" style={{ lineHeight: 1.7 }}>
            榜单只读。{caps.form === 'mobile' ? '三张表纵向排列' : '三张表与侧栏并排'}；积分每日 04:00 全量重算。
          </p>
          <Link href="/matches" className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 10 }}>
            去看正在进行的比赛
          </Link>
        </div>
      </aside>
    </div>
  );
}
