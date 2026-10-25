'use client';

import { usePathname, useRouter } from 'next/navigation';

/**
 * 顶栏「发帖」按钮。
 *
 * 在首页直接派发事件打开弹窗；在其他页面带着 #compose 回首页，
 * Composer 挂载后自动打开。未登录/未签公约先去对应页面。
 */
export function ComposerTrigger({
  loggedIn,
  signed,
  className = 'btn btn-primary btn-sm hide-mobile',
}: {
  loggedIn: boolean;
  signed: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

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
      document.getElementById('composer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.dispatchEvent(new Event('open-composer'));
      return;
    }
    router.push('/#compose');
  }

  return (
    <button type="button" className={className} onClick={open}>
      发帖
    </button>
  );
}
