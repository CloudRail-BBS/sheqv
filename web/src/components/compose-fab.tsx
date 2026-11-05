'use client';

import { usePathname, useRouter } from 'next/navigation';

/**
 * 手机端的发帖入口。
 *
 * 桌面版首页里有一张「说点什么…」的卡片；手机上它占了首屏最好的一段位置，
 * 所以改成右下角的悬浮按钮——内容先出现，动作随时可用。
 *
 * 逻辑与顶栏的 ComposerTrigger 一致：未登录去登录、未签公约去签，否则打开发帖面板。
 */
export function ComposeFab({ loggedIn, signed }: { loggedIn: boolean; signed: boolean }) {
  const router = useRouter();
  const pathname = usePathname();

  function open() {
    if (!loggedIn) {
      router.push('/login');
      return;
    }
    if (!signed) {
      router.push('/agreements');
      return;
    }
    if (pathname === '/') {
      window.dispatchEvent(new Event('open-composer'));
      return;
    }
    router.push('/#compose');
  }

  return (
    <button type="button" className="compose-fab" onClick={open} aria-label="发帖">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <path
          d="M12 5v14M5 12h14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
