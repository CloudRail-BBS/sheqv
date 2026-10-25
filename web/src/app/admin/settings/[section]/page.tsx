import { notFound } from 'next/navigation';
import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminNav } from '@/components/admin-nav';
import { SettingsNav } from '@/components/settings-nav';
import { SettingsForm } from '@/components/settings-form';
import { getOverrides, getSettings } from '@/lib/settings';
import { findSettingsSection } from '@/lib/settings-sections';
import { config } from '@/lib/config';
import { getBaseUrl } from '@/lib/base-url';

export const dynamic = 'force-dynamic';

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
          <h1 className="page-title">站点设置</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            选项已按用途拆到独立页面；改完点当前页底部的保存即可生效。
          </p>
        </div>
      </div>

      <AdminNav />

      <div className="settings-layout">
        <SettingsNav active={meta.key} />
        <div className="settings-main">
          <div className="settings-main-title">{meta.label}</div>
          <p className="settings-main-desc">{meta.desc}</p>
          <SettingsForm
            section={meta.key}
            settings={settings}
            overrides={overrides}
            runtime={{ effectiveBaseUrl, dataDir: config.dataDir, port: process.env.PORT || '8900' }}
          />
        </div>
      </div>
    </div>
  );
}
