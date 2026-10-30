import Link from 'next/link';
import { UserHoverCard } from '@/components/user-hover-card';
import { notFound } from 'next/navigation';
import { getRequestCaps } from '@/lib/request-caps';
import { getCurrentUser } from '@/lib/current-user';
import { getResource } from '@/lib/resource-store';
import { ResourceActions } from '@/components/resource-actions';
import { buildMetadata, resourceJsonLd } from '@/lib/seo';
import { AuditProgress } from '@/components/audit-progress';
import { fmtNum, fmtSize, gameLabel, gameTone } from '@/lib/resource-types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getResource(id);
  if (!item || item.status !== 'published') {
    return buildMetadata({ title: '资源', path: `/resources/${id}`, noIndex: true });
  }
  return buildMetadata({
    title: item.title,
    description: item.summary || `${item.author} 分享的 ${gameLabel(item.game)} ${item.category}`,
    path: `/resources/${id}`,
  });
}

const fmtDate = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export default async function ResourceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [item, user, caps] = await Promise.all([
    getResource(id),
    getCurrentUser(),
    getRequestCaps(),
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
          category: item.category,
          gameLabel: gameLabel(item.game),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }).catch(() => '')
      : '';
  const { directDownload, externalBrowserHint } = caps.capabilities.resource;

  return (
    <div className="cols">
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      )}
      <div className="col-main">
        <div className="crumb">
          <Link href="/resources">资源库</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <span>{item.category}</span>
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
          <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
            <span className={'badge badge-' + tone}>{gameLabel(item.game)}</span>
            <span className="badge">{item.category}</span>
            {item.version && <span className="badge badge-ghost">v{item.version}</span>}
            {item.status === 'hidden' && <span className="badge badge-danger">已下架</span>}
            {item.status === 'pending' && <span className="badge badge-warn">审核中</span>}
            {item.status === 'rejected' && <span className="badge badge-danger">未通过</span>}
          </div>

          <h1 className="page-title" style={{ marginBottom: 8 }}>{item.title}</h1>
          {item.summary && (
            <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.85, marginBottom: 4 }}>
              {item.summary}
            </p>
          )}

          <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
            {item.tags.map((t) => (
              <span key={t} className="badge badge-ghost">#{t}</span>
            ))}
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
          <dl className="kv">
            <dt>下载</dt>
            <dd className="mono">{fmtNum(item.downloadCount)}</dd>
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
            {item.gameVersions && (
              <>
                <dt>支持版本</dt>
                <dd>{item.gameVersions}</dd>
              </>
            )}
            {item.loaders && (
              <>
                <dt>加载器</dt>
                <dd>{item.loaders}</dd>
              </>
            )}
            {item.sourceUrl && (
              <>
                <dt>来源</dt>
                <dd>
                  <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener">
                    原帖 / 百科
                  </a>
                </dd>
              </>
            )}
            <dt>发布</dt>
            <dd className="mono">{fmtDate(item.createdAt)}</dd>
          </dl>

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
