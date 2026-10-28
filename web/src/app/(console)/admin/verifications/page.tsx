import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminVerifications } from '@/components/admin-verifications';

export const dynamic = 'force-dynamic';

export default async function AdminVerificationsPage() {
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
          <h1 className="page-title">认证申请</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            蓝标给个人、红标给机构。通过时能改类型与对外说明，通过后名字后面会挂一枚印记。
          </p>
        </div>
      </div>

      <AdminVerifications />
    </div>
  );
}
