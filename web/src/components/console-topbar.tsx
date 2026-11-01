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
export function ConsoleTopbar({
  nickname,
  todoCount = 0,
  badges,
}: {
  nickname: string;
  /** 未完成待办数，0 时不显示 */
  todoCount?: number;
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const title = consoleTitle(pathname);

  return (
    <header className="console-topbar">
      <ConsoleDrawer badges={badges} />
      <div className="console-crumb">
        <Link href="/admin" className="console-crumb-root">
          控制台
        </Link>
        <span className="console-crumb-sep">/</span>
        <b>{title}</b>
      </div>

      <div className="console-top-actions">
        {todoCount > 0 && (
          <Link href="/admin#todo" className="console-todo" title="未完成的待办">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 7h3l2 2 3-4M13 8h7M4 16h3l2 2 3-4M13 17h7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <b>{todoCount}</b>
          </Link>
        )}
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
