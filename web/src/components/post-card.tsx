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

/** 站内图片的宽高表（media id → 尺寸），用来按原图比例占位 */
export type PostImageSizes = Record<string, { w: number; h: number }>;

/**
 * 帖子卡片：**高度由内容决定**（瀑布流里每张卡不一样高）。
 *
 * - 正文里有图 → 顶部整幅封面，比例取原图（竖图最多 5:4，横图最多 1.9:1）；
 * - 正文里没有图 → 不占封面位，改成标题 + 四行摘要的纯文字卡。
 */
export function PostCard({
  item,
  badge,
  group,
  achievements,
  avatar,
  imageSizes,
}: {
  item: Item;
  badge?: BadgeInfo;
  /** 作者的身份组（名字 + 颜色） */
  group?: UserGroup;
  achievements?: EarnedBadge[];
  /** 作者头像；空则用昵称首字 */
  avatar?: string;
  /** 正文图片的宽高表，用来算封面比例 */
  imageSizes?: PostImageSizes;
}) {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(item.likes);
  const href = item.href ?? '/';
  // 「个人」是早期发帖时写死的占位值，不是公会；空值与它都不展示
  const guildName = item.guild && item.guild !== '个人' ? item.guild : '';

  const text = markdownToText(item.body);
  // 正文里的第一张图当封面：站内图能拿尺寸与多档缩略图，外链图只按 3:2 占位
  const coverMatch = /!\[[^\]]*\]\((https?:\/\/[^\s)]+|\/api\/v1\/media\/[A-Za-z0-9]+)[^)]*\)/.exec(
    item.body,
  );
  const cover = coverMatch?.[1];
  const mediaId = cover?.startsWith('/api/v1/media/')
    ? cover.slice('/api/v1/media/'.length).split('?')[0]
    : undefined;
  const dim = mediaId ? imageSizes?.[mediaId] : undefined;
  const coverRatio = ratioOf(dim?.w, dim?.h);
  const coverSrc = mediaId ? `${cover}?w=640` : cover;

  const title = item.title?.trim() || text.slice(0, 40) || '无标题';
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
    <article className={`card feed-card${cover ? '' : ' feed-card-text'}`}>
      {cover && (
        <Link href={href} className="fc-cover" tabIndex={-1} aria-hidden="true">
          <SmartImage
            src={coverSrc ?? cover}
            alt=""
            ratio={coverRatio}
            sizes="(max-width: 860px) 100vw, (max-width: 1180px) 40vw, 410px"
          />
          {item.pinned && <span className="fc-pin">置顶</span>}
        </Link>
      )}

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

        {!cover && text && <p className="fc-excerpt">{text}</p>}

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

/**
 * 封面比例：拿不到尺寸时用 3:2；竖图最多裁成 5:4（再高会把一列拉得很长），
 * 横图最多 1.9:1，保证同一列里的封面不会差得太夸张。
 */
function ratioOf(w?: number, h?: number): string {
  if (!w || !h) return '3 / 2';
  const r = w / h;
  if (r > 1.9) return '1.9 / 1';
  if (r < 1.25) return '1.25 / 1';
  return `${w} / ${h}`;
}
