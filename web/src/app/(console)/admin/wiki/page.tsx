import Link from 'next/link';
import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminWiki } from '@/components/admin-wiki';
import { AdminWikiReview } from '@/components/admin-wiki-review';
import { apiGet } from '@/lib/api-client';
import type { WikiEntry } from '@/lib/wiki';
import { listCategories } from '@/lib/category-store';

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

  const [data, categories] = await Promise.all([
    apiGet<{ items: WikiEntry[] }>('/api/v1/admin/wiki').catch(() => ({
      items: [] as WikiEntry[],
    })),
    listCategories('wiki'),
  ]);

  return (
    <div className="col-main">
      <div className="between" style={{ alignItems: 'flex-end', gap: 10 }}>
        <div>
          <h1 className="page-title">百科</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            面向全站的说明文档；社区投稿先审核，通过后才会公开。
          </p>
        </div>
        <Link href="/admin/categories" className="btn btn-sm btn-ghost">
          管理分类
        </Link>
      </div>
      <AdminWikiReview categories={categories} />
      <div style={{ marginTop: 12 }}>
        <AdminWiki items={data.items} categories={categories} />
      </div>
    </div>
  );
}
