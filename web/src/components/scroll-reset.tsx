'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * 移动端滚动位置归零。
 *
 * 移动端把滚动从 `body` 挪到了 `.site-scroll`，Next 自带的滚动恢复只认 window，
 * 于是切页面后新页面会停在上一页的滚动位置。这里在路由变化时把容器滚回顶部。
 * 桌面端没有这个容器，`querySelector` 拿不到东西，什么也不做。
 */
export function ScrollReset() {
  const pathname = usePathname();

  useEffect(() => {
    const box = document.querySelector<HTMLElement>('.site-scroll');
    if (!box) return;
    box.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
}
