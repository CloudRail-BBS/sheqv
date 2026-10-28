import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminAppearance } from '@/components/admin-appearance';

export const dynamic = 'force-dynamic';

export default async function AdminAppearancePage() {
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
          <h1 className="page-title">外观样式</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            头衔与徽章的配色和动效。身份组的外观在「身份组」页面里随颜色一起配置。
          </p>
        </div>
      </div>

      <AdminAppearance />
    </div>
  );
}
