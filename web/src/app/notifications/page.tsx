import Link from 'next/link';
import { listNotifications } from '@/lib/forum-store';
import { MATCHES, MATCH_STATUS_LABEL } from '@/lib/data';

export default async function NotificationsPage() {
  const notes = await listNotifications();
  const pending = MATCHES.filter((m) => m.status === 'submitted' || m.status === 'disputed');

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">通知</h1>
            <p className="small muted" style={{ marginTop: 4 }}>评论、待确认与争议都会在这里；Web 无系统推送。</p>
          </div>
          <button className="btn btn-sm btn-ghost">全部已读</button>
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
            <h3 style={{ fontSize: 13 }}>待我确认</h3>
            <span className="badge badge-warn">{pending.length} 场</span>
          </div>
          {pending.map((m) => (
            <Link key={m.id} href={`/matches/${m.id}`} className="rail-item" style={{ padding: '12px 16px' }}>
              <span className={'badge ' + (m.status === 'disputed' ? 'badge-danger' : 'badge-warn')}>
                {MATCH_STATUS_LABEL[m.status]}
              </span>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</span>
              <span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{m.guildA.score} : {m.guildB.score}</span>
            </Link>
          ))}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
            <h3 style={{ fontSize: 13 }}>评论</h3>
            <span className="badge">{notes.length} 条</span>
          </div>
          {notes.length === 0 ? (
            <p className="small muted" style={{ padding: '18px 16px' }}>还没有新评论。去社区发个帖子试试。</p>
          ) : (
            notes.map((n) => (
              <Link key={n.id} href={n.href} className="rail-item" style={{ padding: '12px 16px' }}>
                <span className="badge badge-live">评论</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.text}</span>
              </Link>
            ))
          )}
        </div>
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">推送说明</div>
          <p className="small muted" style={{ lineHeight: 1.75 }}>
            当前形态没有系统推送，通知只在这里与首页红点出现。重要比赛建议安装 App。
          </p>
        </div>
        <div className="card rail-card">
          <div className="rail-title">快捷入口</div>
          <div className="rail-list">
            <Link href="/matches" className="rail-item"><span>我的约战</span><span style={{ marginLeft: 'auto', color: 'var(--blue)' }}>→</span></Link>
            <Link href="/announcements" className="rail-item"><span>公告</span><span style={{ marginLeft: 'auto', color: 'var(--blue)' }}>→</span></Link>
            <Link href="/me" className="rail-item"><span>我的主页</span><span style={{ marginLeft: 'auto', color: 'var(--blue)' }}>→</span></Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
