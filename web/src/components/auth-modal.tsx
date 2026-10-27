'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { SiteSettings } from '@/lib/settings';
import { BrandMark } from './brand-mark';

/** 登录 / 注册共用的小型悬浮卡片外壳 */
export function AuthModal({
  settings,
  title,
  desc,
  children,
  footer,
}: {
  settings: SiteSettings;
  title: string;
  desc?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const panel = (
    <div className="auth-modal-page">
      <div className="auth-modal-card">
        <div className="auth-modal-head">
          <Link href="/" className="auth-modal-brand">
            <BrandMark settings={settings} />
            <span>{settings.siteName}</span>
          </Link>
          <Link href="/" className="auth-modal-close" aria-label="关闭">
            ×
          </Link>
        </div>

        <h1 className="auth-modal-title">{title}</h1>
        {desc && <p className="auth-modal-desc">{desc}</p>}

        <div className="auth-modal-body">{children}</div>
        {footer && <div className="auth-modal-foot">{footer}</div>}
      </div>
    </div>
  );

  // 挂到 body：登录页在 .content 里，父级的入场动画会把它变成
  // position:fixed 的包含块，导致遮罩只盖住内容区、侧栏从底部漏出来。
  return mounted ? createPortal(panel, document.body) : panel;
}
