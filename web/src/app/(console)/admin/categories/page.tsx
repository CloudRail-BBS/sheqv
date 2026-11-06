import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminCategories } from '@/components/admin-categories';

export const dynamic = 'force-dynamic';

export default async function AdminCategoriesPage() {
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
      <div>
        <h1 className="page-title">分类</h1>
        <p className="small muted" style={{ marginTop: 4, lineHeight: 1.7 }}>
          百科与资源库的分类都在这里维护：前台筛选项、投稿与上传表单会立刻跟着变。
          改名字不会动已有内容；删除时如果还有内容在用，会让你先选一个分类把它们移过去。
        </p>
      </div>

      <AdminCategories />
    </div>
  );
}
