'use client';

import { useRef, useState } from 'react';

interface Props {
  maxUploadBytes: number;
  chunkConcurrency: number;
}

const fmt = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(n % 1024 ** 3 === 0 ? 0 : 1)} GB` : `${Math.round(n / 1024 / 1024)} MB`);

/**
 * 投稿入口的配额门禁：limit('maxUploadBytes') / limit('chunkConcurrency')。
 * 注意前端只做提示，服务端必须独立校验（能力表不是鉴权）。
 */
export function UploadPanel({ maxUploadBytes, chunkConcurrency }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > maxUploadBytes) {
      setResult({
        ok: false,
        text: `${f.name} · ${fmt(f.size)} 超过当前形态上限 ${fmt(maxUploadBytes)}，请改用桌面端或 App`,
      });
    } else {
      setResult({
        ok: true,
        text: `${f.name} · ${fmt(f.size)} 可上传，将按 ${chunkConcurrency} 并发分片`,
      });
    }
  }

  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="between">
        <h3 style={{ fontSize: 14 }}>投稿资源</h3>
        <span className="badge">≤ {fmt(maxUploadBytes)}</span>
      </div>
      <p className="small muted">支持 .zip / .mrpack / .rbxl，上传后进入人工审核队列。</p>

      <input ref={ref} type="file" hidden onChange={onPick} />
      <button className="btn btn-ghost" onClick={() => ref.current?.click()}>
        选择文件…
      </button>

      <div className="small muted mono">chunkConcurrency = {chunkConcurrency}</div>

      {result && (
        <div
          className="small"
          style={{
            color: result.ok ? 'var(--accent)' : 'var(--amber)',
            borderTop: '1px solid var(--line-soft)',
            paddingTop: 10,
            lineHeight: 1.6,
          }}
        >
          {result.text}
        </div>
      )}
    </div>
  );
}
