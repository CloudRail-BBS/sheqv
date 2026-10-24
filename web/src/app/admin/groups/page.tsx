import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminNav } from '@/components/admin-nav';
import { AdminGroups } from '@/components/admin-groups';

export const dynamic = 'force-dynamic';

export default async function AdminGroupsPage() {
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
      <h1 className="page-title">身份组</h1>
      <p className="small muted" style={{ marginTop: 4 }}>
        每个身份组独立配置权限与「进组前必须签署的公约」。内置的成员 / 管理员组不能删除。
      </p>

      <AdminNav />

      <AdminGroups />
    </div>
  );
}
