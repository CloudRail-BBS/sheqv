import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminWiki } from '@/components/admin-wiki';
import { AdminWikiReview } from '@/components/admin-wiki-review';
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
        面向全站的说明文档；社区投稿先审核，通过后才会公开。
      </p>
      <AdminWikiReview />
      <div style={{ marginTop: 12 }}>
        <AdminWiki items={data.items} />
      </div>
    </div>
  );
}
