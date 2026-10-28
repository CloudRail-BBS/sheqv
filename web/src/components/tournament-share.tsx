'use client';

import { useState } from 'react';
import {
  TOURNAMENT_STATUS_LABEL,
  fmtDay,
  type Tournament,
} from '@/lib/task-types';
import { gameLabel } from '@/lib/resource-types';
import { downloadCanvas, renderTournamentPoster, safeName, today } from '@/lib/share-image';
import { MEDIA_W, mediaUrl } from '@/lib/media';

/**
 * 赛事宣传图。
 *
 * 一张 1080×1350 的竖版海报：主视觉、赛程、奖品、站内地址，
 * 下载即发朋友圈 / 群；浏览器支持文件分享时直接走系统分享面板。
 */
export function TournamentShare({
  tournament,
  brand,
  site,
}: {
  tournament: Tournament;
  brand: string;
  site: string;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function draw() {
    return renderTournamentPoster({
      id: tournament.id,
      title: tournament.title,
      game: tournament.game,
      gameLabel: gameLabel(tournament.game),
      mode: tournament.mode,
      statusLabel: TOURNAMENT_STATUS_LABEL[tournament.status],
      summary: tournament.summary,
      prize: tournament.prize,
      host: tournament.hostName || brand,
      // 分享图按 1080 宽画，取 1280 版本就够，别去拉几 MB 的原图
      cover: mediaUrl(tournament.cover, MEDIA_W.hero) || undefined,
      signupLabel:
        tournament.signupEnd ? `至 ${fmtDay(tournament.signupEnd)}` : '待定',
      startLabel: tournament.startAt ? fmtDay(tournament.startAt) : '待定',
      entryCount: tournament.entryCount,
      maxEntries: tournament.maxEntries,
      brand,
      site,
      date: today(),
    });
  }

  async function download() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const el = await draw();
      downloadCanvas(el, `${safeName(tournament.title)}-宣传图.png`);
      setMsg('已生成，图片在下载目录');
    } catch {
      setMsg('生成失败，换个浏览器再试');
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const url = `${site}/tournaments/${tournament.id}`;
    try {
      const el = await draw();
      const blob = await new Promise<Blob | null>((resolve) => el.toBlob(resolve, 'image/png'));
      const file = blob
        ? new File([blob], `${safeName(tournament.title)}-宣传图.png`, { type: 'image/png' })
        : null;
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: tournament.title, url });
      } else if (navigator.share) {
        await navigator.share({ title: tournament.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setMsg('已复制赛事链接');
      }
    } catch {
      // 用户取消分享面板不算错误，不提示
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${site}/tournaments/${tournament.id}`);
      setMsg('已复制赛事链接');
    } catch {
      setMsg('复制失败，请手动复制地址栏');
    }
  }

  return (
    <div className="tn-share">
      <div className="tn-share-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={download} disabled={busy}>
          {busy ? '生成中…' : '生成宣传图'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={share} disabled={busy}>
          分享
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
          复制链接
        </button>
      </div>
      <p className="tn-share-hint">
        {msg ?? '1080×1350 竖版海报，含赛程与奖品；可直接发群或朋友圈。'}
      </p>
    </div>
  );
}
