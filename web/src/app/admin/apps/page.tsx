import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminNav } from '@/components/admin-nav';
import { AdminApps } from '@/components/admin-apps';
import { listAllReleases } from '@/lib/app-store';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function AdminAppsPage() {
  const gate = await getAdminGate();
  if (!gate.ok) {
    return (
      <div className="col-main">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  const [releases, settings] = await Promise.all([listAllReleases(), getSettings()]);

  return (
    <div className="col-main">
      <h1 className="page-title">端管理</h1>
      <p className="small muted" style={{ marginTop: 4 }}>
        管理 Windows / macOS / Android 安装包版本、下载地址、强制更新与个推凭据。
      </p>
      <AdminNav />
      <AdminApps
        releases={releases}
        getui={{
          appId: settings.getuiAppId,
          appKey: settings.getuiAppKey,
          appSecret: settings.getuiAppSecret,
          masterSecret: settings.getuiMasterSecret,
        }}
      />
    </div>
  );
}
