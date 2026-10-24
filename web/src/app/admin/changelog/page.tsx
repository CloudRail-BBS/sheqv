import Link from 'next/link';
import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminNav } from '@/components/admin-nav';
import { AdminChangelog } from '@/components/admin-changelog';

export const dynamic = 'force-dynamic';

export default async function AdminChangelogPage() {
  const gate = await getAdminGate();
  if (!gate.ok) {
    return (
      <div className="col-main">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  return (
    <div className="col-main">
      <h1 className="page-title">更新日志</h1>
      <p className="small muted" style={{ marginTop: 4 }}>
        发布后出现在 <Link href="/changelog" style={{ color: 'var(--blue)' }}>/changelog</Link>；草稿只有管理员可见。
      </p>

      <AdminNav />

      <AdminChangelog />
    </div>
  );
}
