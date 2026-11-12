'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export interface AnnouncementLite {
  id: string;
  title: string;
  /** 已本地化成中文：规则 / 版本 / 活动 / 系统 */
  kind: string;
}

const DISMISS_KEY = 'crbbs-ann-dismissed';

/**
 * 全站公告条：任何页面都能看到最新一条公告，点标题去详情，点 × 不再打扰。
 *
 * 关闭状态按公告 id 记在本地（最多留 20 条），所以：
 * 新公告发布 → 自动重新出现；同一条关掉后刷新也不会再弹。
 * 首帧先渲染服务端给的第一条，水合后再按本地记录决定是否隐藏。
 */
export function AnnouncementBar({ items }: { items: AnnouncementLite[] }) {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState<string[] | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      setDismissed(
        Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [],
      );
    } catch {
      setDismissed([]);
    }
  }, []);

  const current =
    dismissed === null ? items[0] : items.find((item) => !dismissed.includes(item.id));
  if (!current) return null;
  // 公告列表页本身不需要再挂一条
  if (pathname?.startsWith('/announcements')) return null;

  function dismiss() {
    const id = current!.id;
    const next = Array.from(new Set([...(dismissed ?? []), id])).slice(-20);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* 隐私模式下写不进去，本次会话仍然生效 */
    }
  }

  return (
    <div className="ann-bar">
      <div className="ann-bar-in">
        <span className="ann-bar-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="15" height="15">
            <path
              d="M4 10.5v3a1.5 1.5 0 0 0 1.5 1.5H7l4.5 3.5V6.5L7 10H5.5A1.5 1.5 0 0 0 4 11.5Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M15 9.5a3.5 3.5 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <span className="ann-bar-kind">{current.kind}</span>
        <Link
          href={`/announcements/${current.id}`}
          className="ann-bar-title"
          onClick={dismiss}
          title={current.title}
        >
          {current.title}
        </Link>
        <Link href="/announcements" className="ann-bar-more">
          全部公告
        </Link>
        <button type="button" className="ann-bar-close" aria-label="关闭公告提醒" onClick={dismiss}>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
