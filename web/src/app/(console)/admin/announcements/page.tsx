import Link from 'next/link';
import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { listAnnouncements } from '@/lib/announcement-store';
import { AnnouncementAdmin } from '@/components/announcement-admin';

export const dynamic = 'force-dynamic';

export default async function AdminAnnouncementsPage() {
  const gate = await getAdminGate();
  if (!gate.ok) {
    return (
      <div className="col-main">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  const items = await listAnnouncements();

  return (
    <div className="col-main">
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">公告</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            发布后立即出现在 <Link href="/announcements" style={{ color: 'var(--blue)' }}>/announcements</Link>
            ，草稿只有管理员可见。
          </p>
        </div>
        <span className="badge">{items.length} 条</span>
      </div>

      <AnnouncementAdmin items={items} />
    </div>
  );
}
