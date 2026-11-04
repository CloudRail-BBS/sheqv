'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FEED_TABS, type FeedTab } from '@/lib/feed-types';

const TABS = FEED_TABS;

/**
 * 标签切换走路由而不是本地 state：
 * 「关注」「我参与的」需要按当前登录用户查库，只有服务端拿得到。
 */
export function FeedTabs({ value, loggedIn }: { value: FeedTab; loggedIn: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = TABS.find((t) => t.key === value) ?? TABS[0];

  function go(next: FeedTab) {
    if (next === value) return;
    // 服务端重新取数期间把整条标签栏调暗一点，给出「正在切换」的反馈
    startTransition(() => {
      router.push(next === 'recommend' ? '/' : `/?tab=${next}`, { scroll: false });
    });
  }

  return (
    <div className="feed-tabs" role="tablist" aria-label="信息流筛选" data-pending={pending || undefined}>
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          className="feed-tab"
          data-on={t.key === value ? 'true' : undefined}
          aria-selected={t.key === value}
          title={!loggedIn && (t.key === 'following' || t.key === 'joined') ? '登录后可用' : t.hint}
          onClick={() => go(t.key)}
        >
          {t.label}
        </button>
      ))}
      <span className="sort">{current.hint}</span>
    </div>
  );
}
