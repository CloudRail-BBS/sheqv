'use client';

import { useState } from 'react';
import Link from 'next/link';
import { markdownToText } from '@/lib/markdown';
import type { FeedItem } from '@/lib/data';
import type { BadgeInfo } from '@/lib/badges';
import type { EarnedBadge } from '@/lib/achievements';
import type { UserGroup } from '@/lib/users';
import { NameBadges } from './name-badges';
import { AchievementChips } from './achievement-chips';
import { UserHoverCard } from './user-hover-card';
import { SmartImage } from './smart-image';

type Item = FeedItem & { href?: string };

/** 帖子列表行：参考 Discourse 的紧凑排布——标题 + 摘要 + 作者信息 + 右侧缩略图 */
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
  const href = item.href ?? '/';
  // 「个人」是早期发帖时写死的占位值，不是公会；空值与它都不展示
  const guildName = item.guild && item.guild !== '个人' ? item.guild : '';

  // 正文里的第一张站内图当缩略图，没有就不占位
  const thumb = /!\[[^\]]*\]\((\/api\/v1\/media\/[A-Za-z0-9]+)[^)]*\)/.exec(item.body)?.[1];

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
    <article className="card post-row">
      <div className="pr-main">
        <div className="pr-top">
          {guildName && <span className="pr-cat">{guildName}</span>}
          <Link href={href} className="pr-title">
            {item.title ?? item.body.slice(0, 30)}
          </Link>
          {item.pinned && <span className="post-pin">置顶</span>}
          {item.kind === 'match' && <span className="badge badge-warn">约战</span>}
          {item.kind === 'resource' && <span className="badge badge-mc">资源</span>}
        </div>

        <p className="pr-excerpt">{markdownToText(item.body)}</p>

        <div className="pr-meta">
          <span className="pr-avatar">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" loading="lazy" decoding="async" />
            ) : (
              item.author.slice(0, 1)
            )}
          </span>
          <UserHoverCard
            userId={item.authorId}
            name={item.author}
            avatar={avatar}
            badge={badge}
            group={group}
          >
            <b>{item.author}</b>
          </UserHoverCard>
          <NameBadges badge={badge} group={group} size="sm" />
          <AchievementChips
            badges={achievements?.filter((b) => !(badge?.admin && b.id === 'admin'))}
            size="sm"
          />
          <span className="pr-dot">·</span>
          <span>{item.time}</span>

          <span className="pr-stats">
            {item.tags.slice(0, 2).map((t) => (
              <span key={t} className="pr-tag">
                #{t}
              </span>
            ))}
            <button type="button" className="pr-stat" data-on={liked} onClick={like} aria-label="点赞">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M7 10v10H4V10zM7 10l4.2-6.4a1.6 1.6 0 0 1 2.9 1.2L13 9h5.4a2 2 0 0 1 2 2.4l-1.3 6.5a2 2 0 0 1-2 1.6H7"
                  fill={liked ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
              </svg>
              {likes}
            </button>
            <Link href={`${href}#replies`} className="pr-stat" aria-label="回复">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
              </svg>
              {item.comments}
            </Link>
          </span>
        </div>
      </div>

      {thumb && (
        <Link href={href} className="pr-thumb" aria-hidden="true" tabIndex={-1}>
          <SmartImage src={`${thumb}?w=320`} alt="" ratio="4 / 3" sizes="120px" />
        </Link>
      )}
    </article>
  );
}
