import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminNav } from '@/components/admin-nav';
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
        审核策略在「设置 → 内容审核」里切换：关闭 / AI 预审 / 全部人工。AI 调用失败时一律转人工，不会直接放行。
      </p>

      <AdminNav />

      <AdminAudit />
    </div>
  );
}
