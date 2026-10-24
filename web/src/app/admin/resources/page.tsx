import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminNav } from '@/components/admin-nav';
import { AdminResources } from '@/components/admin-resources';

export const dynamic = 'force-dynamic';

export default async function AdminResourcesPage() {
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
      <h1 className="page-title">资源</h1>
      <p className="small muted" style={{ marginTop: 4 }}>
        资源不做预审，发布即展示；违规内容在这里下架，下架后前台 404，作者仍可见。
      </p>

      <AdminNav />
      <AdminResources />
    </div>
  );
}
