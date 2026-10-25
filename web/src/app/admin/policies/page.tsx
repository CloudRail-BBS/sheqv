import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminNav } from '@/components/admin-nav';
import { AdminPolicies } from '@/components/admin-policies';
import { listAllPolicies } from '@/lib/policy-store';

export const dynamic = 'force-dynamic';

export default async function AdminPoliciesPage() {
  const gate = await getAdminGate();
  if (!gate.ok) {
    return (
      <div className="col-main">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  const items = await listAllPolicies();

  return (
    <div className="col-main">
      <h1 className="page-title">政策与协议</h1>
      <p className="small muted" style={{ marginTop: 4 }}>
        管理用户协议、免责声明、隐私政策等站内政策；证书底部会读取勾选了「证书声明」的政策。
      </p>
      <AdminNav />
      <AdminPolicies initial={items} />
    </div>
  );
}
