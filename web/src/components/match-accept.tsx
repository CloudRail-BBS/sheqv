'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** 被约战方负责人接受约战 */
export function MatchAccept({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function accept() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/v1/matches/${id}/accept`, { method: 'POST' }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    if (!res?.ok) {
      setErr(data?.message ?? '接受失败');
      return;
    }
    router.refresh();
  }

  return (
    <div className="card card-pad">
      <h3 style={{ fontSize: 13, marginBottom: 8 }}>接受这场约战</h3>
      <p className="small dim" style={{ lineHeight: 1.7 }}>
        接受后名单将锁定，双方按约定时间开赛。比赛结果由双方独立提交。
      </p>
      {err && <div className="small" style={{ color: 'var(--danger)', marginTop: 8 }}>{err}</div>}
      <button className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={accept} disabled={busy}>
        {busy ? '处理中…' : '接受约战'}
      </button>
    </div>
  );
}
