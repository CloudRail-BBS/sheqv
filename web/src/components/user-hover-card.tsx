'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { initialOf } from '@/lib/initials';
import { createPortal } from 'react-dom';
import type { BadgeInfo } from '@/lib/badges';
import type { PublicUser, UserGroup } from '@/lib/users';
import { NameBadges } from './name-badges';

/**
 * 作者悬停卡片：鼠标停留 180ms 后展示公开资料。
 *
 * 列表已经批量带了头像/徽标/身份组时直接显示；缺资料时再按 id 拉一次
 * `/api/v1/users/{id}`，并做模块级缓存，避免反复请求。
 */

interface Props {
  userId?: string;
  name: string;
  avatar?: string;
  badge?: BadgeInfo;
  group?: UserGroup;
  children: React.ReactNode;
}

const cache = new Map<string, Promise<PublicUser | null>>();

function loadProfile(id: string): Promise<PublicUser | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  const req = fetch(`/api/v1/users/${encodeURIComponent(id)}`, { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) return null;
      const data = (await res.json()) as { user?: PublicUser };
      return data.user ?? null;
    })
    .catch(() => null);
  cache.set(id, req);
  return req;
}

function joinDate(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function UserHoverCard({ userId, name, avatar, badge, group, children }: Props) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [profile, setProfile] = useState<PublicUser | null>(null);
  /** 请求结束（无论成败）。失败时隐藏统计块，而不是留三个破折号 */
  const [tried, setTried] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || !userId || profile) return;
    let alive = true;
    void loadProfile(userId).then((p) => {
      if (!alive) return;
      setProfile(p);
      setTried(true);
    });
    return () => {
      alive = false;
    };
  }, [open, userId, profile]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  function show() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = 286;
      const maxLeft = Math.max(8, window.innerWidth - width - 8);
      const left = Math.min(Math.max(r.left, 8), maxLeft);
      const above = r.bottom + 210 > window.innerHeight;
      const top = above ? Math.max(r.top - 190, 8) : r.bottom + 8;
      setPos({ left, top });
      setOpen(true);
    }, 180);
  }

  function hide() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 140);
  }

  function keep() {
    if (timer.current) clearTimeout(timer.current);
  }

  const shown = profile;
  const shownName = shown?.nickname || name;
  const shownAvatar = shown?.avatar || avatar;
  const shownGroup = shown?.group || group;
  const joined = joinDate(shown?.createdAt);
  // 只有「有 id」才谈得上统计；加载中先占位，拉不到就整块隐藏
  const showStats = Boolean(userId) && (!tried || Boolean(shown?.stats));

  return (
    <>
      <span
        ref={triggerRef}
        className="uhc-trigger"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={cardRef}
            className="user-hover-card"
            style={{ left: pos.left, top: pos.top }}
            onMouseEnter={keep}
            onMouseLeave={hide}
          >
            <div className="uhc-head">
              <span className="uhc-avatar">
                {shownAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shownAvatar} alt="" loading="lazy" decoding="async" />
                ) : (
                  initialOf(shownName)
                )}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="uhc-name">
                  {shownName}
                  <NameBadges badge={badge} group={shownGroup} size="sm" />
                </div>
                <div className="uhc-handle">@{shown?.username || 'user'}</div>
              </div>
            </div>

            {/* 参考论坛名片：三个数字比一串标签更快建立印象。
                没拉到资料时不渲染，留三个破折号比不显示更像坏了。 */}
            {showStats && (
              <div className="uhc-stats">
                <div>
                  <b>{shown?.stats ? shown.stats.posts : '–'}</b>
                  <span>主题</span>
                </div>
                <div>
                  <b>{shown?.stats ? shown.stats.comments : '–'}</b>
                  <span>回帖</span>
                </div>
                <div>
                  <b>{shown?.stats ? shown.stats.points : '–'}</b>
                  <span>积分</span>
                </div>
              </div>
            )}

            {(shownGroup || shown?.developer || shown?.title) && (
              <div className="uhc-tags">
                {shown?.developer && <span className="dev-chip">开发者</span>}
                {shown?.title && <span className="badge badge-ghost">{shown.title}</span>}
              </div>
            )}

            {joined && <div className="uhc-meta">加入于 {joined}</div>}
            {!userId && <div className="uhc-meta">站内用户</div>}

            {userId && (
              <Link href={`/messages?to=${encodeURIComponent(userId)}`} className="uhc-action">
                发送消息
              </Link>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
