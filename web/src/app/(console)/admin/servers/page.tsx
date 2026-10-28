import Link from 'next/link';
import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminServers } from '@/components/admin-servers';

export const dynamic = 'force-dynamic';

export default async function AdminServersPage() {
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
          <h1 className="page-title">联机大厅</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            用户自由上传的服务器与中转站；隐藏不影响数据，删除需要用户重新上传。
          </p>
        </div>
        <Link href="/servers" className="btn btn-sm btn-ghost">
          看前台大厅
        </Link>
      </div>

      <AdminServers />
    </div>
  );
}
