import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminTickets } from '@/components/admin-tickets';

export const dynamic = 'force-dynamic';

export default async function AdminTicketsPage() {
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
          <h1 className="page-title">工单</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            用户提交的问题与申诉。回复会发站内信；处理完记得关闭。
          </p>
        </div>
      </div>

      <AdminTickets />
    </div>
  );
}
