import Link from 'next/link';
import { getCurrentUser } from '@/lib/current-user';
import { listServers, relaySnapshot } from '@/lib/server-store';
import { ServerCard } from '@/components/server-card';
import { RelayBoard } from '@/components/relay-board';
import { ServerUpload } from '@/components/server-upload';
import { EmptyState } from '@/components/empty-state';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({
    title: '联机大厅',
    description: '玩家上传的 Minecraft 服务器状态与 Rusted Warfare 联机房，实时显示在线人数、版本与房间列表。',
    path: '/servers',
  });
}

/**
 * 联机大厅。
 *
 * 两个 tab 共用一页：我的世界走「库里的条目 + 后台探测快照」，
 * Rusted Warfare 走「实时聚合中转站房间」。前者首屏就能拿到状态，
 * 后者由 `RelayBoard` 每 15 秒自取——两种数据的新鲜度本来就不一样。
 */
export default async function ServersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const active: 'minecraft' | 'rusted_warfare' =
    tab === 'rusted' ? 'rusted_warfare' : 'minecraft';

  const [user, mc, rw] = await Promise.all([
    getCurrentUser(),
    listServers('minecraft'),
    active === 'rusted_warfare' ? listServers('rusted_warfare') : Promise.resolve([]),
  ]);
  // 房间只在需要时拉：MC 那栏不该为此多等一次中转站请求
  const relay = active === 'rusted_warfare' ? await relaySnapshot() : null;

  const onlineCount = mc.filter((s) => s.probeState === 'online').length;
  const onlinePlayers = mc
    .filter((s) => s.probeState === 'online')
    .reduce((sum, s) => sum + s.playersOnline, 0);

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">联机大厅</h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              Minecraft 服务器与 Rusted Warfare 联机房 · 人数与在线状态自动刷新
            </p>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {active === 'minecraft' ? (
              <>
                <span className="badge badge-live">{onlineCount} 台在线</span>
                <span className="badge">{onlinePlayers} 人在线</span>
              </>
            ) : (
              <>
                <span className="badge badge-live">{relay?.totalRooms ?? 0} 个房间</span>
                <span className="badge">{relay?.totalPlayers ?? 0} 人在线</span>
              </>
            )}
          </div>
        </div>

        <div className="srv-tabs">
          <Link href="/servers" className="srv-tab" data-on={active === 'minecraft'}>
            我的世界
            <span className="n">{mc.length}</span>
          </Link>
          <Link href="/servers?tab=rusted" className="srv-tab" data-on={active === 'rusted_warfare'}>
            Rusted Warfare
            {relay ? <span className="n">{relay.totalRooms}</span> : null}
          </Link>
        </div>

        {active === 'minecraft' ? (
          mc.length === 0 ? (
            <EmptyState
              title="还没有人挂服务器"
              desc="把自己常玩的 Minecraft 服务器填到右边，我们会自动探测在线人数、版本和延迟，填错地址也不怕，删掉重来就行。"
              icon="box"
            />
          ) : (
            <div className="srv-grid">
              {mc.map((item) => (
                <ServerCard key={item.id} item={item} />
              ))}
            </div>
          )
        ) : (
          <RelayBoard initial={relay ?? { nodes: [], totalRooms: 0, totalPlayers: 0 }} />
        )}
      </div>

      <aside className="rail">
        <ServerUpload loggedIn={Boolean(user)} />

        <div className="card rail-card">
          <div className="rail-title">大厅说明</div>
          <dl className="kv">
            <dt>探测周期</dt>
            <dd>约 1 分钟一次</dd>
            <dt>我的世界</dt>
            <dd>Java 与基岩版都可探</dd>
            <dt>Rusted Warfare</dt>
            <dd>房间从你填的中转站实时读取</dd>
            <dt>上限</dt>
            <dd>每人 20 个条目</dd>
          </dl>
          <p className="small muted" style={{ marginTop: 10, lineHeight: 1.75 }}>
            自由上传、不需要审核，站点只挡内网地址。填错端口会显示「离线」，点上传者头像旁边的删除即可移除。
          </p>
        </div>

        {active === 'rusted_warfare' && rw.length > 0 && (
          <div className="card rail-card">
            <div className="rail-title">已登记的中转站</div>
            <div className="row wrap" style={{ gap: 6 }}>
              {rw.map((s) => (
                <span key={s.id} className="badge badge-ghost" title={s.host}>
                  {s.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
