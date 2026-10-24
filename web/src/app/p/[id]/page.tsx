import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPost } from '@/lib/forum-store';
import { isCommunitySigned } from '@/lib/agreement-state';
import { getCurrentUser } from '@/lib/current-user';
import { PostActions } from '@/components/post-actions';
import { getAvatarMap, getBadgeMap, resolveAvatar } from '@/lib/users';
import { resolveBadge } from '@/lib/badges';
import { getGroupMap, resolveGroup } from '@/lib/group-map';
import { UserBadge } from '@/components/user-badge';
import { GroupTag } from '@/components/group-tag';
import { getAchievementMap, findBadges } from '@/lib/achievements';
import { AchievementChips } from '@/components/achievement-chips';
import { buildMetadata } from '@/lib/seo';
import { Markdown, markdownToText } from '@/lib/markdown';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(id);
  // 待审 / 被拒 / 不存在：不进索引，也不泄漏标题
  if (!post || post.status !== 'published') {
    return buildMetadata({ title: '帖子', path: `/p/${id}`, noIndex: true });
  }
  const title = post.title?.trim() || post.body.replace(/\s+/g, ' ').slice(0, 24);
  return buildMetadata({
    title,
    description: markdownToText(post.body).slice(0, 120),
    path: `/p/${id}`,
    type: 'article',
  });
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) notFound();

  const [signed, user, badges, achievements, groups, avatars] = await Promise.all([
    isCommunitySigned(),
    getCurrentUser(),
    getBadgeMap(),
    getAchievementMap(),
    getGroupMap(),
    getAvatarMap(),
  ]);
  const postAvatar = resolveAvatar(avatars, { id: post.authorId, name: post.author });
  const postBadge = resolveBadge(badges, { id: post.authorId, name: post.author });
  const postGroup = resolveGroup(groups, { id: post.authorId, name: post.author });
  // 未过审的帖子只有作者和审核人打得开（后端已按 status 拦过一次，这里只负责说明状态）
  const pending = post.status === 'pending';
  const rejected = post.status === 'rejected';
  const unpublished = pending || rejected;

  return (
    <div className="cols">
      <div className="col-main">
        <div className="crumb">
          <Link href="/">社区</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <span>帖子</span>
        </div>

        <article className="card post">
          {unpublished && (
            <div className="audit-bar" data-kind={post.status}>
              <b>{pending ? '审核中' : '未通过审核'}</b>
              <span>
                {pending
                  ? '在审核通过之前，只有你自己和审核人员能看到它，社区列表里不会出现。'
                  : post.rejectReason
                    ? `原因：${post.rejectReason}`
                    : '审核没有给出具体原因，可以按社区公约检查后重新发布。'}
              </span>
            </div>
          )}
          <div className="post-head">
            <div className="post-avatar">
              {postAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={postAvatar} alt="" />
              ) : (
                post.author.slice(0, 1)
              )}
            </div>
            <div>
              <div className="post-meta">
                <b>{post.author}</b>
                <UserBadge badge={postBadge} />
                <GroupTag group={postGroup} size="sm" />
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
          <Markdown text={post.body} className="md-body post-md" />

          <div className="post-tags">
            {post.tags.map((t) => (
              <span key={t} className="badge badge-ghost">#{t}</span>
            ))}
          </div>
        </article>

        {unpublished ? (
          <div className="card card-pad small muted">
            {pending ? '审核通过后才能点赞和评论。' : '这篇文章未通过审核，点赞与评论已关闭。'}
          </div>
        ) : (
          <PostActions
            postId={post.id}
            likes={post.likes}
            comments={post.comments}
            signed={signed}
            loggedIn={Boolean(user)}
          />
        )}

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
                <span className="post-avatar" style={{ width: 26, height: 26, fontSize: 11, borderRadius: 8 }}>
                  {resolveAvatar(avatars, { name: c.author }) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolveAvatar(avatars, { name: c.author })} alt="" />
                  ) : (
                    c.author.slice(0, 1)
                  )}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="small row" style={{ fontWeight: 550, gap: 6 }}>
                    {c.author}
                    <UserBadge badge={resolveBadge(badges, { id: c.authorId, name: c.author })} size="sm" />
                    <GroupTag group={resolveGroup(groups, { id: c.authorId, name: c.author })} size="sm" />
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
            <span className="post-avatar" style={{ width: 38, height: 38, borderRadius: 11 }}>
              {postAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={postAvatar} alt="" />
              ) : (
                post.author.slice(0, 1)
              )}
            </span>
            <div>
              <div className="small row" style={{ fontWeight: 550, gap: 6 }}>
                {post.author}
                <UserBadge badge={postBadge} size="sm" />
                <GroupTag group={postGroup} size="sm" />
              </div>
              <div className="small muted">{post.guild}公会</div>
              <AchievementChips
                badges={findBadges(achievements, { id: post.authorId, name: post.author }, 3)}
                size="sm"
              />
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
