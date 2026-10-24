import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRequestCaps } from '@/lib/request-caps';
import { GAME_LABEL, RESOURCES } from '@/lib/data';
import { formatBytes } from '@/lib/capabilities';
import { DownloadGate } from '@/components/download-gate';
import { buildMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = RESOURCES.find((r) => r.id === id);
  if (!item) return buildMetadata({ title: '资源', path: `/resources/${id}`, noIndex: true });
  return buildMetadata({
    title: item.title,
    description: item.summary,
    path: `/resources/${id}`,
  });
}

export default async function ResourceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = RESOURCES.find((r) => r.id === id);
  if (!item) notFound();

  const caps = await getRequestCaps();
  const { directDownload, externalBrowserHint } = caps.capabilities.resource;

  return (
    <div className="cols">
      <div className="col-main">
        <div className="crumb">
          <Link href="/resources">资源库</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <span>{item.category}</span>
        </div>

        <div>
          <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
            <span className={'badge ' + (item.game === 'mc' ? 'badge-mc' : 'badge-rw')}>{GAME_LABEL[item.game]}</span>
            <span className="badge">{item.category}</span>
            {item.tags.map((t) => (
              <span key={t} className="badge badge-ghost">
                #{t}
              </span>
            ))}
          </div>
          <h1 className="page-title">{item.title}</h1>
          <div className="small muted" style={{ marginTop: 6 }}>
            {item.author} · {item.authorGuild}公会 · 更新于 {item.updatedAt} · {item.version}
          </div>
        </div>

        <div className="card card-pad">
          <h3 style={{ fontSize: 13, marginBottom: 8 }}>简介</h3>
          <p style={{ color: 'var(--text-2)', fontSize: 13.5, lineHeight: 1.8 }}>{item.summary}</p>
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
            <h3 style={{ fontSize: 13 }}>版本与更新日志</h3>
            <span className="small muted">{item.versions.length} 个版本</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>版本</th>
                <th>日期</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {item.versions.map((v) => (
                <tr key={v.version}>
                  <td className="mono" style={{ color: v.version === item.version ? 'var(--accent)' : undefined }}>
                    {v.version}
                  </td>
                  <td className="mono muted">{v.date}</td>
                  <td className="dim">{v.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card card-pad">
          <h3 style={{ fontSize: 13, marginBottom: 10 }}>文件信息</h3>
          <dl className="kv">
            <dt>大小</dt>
            <dd className="mono">{formatBytes(item.sizeBytes)}</dd>
            <dt>哈希</dt>
            <dd className="mono">sha256:9f2a…{item.id.slice(0, 4)}e</dd>
            <dt>许可</dt>
            <dd>{item.license}</dd>
            <dt>风险提示</dt>
            <dd className="dim">外链资源未经扫描，下载后请自行校验哈希</dd>
          </dl>
        </div>
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="between" style={{ marginBottom: 10 }}>
            <span className="rail-title" style={{ margin: 0 }}>下载</span>
            <span className="badge">{item.version}</span>
          </div>
          <DownloadGate
            title={item.title}
            sizeLabel={formatBytes(item.sizeBytes)}
            directDownload={directDownload}
            isWeChat={caps.isWeChat}
            externalHint={externalBrowserHint}
          />
        </div>

        <div className="card rail-card">
          <div className="rail-title">数据</div>
          <dl className="kv">
            <dt>下载量</dt>
            <dd className="mono">{item.downloads.toLocaleString('zh-CN')}</dd>
            <dt>评分</dt>
            <dd className="mono">{item.rating.toFixed(1)} / 5.0</dd>
            <dt>作者</dt>
            <dd>{item.author}</dd>
            <dt>所属</dt>
            <dd>{item.authorGuild}</dd>
          </dl>
          <div className="row" style={{ marginTop: 12, gap: 6 }}>
            <button className="btn btn-ghost btn-sm grow">举报</button>
            <button className="btn btn-ghost btn-sm grow">侵权投诉</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
