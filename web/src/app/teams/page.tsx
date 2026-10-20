import Link from 'next/link';
import { getRequestCaps } from '@/lib/request-caps';
import { GAME_LABEL, TEAMS } from '@/lib/data';

export default async function TeamsPage() {
  const caps = await getRequestCaps();

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">战队</h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              从公会里组队出战：名单快照、替补、战绩都按战队维度统计
            </p>
          </div>
          <button className="btn btn-primary">创建战队</button>
        </div>

        <div className="feed-tabs">
          <button className="feed-tab" data-on="true">全部</button>
          <button className="feed-tab">我的战队</button>
          <button className="feed-tab">招募中</button>
          <span className="sort">{TEAMS.length} 支</span>
        </div>

        {TEAMS.map((t) => (
          <div key={t.id} className="card team-card">
            <div className="team-head">
              <div className={'crest ' + (t.game === 'mc' ? 'a' : 'b')}>{t.tag}</div>
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 6 }}>
                  <span className="side-name">{t.name}</span>
                  <span className={'badge ' + (t.game === 'mc' ? 'badge-mc' : 'badge-rw')}>{GAME_LABEL[t.game]}</span>
                  <span className={'badge ' + (t.status === '招募中' ? 'badge-live' : 'badge')}>{t.status}</span>
                </div>
                <div className="side-sub">
                  {t.guild}公会 · {t.members} 人 · 名单已快照
                </div>
              </div>
              <div className="row" style={{ marginLeft: 'auto', gap: 6 }}>
                <span className="rec">
                  <b>{t.wins}</b>W <b>{t.losses}</b>L
                </span>
                <Link href="/matches" className="btn btn-sm btn-ghost">
                  约战
                </Link>
              </div>
            </div>

            <div className="row" style={{ gap: 10 }}>
              <span className="small muted" style={{ flex: 'none' }}>
                出战名单
              </span>
              <div className="roster">
                {t.roster.map((p) => (
                  <span key={p} className="rp" title={p}>
                    {p.slice(0, 1)}
                  </span>
                ))}
              </div>
              <span className="winbar">
                <i style={{ width: `${t.winRate * 100}%` }} />
              </span>
              <span className="rec">{(t.winRate * 100).toFixed(0)}%</span>
            </div>

            <p className="small muted" style={{ lineHeight: 1.7 }}>{t.intro}</p>
          </div>
        ))}
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">我的战队</div>
          <div className="rail-list">
            {TEAMS.slice(0, 2).map((t) => (
              <div key={t.id} className="rail-item">
                <span className="crest a" style={{ width: 26, height: 26, fontSize: 8.5, borderRadius: 6, flex: 'none' }}>
                  {t.tag}
                </span>
                <span>{t.name}</span>
                <span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
                  {t.wins}-{t.losses}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card rail-card">
          <div className="rail-title">名单规则</div>
          <div className="rule-list">
            <div className="rule-row">
              <span className="n">1</span>
              <span>比赛前 30 分钟锁定快照，锁定后只读</span>
            </div>
            <div className="rule-row">
              <span className="n">2</span>
              <span>替补可替换首发，但必须在快照名单内</span>
            </div>
            <div className="rule-row">
              <span className="n">3</span>
              <span>名单外人员参赛判定违约，记信誉事件</span>
            </div>
          </div>
        </div>

        <div className="card rail-card">
          <div className="rail-title">当前形态</div>
          <p className="small muted" style={{ lineHeight: 1.7 }}>
            名单编辑：{caps.form === 'mobile' ? '卡片式（桌面为表格）' : '表格批量编辑'}；
            实时频道 {caps.capabilities.realtime.wsForeground ? '前台可用' : '仅轮询'}。
          </p>
        </div>
      </aside>
    </div>
  );
}
