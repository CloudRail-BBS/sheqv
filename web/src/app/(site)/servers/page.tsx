import Link from 'next/link';
import { getCurrentUser } from '@/lib/current-user';
import { listMyServers, listServers, relaySnapshot } from '@/lib/server-store';
import { ServerCard } from '@/components/server-card';
import { RelayBoard } from '@/components/relay-board';
import { ServerUpload } from '@/components/server-upload';
import { MySubmissions } from '@/components/my-submissions';
import { EmptyState } from '@/components/empty-state';
import { FoldCard } from '@/components/fold-card';
import { buildMetadata } from '@/lib/seo';
import { getSettings } from '@/lib/settings';

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

  const [user, mc, rw, settings] = await Promise.all([
    getCurrentUser(),
    listServers('minecraft'),
    active === 'rusted_warfare' ? listServers('rusted_warfare') : Promise.resolve([]),
    getSettings(),
  ]);
  // 待审核的那几条不在公开列表里，单独取一次给「我的提交」
  const mine = user ? await listMyServers() : [];
  // 房间只在需要时拉：MC 那栏不该为此多等一次中转站请求
  const relay = active === 'rusted_warfare' ? await relaySnapshot() : null;

  const onlineCount = mc.filter((s) => s.probeState === 'online').length;
  const onlinePlayers = mc
    .filter((s) => s.probeState === 'online')
    .reduce((sum, s) => sum + s.playersOnline, 0);
  // 大厅先解决「现在能进哪台」：在线优先 → 人多优先 → 新提交优先
  const ranked = [...mc].sort((a, b) => {
    const on = Number(b.probeState === 'online') - Number(a.probeState === 'online');
    if (on !== 0) return on;
    if (b.playersOnline !== a.playersOnline) return b.playersOnline - a.playersOnline;
    return b.createdAt - a.createdAt;
  });
  const newest = [...mc].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const hot = ranked.filter((s) => s.probeState === 'online' && s.playersOnline > 0).slice(0, 3);
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">联机大厅</h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              {settings.serversHint || 'Minecraft 服务器与 Rusted Warfare 联机房 · 人数与在线状态自动刷新'}
            </p>
          </div>
          <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
            <ServerUpload loggedIn={Boolean(user)} defaultKind={active} />
            {active === 'minecraft' ? (
              <span className="srv-stats" title={`共收录 ${mc.length} 个服务器`}>
                <i className="dot" data-state={onlineCount > 0 ? 'online' : 'offline'} />
                <b className="mono">{onlineCount}</b> 台在线
                <span className="srv-stats-sep">·</span>
                <b className="mono">{onlinePlayers}</b> 人在线
                <span className="srv-stats-sep">·</span>
                共 {mc.length} 个
              </span>
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

        {mine.length > 0 && (
          <MySubmissions items={mine.filter((s) => s.kind === active)} />
        )}

        {active === 'minecraft' && newest.length > 0 && (
          <div className="row srv-new-row">
            <span className="srv-new-label">新服速递</span>
            <div className="srv-new">
              {newest.map((s) => (
                <a key={s.id} href={`#srv-${s.id}`} className="srv-new-item" title={s.name}>
                  <span className="srv-new-ava">{s.name.slice(0, 1)}</span>
                  <span className="srv-new-name">{s.name}</span>
                  <span className="srv-new-date">{day(s.createdAt)}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {active === 'minecraft' ? (
          mc.length === 0 ? (
            <EmptyState
              title="还没有已通过审核的服务器"
              desc="点右上角「上传服务器」提交自己的服务器，管理员通过后会出现在这里，并自动探测在线人数、版本和延迟。"
              icon="box"
            />
          ) : (
            <div className="srv-grid">
              {ranked.map((item) => (
                <ServerCard key={item.id} item={item} />
              ))}
            </div>
          )
        ) : (
          <RelayBoard initial={relay ?? { nodes: [], totalRooms: 0, totalPlayers: 0 }} />
        )}
      </div>

      <aside className="rail">
        {active === 'minecraft' && hot.length > 0 && (
          <div className="card rail-card">
            <div className="rail-title">人气服务器</div>
            <div className="rail-list">
              {hot.map((s, i) => (
                <a key={s.id} href={`#srv-${s.id}`} className="rail-item">
                  <span className="idx">{i + 1}</span>
                  <span className="rail-name">{s.name}</span>
                  <span className="mono small muted">{s.playersOnline} 人</span>
                </a>
              ))}
            </div>
          </div>
        )}

        <FoldCard title="大厅说明">
          <dl className="kv">
            <dt>审核</dt>
            <dd>上传后人工过一遍，通过才展示</dd>
            <dt>探测周期</dt>
            <dd>通过后约 1 分钟一次</dd>
            <dt>我的世界</dt>
            <dd>Java 与基岩版都可探</dd>
            <dt>Rusted Warfare</dt>
            <dd>房间从你填的中转站实时读取</dd>
            <dt>上限</dt>
            <dd>每人 20 个条目</dd>
          </dl>
          <p className="small muted" style={{ marginTop: 10, lineHeight: 1.75 }}>
            提交后可以在「我的提交」里看状态；填错地址就删掉重传，不用等审核。
            站点只接受公网地址，内网 IP 会在提交时被挡下。
          </p>
        </FoldCard>

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
