'use client';

import { useEffect, useState } from 'react';

/**
 * 帖子底部的「写回复」悬浮条（只在手机上出现，CSS 控制）。
 *
 * 真实的回复框在页面底部，长帖要滚很久才看得到；这条悬浮条让人随时能回。
 * 回复框一旦进入视口就自动隐藏，避免和输入框叠在一起。
 */
export function ReplyDock() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const form = document.getElementById('comment-form');
    if (!form) return;
    const io = new IntersectionObserver(
      (entries) => setShow(!entries[0].isIntersecting),
      // 上边让开顶栏，下边不缩：评论框只要露出来一点点，这条就收起。
      // 之前底部缩了 140px，输入框已经贴在屏幕下沿时它还浮在上面，
      // 看起来像回复区凭空多了一行。
      { rootMargin: '-96px 0px 0px 0px', threshold: 0 },
    );
    io.observe(form);
    return () => io.disconnect();
  }, []);

  function write() {
    const form = document.getElementById('comment-form');
    if (!form) return;
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // 等滚动结束再聚焦，否则移动端键盘弹出会把位置顶乱
    window.setTimeout(() => {
      form.querySelector('textarea')?.focus({ preventScroll: true });
    }, 380);
  }

  return (
    <div className="reply-dock" data-show={show}>
      <span className="reply-dock-text">写下你的回复…</span>
      <button type="button" className="reply-dock-go" onClick={write}>
        回复
      </button>
    </div>
  );
}
