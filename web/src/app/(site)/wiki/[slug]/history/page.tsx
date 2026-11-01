import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listWiki, listRevisions, getRevision, fmtDay } from '@/lib/wiki';
import { Markdown } from '@/lib/markdown';
import { getCurrentUser } from '@/lib/current-user';
import { WikiRestore } from '@/components/wiki-restore';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

const fmtAt = (ms: number) => {
  const d = new Date(ms + 8 * 3600 * 1000);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return buildMetadata({ title: '历史版本 · 百科', path: `/wiki/${slug}/history`, noIndex: true });
}

export default async function WikiHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ rev?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const [entries, revisions, user] = await Promise.all([
    listWiki({}),
    listRevisions(slug),
    getCurrentUser(),
  ]);
  const entry = entries.find((e) => e.slug === slug);
  if (!entry) notFound();

  const viewing = sp.rev ? await getRevision(slug, sp.rev) : null;

  return (
    <div className="cols">
      <div className="col-main">
        <div className="crumb">
          <Link href="/wiki">百科</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <Link href={`/wiki/${slug}`}>{entry.title}</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <span>历史版本</span>
        </div>

        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">历史版本</h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              共 {revisions.length} 个历史版本 · 每次保存前会自动存一份
            </p>
          </div>
          <Link href={`/wiki/${slug}`} className="btn btn-sm btn-ghost">
            返回词条
          </Link>
        </div>

        {viewing && (
          <div className="card card-pad wiki-version">
            <div className="between" style={{ marginBottom: 10, alignItems: 'center' }}>
              <div>
                <b style={{ fontSize: 13 }}>正在查看历史版本</b>
                <p className="small muted" style={{ marginTop: 3 }}>
                  {fmtAt(viewing.createdAt)} · 编辑者 {viewing.editor}
                </p>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {user?.isAdmin && <WikiRestore entryId={entry.id} revisionId={viewing.id} />}
                <Link href={`/wiki/${slug}`} className="btn btn-sm btn-ghost">
                  看最新版本
                </Link>
              </div>
            </div>
            <h2 className="wiki-version-title">{viewing.title}</h2>
            {viewing.summary && <p className="wiki-article-lead">{viewing.summary}</p>}
            <div className="wiki-body">
              <Markdown text={viewing.body} className="md-body wiki-md" />
            </div>
          </div>
        )}

        <div className="card wiki-list" style={{ marginTop: viewing ? 12 : 4 }}>
          <Link href={`/wiki/${slug}`} className="wiki-row wiki-rev-row" data-current="true">
            <div className="wiki-row-main">
              <div className="wiki-row-top">
                <span className="badge badge-live">当前版本</span>
              </div>
              <h2 className="wiki-row-title">{entry.title}</h2>
              <div className="wiki-row-meta">更新于 {fmtDay(entry.updatedAt)}</div>
            </div>
          </Link>

          {revisions.map((r, i) => (
            <Link key={r.id} href={`/wiki/${slug}/history?rev=${r.id}`} className="wiki-row wiki-rev-row">
              <div className="wiki-row-main">
                <div className="wiki-row-top">
                  <span className="badge badge-ghost">第 {revisions.length - i} 版</span>
                </div>
                <h2 className="wiki-row-title">{r.title}</h2>
                <div className="wiki-row-meta">
                  {fmtAt(r.createdAt)} · 编辑者 {r.editor}
                </div>
              </div>
              <span className="wiki-rev-view">查看</span>
            </Link>
          ))}
        </div>

        {revisions.length === 0 && (
          <p className="card card-pad small muted" style={{ marginTop: 12 }}>
            这个词条还没有历史版本。下一次在后台保存修改时，会自动把当前内容存成第 1 版。
          </p>
        )}
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">关于历史版本</div>
          <p className="small muted" style={{ lineHeight: 1.85 }}>
            只有管理员编辑词条时才会产生版本记录，每次保存前存一份当前内容。
            回滚同样会先备份当前内容，所以误操作也能再改回来。
          </p>
        </div>
      </aside>
    </div>
  );
}
