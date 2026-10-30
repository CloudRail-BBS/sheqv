'use client';

/**
 * 每条回复右上角的「回复」。点击只做两件事：
 * 1. 通过 `post:reply` 事件把引用前缀交给底部回复框；
 * 2. 滚到底部并聚焦（滚动放在事件之后，让布局先更新）。
 */
export function FloorReply({ author }: { author: string }) {
  function onClick() {
    window.dispatchEvent(new CustomEvent('post:reply', { detail: { author } }));
    document.getElementById('comment-form')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }

  return (
    <button type="button" className="floor-reply" onClick={onClick} aria-label={`回复 ${author}`}>
      回复
    </button>
  );
}
