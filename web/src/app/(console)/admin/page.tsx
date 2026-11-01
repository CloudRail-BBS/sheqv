import Link from 'next/link';
import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { getRequestCaps } from '@/lib/request-caps';
import { listUsers } from '@/lib/users';
import { forumStats, listPosts } from '@/lib/forum-store';
import { getSnapshot, formatAmount } from '@/lib/sponsor-store';
import { listAgreements } from '@/lib/agreement-store';
import { getAdminOverview, getAdminTodos } from '@/lib/admin-todos';
import { AdminTodos } from '@/components/admin-todos';
import { MATCHES, MATCH_STATUS_LABEL } from '@/lib/data';

export const dynamic = 'force-dynamic';

const day = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/** 队列里最老一条积压了几天 */
const ageDays = (ts: number) => Math.max(0, Math.floor((Date.now() - ts) / 86_400_000));

export default async function AdminPage() {
  const gate = await getAdminGate();
  if (!gate.ok) {
    return (
      <div className="col-main">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  const [caps, users, stats, posts, sponsors, agreements, overview, todos] = await Promise.all([
    getRequestCaps(),
    listUsers(),
    forumStats(),
    listPosts(),
    getSnapshot(true),
    listAgreements(),
    getAdminOverview(),
    getAdminTodos(),
  ]);

  const pendingMatches = MATCHES.filter((m) => m.status === 'submitted' || m.status === 'disputed');
  const recentUsers = users.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const recentPosts = posts.slice(0, 5);
  const bannedCount = users.filter((u) => u.banned).length;
  const adminCount = users.filter((u) => u.role === 'admin' && !u.banned).length;

  // 队列里最挤的一条：页头用一句话点出来，省得管理员自己扫六个数字
  const backlog = overview.queues
    .filter((q) => q.count > 0)
    .sort((a, b) => b.count - a.count)[0];
  const auditQueue = overview.queues.find((q) => q.key === 'posts');

  const today = new Date().toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <div className="col-main">
      <header className="adm-head">
        <div>
          <h1 className="page-title">概览</h1>
          <p className="adm-head-sub">
            <span>{today}</span>
            <span className="adm-dot">·</span>
            <span>
              {overview.pending > 0 ? `${overview.pending} 项在队列里等处理` : '队列都清空了'}
            </span>
            {backlog && (
              <>
                <span className="adm-dot">·</span>
                <span className="adm-head-backlog">
                  积压最多：{backlog.label} {backlog.count} 项
                </span>
              </>
            )}
          </p>
        </div>
        <div className="adm-head-actions">
          <span className="badge badge-live hide-mobile">{adminCount} 位管理员</span>
          <Link href="/admin/announcements" className="btn btn-sm btn-ghost">
            发公告
          </Link>
          <Link href="/admin/audit" className="btn btn-sm btn-primary">
            去审核{auditQueue && auditQueue.count > 0 ? ` ${auditQueue.count}` : ''}
          </Link>
        </div>
      </header>

      {caps.form === 'mobile' && (
        <div className="hint-box">
          窄屏下管理后台仍可用，表格会横向滚动；复杂操作建议在桌面端完成。
        </div>
      )}

      <div className="adm-stats">
        {[
          {
            k: '待处理',
            v: String(overview.pending),
            sub: overview.pending > 0 ? '6 条队列合计' : '已全部清空',
            href: '#queues',
            tone: overview.pending > 0 ? 'warn' : '',
          },
          {
            k: '待办',
            v: String(todos.stats.open),
            sub: todos.stats.overdue > 0 ? `${todos.stats.overdue} 项逾期` : '无逾期',
            href: '#todo',
            tone: todos.stats.overdue > 0 ? 'danger' : '',
          },
          {
            k: '用户',
            v: String(users.length),
            sub: bannedCount > 0 ? `${bannedCount} 已封禁` : '全部正常',
            href: '/admin/users',
            tone: '',
          },
          {
            k: '帖子',
            v: String(stats.posts),
            sub: `${stats.comments} 条评论`,
            href: '/admin/posts',
            tone: '',
          },
          {
            k: '赞助',
            v: `¥${formatAmount(sponsors.totalAmount)}`,
            sub: `${sponsors.count} 人`,
            href: '/admin/sponsors',
            tone: '',
          },
        ].map((s) => (
          <Link key={s.k} href={s.href} className="card adm-stat" data-tone={s.tone || undefined}>
            <b>{s.v}</b>
            <span>{s.k}</span>
            <em>{s.sub}</em>
          </Link>
        ))}
      </div>

      <div className="adm-hero">
        <AdminTodos initial={todos.items} stats={todos.stats} />

        <section className="card adm-panel" id="queues" aria-label="待处理队列">
          <header className="adm-panel-head">
            <div>
              <h3>待处理队列</h3>
              <p>按提交时间排队，处理完自动消失</p>
            </div>
            <span className={'badge ' + (overview.pending > 0 ? 'badge-warn' : 'badge-ghost')}>
              {overview.pending} 项
            </span>
          </header>

          <div className="dq-list">
            {overview.queues.map((q) => {
              const days = q.oldest ? ageDays(q.oldest) : 0;
              return (
                <Link key={q.key} href={q.href} className="dq-row" data-empty={q.count === 0}>
                  <span className="dq-label">{q.label}</span>
                  <span className="dq-age">
                    {q.count === 0 ? '已清空' : days >= 1 ? `最久 ${days} 天` : '今天提交'}
                  </span>
                  <span
                    className="dq-count"
                    data-level={q.count === 0 ? 'zero' : q.count >= 10 ? 'high' : 'normal'}
                  >
                    {q.count}
                  </span>
                </Link>
              );
            })}
          </div>

          <p className="dq-foot">数字是实时的，处理完自动减少</p>
        </section>
      </div>

      <div className="adm-grid">
        <section className="card adm-panel">
          <header className="adm-panel-head">
            <div>
              <h3>最近注册</h3>
            </div>
            <Link href="/admin/users" className="adm-panel-link">
              全部
            </Link>
          </header>
          {recentUsers.length === 0 ? (
            <p className="small muted" style={{ padding: '18px 16px' }}>
              还没有用户。
            </p>
          ) : (
            recentUsers.map((u) => (
              <Link key={u.id} href="/admin/users" className="rail-item adm-row">
                <span className="adm-avatar">{u.nickname.slice(0, 1)}</span>
                <span className="adm-row-main">{u.nickname}</span>
                <span className={'badge ' + (u.role === 'admin' ? 'badge-live' : 'badge-ghost')}>
                  {u.role === 'admin' ? '管理员' : '成员'}
                </span>
                <span className="mono small muted" style={{ marginLeft: 'auto' }}>
                  {day(u.createdAt)}
                </span>
              </Link>
            ))
          )}
        </section>

        <section className="card adm-panel">
          <header className="adm-panel-head">
            <div>
              <h3>最近帖子</h3>
            </div>
            <Link href="/admin/posts" className="adm-panel-link">
              管理
            </Link>
          </header>
          {recentPosts.length === 0 ? (
            <p className="small muted" style={{ padding: '18px 16px' }}>
              还没有帖子。
            </p>
          ) : (
            recentPosts.map((p) => (
              <a key={p.id} href={p.href} className="rail-item adm-row">
                <span className="adm-row-main">{p.title ?? p.body.slice(0, 24)}</span>
                <span className="small muted" style={{ flex: 'none' }}>
                  {p.author}
                </span>
              </a>
            ))
          )}
        </section>
      </div>

      <div className="adm-grid">
        <section className="card adm-panel">
          <header className="adm-panel-head">
            <div>
              <h3>待处理比赛</h3>
            </div>
            <span className={'badge ' + (pendingMatches.length > 0 ? 'badge-warn' : 'badge-ghost')}>
              {pendingMatches.length} 场
            </span>
          </header>
          {pendingMatches.length === 0 ? (
            <p className="small muted" style={{ padding: '18px 16px' }}>
              没有等待处理的比赛。
            </p>
          ) : (
            pendingMatches.map((m) => (
              <Link key={m.id} href={`/matches/${m.id}`} className="rail-item adm-row">
                <span className="badge badge-warn">{MATCH_STATUS_LABEL[m.status]}</span>
                <span className="adm-row-main">{m.title}</span>
                <span className="mono small muted" style={{ marginLeft: 'auto' }}>
                  {m.guildA.name} vs {m.guildB.name}
                </span>
              </Link>
            ))
          )}
        </section>

        <section className="card adm-panel">
          <header className="adm-panel-head">
            <div>
              <h3>公约</h3>
            </div>
            <Link href="/admin/agreements" className="adm-panel-link">
              管理
            </Link>
          </header>
          {agreements.length === 0 ? (
            <p className="small muted" style={{ padding: '18px 16px' }}>
              还没有配置公约。
            </p>
          ) : (
            agreements.map((a) => (
              <div key={a.id} className="rail-item adm-row">
                <span className="adm-row-main">{a.title}</span>
                <span className="mono small muted">{a.version}</span>
                <span
                  className={'badge ' + (a.active ? 'badge-live' : 'badge-ghost')}
                  style={{ marginLeft: 'auto' }}
                >
                  {a.active ? '生效中' : '已停用'}
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
