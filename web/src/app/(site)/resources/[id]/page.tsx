import Link from 'next/link';
import { UserHoverCard } from '@/components/user-hover-card';
import { notFound } from 'next/navigation';
import { getRequestCaps } from '@/lib/request-caps';
import { getCurrentUser } from '@/lib/current-user';
import { getResource } from '@/lib/resource-store';
import { ResourceActions } from '@/components/resource-actions';
import { ResourceCover } from '@/components/resource-cover';
import { breadcrumbJsonLd, buildMetadata, resourceJsonLd } from '@/lib/seo';
import { AuditProgress } from '@/components/audit-progress';
import {
  fmtNum,
  fmtSize,
  gameLabel,
  gameTone,
  sourceLabel,
  sourceUrlFor,
} from '@/lib/resource-types';
import { catLabel, listCategories } from '@/lib/category-store';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getResource(id);
  if (!item || item.status !== 'published') {
    return buildMetadata({ title: '资源', path: `/resources/${id}`, noIndex: true });
  }
  const cats = await listCategories('resource');
  return buildMetadata({
    title: item.title,
    description:
      item.summary ||
      `${item.author} 分享的 ${gameLabel(item.game)} ${catLabel(cats, item.category)}`,
    path: `/resources/${id}`,
  });
}

const fmtDate = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export default async function ResourceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [item, user, caps, cats] = await Promise.all([
    getResource(id),
    getCurrentUser(),
    getRequestCaps(),
    listCategories('resource'),
  ]);

  if (!item) notFound();

  const tone = gameTone(item.game);
  const canDelete = Boolean(user && (user.id === item.authorId || user.isAdmin));
  const jsonLd =
    item.status === 'published'
      ? await resourceJsonLd({
          id: item.id,
          title: item.title,
          summary: item.summary,
          author: item.author,
          category: catLabel(cats, item.category),
          gameLabel: gameLabel(item.game),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }).catch(() => '')
      : '';
  const { directDownload, externalBrowserHint } = caps.capabilities.resource;
  /** 「1.20.1, Fabric、1.20.4」这类自由文本拆成胶囊 */
  const splitList = (raw: string) =>
    raw
      .split(/[,，、\s]+/)
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 12);
  const versions = splitList(item.gameVersions);
  const loaders = splitList(item.loaders);
  const crumbs = item.status === 'published'
    ? await breadcrumbJsonLd([
        { name: '首页', path: '/' },
        { name: '资源库', path: '/resources' },
        { name: catLabel(cats, item.category), path: `/resources?category=${encodeURIComponent(item.category)}` },
        { name: item.title, path: `/resources/${encodeURIComponent(item.id)}` },
      ]).catch(() => '')
    : '';

  return (
    <div className="cols">
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      )}
      {crumbs && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: crumbs }} />
      )}
      <div className="col-main">
        <div className="crumb">
          <Link href="/resources">资源库</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <span>{catLabel(cats, item.category)}</span>
        </div>

        {item.status !== 'published' && (
          <div style={{ marginBottom: 12 }}>
            <AuditProgress
              status={item.status as 'pending' | 'rejected' | 'hidden'}
              createdAt={item.createdAt}
              reviewedAt={item.reviewedAt}
              rejectReason={item.rejectReason}
            />
          </div>
        )}

        <article className="card card-pad res-detail">
          {/* 参考资源广场：左边一块方标，右边标题与简介；下载动作紧跟其后 */}
          <div className="res-head">
            <ResourceCover
              id={item.id}
              cover={item.cover}
              title={item.title}
              tone={tone}
              canEdit={canDelete}
            />
            <div className="res-head-main">
              <div className="row wrap" style={{ gap: 6 }}>
                <span className={'badge badge-' + tone}>{gameLabel(item.game)}</span>
                <span className="badge">{catLabel(cats, item.category)}</span>
                {item.source && (
                  <a
                    className="badge badge-ghost res-source-badge"
                    href={sourceUrlFor(item.source, item.sourceKind, item.sourceId) || item.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={`在 ${sourceLabel(item.source)} 打开原条目`}
                  >
                    来自 {sourceLabel(item.source)} ↗
                  </a>
                )}
                {item.version && <span className="badge badge-ghost">v{item.version}</span>}
                {item.status === 'hidden' && <span className="badge badge-danger">已下架</span>}
                {item.status === 'pending' && <span className="badge badge-warn">审核中</span>}
                {item.status === 'rejected' && <span className="badge badge-danger">未通过</span>}
              </div>

              <h1 className="page-title res-head-title">{item.title}</h1>
              {item.summary && <p className="res-head-summary">{item.summary}</p>}

              {item.tags.length > 0 && (
                <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                  {item.tags.map((t) => (
                    <span key={t} className="badge badge-ghost">#{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="res-detail-actions">
            <ResourceActions
              id={item.id}
              initialLiked={item.liked}
              initialLikes={item.likeCount}
              initialDownloads={item.downloadCount}
              sizeBytes={item.sizeBytes}
              url={item.url}
              files={item.files ?? []}
              loggedIn={Boolean(user)}
              canDelete={canDelete}
              directDownload={directDownload}
            />
          </div>

          {!directDownload && externalBrowserHint && (
            <p className="small" style={{ color: 'var(--amber)', marginTop: 10 }}>
              {externalBrowserHint}
            </p>
          )}

          <div className="res-body-text">
            {item.body
              ? item.body.split('\n').map((line, i) =>
                  line.trim() ? <p key={i}>{line}</p> : <br key={i} />,
                )
              : <p className="muted">作者还没有写详细介绍。</p>}
          </div>
        </article>

        <div className="card card-pad" style={{ marginTop: 12 }}>
          <div className="between">
            <div className="row" style={{ gap: 10 }}>
              <span className="post-avatar" style={{ width: 38, height: 38, borderRadius: 11 }}>
                {item.author.slice(0, 1)}
              </span>
              <div>
                <div className="row" style={{ gap: 6 }}>
                  <UserHoverCard userId={item.authorId} name={item.author}>
                    <b>{item.author}</b>
                  </UserHoverCard>
                  {item.authorDeveloper && <span className="dev-chip">开发者</span>}
                </div>
                <div className="small muted">
                  {item.teamId ? (
                    <>
                      来自开发团队{' '}
                      <Link href={`/dev-teams/${item.teamId}`} style={{ color: 'var(--blue)' }}>
                        {item.teamName}
                      </Link>
                    </>
                  ) : (
                    '以个人名义发布'
                  )}
                </div>
              </div>
            </div>
            <Link href="/dev-teams" className="btn btn-sm btn-ghost">
              开发团队
            </Link>
          </div>
        </div>
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">资源信息</div>

          <div className="res-dl-hero">
            <b className="mono">{fmtNum(item.downloadCount)}</b>
            <span>次下载</span>
          </div>

          <div className="row wrap res-pills">
            <span className={'badge badge-' + tone}>{gameLabel(item.game)}</span>
            <span className="badge">{catLabel(cats, item.category)}</span>
            {loaders.map((v) => (
              <span key={v} className="badge badge-ghost">{v}</span>
            ))}
          </div>

          <dl className="kv">
            <dt>点赞</dt>
            <dd className="mono">{fmtNum(item.likeCount)}</dd>
            <dt>文件大小</dt>
            <dd className="mono">{fmtSize(item.sizeBytes)}</dd>
            {item.fileCount > 0 && (
              <>
                <dt>文件数</dt>
                <dd className="mono">{item.fileCount}</dd>
              </>
            )}
            <dt>版本</dt>
            <dd className="mono">{item.version || '—'}</dd>
            <dt>授权</dt>
            <dd>{item.license || '作者保留'}</dd>
            <dt>发布</dt>
            <dd className="mono">{fmtDate(item.createdAt)}</dd>
          </dl>

          {versions.length > 0 && (
            <div className="res-versions">
              <div className="res-versions-label">支持版本</div>
              <div className="row wrap" style={{ gap: 4 }}>
                {versions.map((v) => (
                  <span key={v} className="badge badge-ghost mono res-ver">{v}</span>
                ))}
              </div>
            </div>
          )}

          {/* 来源要写清楚：外部收录的条目不是本站原创，介绍与封面都来自原站 */}
          {item.source && (
            <div className="res-origin">
              <span className="res-origin-label">来源</span>
              <a
                href={sourceUrlFor(item.source, item.sourceKind, item.sourceId) || item.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                {sourceLabel(item.source)} ↗
              </a>
              <em>介绍、封面与版本信息来自原站，本站只做收录与索引</em>
            </div>
          )}

          {item.sourceUrl && !item.source && (
            <a
              className="res-source"
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              打开原帖 ↗
            </a>
          )}

          {item.deps && (
            <div className="res-deps">
              <b>前置依赖</b>
              <p>{item.deps}</p>
            </div>
          )}
        </div>

        <div className="card rail-card">
          <div className="rail-title">开发者榜单</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            资源下载量与点赞量会折算成开发者积分，个人与团队各有一张榜。
          </p>
          <Link href="/leaderboard#developers" className="btn btn-sm btn-ghost" style={{ marginTop: 10, width: '100%' }}>
            查看开发者榜
          </Link>
        </div>
      </aside>
    </div>
  );
}
