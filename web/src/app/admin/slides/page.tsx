import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminNav } from '@/components/admin-nav';
import { listSlides } from '@/lib/slide-store';
import { SlideAdmin } from '@/components/slide-admin';

export const dynamic = 'force-dynamic';

export default async function AdminSlidesPage() {
  const gate = await getAdminGate();
  if (!gate.ok) {
    return (
      <div className="col-main">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  const items = await listSlides();

  return (
    <div className="col-main">
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">首页轮播</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            每张可以设背景色或背景图；全部停用后首页不显示轮播，不会留空位。
          </p>
        </div>
        <span className="badge">{items.filter((s) => s.active).length} / {items.length} 展示中</span>
      </div>

      <AdminNav />

      <SlideAdmin items={items} />
    </div>
  );
}
