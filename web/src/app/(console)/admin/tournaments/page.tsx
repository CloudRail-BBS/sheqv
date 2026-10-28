import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminTournaments } from '@/components/admin-tournaments';

export const dynamic = 'force-dynamic';

export default async function AdminTournamentsPage() {
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
          <h1 className="page-title">赛事</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            创建赛事、设置报名窗口与名额；报名先待审核，通过后才占名额。
          </p>
        </div>
      </div>

      <AdminTournaments />
    </div>
  );
}
