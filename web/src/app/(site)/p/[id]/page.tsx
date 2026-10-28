import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPost } from '@/lib/forum-store';
import { isCommunitySigned } from '@/lib/agreement-state';
import { getCurrentUser } from '@/lib/current-user';
import { CommentComposer, PostLike } from '@/components/post-actions';
import { FloorReply } from '@/components/floor-reply';
import { getAvatarMap, getBadgeMap, resolveAvatar } from '@/lib/users';
import { resolveBadge } from '@/lib/badges';
import { getGroupMap, resolveGroup } from '@/lib/group-map';
import { NameBadges } from '@/components/name-badges';
import { getAchievementMap, findBadges } from '@/lib/achievements';
import { AchievementChips } from '@/components/achievement-chips';
import { UserHoverCard } from '@/components/user-hover-card';
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

/** 固定按东八区展示：服务端与客户端算出来必须一致，否则 hydration 会报警 */
const fmtAt = (ts: number) => {
  const d = new Date(ts + 8 * 3600 * 1000);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
};

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

  const who = (name: string, userId?: string) => {
    const key = { id: userId, name };
    return {
      avatar: resolveAvatar(avatars, key),
      badge: resolveBadge(badges, key),
      group: resolveGroup(groups, key),
    };
  };

  const op = who(post.author, post.authorId);
  // 「个人」是早期发帖写死的占位值，不是公会名；空值同样不展示
  const guildName = post.guild && post.guild !== '个人' ? post.guild : '';
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

        {/* 主题头：标题、作者、统计与快捷回复，楼层里不再重复 */}
        <header className="card card-pad thread-head" id="top">
          <div className="thread-kicker">
            {guildName && (
              <>
                <span>{guildName}公会</span>
                <span>·</span>
              </>
            )}
            <span>{post.time}</span>
            <span>·</span>
            <span>{post.comments} 条回复</span>
            <span>·</span>
            <span>{post.likes} 赞</span>
          </div>
          <h1 className="thread-title">{post.title ?? '无标题'}</h1>
          <div className="thread-head-foot">
            <div className="post-tags" style={{ margin: 0 }}>
              {post.tags.map((t) => (
                <span key={t} className="badge badge-ghost">
                  #{t}
                </span>
              ))}
            </div>
            {!unpublished && (
              <a href="#comment-form" className="btn btn-sm btn-ghost">
                回复主题
              </a>
            )}
          </div>
        </header>

        {/* 1 楼：楼主 */}
        <article className="card floor floor-op" id="floor-1">
          <aside className="floor-side">
            <span className="floor-avatar">
              {op.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={op.avatar} alt="" />
              ) : (
                post.author.slice(0, 1)
              )}
            </span>
            <div className="floor-who">
              <UserHoverCard
                userId={post.authorId}
                name={post.author}
                avatar={op.avatar}
                badge={op.badge}
                group={op.group}
              >
                <b>{post.author}</b>
              </UserHoverCard>
              {/* 标签与成就挂一行：作者横带只占两行，不把楼层顶得很高 */}
              <div className="floor-tags">
                <NameBadges badge={op.badge} group={op.group} size="sm" />
                <AchievementChips
                  badges={findBadges(achievements, { id: post.authorId, name: post.author }, 3)}
                  size="sm"
                />
              </div>
            </div>
          </aside>

          <div className="floor-main">
            <div className="floor-head">
              <span className="floor-num">#1</span>
              <span className="floor-badge">楼主</span>
              {post.pinned && <span className="post-pin">置顶</span>}
              <time className="floor-time">{post.time}</time>
            </div>

            <Markdown text={post.body} className="md-body post-md" />

            <div className="floor-foot">
              {unpublished ? (
                <span className="small muted">
                  {pending ? '审核通过后才能点赞和回复。' : '这篇文章未通过审核，点赞与回复已关闭。'}
                </span>
              ) : (
                <PostLike
                  postId={post.id}
                  likes={post.likes}
                  comments={post.comments}
                  loggedIn={Boolean(user)}
                />
              )}
            </div>
          </div>
        </article>

        {/* 2 楼起：回复楼层 */}
        {post.commentsList.map((c) => {
          const u = who(c.author, c.authorId);
          return (
            <article className="card floor" id={`floor-${c.floor}`} key={c.id}>
              <aside className="floor-side">
                <span className="floor-avatar">
                  {u.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.avatar} alt="" />
                  ) : (
                    c.author.slice(0, 1)
                  )}
                </span>
                <div className="floor-who">
                  <UserHoverCard
                    userId={c.authorId}
                    name={c.author}
                    avatar={u.avatar}
                    badge={u.badge}
                    group={u.group}
                  >
                    <b>{c.author}</b>
                  </UserHoverCard>
                  <div className="floor-tags">
                    <NameBadges badge={u.badge} group={u.group} size="sm" />
                  </div>
                </div>
              </aside>

              <div className="floor-main">
                <div className="floor-head">
                  <span className="floor-num">#{c.floor}</span>
                  <time className="floor-time">{fmtAt(c.at)}</time>
                  <FloorReply floor={c.floor} author={c.author} />
                </div>
                <div className="floor-body">{c.body}</div>
              </div>
            </article>
          );
        })}

        {post.commentsList.length === 0 && (
          <p className="card card-pad small muted" style={{ margin: 0 }}>
            还没有人回复，抢占 2 楼。
          </p>
        )}

        {unpublished ? (
          <div className="card card-pad small muted">审核通过后才能点赞和回复。</div>
        ) : (
          <CommentComposer
            postId={post.id}
            signed={signed}
            loggedIn={Boolean(user)}
            total={post.commentsList.length}
          />
        )}
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">作者</div>
          <div className="row" style={{ gap: 10 }}>
            <span className="post-avatar" style={{ width: 38, height: 38, borderRadius: 11 }}>
              {op.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={op.avatar} alt="" />
              ) : (
                post.author.slice(0, 1)
              )}
            </span>
            <div>
              <div className="small row" style={{ fontWeight: 550, gap: 6 }}>
                <UserHoverCard
                  userId={post.authorId}
                  name={post.author}
                  avatar={op.avatar}
                  badge={op.badge}
                  group={op.group}
                >
                  <span>{post.author}</span>
                </UserHoverCard>
                <NameBadges badge={op.badge} group={op.group} size="sm" />
              </div>
              <div className="small muted">{guildName ? `${guildName}公会` : '个人发布'}</div>
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
