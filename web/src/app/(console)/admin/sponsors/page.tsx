import Link from 'next/link';
import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { getSnapshot, formatAmount } from '@/lib/sponsor-store';
import { afdianConfigured, afdianPageUrl } from '@/lib/afdian';
import { SponsorAdmin } from '@/components/sponsor-admin';

export const dynamic = 'force-dynamic';

export default async function AdminSponsorsPage() {
  const gate = await getAdminGate();
  if (!gate.ok) {
    return (
      <div className="col-main">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  const snap = await getSnapshot(true);
  const visible = snap.sponsors.filter((s) => !s.hidden).length;
  const [configured, pageUrl] = await Promise.all([afdianConfigured(), afdianPageUrl()]);

  return (
    <div className="col-main">
      <div className="crumb">
        <Link href="/admin">管理后台</Link>
        <span style={{ margin: '0 7px' }}>/</span>
        <span>赞助管理</span>
      </div>

      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">赞助管理</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            同步爱发电赞助名单、手动补录线下支持、隐藏需要匿名的赞助者。
          </p>
        </div>
        <span className="badge badge-live">
          {visible} / {snap.count} 展示中 · ¥{formatAmount(snap.totalAmount)}
        </span>
      </div>

      <div className="hint-box" style={{ marginTop: 12 }}>
        公开页 <Link href="/sponsors" style={{ color: 'var(--blue)' }}>/sponsors</Link>
        展示的是最近一次同步的结果，点「同步爱发电」即可拉取最新名单。
      </div>

      <div style={{ marginTop: 12 }}>
        <SponsorAdmin
          items={snap.sponsors}
          configured={configured}
          syncedAt={snap.syncedAt}
          pageUrl={pageUrl}
        />
      </div>
    </div>
  );
}
