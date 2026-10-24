'use client';

import {
  NAV_GROUPS,
  NAV_ITEMS,
  SIDEBAR_DEFAULT,
  TABBAR_DEFAULT,
  TABBAR_SIZE,
  parseNav,
  serializeNav,
} from '@/lib/nav-config';

/**
 * 导航设置：侧边栏按分组勾选 + 组内排序；底部栏固定 5 格。
 *
 * 存的是 key 的有序列表；空串代表「用默认」。
 * 侧边栏不允许全部关掉（至少留一项），底部栏最多 5 个、少选均分。
 */
export function NavSettings({
  sidebar,
  tabbar,
  onChange,
}: {
  sidebar: string;
  tabbar: string;
  onChange: (key: 'sidebarItems' | 'tabbarItems', value: string) => void;
}) {
  const sideKeys = parseNav(sidebar, SIDEBAR_DEFAULT);
  const tabKeys = parseNav(tabbar, TABBAR_DEFAULT).slice(0, TABBAR_SIZE);

  function toggleSide(key: string) {
    if (sideKeys.includes(key)) {
      if (sideKeys.length <= 1) return;
      onChange('sidebarItems', serializeNav(sideKeys.filter((k) => k !== key)));
    } else {
      onChange('sidebarItems', serializeNav([...sideKeys, key]));
    }
  }

  function moveSide(key: string, dir: -1 | 1) {
    const group = NAV_GROUPS.find((g) => g.items.some((i) => i.key === key));
    if (!group) return;
    const groupKeys = sideKeys.filter((k) => group.items.some((i) => i.key === k));
    const at = groupKeys.indexOf(key);
    const target = groupKeys[at + dir];
    if (!target) return;
    const next = [...sideKeys];
    const a = next.indexOf(key);
    const b = next.indexOf(target);
    [next[a], next[b]] = [next[b], next[a]];
    onChange('sidebarItems', serializeNav(next));
  }

  function toggleTab(key: string) {
    if (tabKeys.includes(key)) {
      if (tabKeys.length <= 1) return;
      onChange('tabbarItems', serializeNav(tabKeys.filter((k) => k !== key)));
      return;
    }
    if (tabKeys.length >= TABBAR_SIZE) return;
    onChange('tabbarItems', serializeNav([...tabKeys, key]));
  }

  function moveTab(key: string, dir: -1 | 1) {
    const at = tabKeys.indexOf(key);
    const target = tabKeys[at + dir];
    if (!target) return;
    const next = [...tabKeys];
    [next[at], next[at + dir]] = [next[at + dir], next[at]];
    onChange('tabbarItems', serializeNav(next));
  }

  return (
    <div className="nav-editor">
      <div className="nav-col">
        <div className="between">
          <div>
            <b style={{ fontSize: 13 }}>侧边栏</b>
            <p className="small muted" style={{ marginTop: 2 }}>
              勾选要显示的项，组内用 ↑↓ 调顺序；至少保留一项。
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => onChange('sidebarItems', '')}
          >
            恢复默认
          </button>
        </div>

        {NAV_GROUPS.map((group) => {
          const groupKeys = sideKeys.filter((k) => group.items.some((i) => i.key === k));
          return (
            <div key={group.id} className="nav-group">
              <div className="nav-group-title">{group.label}</div>
              {group.items.map((item) => {
                const on = sideKeys.includes(item.key);
                const at = groupKeys.indexOf(item.key);
                return (
                  <div key={item.key} className="nav-row" data-on={on}>
                    <label className="nav-check">
                      <input type="checkbox" checked={on} onChange={() => toggleSide(item.key)} />
                      <span>{item.label}</span>
                    </label>
                    {on && (
                      <span className="nav-move">
                        <button type="button" onClick={() => moveSide(item.key, -1)} disabled={at <= 0} aria-label="上移">
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSide(item.key, 1)}
                          disabled={at >= groupKeys.length - 1}
                          aria-label="下移"
                        >
                          ↓
                        </button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="nav-col">
        <div className="between">
          <div>
            <b style={{ fontSize: 13 }}>移动端底部栏</b>
            <p className="small muted" style={{ marginTop: 2 }}>
              最多 5 个；少选也会均分铺满。
            </p>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange('tabbarItems', '')}>
            恢复默认
          </button>
        </div>

        <div className="nav-slots">
          {tabKeys.map((key, i) => {
            const item = NAV_ITEMS.find((x) => x.key === key);
            return (
              <div key={key} className="nav-slot">
                <span className="mono nav-slot-no">{i + 1}</span>
                <span className="nav-slot-label">{item?.label ?? key}</span>
                <span className="nav-move">
                  <button type="button" onClick={() => moveTab(key, -1)} disabled={i === 0} aria-label="上移">
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveTab(key, 1)}
                    disabled={i === tabKeys.length - 1}
                    aria-label="下移"
                  >
                    ↓
                  </button>
                </span>
              </div>
            );
          })}
        </div>

        <div className="nav-pool">
          {NAV_ITEMS.map((item) => {
            const on = tabKeys.includes(item.key);
            const full = tabKeys.length >= TABBAR_SIZE;
            return (
              <label key={item.key} className="nav-check" data-on={on} data-disabled={!on && full}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && full}
                  onChange={() => toggleTab(item.key)}
                />
                <span>{item.label}</span>
              </label>
            );
          })}
        </div>
        <p className="small muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
          底部栏只建议放首页、公会、战队、约战、我的这类一级入口；资源与福利更适合放侧边栏。
        </p>
      </div>
    </div>
  );
}
