'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  STATUSES,
  gameLabel,
  statusLabel,
  type Org,
} from '@/lib/org-types';
import { downloadCanvas, renderOrgCard, safeName, today } from '@/lib/share-image';

/**
 * 负责人面板：分享图、证书、状态、删除。
 *
 * 证书只给负责人本人看（管理员可以查看，但落款是负责人）；
 * 分享图任何人都能生成，这里只放在详情页里，避免列表页按钮过密。
 */
export function OrgOwnerPanel({
  org,
  brand,
  isOwner,
  isAdmin,
}: {
  org: Org;
  brand: string;
  isOwner: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const label = org.kind === 'guild' ? '公会' : '战队';

  function shareImage() {
    const card = renderOrgCard(
      {
        ...org,
        gameLabel: gameLabel(org.game),
        statusLabel: statusLabel(org.status),
      },
      brand,
      today(),
    );
    downloadCanvas(card, `${safeName(org.name)}-${label}名片.png`);
  }

  async function setStatus(status: string) {
    setBusy(true);
    setMsg(null);
    const path = org.kind === 'guild' ? '/api/v1/guilds' : '/api/v1/teams';
    const res = await fetch(`${path}/${org.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setMsg(data?.message ?? '状态修改失败');
      return;
    }
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`删除${label}「${org.name}」？删除后无法恢复。`)) return;
    setBusy(true);
    const path = org.kind === 'guild' ? '/api/v1/guilds' : '/api/v1/teams';
    const res = await fetch(`${path}/${org.id}`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMsg('删除失败');
      return;
    }
    router.push(`/${org.kind}s`);
    router.refresh();
  }

  return (
    <div className="card rail-card">
      <div className="rail-title">
        {isOwner ? '我是负责人' : isAdmin ? '管理员操作' : '分享这个条目'}
      </div>

      <button type="button" className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={shareImage}>
        导出{label}分享图
      </button>

      {(isOwner || isAdmin) && (
        <Link
          href={`/${org.kind}s/${org.id}/certificate`}
          className="btn btn-ghost btn-sm"
          style={{ width: '100%', marginTop: 8 }}
        >
          {isOwner ? '我的负责人证书' : '查看负责人证书'}
        </Link>
      )}

      {(isOwner || isAdmin) && (
        <>
          <label className="field" style={{ marginTop: 12 }}>
            招募状态
            <select
              className="input"
              value={org.status}
              disabled={busy}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', marginTop: 10, color: 'var(--danger)' }}
            disabled={busy}
            onClick={remove}
          >
            删除{label}
          </button>
        </>
      )}

      {msg && (
        <p className="small" style={{ marginTop: 8, color: 'var(--danger)' }}>
          {msg}
        </p>
      )}

      <p className="small muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
        {isOwner || isAdmin
          ? '分享图是 1080×1350 的 PNG，证书是 A4 横向 PNG，都可以直接发到群里或印出来。'
          : '分享图是 1080×1350 的 PNG，会把当前战绩一起画进去。'}
      </p>
    </div>
  );
}
