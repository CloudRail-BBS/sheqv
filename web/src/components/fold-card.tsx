'use client';

import { useId, useState, type ReactNode } from 'react';

/**
 * 侧栏说明卡：桌面是一张普通卡片，手机上折成一行。
 *
 * 为什么需要它：手机端 `.cols` 变成单列后，右侧栏整体落到正文之后，
 * 几张说明卡加起来就是一两屏的「纯文字尾巴」。折叠后页面底部只剩
 * 几行标题，想看的再展开。
 *
 * 默认态刻意不做成 open 再在客户端收起——那样首屏会闪一下，
 * 直接用 `data-open` + CSS 决定：手机上默认收起，桌面端 CSS 忽略这个标记。
 *
 * 标题写两份：桌面是普通的 `.rail-title`，手机才是可点的按钮。
 * 这样桌面上不会出现一个「说的是收起、内容却全都在」的按钮，
 * 键盘和读屏用户也不会撞上一个点了没反应的控件。
 */
export function FoldCard({
  title,
  children,
  className = '',
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <div className={`card rail-card fold-card ${className}`.trim()} data-open={open ? 'true' : 'false'}>
      <div className="rail-title fold-static">{title}</div>
      <button
        type="button"
        className="rail-title fold-head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="fold-label">{title}</span>
        <span className="fold-hint" aria-hidden="true">
          {open ? '收起' : '展开'}
        </span>
        <svg className="fold-chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="m6 9.5 6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div className="fold-body" id={bodyId}>
        {children}
      </div>
    </div>
  );
}
