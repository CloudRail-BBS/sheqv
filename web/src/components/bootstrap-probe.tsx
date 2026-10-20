'use client';

import { useState } from 'react';

interface ProbeState {
  status: number;
  etag?: string;
  runtime?: string;
  source?: string;
  ttl?: number;
  ms: number;
  at: string;
}

/**
 * 现场验证 /api/v1/bootstrap 的 ETag 协商与 fail-closed 合并结果。
 * 第二次请求带 If-None-Match，应当拿到 304。
 */
export function BootstrapProbe() {
  const [log, setLog] = useState<ProbeState[]>([]);
  const [busy, setBusy] = useState(false);

  async function probe() {
    setBusy(true);
    const etag = log.length > 0 ? log[log.length - 1].etag : undefined;
    const t0 = performance.now();
    const res = await fetch('/api/v1/bootstrap', {
      headers: etag ? { 'If-None-Match': etag } : {},
      cache: 'no-store',
    });
    const ms = Math.round(performance.now() - t0);
    let runtime: string | undefined;
    let source: string | undefined;
    let ttl: number | undefined;
    if (res.status === 200) {
      const body = await res.json();
      runtime = body.client.runtime;
      source = body.client.runtimeSource;
      ttl = body.ttl;
    }
    setLog((l) => [
      ...l,
      { status: res.status, etag: res.headers.get('etag') ?? etag, runtime, source, ttl, ms, at: new Date().toLocaleTimeString('zh-CN') },
    ]);
    setBusy(false);
  }

  return (
    <div className="card card-pad">
      <div className="between" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 14 }}>bootstrap 实测</h3>
        <button className="btn btn-sm" onClick={probe} disabled={busy}>
          {busy ? '请求中…' : '发一次请求'}
        </button>
      </div>
      {log.length === 0 ? (
        <p className="small muted">点一次请求，第二次会自动带 If-None-Match，预期返回 304。</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>时间</th>
              <th>状态</th>
              <th>runtime / source</th>
              <th>耗时</th>
            </tr>
          </thead>
          <tbody>
            {log.map((r, i) => (
              <tr key={i}>
                <td className="mono">{r.at}</td>
                <td>
                  <span className={'badge ' + (r.status === 200 ? 'badge-live' : 'badge-ghost')}>{r.status}</span>
                </td>
                <td className="mono">
                  {r.status === 200 ? `${r.runtime} / ${r.source}` : '沿用缓存 · 未变更'}
                </td>
                <td className="mono">{r.ms}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
