'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TITLE_MAX, TITLE_MIN } from '@/lib/badges';

/**
 * 「我的」页的头衔编辑。
 * 普通用户的保留字（管理员 / 站务 / 官方…）在服务端拦截，这里只做长度提示。
 */
export function TitleEditor({ current, isAdmin }: { current: string; isAdmin: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(next: string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/v1/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: next }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);

    if (!res?.ok) {
      setMsg({ ok: false, text: data?.message ?? '保存失败，稍后再试' });
      return;
    }

    setValue(next.trim());
    setMsg({ ok: true, text: next.trim() ? '头衔已更新' : '已恢复默认' });
    router.refresh();
  }

  const dirty = value.trim() !== current;

  return (
    <div className="title-edit">
      <div className="row" style={{ gap: 8 }}>
        <input
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={isAdmin ? '默认显示「管理员」' : '例如：红石工程师'}
          maxLength={TITLE_MAX}
          aria-label="头衔"
        />
        <button
          className="btn btn-sm btn-primary"
          type="button"
          disabled={busy || !dirty}
          onClick={() => save(value)}
        >
          {busy ? '保存中' : '保存'}
        </button>
        {current && (
          <button className="btn btn-sm btn-ghost" type="button" disabled={busy} onClick={() => save('')}>
            清除
          </button>
        )}
      </div>
      <p className="small muted" style={{ marginTop: 6 }}>
        {TITLE_MIN}–{TITLE_MAX} 个字，会显示在帖子与评论的作者名后面。
        {isAdmin ? '' : '「管理员」「站务」等属于保留头衔。'}
      </p>
      {msg && (
        <p className="small" style={{ marginTop: 4, color: msg.ok ? 'var(--text-2)' : 'var(--danger)' }}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
