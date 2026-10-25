'use client';

import { useEffect, useRef, useState } from 'react';
import { certSerial, downloadCanvas, renderAgreementCertificate, safeName } from '@/lib/share-image';

/** 公约签署证书：只展示、导出当前账号自己的签署记录 */
export function AgreementCertificate({
  agreement,
  nickname,
  signedAt,
  brand,
  disclaimer,
  stampUrl = '/stamp.png',
}: {
  agreement: { id: string; title: string; version: string; scope: string };
  nickname: string;
  signedAt: string;
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
    const drawn = renderAgreementCertificate(
      agreement,
      nickname,
      signedAt,
      brand,
      new Date().toISOString().slice(0, 10),
      disclaimer,
    );
    const ctx = el.getContext('2d');
    if (ctx) {
      ctx.drawImage(drawn, 0, 0);
      setReady(true);
    }
    return () => setReady(false);
  }, [agreement, nickname, signedAt, brand, disclaimer, stamp]);

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
              downloadCanvas(ref.current, `${safeName(agreement.title)}-签署证书.png`);
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
        证书编号 <span className="mono">{certSerial(`AGR-${agreement.id.toUpperCase()}`, nickname)}</span> ·
        以图片形式保存后可直接发送，打印建议选横向 A4。
      </p>
    </div>
  );
}
