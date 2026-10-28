import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
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
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">更新日志</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            发布后会出现在前台 /changelog。正文一行一条要点，标签决定要点前面的颜色。
          </p>
        </div>
      </div>

      <AdminChangelog />
    </div>
  );
}
