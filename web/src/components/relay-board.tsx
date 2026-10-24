'use client';

import { useEffect, useState } from 'react';
import { ago, roomStatusLabel, type RelaySnapshot } from '@/lib/server-types';

const POLL_MS = 15_000;

/**
 * 铁锈战争房间板。
 *
 * 房间是**实时数据**，不落库：服务端给首屏快照，之后每 15 秒自己拉一次。
 * 中转站挂掉时后端会把上一次成功的结果标成 `ok=false` 返回，这里显示成
 * 「数据可能已过期」，而不是把大厅清空。
 */
export function RelayBoard({ initial }: { initial: RelaySnapshot }) {
  const [data, setData] = useState<RelaySnapshot>(initial);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;

    const load = async () => {
      if (alive) setLoading(true);
      const res = await fetch('/api/v1/relay/rooms', { cache: 'no-store' }).catch(() => null);
      if (!alive) return;
      setLoading(false);
      if (!res?.ok) {
        setError('刷新失败，稍后自动重试');
        return;
      }
      const next = (await res.json().catch(() => null)) as RelaySnapshot | null;
      if (!alive || !next) return;
      setData(next);
      setError('');
    };

    // 首屏已经有服务端数据，等一个周期再拉，避免刚进来就重复请求
    timer = window.setInterval(load, POLL_MS);
    return () => {
      alive = false;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  const rooms = data.nodes.flatMap((node) =>
    node.rooms.map((room) => ({ room, nodeName: node.name || node.url })),
  );
  const stale = data.nodes.filter((n) => !n.ok);
  const fetchedAt = data.nodes.reduce((max, n) => Math.max(max, n.fetchedAt), 0);

  return (
    <div className="relay-board">
      <div className="relay-bar">
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="badge badge-live">{data.totalRooms} 个房间</span>
          <span className="badge">{data.totalPlayers} 人在线</span>
          {data.nodes.map((n) => (
            <span key={n.url} className="badge badge-ghost" title={n.url}>
              {n.name || n.url}
            </span>
          ))}
        </div>
        <span className="small muted">
          {loading ? '刷新中…' : fetchedAt ? `${ago(fetchedAt)}更新 · 每 15 秒自动刷新` : '每 15 秒自动刷新'}
        </span>
      </div>

      {(error || stale.length > 0) && (
        <div className="notice" style={{ marginBottom: 12 }}>
          <span>
            {error || `${stale.map((n) => n.name || n.url).join('、')} 暂时连不上，下面是最后一次拿到的数据。`}
          </span>
        </div>
      )}

      {rooms.length === 0 ? (
        <div className="card empty-state">
          <b>现在还没有房间</b>
          <p>进游戏开一局，房间会自动出现在这里。也可以在上传面板登记自己的中转站。</p>
        </div>
      ) : (
        <div className="srv-grid">
          {rooms.map(({ room, nodeName }) => (
            <article key={`${nodeName}-${room.id}`} className="card room-card">
              <div className="srv-head">
                <span className="srv-ava" data-online>
                  {(room.host || room.map || '?').slice(0, 1)}
                </span>
                <div className="srv-id">
                  <div className="srv-name">{room.map || '未知地图'}</div>
                  <div className="srv-sub">
                    <span>{room.host || '未知房主'}</span>
                    <span className="mono">· {room.displayId || room.id}</span>
                  </div>
                </div>
                <span
                  className={'badge ' + (room.status === 'ingame' ? 'badge-live' : 'badge-ghost')}
                >
                  {roomStatusLabel(room.status)}
                </span>
              </div>

              <div className="room-meta">
                <span className="mono">{room.players} 人</span>
                {room.isMod && <span className="badge badge-ghost">MOD</span>}
                <span className="muted">{nodeName}</span>
              </div>

              <div className="srv-foot">
                <span className="small muted">
                  {room.lastActiveAt ? `${ago(room.lastActiveAt)}活跃` : '刚开局'}
                </span>
                {room.joinLink && (
                  <a className="btn btn-sm" href={room.joinLink} target="_blank" rel="noreferrer">
                    加入房间
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
