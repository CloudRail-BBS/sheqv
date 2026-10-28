'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addressOf, STATUS_LABEL, type GameServer } from '@/lib/server-types';

/**
 * 「我的提交」：待审核与被拒的条目。
 *
 * 大厅只展示已通过的，所以这两类必须单独列出来——否则用户提交完什么也看不到，
 * 会以为上传失败又重复提交。已通过的条目已经在大厅卡片里，这里不重复。
 */
export function MySubmissions({ items }: { items: GameServer[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pending = items.filter((s) => (s.status ?? 'approved') !== 'approved');
  if (pending.length === 0) return null;

  async function remove(item: GameServer) {
    if (!window.confirm(`删除「${item.name}」？删除后需要重新提交并再次审核。`)) return;
    setBusy(item.id);
    setErr(null);
    const res = await fetch(`/api/v1/servers/${encodeURIComponent(item.id)}`, {
      method: 'DELETE',
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setErr('删除失败，稍后再试');
      return;
    }
    router.refresh();
  }

  return (
    <div className="card my-srv">
      <div className="my-srv-head">
        <b>我的提交</b>
        <span className="small muted">审核通过后才会出现在大厅</span>
      </div>
      <ul className="my-srv-list">
        {pending.map((s) => (
          <li key={s.id} className="my-srv-row">
            <span className={'badge ' + (s.status === 'rejected' ? 'badge-danger' : 'badge-warn')}>
              {STATUS_LABEL[s.status] ?? '待审核'}
            </span>
            <span className="my-srv-name" title={s.name}>{s.name}</span>
            <code className="my-srv-addr" title={addressOf(s)}>{addressOf(s)}</code>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={busy === s.id}
              onClick={() => remove(s)}
            >
              {busy === s.id ? '删除中…' : '删除'}
            </button>
          </li>
        ))}
      </ul>
      {err && <p className="small" style={{ color: 'var(--danger)', padding: '0 14px 10px' }}>{err}</p>}
    </div>
  );
}
