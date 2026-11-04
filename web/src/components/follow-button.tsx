'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 关注 / 取消关注。
 * 先本地切换再 refresh，按钮不会有一拍延迟；失败则回滚并提示。
 */
export function FollowButton({
  userId,
  following,
}: {
  userId: string;
  following: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(following);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const next = !on;
    const res = await fetch(`/api/v1/users/${encodeURIComponent(userId)}/follow`, {
      method: next ? 'POST' : 'DELETE',
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setErr(data?.message ?? '操作失败，稍后再试');
      return;
    }
    setOn(next);
    router.refresh();
  }

  return (
    <span className="follow-wrap">
      <button
        type="button"
        className={`btn btn-sm ${on ? 'btn-ghost' : 'btn-primary'}`}
        onClick={() => void toggle()}
        disabled={busy}
        aria-pressed={on}
      >
        {busy ? '处理中…' : on ? '已关注' : '关注'}
      </button>
      {err && <span className="small auth-err">{err}</span>}
    </span>
  );
}
