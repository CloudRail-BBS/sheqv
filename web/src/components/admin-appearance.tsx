'use client';

import { useCallback, useEffect, useState } from 'react';
import { BADGE_EFFECTS, BADGE_STYLES } from '@/lib/badges';

interface BadgeRow {
  id: string;
  name: string;
  desc: string;
  tone: string;
  style: string;
  effect: string;
}

const TONE_STYLE: Record<string, string> = {
  blue: 'blue',
  gold: 'gold',
  red: 'plain',
  gray: 'plain',
};

/**
 * 外观：头衔与徽章的样式。
 *
 * 头衔的样式在审核时逐条决定，这里只展示可选调色板（作者名旁边长什么样）；
 * 徽章是规则算出来的，所以按徽章类型存覆盖，改完立即对全站生效。
 */
export function AdminAppearance() {
  const [items, setItems] = useState<BadgeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/admin/badge-styles', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) {
      setMsg({ ok: false, text: '读取失败（需要管理员权限）' });
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { items: BadgeRow[] };
    setItems(data.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(row: BadgeRow, next: { style?: string; effect?: string }) {
    const style = next.style ?? row.style;
    const effect = next.effect ?? row.effect;
    setBusy(row.id);
    setMsg(null);
    const res = await fetch(`/api/v1/admin/badge-styles/${row.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ style, effect }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setMsg({ ok: false, text: '保存失败' });
      return;
    }
    setItems((list) => list.map((b) => (b.id === row.id ? { ...b, style, effect } : b)));
    setMsg({ ok: true, text: `「${row.name}」外观已更新` });
  }

  return (
    <>
      {msg && (
        <p className="small" style={{ color: msg.ok ? 'var(--ok)' : 'var(--danger)', marginBottom: 8 }}>
          {msg.text}
        </p>
      )}

      <div className="card card-pad">
        <div className="between" style={{ marginBottom: 8 }}>
          <b style={{ fontSize: 13.5 }}>头衔样式</b>
          <span className="small muted">审核头衔申请时可逐条选择</span>
        </div>
        <p className="small muted" style={{ lineHeight: 1.8, marginBottom: 10 }}>
          用户在「我的 → 头衔」里只能从这套调色板里挑，管理员在审核时可以改成任意一种；
          通过后立刻显示在帖子与评论的作者名后面。
        </p>
        <div className="row wrap" style={{ gap: 8 }}>
          {BADGE_STYLES.map((s) => (
            <span key={s.key} className="ut" data-kind="custom" data-bs={s.key} data-be={s.key === 'holo' ? 'shine' : undefined}>
              {s.label}
            </span>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
          {BADGE_EFFECTS.filter((e) => e.key).map((e) => (
            <span key={e.key} className="ut" data-kind="custom" data-bs="blue" data-be={e.key}>
              {e.label}
            </span>
          ))}
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 12 }}>
        <div className="between" style={{ marginBottom: 8 }}>
          <b style={{ fontSize: 13.5 }}>徽章样式</b>
          <span className="small muted">按徽章类型覆盖默认语气色</span>
        </div>

        {loading ? (
          <p className="small muted">读取中…</p>
        ) : (
          <div className="badge-style-list">
            {items.map((row) => (
              <div key={row.id} className="badge-style-row">
                <span
                  className="bz"
                  data-tone={row.tone}
                  data-bs={row.style || TONE_STYLE[row.tone] || 'plain'}
                  data-be={row.effect || undefined}
                >
                  {row.name}
                </span>
                <span className="badge-style-desc">{row.desc}</span>
                <select
                  className="input"
                  aria-label={`${row.name} 样式`}
                  value={row.style}
                  disabled={busy === row.id}
                  onChange={(e) => save(row, { style: e.target.value })}
                >
                  <option value="">默认（{row.tone}）</option>
                  {BADGE_STYLES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
                <select
                  className="input"
                  aria-label={`${row.name} 特效`}
                  value={row.effect}
                  disabled={busy === row.id}
                  onChange={(e) => save(row, { effect: e.target.value })}
                >
                  {BADGE_EFFECTS.map((e) => (
                    <option key={e.key || 'none'} value={e.key}>{e.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        <p className="small muted" style={{ marginTop: 10, lineHeight: 1.8 }}>
          身份组的颜色与外观在「公会与战队 → 身份组」里改；没有单独配置的徽章沿用自带的语气色。
        </p>
      </div>
    </>
  );
}
