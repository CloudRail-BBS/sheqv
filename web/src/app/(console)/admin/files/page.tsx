import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminFiles } from '@/components/admin-files';

export const dynamic = 'force-dynamic';

export default async function AdminFilesPage() {
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
          <h1 className="page-title">文件管理</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            用户上传的头像、背景、正文图与资源附件。删除时连同对象存储里的原件一起清掉。
          </p>
        </div>
      </div>

      <AdminFiles />
    </div>
  );
}
