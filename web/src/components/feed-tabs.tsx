'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
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
  const barRef = useRef<HTMLDivElement | null>(null);
  /** 选中块的位置：跟着标签栏的实际排版量出来，不写死间距 */
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  /** 首帧不播动画，否则刚进页面会看到滑块从左滑过来 */
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const measure = () => {
      const active = bar.querySelector<HTMLButtonElement>('.feed-tab[data-on="true"]');
      if (!active) {
        setPill(null);
        return;
      }
      const a = active.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      // 绝对定位以 padding box 为基准，容器有 1px 边框时要减掉，否则差 1px
      setPill({ x: a.left - b.left - bar.clientLeft, w: a.width });
    };

    measure();
    // 字体加载、窗口缩放、侧栏收起都会改变宽度，统一重测
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [value]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  function go(next: FeedTab) {
    if (next === value) return;
    // 服务端重新取数期间把整条标签栏调暗一点，给出「正在切换」的反馈
    startTransition(() => {
      router.push(next === 'recommend' ? '/' : `/?tab=${next}`, { scroll: false });
    });
  }

  return (
    <div
      ref={barRef}
      className="feed-tabs"
      role="tablist"
      aria-label="信息流筛选"
      data-pending={pending || undefined}
      data-pill={pill ? 'true' : undefined}
    >
      {/* 选中块：位移动画，切换标签时滑过去而不是原地闪一下 */}
      <span
        className="feed-tab-pill"
        aria-hidden="true"
        data-ready={ready || undefined}
        style={pill ? { transform: `translateX(${pill.x}px)`, width: pill.w } : { opacity: 0 }}
      />
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
      <span className="sort">
        {/* 排序说明配一枚图标，别让它像句无关的灰字 */}
        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 5v14m0 0-3-3m3 3 3-3M17 19V5m0 0-3 3m3-3 3 3" />
        </svg>
        {current.hint}
      </span>
    </div>
  );
}
