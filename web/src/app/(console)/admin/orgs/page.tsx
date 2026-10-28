import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminOrgs } from '@/components/admin-orgs';

export const dynamic = 'force-dynamic';

export default async function AdminOrgsPage() {
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
      <h1 className="page-title">公会与战队</h1>
      <p className="small muted" style={{ marginTop: 4 }}>
        两个独立实体，两张分开的榜；这里校准积分与战绩（负责人不能自己改）。
      </p>

      <AdminOrgs />
    </div>
  );
}
