import Link from 'next/link';
import { devTeamGameLabel, type DevTeam } from '@/lib/dev-team-types';
import { DevTeamAvatar } from './dev-team-avatar';
import { fmtNum } from '@/lib/resource-types';

/** 开发团队卡片：和公会/战队卡片刻意不同，强调「作品」而不是「战绩」 */
export function DevTeamCard({ team }: { team: DevTeam }) {
  return (
    <Link href={`/dev-teams/${team.id}`} className="card dev-team-card">
      <span className="dt-accent" style={{ background: team.color || 'var(--blue)' }} />
      <div className="dt-head">
        <DevTeamAvatar team={team} size={42} />
        <div style={{ minWidth: 0 }}>
          <div className="dt-name">{team.name}</div>
          <div className="small muted">
            {devTeamGameLabel(team.game)} · 负责人 {team.owner}
          </div>
        </div>
      </div>

      <p className="dt-desc">{team.description || '这个团队还没有写简介。'}</p>

      <div className="dt-stats">
        <span><b className="mono">{team.memberCount}</b> 成员</span>
        <span><b className="mono">{team.resourceCount}</b> 资源</span>
        <span><b className="mono">{fmtNum(team.downloads)}</b> 下载</span>
        <span><b className="mono">{fmtNum(team.likes)}</b> 点赞</span>
      </div>
    </Link>
  );
}
