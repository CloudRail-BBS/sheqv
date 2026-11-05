import type { Metadata } from 'next';
import Link from 'next/link';
import { getOpsGate } from '@/lib/ops-auth';
import { getOpsSummary } from '@/lib/ops-store';
import { OpsNav } from '@/components/ops-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { getSettings } from '@/lib/settings';
import { BrandMark } from '@/components/brand-mark';

/**
 * 运营面板外壳。
 *
 * 与 `(console)` 平级，不继承前台布局；判权只看身份组里的 `ops.console`。
 * 结构比后台轻：一条顶栏 + 一排横向标签，没有侧栏与抽屉。
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '运营面板',
  robots: { index: false, follow: false, nocache: true },
};

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const [gate, settings] = await Promise.all([getOpsGate(), getSettings()]);

  if (!gate.ok) {
    return (
      <div className="ops ops-denied-wrap">
        <div className="card card-pad ops-denied">
          <h1 className="page-title" style={{ fontSize: 19 }}>
            {gate.user ? '403 · 没有运营权限' : '运营面板需要登录'}
          </h1>
          <p className="small muted" style={{ marginTop: 8, lineHeight: 1.8 }}>
            {gate.user ? (
              <>
                你正以 <b>{gate.user.nickname}</b> 的身份登录，但所在身份组没有勾选
                「进入运营面板」。请让管理员在「后台 → 身份组」里打开这个权限。
              </>
            ) : (
              <>登录后，如果你的身份组带有运营权限，就能进入这里审核帖子、认证与头衔。</>
            )}
          </p>
          <div className="row" style={{ gap: 8, marginTop: 16 }}>
            <Link href={gate.user ? '/' : '/login'} className="btn btn-primary" style={{ flex: 1 }}>
              {gate.user ? '返回社区' : '去登录'}
            </Link>
            {!gate.user && (
              <Link href="/register" className="btn" style={{ flex: 1 }}>
                注册
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  const summary = await getOpsSummary();
  const badges: Record<string, number> = {};
  for (const q of summary.queues) {
    if (q.count > 0) badges[q.key] = q.count;
  }

  return (
    <div className="ops">
      <header className="ops-topbar">
        <div className="ops-topbar-in">
          <Link href="/ops" className="ops-brand">
            <BrandMark settings={settings} />
            <span>
              <b>{settings.siteName}</b>
              <em>运营面板</em>
            </span>
          </Link>

          <div className="ops-top-actions">
            <ThemeToggle />
            <Link href="/" className="btn btn-sm btn-ghost">
              返回前台
            </Link>
            <span className="ops-user" title={gate.user?.nickname ?? ''}>
              {gate.user?.nickname?.slice(0, 1) ?? '运'}
            </span>
          </div>
        </div>
        <div className="ops-tabs-in">
          <OpsNav badges={badges} />
        </div>
      </header>

      <main className="ops-main">{children}</main>
    </div>
  );
}
