import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { findById } from '@/lib/users';
import { getAvatarMap, getBadgeMap, resolveAvatar } from '@/lib/users';
import { getGroupMap, resolveGroup } from '@/lib/group-map';
import { listPosts } from '@/lib/forum-store';
import { getAchievementMap, findBadges } from '@/lib/achievements';
import { resolveBadge } from '@/lib/badges';
import { PostCard } from '@/components/post-card';
import { LevelPill, RepPill } from '@/components/rank-badges';
import { NameBadges } from '@/components/name-badges';
import { AchievementChips } from '@/components/achievement-chips';
import { buildMetadata } from '@/lib/seo';

const fmtDay = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await findById(id);
  return buildMetadata({
    title: user ? `${user.nickname} 的主页` : '用户',
    path: `/u/${id}`,
    noIndex: true,
  });
}

/** 公开主页：从帖子卡片的作者名点进来，看这个人的简介与帖子。 */
export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await findById(id);
  if (!user) notFound();

  const [posts, badges, groups, avatars, achievements] = await Promise.all([
    listPosts(),
    getBadgeMap(),
    getGroupMap(),
    getAvatarMap(),
    getAchievementMap(),
  ]);

  const key = { id: user.id, name: user.nickname };
  const avatar = resolveAvatar(avatars, key);
  const badge = resolveBadge(badges, key);
  const group = resolveGroup(groups, key);
  const mine = posts.filter((p) => p.authorId === user.id);
  const earned = findBadges(achievements, key, 6);

  return (
    <div className="cols">
      <div className="col-main">
        <div className="crumb">
          <Link href="/">社区</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <span>{user.nickname}</span>
        </div>

        <section className="card card-pad up-head">
          <span className="up-avatar">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" />
            ) : (
              user.nickname.slice(0, 1)
            )}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="up-name">
              <b>{user.nickname}</b>
              <NameBadges badge={badge} group={group} size="sm" showVerifyLabel />
              <LevelPill level={user.level} />
              <RepPill rep={user.reputation} />
            </div>
            <div className="up-sub">
              @{user.username} · 加入于 {fmtDay(user.createdAt)}
              {user.group ? ` · ${user.group.name}` : ''}
            </div>
            <div className="up-meta">
              {user.title && <span className="badge badge-ghost">{user.title}</span>}
              {user.developer && <span className="dev-chip">开发者</span>}
              <AchievementChips badges={earned} size="sm" />
            </div>
          </div>
          <div className="up-stats">
            <div>
              <b>{mine.length}</b>
              <span>帖子</span>
            </div>
            <div>
              <b>{mine.reduce((n, p) => n + p.likes, 0)}</b>
              <span>获赞</span>
            </div>
            <div>
              <b>{user.reputation?.score ?? '—'}</b>
              <span>信誉</span>
            </div>
          </div>
        </section>

        <h2 className="section-title" style={{ marginTop: 16 }}>
          发布的帖子
        </h2>

        {mine.length === 0 ? (
          <p className="card card-pad small muted" style={{ margin: 0 }}>
            还没有发过帖子。
          </p>
        ) : (
          <div className="post-grid">
            {mine.map((f) => (
              <PostCard
                key={f.id}
                item={f}
                badge={resolveBadge(badges, { id: f.authorId, name: f.author })}
                group={resolveGroup(groups, { id: f.authorId, name: f.author })}
                achievements={findBadges(achievements, { id: f.authorId, name: f.author }, 2)}
                avatar={resolveAvatar(avatars, { id: f.authorId, name: f.author })}
              />
            ))}
          </div>
        )}
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">关于</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            {user.verifyKind
              ? '这个账号已通过社区认证，昵称旁的标记可点击查看认证说明。'
              : '这个账号还没有认证标记。'}
          </p>
        </div>
      </aside>
    </div>
  );
}
