import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { apiGet } from '@/lib/api-client';
import { getCurrentUser } from '@/lib/current-user';
import { buildMetadata } from '@/lib/seo';
import { fmtNum, sourceLabel } from '@/lib/resource-types';
import { RemoteCollect } from '@/components/remote-collect';

export const dynamic = 'force-dynamic';

interface RemoteDetail {
  title: string;
  summary: string;
  body: string;
  loaders: string;
  gameVersions: string;
  license: string;
  tags: string[];
  icon: string;
  downloads: number;
  kind: string;
  url: string;
}

interface RemotePayload {
  ok: boolean;
  detail: RemoteDetail;
  importedId: string | null;
}

const KIND_LABEL: Record<string, string> = {
  mods: '模组',
  modpacks: '整合包',
  resourcepacks: '材质',
  shaderpacks: '光影',
  datapacks: '数据包',
};
const kindLabel = (k: string) => KIND_LABEL[k] ?? '资源';

/** 逗号 / 斜杠拆开、去重、限量，和资源卡的胶囊同一套规则 */
function splitList(v: string, max = 6): string[] {
  const out: string[] = [];
  for (const raw of (v || '').split(/[,，/]/)) {
    const s = raw.trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out.slice(0, max);
}

async function load(source: string, id: string): Promise<RemotePayload | null> {
  return apiGet<RemotePayload>(
    `/api/v1/resources/remote/${encodeURIComponent(source)}/${encodeURIComponent(id)}`,
  ).catch(() => null);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ source: string; id: string }>;
}) {
  const { source, id } = await params;
  const data = await load(source, id);
  return buildMetadata({
    title: data?.detail.title || '外部资源',
    description: data?.detail.summary || `来自 ${sourceLabel(source)} 的条目`,
    path: `/resources/remote/${source}/${id}`,
    noIndex: true,
  });
}

/**
 * 外部条目的「站内预览页」。
 *
 * 不落库也能看：标题、封面、介绍正文、加载器与支持版本都从原站拉。
 * 管理员在底部直接收录进资源库；其他人看完去原站下载。
 * 如果这条其实已经收过了，直接跳到站内详情。
 */
export default async function RemoteResourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ source: string; id: string }>;
  searchParams: Promise<{ pid?: string }>;
}) {
  const { source, id } = await params;
  const sp = await searchParams;
  const projectId = Number(sp.pid ?? 0) || 0;

  const [user, data] = await Promise.all([getCurrentUser(), load(source, id)]);
  if (!data?.ok) notFound();
  if (data.importedId) redirect(`/resources/${data.importedId}`);

  const d = data.detail;
  const label = sourceLabel(source) || source;
  const origin = d.url || `https://${source === 'modrinth' ? 'modrinth.com' : 'curseforge.com'}`;
  const versions = splitList(d.gameVersions, 8);
  const loaders = splitList(d.loaders, 4);
  const tags = d.tags.slice(0, 8);
  const tone = 'mc';

  return (
    <div className="col-main">
      <div className="crumb">
        <Link href="/resources">资源库</Link>
        <span style={{ margin: '0 7px' }}>/</span>
        <span>{label}</span>
      </div>

      <article className="card card-pad res-detail">
        <div className="res-head">
          <div className={'res-head-mark cover-' + tone + (d.icon ? ' has-img' : '')}>
            {d.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.icon} alt={`${d.title} 的封面`} decoding="async" />
            ) : (
              <span aria-hidden="true">{d.title.trim().slice(0, 1) || 'R'}</span>
            )}
          </div>

          <div className="res-head-main">
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="badge">{kindLabel(d.kind)}</span>
              <a className="badge badge-ghost res-source-badge" href={origin} target="_blank" rel="noreferrer noopener">
                来自 {label} ↗
              </a>
            </div>
            <h1 className="page-title res-head-title">{d.title}</h1>
            {d.summary && <p className="res-head-summary">{d.summary}</p>}

            <div className="res-meta" style={{ marginTop: 10, gap: 12 }}>
              <span>{fmtNum(d.downloads)} 次下载</span>
              {loaders.length > 0 && <span>加载器 {loaders.join(' / ')}</span>}
              {d.license && <span>{d.license}</span>}
            </div>
          </div>
        </div>

        {(versions.length > 0 || tags.length > 0) && (
          <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
            {tags.map((t) => (
              <span key={`t-${t}`} className="res-chip">
                {t}
              </span>
            ))}
            {versions.map((v) => (
              <span key={`v-${v}`} className="res-chip mono">
                {v}
              </span>
            ))}
          </div>
        )}

        {d.body ? (
          <div className="res-body-text">{d.body}</div>
        ) : (
          <p className="small muted" style={{ marginTop: 14 }}>
            原站没有提供介绍正文，可以点下面的按钮去原站查看。
          </p>
        )}

        <div className="res-origin">
          <span className="res-origin-label">来源</span>
          <a href={origin} target="_blank" rel="noreferrer noopener">
            {label} ↗
          </a>
          <em>介绍、封面与版本信息来自原站；收录进资源库后以站内条目为准</em>
        </div>

        <div className="row wrap" style={{ gap: 10, marginTop: 14, alignItems: 'center' }}>
          {user?.isAdmin ? (
            <RemoteCollect
              source={source}
              sourceId={id}
              projectId={projectId}
              title={d.title}
              summary={d.summary}
              icon={d.icon}
              url={d.url}
              kind={d.kind}
              downloads={d.downloads}
            />
          ) : (
            <a className="btn btn-primary" href={origin} target="_blank" rel="noreferrer noopener">
              去 {label} 下载
            </a>
          )}
          <a className="btn btn-ghost" href={origin} target="_blank" rel="noreferrer noopener">
            查看原条目 ↗
          </a>
        </div>
      </article>
    </div>
  );
}
