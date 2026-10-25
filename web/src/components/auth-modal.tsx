import Link from 'next/link';
import type { ReactNode } from 'react';
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
  return (
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
}
