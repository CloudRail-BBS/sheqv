import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPost } from '@/lib/forum-store';
import { isCommunitySigned } from '@/lib/agreement-state';
import { getCurrentUser } from '@/lib/current-user';
import { CommentComposer, PostLike } from '@/components/post-actions';
import { ReplyDock } from '@/components/reply-dock';
import { FloorReply } from '@/components/floor-reply';
import { PostTools } from '@/components/post-tools';
import { getAvatarMap, getBadgeMap, resolveAvatar } from '@/lib/users';
import { resolveBadge } from '@/lib/badges';
import { getGroupMap, resolveGroup } from '@/lib/group-map';
import { NameBadges } from '@/components/name-badges';
import { getAchievementMap, findBadges } from '@/lib/achievements';
import { AchievementChips } from '@/components/achievement-chips';
import { UserHoverCard } from '@/components/user-hover-card';
import { breadcrumbJsonLd, buildMetadata, postJsonLd } from '@/lib/seo';
import { AuditProgress } from '@/components/audit-progress';
import { getImageSizes } from '@/lib/media-sizes';
import { publicCaptchaId } from '@/lib/geetest';
import { catLabel, listCategories } from '@/lib/category-store';
import { Markdown, markdownToText } from '@/lib/markdown';
import { FoldCard } from '@/components/fold-card';

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
    publishedTime: post.createdAt,
    modifiedTime: post.editedAt,
    authors: [post.author],
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

  const [signed, user, badges, achievements, groups, avatars, sections] = await Promise.all([
    isCommunitySigned(),
    getCurrentUser(),
    getBadgeMap(),
    getAchievementMap(),
    getGroupMap(),
    getAvatarMap(),
    listCategories('post_section'),
  ]);

  const who = (name: string, userId?: string) => {
    const key = { id: userId, name };
    return {
      avatar: resolveAvatar(avatars, key),
      badge: resolveBadge(badges, key),
      group: resolveGroup(groups, key),
    };
  };

  const captchaId = await publicCaptchaId();
  const imageSizes = await getImageSizes(post.body).catch(() => ({}));
  const jsonLd = post.status !== 'published'
    ? ''
    : await postJsonLd({
        id: post.id,
        title: post.title,
        body: post.body,
        author: post.author,
        authorId: post.authorId,
        likes: post.likes,
        comments: post.comments,
        createdAt: post.createdAt,
      }).catch(() => '');
  const op = who(post.author, post.authorId);
  // 「个人」是早期发帖写死的占位值，不是公会名；空值同样不展示
  const guildName = post.guild && post.guild !== '个人' ? post.guild : '';
  const pending = post.status === 'pending';
  const rejected = post.status === 'rejected';
  const unpublished = pending || rejected;
  const crumbs = post.status === 'published'
    ? await breadcrumbJsonLd([
        { name: '首页', path: '/' },
        ...(post.section
          ? [{ name: catLabel(sections, post.section), path: `/?section=${encodeURIComponent(post.section)}` }]
          : []),
        { name: post.title?.trim() || '帖子', path: `/p/${encodeURIComponent(post.id)}` },
      ]).catch(() => '')
    : '';

  return (
    <div className="cols">
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      )}
      {crumbs && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: crumbs }} />
      )}
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

        {/* 每一楼都是帖子：楼主是 1 楼，回复从 2 楼起，结构和样式完全一致 */}
        <article className="card post-block" id="post-1">
            {(post.pinned || post.featured) && (
              <div className="pb-flagbar" data-flag={post.pinned ? 'pinned' : 'featured'}>
                <span className="pb-flagbar-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    {post.pinned ? (
                      <path d="M9 3h6l-1 6 4 3v2H6v-2l4-3zM12 14v7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
                    ) : (
                      <path d="m12 3 2.6 5.4 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.3l5.9-.9z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    )}
                  </svg>
                </span>
                <b>{post.pinned ? '置顶帖' : '精华帖'}</b>
                <span>
                  {post.pinned
                    ? '管理员把这篇文章放在了版块最前面'
                    : '版主认为这篇内容值得一读'}
                </span>
              </div>
            )}
            <div className="pb-title-block">
              <div className="pb-title-row">
                <h1 className="pb-title">{post.title ?? '无标题'}</h1>
                <PostTools
                  postId={post.id}
                  title={post.title ?? ''}
                  body={post.body}
                  canEdit={Boolean(user) && (user!.id === post.authorId || Boolean(user!.isAdmin))}
                  canModerate={Boolean(user?.isAdmin) || Boolean(user?.permissions?.includes('post.pin'))}
                  pinned={post.pinned}
                  featured={post.featured}
                  canNotice={Boolean(user?.isAdmin)}
                  adminNote={post.adminNote ?? ''}
                />
              </div>
            </div>

            {/* 作者行与标题同一块白面：头像 / 昵称 + 身份 / 发表信息 / 右侧浏览与回复 */}
            <header className="pb-head">
              <span className="pb-avatar">
                {op.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={op.avatar} alt="" loading="lazy" decoding="async" />
                ) : (
                  post.author.slice(0, 1)
                )}
              </span>
              <div className="pb-who">
                <div className="pb-name">
                  <UserHoverCard
                    userId={post.authorId}
                    name={post.author}
                    avatar={op.avatar}
                    badge={op.badge}
                    group={op.group}
                  >
                    <b>{post.author}</b>
                  </UserHoverCard>
                  <NameBadges badge={op.badge} group={op.group} size="sm" showVerifyLabel />
                  <AchievementChips
                    badges={findBadges(achievements, { id: post.authorId, name: post.author }, 3)}
                    size="sm"
                    skip={[op.badge?.label, op.group?.name, '楼主']}
                  />
                  <span className="pb-op">楼主</span>
                </div>
                <div className="pb-sub">
                  {post.pinned && (
                    <span className="pb-flag" data-flag="pinned">置顶</span>
                  )}
                  {post.featured && (
                    <span className="pb-flag" data-flag="featured">精华</span>
                  )}
                  <span>发表于 {post.time}</span>
                  {post.ipRegion && (
                    <>
                      <i className="pb-dot" aria-hidden="true" />
                      <span className="pb-ip" title="发帖时的 IP 归属地">
                        IP:{post.ipRegion}
                      </span>
                    </>
                  )}
                  {post.editedAt ? (
                    <>
                      <i className="pb-dot" aria-hidden="true" />
                      <span title={new Date(post.editedAt).toLocaleString('zh-CN')}>已编辑</span>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="pb-stats">
                <span className="pb-stat" title={`${post.views} 次浏览`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                    <path d="M2.3 12S6 5.6 12 5.6 21.7 12 21.7 12 18 18.4 12 18.4 2.3 12 2.3 12Z" />
                    <circle cx="12" cy="12" r="2.7" />
                  </svg>
                  {post.views}
                </span>
                <span className="pb-stat" title={`${post.comments} 条回复`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                    <path d="M21 12a8 8 0 0 1-8 8H8l-4 3v-5.5A8 8 0 1 1 21 12Z" />
                  </svg>
                  {post.comments}
                </span>
              </div>
            </header>

            {post.adminNote && (
              <div className="pb-notice" role="note">
                <span className="pb-notice-tag">管理员声明</span>
                <p>{post.adminNote}</p>
              </div>
            )}

            <div className="pb-body">
              <Markdown text={post.body} className="md-body post-md" imageSizes={imageSizes} />
            </div>

            <footer className="pb-foot">
              {unpublished ? (
                <span className="small muted">
                  {pending ? '审核通过后才能点赞和回复。' : '这篇文章未通过审核，点赞与回复已关闭。'}
                </span>
              ) : (
                <PostLike
                  postId={post.id}
                  likes={post.likes}
                  liked={post.liked}
                  comments={post.comments}
                  loggedIn={Boolean(user)}
                />
              )}
            </footer>
        </article>

        <div id="replies" className="pb-list">
          {post.commentsList.map((c) => {
            const u = who(c.author, c.authorId);
            return (
              <article className="card post-block" id={`post-${c.floor}`} key={c.id}>
                <header className="pb-head" data-reply="true">
                  <span className="pb-avatar">
                    {u.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatar} alt="" loading="lazy" decoding="async" />
                    ) : (
                      c.author.slice(0, 1)
                    )}
                  </span>
                  <div className="pb-who">
                    <div className="pb-name">
                      <UserHoverCard
                        userId={c.authorId}
                        name={c.author}
                        avatar={u.avatar}
                        badge={u.badge}
                        group={u.group}
                      >
                        <b>{c.author}</b>
                      </UserHoverCard>
                      <NameBadges badge={u.badge} group={u.group} size="sm" />
                      <span className="pb-floor">#{c.floor}</span>
                    </div>
                    <div className="pb-sub">
                      <time>回复于 {fmtAt(c.at)}</time>
                      {c.ipRegion ? (
                        <>
                          <i className="pb-dot" aria-hidden="true" />
                          <span className="pb-ip" title="回复时的 IP 归属地">
                            IP:{c.ipRegion}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <FloorReply author={c.author} />
                </header>
                <div className="pb-body pb-reply-body">{c.body}</div>
              </article>
            );
          })}
        </div>

        {post.commentsList.length === 0 && (
          <p className="card card-pad small muted" style={{ margin: 0 }}>
            还没有人回复，来说两句。
          </p>
        )}

        {unpublished ? (
          <AuditProgress
            status={post.status === 'rejected' ? 'rejected' : 'pending'}
            createdAt={post.createdAt}
            reviewedAt={post.reviewedAt}
            rejectReason={post.rejectReason}
          />
        ) : (
          <>
            <CommentComposer
              postId={post.id}
              signed={signed}
              loggedIn={Boolean(user)}
              total={post.commentsList.length}
              captchaId={captchaId}
              mutedUntil={user?.mutedUntil ?? 0}
              muteReason={user?.muteReason ?? ''}
            />
            {/* 手机端：帖子太长时不必滚到底才能回复 */}
            {user && signed && !(user.mutedUntil && user.mutedUntil > Date.now()) && <ReplyDock />}
          </>
        )}
      </div>

      <aside className="rail">
        <FoldCard title="发帖规则">
          <div className="rule-list">
            <div className="rule-row"><span className="n">1</span><span>发帖与评论需先签署《社区公约》</span></div>
            <div className="rule-row"><span className="n">2</span><span>转载注明作者与许可协议</span></div>
            <div className="rule-row"><span className="n">3</span><span>招募信息请发到对应分区</span></div>
          </div>
        </FoldCard>
      </aside>
    </div>
  );
}
