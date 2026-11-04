'use client';

import type { ReactNode } from 'react';

/**
 * 切标签时给列表一个淡入上移的过渡。
 *
 * 用 `key={tab}` 让它在换标签时重新挂载，CSS 动画就会重播；
 * 动画只在入场，不加 `fill-mode`，免得动画结束后留下 stacking context
 * 把页面里的 fixed 弹窗关在这一层（之前踩过）。
 */
export function FeedFade({ children }: { children: ReactNode }) {
  return <div className="feed-fade">{children}</div>;
}
