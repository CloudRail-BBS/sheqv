import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminAbout } from '@/components/admin-about';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function AdminAboutPage() {
  const gate = await getAdminGate();
  if (!gate.ok) {
    return (
      <div className="col-main">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  const settings = await getSettings();

  return (
    <div className="col-main">
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">关于社区</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            这里配置的内容会出现在「关于社区」页：站点介绍、社区成员与合作单位。
          </p>
        </div>
      </div>

      <AdminAbout intro={settings.aboutIntro ?? ''} join={settings.aboutJoin ?? ''} />
    </div>
  );
}
