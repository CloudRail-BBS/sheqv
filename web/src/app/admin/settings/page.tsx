import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminNav } from '@/components/admin-nav';
import { getOverrides, getSettings } from '@/lib/settings';
import { config } from '@/lib/config';
import { getBaseUrl } from '@/lib/base-url';
import { SettingsForm } from '@/components/settings-form';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const gate = await getAdminGate();
  if (!gate.ok) {
    return (
      <div className="col-main">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  const [settings, overrides, effectiveBaseUrl] = await Promise.all([
    getSettings(),
    getOverrides(),
    getBaseUrl(),
  ]);

  return (
    <div className="col-main">
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">站点设置</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            这些项原本要改 <code>.env</code> 再重启，现在改完立即生效；环境变量仍作为默认值。
          </p>
        </div>
      </div>

      <AdminNav />

      <SettingsForm
        settings={settings}
        overrides={overrides}
        runtime={{ effectiveBaseUrl, dataDir: config.dataDir, port: process.env.PORT || '8900' }}
      />
    </div>
  );
}
