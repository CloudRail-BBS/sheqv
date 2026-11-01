'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** 回滚到某个历史版本（管理员）。成功后刷新页面，正文会变回那版内容。 */
export function WikiRestore({ entryId, revisionId }: { entryId: string; revisionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    if (!window.confirm('回滚到这个版本？当前内容会先存进历史，不会丢失。')) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/v1/admin/wiki/${entryId}/restore`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ revisionId }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    if (!res?.ok) {
      setErr(data?.message ?? '回滚失败');
      return;
    }
    router.refresh();
  }

  return (
    <span className="wiki-restore">
      <button type="button" className="btn btn-sm btn-ghost" onClick={run} disabled={busy}>
        {busy ? '回滚中…' : '回滚到此版本'}
      </button>
      {err && (
        <span className="small" style={{ color: 'var(--danger)' }}>
          {err}
        </span>
      )}
    </span>
  );
}
