'use client';

import { useEffect, useRef, useState } from 'react';
import { certSerial, downloadCanvas, renderTournamentCertificate, safeName, today } from '@/lib/share-image';
import { TOURNAMENT_STATUS_LABEL, fmtDay, type Tournament } from '@/lib/task-types';
import { gameLabel } from '@/lib/resource-types';

export type CertRole = 'host' | 'entry';

const ROLE_LABEL: Record<CertRole, string> = { host: '主办证书', entry: '参赛证书' };

/**
 * 赛事证书。
 *
 * 与公会负责人证书同一套版式（1600×1131，A4 横向 150dpi 左右），
 * 页面上展示的 canvas 就是导出时的那张图，不存在「预览和下载不一致」。
 * 主办与参赛都符合时给两枚页签，切换即重画。
 */
export function TournamentCertificate({
  tournament,
  holder,
  teamName,
  roles,
  brand,
  disclaimer,
  stampUrl = '/stamp.png',
}: {
  tournament: Tournament;
  holder: string;
  teamName?: string;
  roles: CertRole[];
  brand: string;
  disclaimer: string;
  stampUrl?: string;
}) {
  const [role, setRole] = useState<CertRole>(roles[0] ?? 'entry');
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [stamp, setStamp] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setStamp(img);
    img.src = stampUrl;
    return () => {
      img.onload = null;
    };
  }, [stampUrl]);

  // 赛事 id 形如 `t1a2b3c4`；去掉非字母数字，避免出现 `TN--001` 这种编号
  const code = tournament.id.replace(/[^0-9a-z]/gi, '').slice(-4).toUpperCase();
  const serial = certSerial(
    `TN-${code}`,
    role === 'host' ? `host:${holder}` : `entry:${teamName || holder}`,
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const drawn = renderTournamentCertificate(
      {
        role,
        holder,
        teamName,
        title: tournament.title,
        gameLabel: gameLabel(tournament.game),
        mode: tournament.mode,
        host: tournament.hostName || brand,
        entryCount: tournament.entryCount,
        serial,
        stage:
          tournament.status === 'ended'
            ? '赛事已结束'
            : tournament.status === 'running'
              ? '赛事进行中'
              : `${TOURNAMENT_STATUS_LABEL[tournament.status]}${tournament.startAt ? `，${fmtDay(tournament.startAt)} 开赛` : ''}`,
        date: today(),
      },
      brand,
      disclaimer,
      stamp,
    );
    const ctx = el.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.drawImage(drawn, 0, 0);
      setReady(true);
    }
    return () => setReady(false);
  }, [role, holder, teamName, tournament, brand, disclaimer, serial, stamp]);

  return (
    <div className="cert-wrap">
      {roles.length > 1 && (
        <div className="tn-cert-tabs" role="tablist" aria-label="证书类型">
          {roles.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              className="tn-cert-tab"
              aria-selected={r === role}
              data-on={r === role}
              onClick={() => setRole(r)}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      )}

      <canvas ref={ref} width={1600} height={1131} className="cert-canvas" />

      <div className="row no-print" style={{ gap: 8, marginTop: 14, justifyContent: 'center' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!ready}
          onClick={() => {
            if (ref.current) {
              downloadCanvas(ref.current, `${safeName(tournament.title)}-${ROLE_LABEL[role]}.png`);
            }
          }}
        >
          保存为图片
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
          打印
        </button>
      </div>
      <p className="small muted no-print" style={{ textAlign: 'center', marginTop: 10, lineHeight: 1.7 }}>
        证书编号 <span className="mono">{serial}</span> ·
        以图片形式保存后可直接发送，打印建议选横向 A4。
      </p>
    </div>
  );
}
