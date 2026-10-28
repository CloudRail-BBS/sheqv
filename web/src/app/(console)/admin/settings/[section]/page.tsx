import { notFound } from 'next/navigation';
import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { SettingsForm } from '@/components/settings-form';
import { getOverrides, getSettings } from '@/lib/settings';
import { findSettingsSection } from '@/lib/settings-sections';
import { config } from '@/lib/config';
import { getBaseUrl } from '@/lib/base-url';

export const dynamic = 'force-dynamic';

/**
 * 站点设置分区页。
 *
 * 分区之间靠后台侧栏切换（每个分区都是侧栏里的一级项），
 * 页面里不再放第二条导航，内容区只留这一个分区的表单。
 */
export default async function AdminSettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const meta = findSettingsSection(section);
  if (!meta) notFound();

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
          <h1 className="page-title">{meta.label}</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            {meta.desc}
          </p>
        </div>
      </div>

      <div className="settings-main">
        <SettingsForm
          section={meta.key}
          settings={settings}
          overrides={overrides}
          runtime={{ effectiveBaseUrl, dataDir: config.dataDir, port: process.env.PORT || '8900' }}
        />
      </div>
    </div>
  );
}
