import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';
import { getCurrentUser } from '@/lib/current-user';
import { getNotifications, noteKindLabel, noteKindTone, timeAgo } from '@/lib/notifications';
import { MarkAllRead } from '@/components/notification-bell';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({ title: '站内通知', path: '/notifications', noIndex: true });
}

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  const feed = await getNotifications(user);

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">通知</h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              评论、礼品卡到账、审核结果都会在这里；顶栏铃铛可以直接快速查看。
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {feed.unread > 0 && <span className="badge badge-warn">{feed.unread} 条未读</span>}
            <MarkAllRead disabled={feed.unread === 0 || !user} />
          </div>
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
            <h3 style={{ fontSize: 13 }}>待我确认</h3>
            <span className="badge badge-warn">{feed.pending.length} 场</span>
          </div>
          {feed.pending.length === 0 ? (
            <p className="small muted" style={{ padding: '18px 16px' }}>
              没有待确认的比赛。
            </p>
          ) : (
            feed.pending.map((m) => (
              <Link key={m.id} href={m.href} className="rail-item" style={{ padding: '12px 16px' }}>
                <span className="badge badge-warn">{m.badge}</span>
                <span className="n-title" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.title}
                </span>
                <span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
                  {m.text}
                </span>
              </Link>
            ))
          )}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
            <h3 style={{ fontSize: 13 }}>通知</h3>
            <span className="badge">{feed.comments.length} 条</span>
          </div>
          {feed.comments.length === 0 ? (
            <p className="small muted" style={{ padding: '18px 16px' }}>
              还没有通知。有人评论你的帖子、工单有新回复或收到系统消息时会出现。
            </p>
          ) : (
            feed.comments.map((n) => (
              <Link
                key={n.id}
                href={n.href || '/notifications'}
                className="rail-item"
                data-unread={n.unread}
                style={{ padding: '12px 16px' }}
              >
                <span className={'badge ' + (n.unread ? 'badge-live' : noteKindTone(n.kind))}>
                  {n.unread ? '新' : noteKindLabel(n.kind)}
                </span>
                <span className="n-title" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.kind === 'comment' ? n.text : n.title}
                </span>
                <span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)', flex: 'none' }}>
                  {timeAgo(n.at)}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">未读怎么算</div>
          <p className="small muted" style={{ lineHeight: 1.75 }}>
            点「全部标为已读」会清掉所有未读通知。
            待确认比赛属于「待处理」，不随已读消失。
            {!user && ' 登录后未读状态会跟着账号走，换设备也一致。'}
          </p>
        </div>
        <div className="card rail-card">
          <div className="rail-title">快捷入口</div>
          <div className="rail-list">
            <Link href="/matches" className="rail-item">
              <span>我的约战</span>
              <span style={{ marginLeft: 'auto', color: 'var(--blue)' }}>→</span>
            </Link>
            <Link href="/announcements" className="rail-item">
              <span>公告</span>
              <span style={{ marginLeft: 'auto', color: 'var(--blue)' }}>→</span>
            </Link>
            <Link href="/me" className="rail-item">
              <span>我的主页</span>
              <span style={{ marginLeft: 'auto', color: 'var(--blue)' }}>→</span>
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
