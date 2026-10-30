'use client';

import { useState } from 'react';
import Link from 'next/link';
import { markdownToText } from '@/lib/markdown';
import type { FeedItem } from '@/lib/data';
import type { BadgeInfo } from '@/lib/badges';
import type { EarnedBadge } from '@/lib/achievements';
import type { UserGroup } from '@/lib/users';
import { UserHoverCard } from './user-hover-card';
import { SmartImage } from './smart-image';

type Item = FeedItem & { href?: string };

/**
 * 帖子卡片：**顶部整幅封面 + 下面信息面板**。
 *
 * - 封面取正文第一张站内图（`?w=640`），没有图就用同色系渐变兜底；
 * - 面板第一行是作者头像 / 昵称 / 头衔与身份组 / 分类 / 时间；
 * - 标题最多两行，底部三个计数：点赞（可点）、回复、浏览。
 */
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

  // 正文里的第一张站内图当封面
  const cover = /!\[[^\]]*\]\((\/api\/v1\/media\/[A-Za-z0-9]+)[^)]*\)/.exec(item.body)?.[1];
  const title = item.title?.trim() || markdownToText(item.body).slice(0, 40) || '无标题';
  // 分类：优先第一个标签，其次公会名
  const category = item.tags[0] || guildName || '讨论';

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
    <article className="card feed-card">
      <Link href={href} className="fc-cover" tabIndex={-1} aria-hidden="true">
        {cover ? (
          <SmartImage
            src={`${cover}?w=640`}
            alt=""
            ratio="16 / 9"
            sizes="(max-width: 860px) 100vw, (max-width: 1180px) 28vw, 360px"
          />
        ) : (
          <span className="fc-cover-fallback">
            <span>{title.slice(0, 1)}</span>
          </span>
        )}
        {item.pinned && <span className="fc-pin">置顶</span>}
      </Link>

      <div className="fc-body">
        <div className="fc-head">
          {/* 头衔 / 身份组 / 成就不在这行堆着（窄卡片会挤成两行），
              鼠标停在头像或昵称上时由悬浮卡展示 */}
          <span
            className="fc-avatar"
            title={
              [badge?.label, group?.name, ...(achievements ?? []).map((b) => b.name)]
                .filter(Boolean)
                .join(' · ') || undefined
            }
          >
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
          <span className="fc-chip">{category}</span>
          <time className="fc-time">{item.time}</time>
        </div>

        <Link href={href} className="fc-title" title={title}>
          {title}
        </Link>

        <div className="fc-foot">
          <button
            type="button"
            className="fc-stat"
            data-on={liked}
            onClick={like}
            aria-label="点赞"
          >
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

          <Link href={`${href}#replies`} className="fc-stat" aria-label="回复">
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

          <span className="fc-stat fc-stat-static" title="浏览">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M2 12s3.7-6.2 10-6.2S22 12 22 12s-3.7 6.2-10 6.2S2 12 2 12z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="12" r="2.7" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            {item.views ?? 0}
          </span>
        </div>
      </div>
    </article>
  );
}
