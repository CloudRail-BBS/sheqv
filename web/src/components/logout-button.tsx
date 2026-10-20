'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** 退出登录：清会话 Cookie 后回到首页 */
export function LogoutButton({ className = 'btn btn-sm btn-ghost' }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => null);
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? '退出中…' : '退出登录'}
    </button>
  );
}
