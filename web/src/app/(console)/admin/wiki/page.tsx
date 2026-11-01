import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminWiki } from '@/components/admin-wiki';
import { apiGet } from '@/lib/api-client';
import type { WikiEntry } from '@/lib/wiki';

export const dynamic = 'force-dynamic';

export default async function AdminWikiPage() {
  const gate = await getAdminGate();
  if (!gate.ok) {
    return (
      <div className="col-main">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  const data = await apiGet<{ items: WikiEntry[] }>('/api/v1/admin/wiki').catch(() => ({
    items: [] as WikiEntry[],
  }));

  return (
    <div className="col-main">
      <h1 className="page-title">百科</h1>
      <p className="small muted" style={{ marginTop: 4 }}>
        维护面向全站的说明文档；草稿只在后台可见。
      </p>
      <div style={{ marginTop: 12 }}>
        <AdminWiki items={data.items} />
      </div>
    </div>
  );
}
