'use client';

import { useState } from 'react';
import type { DevTeamRow } from '@/lib/resource-store';
import { downloadCanvas, renderDevBoardShare, safeName, today } from '@/lib/share-image';

/**
 * 开发团队榜分享图：1080×1440 PNG，前 8 名。
 *
 * 头像只认站内路径（同源），跨域 logo 在 canvas 里会污染画布导致导出失败，
 * 此时自动回落到简称色块——分享图里不会出现空头像。
 */
export function DevTeamShare({
  rows,
  brand,
  label = '生成团队榜分享图',
}: {
  rows: DevTeamRow[];
  brand: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy || rows.length === 0) return;
    setBusy(true);
    try {
      const el = await renderDevBoardShare({
        rows: rows.map((r) => ({
          rank: r.rank,
          teamId: r.teamId,
          name: r.name,
          tag: r.tag,
          color: r.color,
          logo: r.logo,
          members: r.members,
          resources: r.resources,
          downloads: r.downloads,
          likes: r.likes,
          score: r.score,
        })),
        brand,
        date: today(),
      });
      downloadCanvas(el, `${safeName('开发团队榜-' + brand)}-${today()}.png`);
    } finally {
      window.setTimeout(() => setBusy(false), 600);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-sm btn-ghost"
      onClick={run}
      disabled={busy || rows.length === 0}
      title={rows.length === 0 ? '还没有团队上榜' : '生成 1080×1440 的 PNG'}
    >
      {busy ? '生成中…' : label}
    </button>
  );
}
