import Link from 'next/link';
import { listAgreements } from '@/lib/agreement-store';
import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AgreementAdmin } from '@/components/agreement-admin';

export const dynamic = 'force-dynamic';

export default async function AdminAgreementsPage() {
  const gate = await getAdminGate();
  if (!gate.ok) {
    return (
      <div className="col-main">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  const items = await listAgreements();

  return (
    <div className="col-main">
      <div className="crumb">
        <Link href="/admin">管理后台</Link>
        <span style={{ margin: '0 7px' }}>/</span>
        <span>公约管理</span>
      </div>

      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">公约管理</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            新增的公约会立即出现在 <Link href="/agreements" style={{ color: 'var(--blue)' }}>/agreements</Link> 与「我的」；
            内置的两份不可改，只能新增与停用。
          </p>
        </div>
        <span className="badge">cap.admin.console</span>
      </div>

      <div className="hint-box">
        发布新版本（例如 v1 → v2）会让已签署用户回到未签状态，需要重新确认；
        停用后不再展示，历史签名保留。
      </div>

      <AgreementAdmin items={items} />
    </div>
  );
}
