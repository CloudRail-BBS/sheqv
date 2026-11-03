'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UID_STYLES, UidBadge, isUidStyle, type UidStyle } from './uid-badge';

/**
 * UID 外观选择。
 * 点一下就直接保存（没有「保存」按钮），和在设置里切主题的手感一致。
 */
export function UidStylePicker({ uid, style }: { uid?: number; style?: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState<UidStyle>(isUidStyle(style) ? style : 'plain');
  const [busy, setBusy] = useState<UidStyle | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function pick(next: UidStyle) {
    if (busy || next === current) return;
    setBusy(next);
    setErr(null);
    const res = await fetch('/api/v1/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ uidStyle: next }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setErr(data?.message ?? '保存失败，稍后再试');
      return;
    }
    setCurrent(next);
    router.refresh();
  }

  if (!uid) return null;

  return (
    <div className="uid-picker">
      <div className="uid-picker-head">
        <div className="uid-picker-copy">
          <b>UID 外观</b>
          <span className="small muted">
            个人主页上别人看到的样子，点一下直接保存；别人点它就能复制你的 UID。
          </span>
        </div>
        <UidBadge uid={uid} style={current} size="md" />
      </div>

      <div className="uid-options">
        {UID_STYLES.map((s) => (
          <button
            key={s.key}
            type="button"
            className="uid-option"
            data-on={s.key === current}
            disabled={Boolean(busy)}
            onClick={() => void pick(s.key)}
            aria-pressed={s.key === current}
          >
            <span className="uid-option-preview">
              <UidBadge uid={uid} style={s.key} />
            </span>
            <span className="uid-option-main">
              <b>{s.name}</b>
              <i>{s.note}</i>
            </span>
            {busy === s.key && <span className="uid-option-busy">保存中…</span>}
          </button>
        ))}
      </div>

      {err && <p className="small auth-err">{err}</p>}
    </div>
  );
}
