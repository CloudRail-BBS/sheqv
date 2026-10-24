import { getRequestCaps } from '@/lib/request-caps';
import { RESOURCES } from '@/lib/data';
import { ResourceCard } from '@/components/resource-card';
import { UploadPanel } from '@/components/upload-panel';
import { formatBytes } from '@/lib/capabilities';
import { EmptyState } from '@/components/empty-state';
import { buildMetadata } from '@/lib/seo';

const FILTERS = ['全部', 'Minecraft', 'Roblox', '地图', '整合包', '材质', '存档', '工具'];

export async function generateMetadata() {
  return buildMetadata({
    title: '资源库',
    description: '玩家分享的地图、整合包、材质与工具，支持按游戏与分类筛选。',
    path: '/resources',
  });
}

export default async function ResourcesPage() {
  const caps = await getRequestCaps();

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">资源库</h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              地图、整合包、材质与工具 · 全部过审后展示
            </p>
          </div>
          <span className="badge">{RESOURCES.length} 个条目</span>
        </div>

        <div className="row wrap" style={{ gap: 6 }}>
          {FILTERS.map((f, i) => (
            <button key={f} className="chip" data-on={i === 0}>
              {f}
            </button>
          ))}
        </div>

        <div className="res-grid">
          {RESOURCES.length === 0 && (
          <EmptyState title="资源库还是空的" desc="还没有人上传地图、整合包或材质。接入上传通道后，这里会按游戏与分类展示。" actionHref="/" actionLabel="去社区看看" icon="box" />
        )}

        {RESOURCES.map((r) => (
            <ResourceCard key={r.id} item={r} directDownload={caps.capabilities.resource.directDownload} />
          ))}
        </div>

        <button className="btn btn-ghost" style={{ width: '100%', height: 38 }}>
          加载更多
        </button>
      </div>

      <aside className="rail">
        <UploadPanel maxUploadBytes={caps.limits.maxUploadBytes} chunkConcurrency={caps.limits.chunkConcurrency} />

        <div className="card rail-card">
          <div className="rail-title">当前形态的下载能力</div>
          <dl className="kv">
            <dt>runtime</dt>
            <dd className="mono">{caps.runtime} · {caps.source}</dd>
            <dt>直下</dt>
            <dd className="mono" style={{ color: caps.capabilities.resource.directDownload ? 'var(--accent)' : 'var(--amber)' }}>
              {String(caps.capabilities.resource.directDownload)}
            </dd>
            <dt>上传上限</dt>
            <dd className="mono">{formatBytes(caps.limits.maxUploadBytes)}</dd>
            <dt>附件上限</dt>
            <dd className="mono">{formatBytes(caps.limits.attachmentBytes)}</dd>
          </dl>
          <p className="small muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
            来自 <code className="mono">/api/v1/bootstrap</code>，服务端按 UA 判定后下发。
          </p>
        </div>

        <div className="card rail-card">
          <div className="rail-title">投稿须知</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            转载需注明许可协议；含外链的资源会标注风险；侵权投诉 48 小时内处理。
          </p>
        </div>
      </aside>
    </div>
  );
}
