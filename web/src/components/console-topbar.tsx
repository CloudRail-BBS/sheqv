'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './theme-toggle';
import { ConsoleDrawer, consoleTitle } from './console-nav';
import { PushToggle } from './push-toggle';

/**
 * 后台顶栏：汉堡（移动端）+ 面包屑 + 快捷动作。
 *
 * 与前台顶栏刻意做得不一样——这里没有搜索框、积分、站内信，
 * 只保留「回到前台 / 推送开关 / 明暗」三件事，避免误操作。
 */
export function ConsoleTopbar({ nickname }: { nickname: string }) {
  const pathname = usePathname();
  const title = consoleTitle(pathname);

  return (
    <header className="console-topbar">
      <ConsoleDrawer />
      <div className="console-crumb">
        <Link href="/admin" className="console-crumb-root">
          控制台
        </Link>
        <span className="console-crumb-sep">/</span>
        <b>{title}</b>
      </div>

      <div className="console-top-actions">
        <PushToggle />
        <ThemeToggle />
        <Link href="/" className="btn btn-sm btn-ghost hide-mobile">
          返回前台
        </Link>
        <span className="console-user hide-mobile" title={nickname}>
          {nickname.slice(0, 1)}
        </span>
      </div>
    </header>
  );
}
