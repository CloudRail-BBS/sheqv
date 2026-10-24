'use client';

import { useState } from 'react';
import { addressOf, STATE_LABEL, type GameServer } from '@/lib/server-types';

/**
 * 我的世界服务器卡片。
 *
 * 复制地址要读剪贴板，所以整卡是个客户端组件——但它不取数，
 * 数据由服务端页面一次性传进来，避免大厅首屏空一片。
 */
export function ServerCard({ item }: { item: GameServer }) {
  const [copied, setCopied] = useState(false);
  const online = item.probeState === 'online';
  const addr = addressOf(item);
  const pct =
    item.playersMax > 0
      ? Math.min(100, Math.round((item.playersOnline / item.playersMax) * 100))
      : 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="card srv-card">
      <div className="srv-head">
        <span className="srv-ava" data-online={online}>
          {item.name.slice(0, 1)}
        </span>
        <div className="srv-id">
          <div className="srv-name">{item.name}</div>
          <div className="srv-sub">
            <i className="dot" data-state={item.probeState} />
            <span>{STATE_LABEL[item.probeState]}</span>
            {online && item.versionName ? <span>· {item.versionName}</span> : null}
            {online && item.latencyMs > 0 ? <span>· {item.latencyMs}ms</span> : null}
          </div>
        </div>
        <span className="badge badge-ghost">{item.edition === 'bedrock' ? '基岩版' : 'Java'}</span>
      </div>

      {online && item.motd ? (
        <p className="srv-motd">{item.motd}</p>
      ) : item.description ? (
        <p className="srv-motd">{item.description}</p>
      ) : null}

      {online ? (
        <div className="srv-players">
          <div className="between small">
            <span className="mono">
              {item.playersOnline}
              <span className="muted"> / {item.playersMax || '—'}</span>
            </span>
            <span className="muted">在线玩家</span>
          </div>
          <div className="srv-bar">
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : (
        <p className="srv-off">{item.probeError || '还没有探测结果，稍后自动刷新'}</p>
      )}

      {item.tags.length > 0 && (
        <div className="row wrap" style={{ gap: 5 }}>
          {item.tags.map((t) => (
            <span key={t} className="badge badge-ghost">
              #{t}
            </span>
          ))}
        </div>
      )}

      <div className="srv-foot">
        <code className="srv-addr" title={addr}>
          {addr}
        </code>
        <button type="button" className="btn btn-sm btn-ghost" onClick={copy}>
          {copied ? '已复制' : '复制地址'}
        </button>
      </div>
    </article>
  );
}
