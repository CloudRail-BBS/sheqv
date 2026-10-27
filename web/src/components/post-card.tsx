'use client';

import { useState } from 'react';
import Link from 'next/link';
import { markdownToText } from '@/lib/markdown';
import type { FeedItem } from '@/lib/data';
import type { BadgeInfo } from '@/lib/badges';
import type { EarnedBadge } from '@/lib/achievements';
import type { UserGroup } from '@/lib/users';
import { UserBadge } from './user-badge';
import { GroupTag } from './group-tag';
import { AchievementChips } from './achievement-chips';
import { UserHoverCard } from './user-hover-card';

type Item = FeedItem & { href?: string };

export function PostCard({
  item,
  badge,
  group,
  achievements,
  avatar,
}: {
  item: Item;
  badge?: BadgeInfo;
  /** 作者的身份组（名字 + 颜色） */
  group?: UserGroup;
  achievements?: EarnedBadge[];
  /** 作者头像；空则用昵称首字 */
  avatar?: string;
}) {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(item.likes);
  const [saved, setSaved] = useState(false);
  const href = item.href ?? '/';

  async function like() {
    if (liked) return;
    setLiked(true);
    setLikes((n) => n + 1);
    const res = await fetch(`/api/v1/posts/${item.id}/like`, { method: 'POST' });
    if (!res.ok) {
      setLiked(false);
      setLikes((n) => n - 1);
    }
  }

  return (
    <article className="card post">
      <div className="post-head">
        <div className="post-avatar">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" />
          ) : (
            item.author.slice(0, 1)
          )}
        </div>
        <div>
          <div className="post-meta">
            <UserHoverCard
              userId={item.authorId}
              name={item.author}
              avatar={avatar}
              badge={badge}
              group={group}
            >
              <b>{item.author}</b>
            </UserHoverCard>
            <UserBadge badge={badge} />
            <GroupTag group={group} size="sm" />
            <span className="sep">·</span>
            {item.guild}
            {item.pinned && <span className="post-pin">置顶</span>}
          </div>
          <div className="post-sub">
            <span>{item.time}</span>
            <AchievementChips
              badges={achievements?.filter((b) => !(badge?.admin && b.id === 'admin'))}
              size="sm"
            />
          </div>
        </div>
        {item.kind === 'match' && (
          <Link href="/matches" className="badge badge-warn" style={{ marginLeft: 'auto' }}>
            约战
          </Link>
        )}
        {item.kind === 'resource' && (
          <Link href="/resources" className="badge badge-mc" style={{ marginLeft: 'auto' }}>
            资源
          </Link>
        )}
      </div>

      <h3 className="post-title">
        <Link href={href}>{item.title ?? item.body.slice(0, 30)}</Link>
      </h3>
      <p className="post-body">{markdownToText(item.body)}</p>

      <div className="post-tags">
        {item.tags.map((t) => (
          <span key={t} className="badge badge-ghost">
            #{t}
          </span>
        ))}
      </div>

      <div className="post-foot">
        <button className="act" data-on={liked} onClick={like}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M7 10v10H4V10zM7 10l4.2-6.4a1.6 1.6 0 0 1 2.9 1.2L13 9h5.4a2 2 0 0 1 2 2.4l-1.3 6.5a2 2 0 0 1-2 1.6H7"
              fill={liked ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
          {likes}
        </button>
        <Link href={`${href}#comments`} className="act">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          {item.comments}
        </Link>
        <button className="act" data-on={saved} onClick={() => setSaved((v) => !v)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3h12v18l-6-4-6 4z" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          {saved ? '已收藏' : '收藏'}
        </button>
        <Link href={href} className="act">
          查看详情
        </Link>
      </div>
    </article>
  );
}
