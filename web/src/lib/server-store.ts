import { apiGetOr } from './api-client';
import type { GameServer, RelaySnapshot, ServerKind } from './server-types';

/**
 * 联机大厅的**读**接口（仅服务端）。
 *
 * 上传/编辑在客户端组件里直接打 `/api/v1/servers`，不经过这里。
 * 房间是实时数据，服务端只给首屏快照，之后由 `RelayBoard` 自己轮询。
 */

export * from './server-types';

export async function listServers(kind: ServerKind): Promise<GameServer[]> {
  const d = await apiGetOr<{ items: GameServer[] }>(`/api/v1/servers?kind=${kind}`, { items: [] });
  return d.items;
}

export async function relaySnapshot(): Promise<RelaySnapshot> {
  return apiGetOr<RelaySnapshot>('/api/v1/relay/rooms', {
    nodes: [],
    totalRooms: 0,
    totalPlayers: 0,
  });
}
