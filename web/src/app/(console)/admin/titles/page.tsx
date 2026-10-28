import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminTitles } from '@/components/admin-titles';

export const dynamic = 'force-dynamic';

export default async function AdminTitlesPage() {
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
          <h1 className="page-title">头衔申请</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            用户提交的展示头衔。通过时可以改文案、样式与特效，通过后立即生效。
          </p>
        </div>
      </div>

      <AdminTitles />
    </div>
  );
}
