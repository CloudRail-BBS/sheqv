import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminPoints } from '@/components/admin-points';

export const dynamic = 'force-dynamic';

export default async function AdminPointsPage() {
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
          <h1 className="page-title">积分</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            查看余额与流水、手动加减分。删除内容时的冲正由系统自动完成。
          </p>
        </div>
      </div>

      <AdminPoints />
    </div>
  );
}
