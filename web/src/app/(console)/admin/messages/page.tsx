import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminMessages } from '@/components/admin-messages';

export const dynamic = 'force-dynamic';

export default async function AdminMessagesPage() {
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
          <h1 className="page-title">系统消息</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            给单个用户或全站发站内信。用户在铃铛与通知页里能看到，也会计入未读。
          </p>
        </div>
      </div>

      <AdminMessages />
    </div>
  );
}
