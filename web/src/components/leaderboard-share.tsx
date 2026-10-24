'use client';

import { useState } from 'react';
import { KIND_LABEL, type OrgKind, type ShareRow } from '@/lib/org-types';
import { downloadCanvas, renderLeaderboardShare, safeName, today } from '@/lib/share-image';

/**
 * 榜单分享图按钮：点一下直接把当前榜单（前 8 名）画成 1080×1440 的 PNG。
 *
 * 分享图故意做成「当前筛选后的样子」——用户切到 Rusted Warfare 再导出，
 * 图里就只会有 Rusted Warfare 的榜，不会混进别的游戏。
 */
export function LeaderboardShare({
  kind,
  gameLabel,
  rows,
  brand,
}: {
  kind: OrgKind;
  gameLabel: string;
  rows: ShareRow[];
  brand: string;
}) {
  const [busy, setBusy] = useState(false);

  function run() {
    if (busy || rows.length === 0) return;
    setBusy(true);
    try {
      const el = renderLeaderboardShare({
        title: `${KIND_LABEL[kind]}榜`,
        gameLabel,
        rows,
        brand,
        date: today(),
      });
      downloadCanvas(
        el,
        `${safeName(KIND_LABEL[kind] + '榜-' + gameLabel)}-${today()}.png`,
      );
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
      title={rows.length === 0 ? '榜单为空，暂不能生成' : '生成 1080×1440 的 PNG'}
    >
      {busy ? '生成中…' : '生成分享图'}
    </button>
  );
}
