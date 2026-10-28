import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminAudit } from '@/components/admin-audit';

export const dynamic = 'force-dynamic';

export default async function AdminAuditPage() {
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
      <h1 className="page-title">内容审核</h1>
      <p className="small muted" style={{ marginTop: 4 }}>
        审核策略在「设置 → 内容审核」里调整；这里处理等待人工判断的内容。
      </p>

      <AdminAudit />
    </div>
  );
}
