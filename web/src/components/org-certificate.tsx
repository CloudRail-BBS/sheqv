'use client';

import { useEffect, useRef, useState } from 'react';
import { gameLabel, statusLabel, type Org } from '@/lib/org-types';
import { downloadCanvas, renderCertificate, safeName } from '@/lib/share-image';

/**
 * 负责人证书页的正文。
 *
 * 证书直接用 canvas 画（1600×1131，A4 横向 150dpi 左右），
 * 页面上展示的就是最终导出的那张图——不会出现「预览和下载不一样」。
 */
export function OrgCertificate({
  org,
  ownerName,
  brand,
  disclaimer,
  stampUrl = '/stamp.png',
}: {
  org: Org;
  ownerName: string;
  brand: string;
  disclaimer: string;
  stampUrl?: string;
}) {
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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const drawn = renderCertificate(
      {
        ...org,
        gameLabel: gameLabel(org.game),
        statusLabel: statusLabel(org.status),
      },
      ownerName,
      brand,
      new Date().toISOString().slice(0, 10),
      disclaimer,
    );
    // 把画好的内容拷到页面上的 canvas，避免再画一遍
    const ctx = el.getContext('2d');
    if (ctx) {
      ctx.drawImage(drawn, 0, 0);
      setReady(true);
    }
    return () => setReady(false);
  }, [org, ownerName, brand, disclaimer, stamp]);

  return (
    <div className="cert-wrap">
      <canvas ref={ref} width={1600} height={1131} className="cert-canvas" />

      <div className="row no-print" style={{ gap: 8, marginTop: 14, justifyContent: 'center' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!ready}
          onClick={() => {
            if (ref.current) {
              downloadCanvas(ref.current, `${safeName(org.name)}-负责人证书.png`);
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
        证书编号 <span className="mono">{org.id.toUpperCase()}</span> ·
        以图片形式保存后可直接发送，打印建议选横向 A4。
      </p>
    </div>
  );
}
