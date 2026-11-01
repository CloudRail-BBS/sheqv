'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Geetest, type CaptchaPayload } from './geetest';

/**
 * 弹窗式人机验证。
 *
 * 提交时发现还没有票据就把它打开，验证层自动弹出（`Geetest auto`），
 * 通过后回调票据并自动继续提交 —— 页面上不再单独摆一个「点击完成验证」按钮。
 */
export function CaptchaDialog({
  open,
  captchaId,
  onDone,
  onCancel,
}: {
  open: boolean;
  captchaId: string;
  onDone: (payload: CaptchaPayload) => void;
  onCancel: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onCancel]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="composer-modal" role="dialog" aria-modal="true" aria-label="人机验证">
      <button type="button" className="composer-backdrop" aria-label="关闭" onClick={onCancel} />
      <div
        className="composer-panel org-modal"
        style={{ width: 'min(420px, 92vw)', padding: '18px 20px 20px' }}
      >
        <div className="composer-panel-head" style={{ marginBottom: 6 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <b className="composer-head-title">先完成人机验证</b>
            <div className="composer-head-sub">通过后会自动继续提交，不需要再点一次</div>
          </div>
          <button type="button" className="composer-icon-btn" aria-label="关闭" onClick={onCancel}>
            ×
          </button>
        </div>
        <Geetest captchaId={captchaId} onChange={(p) => p && onDone(p)} resetKey={0} auto />
      </div>
    </div>,
    document.body,
  );
}
