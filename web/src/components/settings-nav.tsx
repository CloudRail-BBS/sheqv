import Link from 'next/link';
import { SETTINGS_GROUPS, SETTINGS_SECTIONS, type SettingsSection } from '@/lib/settings-sections';

/** 设置页左侧导航：固定分组，当前页高亮 */
export function SettingsNav({ active }: { active: SettingsSection }) {
  return (
    <aside className="card settings-nav" aria-label="设置分区">
      <div className="rail-title">设置</div>
      {SETTINGS_GROUPS.map((group) => {
        const items = SETTINGS_SECTIONS.filter((s) => s.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className="settings-nav-group">
            <div className="settings-nav-label">{group}</div>
            {items.map((s) => (
              <Link
                key={s.key}
                href={`/admin/settings/${s.key}`}
                className="settings-nav-item"
                data-active={s.key === active}
              >
                {s.label}
              </Link>
            ))}
          </div>
        );
      })}
    </aside>
  );
}
