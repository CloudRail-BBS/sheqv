import Link from 'next/link';
import { getOpsGate } from '@/lib/ops-auth';
import { getOpsSummary, pendingTotal } from '@/lib/ops-store';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({ title: '运营概览', noIndex: true });
}

const n = (v: number) => v.toLocaleString('zh-CN');

/** 队列 → 运营面板里的对应页面；面板没有的（联机大厅 / 工单 / 赛事）引导去后台 */
const OPS_QUEUE_HREF: Record<string, string> = {
  posts: '/ops/review',
  verifications: '/ops/verifications',
  titles: '/ops/titles',
};

export default async function OpsHomePage() {
  const [gate, summary] = await Promise.all([getOpsGate(), getOpsSummary()]);
  const c = summary.counts;
  const pending = pendingTotal(summary);

  const cards = [
    { label: '注册用户', value: c.users, delta: c.usersNew },
    { label: '帖子', value: c.posts, delta: c.postsNew },
    { label: '评论', value: c.comments, delta: c.commentsNew },
    { label: '点赞', value: c.likes },
    { label: '资源', value: c.resources },
    { label: '联机大厅', value: c.servers },
  ];

  return (
    <>
      <div className="between ops-page-head">
        <div>
          <h1 className="page-title">运营概览</h1>
          <p className="small muted">
            {gate.user?.nickname ? `${gate.user.nickname}，` : ''}
            今天有 <b>{n(pending)}</b> 件事等着处理
          </p>
        </div>
        <span className="badge badge-ghost">数据实时</span>
      </div>

      <div className="ops-stats">
        {cards.map((card) => (
          <div key={card.label} className="card ops-stat">
            <b>{n(card.value)}</b>
            <span>{card.label}</span>
            {typeof card.delta === 'number' && card.delta > 0 && (
              <em>近 7 天 +{n(card.delta)}</em>
            )}
          </div>
        ))}
      </div>

      <section className="card ops-queues">
        <div className="between">
          <h2 className="ops-h2">待处理</h2>
          <span className="small muted">按积压时间排序</span>
        </div>

        {summary.queues.length === 0 ? (
          <p className="small muted" style={{ padding: '10px 2px' }}>
            还读不到待办数据，稍后刷新试试。
          </p>
        ) : (
          <ul className="ops-queue-list">
            {summary.queues.map((q) => {
              const href = OPS_QUEUE_HREF[q.key];
              const age =
                q.count > 0 && q.oldest
                  ? Math.max(0, Math.floor((Date.now() - q.oldest) / 86_400_000))
                  : 0;
              return (
                <li key={q.key} data-empty={q.count === 0}>
                  <span className="ops-queue-name">{q.label}</span>
                  <span className="ops-queue-count">{n(q.count)}</span>
                  {q.count > 0 ? (
                    <>
                      <span className="ops-queue-age">{age > 0 ? `最久 ${age} 天` : '今天新增'}</span>
                      {href ? (
                        <Link href={href} className="btn btn-sm btn-ghost">
                          去处理
                        </Link>
                      ) : (
                        <span className="ops-queue-hint">在后台处理</span>
                      )}
                    </>
                  ) : (
                    <span className="ops-queue-hint">已清空</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card ops-about">
        <h2 className="ops-h2">这个面板能做什么</h2>
        <ul className="ops-list">
          <li>
            <b>帖子审核</b>：看 AI 预审给出的风险提示，通过或驳回（驳回要写原因，作者会收到站内信）。
          </li>
          <li>
            <b>认证</b>：处理个人与机构的认证申请，通过时写入标记与说明。
          </li>
          <li>
            <b>头衔</b>：审核自定义头衔，可以改文案、样式与特效后再通过。
          </li>
          <li>
            运营数据：用户、帖子、评论、点赞、资源与联机大厅的存量，以及近 7 天新增。
          </li>
        </ul>
        <p className="small muted" style={{ marginTop: 10, lineHeight: 1.8 }}>
          用户管理、站点设置这些仍然要管理员在「控制台」里操作；运营权限由身份组控制，
          管理员在「后台 → 身份组 → 进入运营面板」里勾选。
        </p>
      </section>
    </>
  );
}
