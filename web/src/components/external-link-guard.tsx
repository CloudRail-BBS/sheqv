'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 外链跳转提示。
 *
 * 全站只挂这一个：捕获阶段拦下所有 `a[href^=http]`，同站放行，
 * 外站先弹一层「即将离开」—— 说明目标域名、给出风险提示，用户确认后再新开标签页。
 *
 * 几个刻意不拦的情况：
 * - 按着 Ctrl / ⌘ / Shift / Alt 点（用户明确想新开标签页）；
 * - 中键、右键（交给浏览器默认行为）；
 * - `download` 链接（本站的下载走同源 /api，这里是兜底）；
 * - 带 `data-no-guard` 的链接（弹窗内的「继续前往」自己）。
 *
 * 只做提示，不做白名单：任何外站都提示一次，避免「看起来像站内」的钓鱼链接。
 */
export function ExternalLinkGuard() {
  const [target, setTarget] = useState<{ href: string; host: string } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      // 修饰键点击 = 用户自己去开新标签页，别打断
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      if (anchor.dataset.noGuard !== undefined) return;
      if (anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href') ?? '';
      if (!/^https?:\/\//i.test(href)) return;

      let url: URL;
      try {
        url = new URL(href);
      } catch {
        return;
      }
      if (url.hostname === window.location.hostname) return;

      e.preventDefault();
      setTarget({ href: url.href, host: url.hostname });
    }

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTarget(null);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [target]);

  if (!mounted || !target) return null;

  return createPortal(
    <div className="modal-mask ext-mask" role="presentation" onClick={() => setTarget(null)}>
      <div
        className="modal ext-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ext-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ext-head">
          <span className="ext-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="ext-title-wrap">
            <h2 id="ext-title">即将离开云轨社区</h2>
            <p className="small muted">
              目标站点 <b className="mono">{target.host}</b> 不是本站
            </p>
          </div>
        </div>

        <p className="ext-warn">
          外链页面不受本站管理。请不要在陌生页面输入本站的账号、密码或验证码；
          遇到要求转账、下载可执行文件、扫码登录的，先确认来源再操作。
        </p>

        <p className="mono ext-url">{target.href}</p>

        <div className="ext-foot">
          <button type="button" className="btn btn-ghost" onClick={() => setTarget(null)} autoFocus>
            留在这里
          </button>
          <a
            className="btn btn-primary"
            href={target.href}
            target="_blank"
            rel="noopener noreferrer"
            data-no-guard="true"
            onClick={() => setTarget(null)}
          >
            继续前往
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}
