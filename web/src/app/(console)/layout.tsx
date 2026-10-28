import type { Metadata } from 'next';
import Link from 'next/link';
import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { getSettings } from '@/lib/settings';
import { BrandMark } from '@/components/brand-mark';
import { ConsoleNav } from '@/components/console-nav';
import { ConsoleTopbar } from '@/components/console-topbar';

/**
 * 后台外壳：**不继承前台布局**。
 *
 * 路由组 `(console)` 与 `(site)` 平级，后台没有前台顶栏 / 侧栏 / 页脚 / 底部栏，
 * 也就不会被前台的 sticky 顶栏和 tabbar 挤压。鉴权在这里做一次，
 * 各页面自己仍会再取一次 gate（页面里还要用 user 信息）。
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '控制台',
  robots: { index: false, follow: false, nocache: true },
};

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const [gate, settings] = await Promise.all([getAdminGate(), getSettings()]);

  if (!gate.ok) {
    return (
      <div className="console-denied">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  return (
    <div className="console">
      <aside className="console-side">
        <Link href="/admin" className="console-brand">
          <BrandMark settings={settings} />
          <span>
            <b>{settings.siteName}</b>
            <em>控制台</em>
          </span>
        </Link>

        <ConsoleNav />

        <div className="console-side-foot">
          <Link href="/" className="console-side-link">
            返回前台
          </Link>
          <span className="console-ver">v0.1</span>
        </div>
      </aside>

      <div className="console-body">
        <ConsoleTopbar nickname={gate.user?.nickname ?? '管理员'} />
        <main className="console-main">{children}</main>
      </div>
    </div>
  );
}
