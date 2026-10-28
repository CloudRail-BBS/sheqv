import Link from 'next/link';
import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { getRequestCaps } from '@/lib/request-caps';
import { listUsers } from '@/lib/users';
import { forumStats, listPosts } from '@/lib/forum-store';
import { getSnapshot, formatAmount } from '@/lib/sponsor-store';
import { listAgreements } from '@/lib/agreement-store';
import { MATCHES, MATCH_STATUS_LABEL } from '@/lib/data';

export const dynamic = 'force-dynamic';

const day = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export default async function AdminPage() {
  const gate = await getAdminGate();
  if (!gate.ok) {
    return (
      <div className="col-main">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  const [caps, users, stats, posts, sponsors, agreements] = await Promise.all([
    getRequestCaps(),
    listUsers(),
    forumStats(),
    listPosts(),
    getSnapshot(true),
    listAgreements(),
  ]);

  const pending = MATCHES.filter((m) => m.status === 'submitted' || m.status === 'disputed');
  const recentUsers = users.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const recentPosts = posts.slice(0, 5);
  const bannedCount = users.filter((u) => u.banned).length;
  const adminCount = users.filter((u) => u.role === 'admin' && !u.banned).length;

  return (
    <div className="col-main">
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">概览</h1>
        </div>
        <span className="badge badge-live">{adminCount} 位管理员</span>
      </div>

      {caps.form === 'mobile' && (
        <div className="hint-box" style={{ marginBottom: 12 }}>
          窄屏下管理后台仍可用，表格会横向滚动；复杂操作建议在桌面端完成。
        </div>
      )}

      <div className="me-stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          { k: '用户', v: String(users.length), sub: bannedCount > 0 ? `${bannedCount} 已封禁` : '全部正常', href: '/admin/users' },
          { k: '帖子', v: String(stats.posts), sub: `${stats.comments} 条评论`, href: '/admin/posts' },
          { k: '赞助', v: `¥${formatAmount(sponsors.totalAmount)}`, sub: `${sponsors.count} 人`, href: '/admin/sponsors' },
          { k: '待处理', v: String(pending.length), sub: '待确认 / 争议', href: '/matches' },
        ].map((s) => (
          <Link key={s.k} href={s.href} className="card adm-stat">
            <b>{s.v}</b>
            <span>{s.k}</span>
            <em>{s.sub}</em>
          </Link>
        ))}
      </div>

      <div className="adm-grid">
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
            <h3 style={{ fontSize: 13 }}>最近注册</h3>
            <Link href="/admin/users" className="small" style={{ color: 'var(--blue)' }}>
              全部
            </Link>
          </div>
          {recentUsers.length === 0 ? (
            <p className="small muted" style={{ padding: '18px 16px' }}>
              还没有用户。
            </p>
          ) : (
            recentUsers.map((u) => (
              <Link key={u.id} href="/admin/users" className="rail-item" style={{ padding: '10px 16px' }}>
                <span className="adm-avatar">{u.nickname.slice(0, 1)}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.nickname}
                </span>
                <span className={'badge ' + (u.role === 'admin' ? 'badge-live' : 'badge-ghost')}>
                  {u.role === 'admin' ? '管理员' : '成员'}
                </span>
                <span className="mono small muted" style={{ marginLeft: 'auto' }}>
                  {day(u.createdAt)}
                </span>
              </Link>
            ))
          )}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
            <h3 style={{ fontSize: 13 }}>最近帖子</h3>
            <Link href="/admin/posts" className="small" style={{ color: 'var(--blue)' }}>
              管理
            </Link>
          </div>
          {recentPosts.length === 0 ? (
            <p className="small muted" style={{ padding: '18px 16px' }}>
              还没有帖子。
            </p>
          ) : (
            recentPosts.map((p) => (
              <a key={p.id} href={p.href} className="rail-item" style={{ padding: '10px 16px' }}>
                <span
                  style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {p.title ?? p.body.slice(0, 24)}
                </span>
                <span className="small muted" style={{ marginLeft: 'auto', flex: 'none' }}>
                  {p.author}
                </span>
              </a>
            ))
          )}
        </div>
      </div>

      <div className="adm-grid">
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
            <h3 style={{ fontSize: 13 }}>待处理比赛</h3>
            <span className="badge badge-warn">{pending.length} 场</span>
          </div>
          {pending.length === 0 ? (
            <p className="small muted" style={{ padding: '18px 16px' }}>
              没有等待处理的比赛。
            </p>
          ) : (
            pending.map((m) => (
              <Link key={m.id} href={`/matches/${m.id}`} className="rail-item" style={{ padding: '10px 16px' }}>
                <span className="badge badge-warn">{MATCH_STATUS_LABEL[m.status]}</span>
                <span
                  style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {m.title}
                </span>
                <span className="mono small muted" style={{ marginLeft: 'auto' }}>
                  {m.guildA.name} vs {m.guildB.name}
                </span>
              </Link>
            ))
          )}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
            <h3 style={{ fontSize: 13 }}>公约</h3>
            <Link href="/admin/agreements" className="small" style={{ color: 'var(--blue)' }}>
              管理
            </Link>
          </div>
          {agreements.map((a) => (
            <div key={a.id} className="rail-item" style={{ padding: '10px 16px' }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.title}
              </span>
              <span className="mono small muted">{a.version}</span>
              <span className={'badge ' + (a.active ? 'badge-live' : 'badge-ghost')} style={{ marginLeft: 'auto' }}>
                {a.active ? '生效中' : '已停用'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
