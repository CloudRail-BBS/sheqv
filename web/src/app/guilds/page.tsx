import Link from 'next/link';
import { getRequestCaps } from '@/lib/request-caps';
import { GUILDS, MATCHES, TEAMS } from '@/lib/data';
import { EmptyState } from '@/components/empty-state';

export default async function GuildsPage() {
  const caps = await getRequestCaps();
  const guildMatches = MATCHES.filter((m) => m.status !== 'confirmed').slice(0, 3);

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">公会</h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              公会是你在这个社区的根：成员、权限、公会战与战队都挂在这里
            </p>
          </div>
          <button className="btn btn-primary">创建公会</button>
        </div>

        <div className="feed-tabs">
          <button className="feed-tab" data-on="true">全部</button>
          <button className="feed-tab">招募中</button>
          <button className="feed-tab">我的公会</button>
          <span className="sort">{GUILDS.length} 个</span>
        </div>

        <div className="gcard-grid">
          {GUILDS.length === 0 && (
          <EmptyState title="还没有公会" desc="公会由玩家自行创建，创建后可以招募成员、约战并参与排行榜。" actionHref="/register" actionLabel="注册后创建" icon="users" />
        )}

        {GUILDS.map((g) => (
            <div key={g.tag} className="card gcard">
              <div className="gcard-top">
                <div className="crest a">{g.tag}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="side-name">{g.name}</div>
                  <div className="side-sub">
                    {g.members} 成员 · 战力 {g.power}
                  </div>
                </div>
                <span className="badge badge-mc" style={{ marginLeft: 'auto' }}>
                  招募中
                </span>
              </div>
              <p className="small dim" style={{ marginTop: 10, lineHeight: 1.7 }}>
                {g.intro}
              </p>
              <div className="gstat">
                <div>
                  <b>{(g.winRate * 100).toFixed(0)}%</b>
                  胜率
                </div>
                <div>
                  <b>{TEAMS.filter((t) => t.guild === g.name).length}</b>
                  战队
                </div>
                <div>
                  <b>{g.members}</b>
                  成员
                </div>
                <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>
                  <Link href="/teams" className="btn btn-sm btn-ghost">
                    查看战队
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
            <h3 style={{ fontSize: 13 }}>公会战日程</h3>
            <Link href="/matches" className="small" style={{ color: 'var(--blue)' }}>
              全部约战 →
            </Link>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>对阵</th>
                <th>赛制</th>
                <th className="num">状态</th>
              </tr>
            </thead>
            <tbody>
              {guildMatches.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link href={`/matches/${m.id}`}>
                      {m.guildA.name} <span className="muted">vs</span> {m.guildB.name}
                    </Link>
                  </td>
                  <td className="muted">{m.format}</td>
                  <td className="num">
                    <span className="badge badge-warn">{m.status === 'disputed' ? '争议中' : '待确认'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">我的公会</div>
          <div className="row" style={{ gap: 11 }}>
            <div className="crest a" style={{ width: 34, height: 34, fontSize: 11, borderRadius: 9 }}>
              SG
            </div>
            <div>
              <div className="small" style={{ fontWeight: 550 }}>星轨</div>
              <div className="small muted">队长 · 权限 7 项</div>
            </div>
          </div>
          <div className="gstat" style={{ gap: 18 }}>
            <div>
              <b>48</b>成员
            </div>
            <div>
              <b>2</b>战队
            </div>
            <div>
              <b>72%</b>胜率
            </div>
          </div>
        </div>

        <div className="card rail-card">
          <div className="rail-title">创建 vs 加入</div>
          <div className="rule-list">
            <div className="rule-row">
              <span className="n">1</span>
              <span>创建需要信誉分 ≥ 80，且 30 天内无违约</span>
            </div>
            <div className="rule-row">
              <span className="n">2</span>
              <span>加入方式由公会设定：开放 / 申请 / 邀请</span>
            </div>
            <div className="rule-row">
              <span className="n">3</span>
              <span>转让与解散需要二次验证，且 7 天冷却</span>
            </div>
          </div>
        </div>

        <div className="card rail-card">
          <div className="rail-title">当前形态</div>
          <p className="small muted" style={{ lineHeight: 1.7 }}>
            实时频道 {caps.capabilities.realtime.wsForeground ? '可用' : '不可用'}，公会操作日志
            {caps.form === 'mobile' ? ' 移动端只读近 30 条' : ' 可筛选全量'}。
          </p>
        </div>
      </aside>
    </div>
  );
}
