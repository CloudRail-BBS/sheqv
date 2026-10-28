import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminPush } from '@/components/admin-push';
import { PushToggle } from '@/components/push-toggle';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function AdminPushPage() {
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
          <h1 className="page-title">网页推送</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            用户开启通知后，即使没打开页面也能收到公告与审核提醒。
            iOS 需要先把本站添加到主屏幕。
          </p>
        </div>
        <span className="badge badge-live">VAPID + aes128gcm</span>
      </div>

      <PushToggle variant="wide" />

      <AdminPush pushAnnounce={settings.pushAnnounce} />
    </div>
  );
}
