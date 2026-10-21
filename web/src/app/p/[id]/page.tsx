import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPost } from '@/lib/forum-store';
import { isCommunitySigned } from '@/lib/agreement-state';
import { getCurrentUser } from '@/lib/current-user';
import { PostActions } from '@/components/post-actions';
import { getBadgeMap } from '@/lib/users';
import { resolveBadge } from '@/lib/badges';
import { UserBadge } from '@/components/user-badge';

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) notFound();

  const [signed, user, badges] = await Promise.all([isCommunitySigned(), getCurrentUser(), getBadgeMap()]);
  const postBadge = resolveBadge(badges, { id: post.authorId, name: post.author });

  return (
    <div className="cols">
      <div className="col-main">
        <div className="crumb">
          <Link href="/">社区</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <span>帖子</span>
        </div>

        <article className="card post">
          <div className="post-head">
            <div className="post-avatar">{post.author.slice(0, 1)}</div>
            <div>
              <div className="post-meta">
                <b>{post.author}</b>
                <UserBadge badge={postBadge} />
                <span className="sep">·</span>
                {post.guild}
                {post.pinned && <span className="post-pin">置顶</span>}
              </div>
              <div className="post-meta">{post.time}</div>
            </div>
          </div>

          <h1 className="page-title" style={{ marginBottom: 12 }}>
            {post.title ?? '无标题'}
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>{post.body}</p>

          <div className="post-tags">
            {post.tags.map((t) => (
              <span key={t} className="badge badge-ghost">#{t}</span>
            ))}
          </div>
        </article>

        <PostActions
          postId={post.id}
          likes={post.likes}
          comments={post.comments}
          signed={signed}
          loggedIn={Boolean(user)}
        />

        <section id="comments" className="card" style={{ overflow: 'hidden' }}>
          <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
            <h3 style={{ fontSize: 13 }}>评论 {post.commentsList.length}</h3>
            <span className="small muted">按时间正序</span>
          </div>
          {post.commentsList.length === 0 ? (
            <p className="small muted" style={{ padding: '18px 16px' }}>还没有评论，说说你的看法。</p>
          ) : (
            post.commentsList.map((c) => (
              <div key={c.id} className="rail-item" style={{ padding: '12px 16px', alignItems: 'flex-start' }}>
                <span className="post-avatar" style={{ width: 26, height: 26, fontSize: 11, borderRadius: 8 }}>{c.author.slice(0, 1)}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="small row" style={{ fontWeight: 550, gap: 6 }}>
                    {c.author}
                    <UserBadge badge={resolveBadge(badges, { id: c.authorId, name: c.author })} size="sm" />
                  </div>
                  <div className="small dim" style={{ lineHeight: 1.7 }}>{c.body}</div>
                </div>
              </div>
            ))
          )}
        </section>
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">作者</div>
          <div className="row" style={{ gap: 10 }}>
            <span className="post-avatar" style={{ width: 38, height: 38, borderRadius: 11 }}>{post.author.slice(0, 1)}</span>
            <div>
              <div className="small row" style={{ fontWeight: 550, gap: 6 }}>
                {post.author}
                <UserBadge badge={postBadge} size="sm" />
              </div>
              <div className="small muted">{post.guild}公会</div>
            </div>
          </div>
          <Link href="/me" className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 12 }}>查看主页</Link>
        </div>

        <div className="card rail-card">
          <div className="rail-title">发帖规则</div>
          <div className="rule-list">
            <div className="rule-row"><span className="n">1</span><span>发帖与评论需先签署《社区公约》</span></div>
            <div className="rule-row"><span className="n">2</span><span>转载注明作者与许可协议</span></div>
            <div className="rule-row"><span className="n">3</span><span>招募信息请发到对应分区</span></div>
          </div>
        </div>
      </aside>
    </div>
  );
}
