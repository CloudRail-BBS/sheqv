'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** 活动详情页的参加按钮：状态切换后 refresh，人数由服务端重算 */
export function EventJoin({
  id,
  joined,
  status,
  loggedIn,
}: {
  id: string;
  joined: boolean;
  status: string;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/v1/events/${encodeURIComponent(id)}/join`, {
      method: joined ? 'DELETE' : 'POST',
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setErr(data?.message ?? '操作失败');
      return;
    }
    router.refresh();
  }

  return (
    <div className="ev-join">
      <button
        type="button"
        className={`btn ${joined ? 'btn-ghost' : 'btn-primary'}`}
        disabled={!loggedIn || status !== 'open' || busy}
        onClick={() => void toggle()}
      >
        {busy ? '处理中…' : !loggedIn ? '登录后参加' : status !== 'open' ? '活动已结束' : joined ? '已参加 · 取消' : '参加活动'}
      </button>
      {err && <span className="small auth-err">{err}</span>}
    </div>
  );
}
