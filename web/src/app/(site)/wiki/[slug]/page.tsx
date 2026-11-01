import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getWiki, tocOf, categoryLabel, fmtDay, listRevisions, WIKI_CATEGORIES } from '@/lib/wiki';
import { Markdown } from '@/lib/markdown';
import { buildMetadata } from '@/lib/seo';
import { getCurrentUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getWiki(slug);
  if (!data) return buildMetadata({ title: '百科', path: `/wiki/${slug}`, noIndex: true });
  return buildMetadata({
    title: data.entry.title,
    description: data.entry.summary || undefined,
    path: `/wiki/${data.entry.slug}`,
  });
}

export default async function WikiEntryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [data, user, revisions] = await Promise.all([
    getWiki(slug),
    getCurrentUser(),
    listRevisions(slug),
  ]);
  if (!data) notFound();

  const { entry, related } = data;
  const cat = WIKI_CATEGORIES.find((c) => c.key === entry.category);
  const toc = tocOf(entry.body).filter((h) => h.level === 2).slice(0, 14);

  return (
    <div className="cols">
      <div className="col-main">
        <div className="crumb">
          <Link href="/wiki">百科</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <Link href={`/wiki?category=${entry.category}`}>{categoryLabel(entry.category)}</Link>
        </div>

        <article className="card card-pad wiki-article">
          <div className="wiki-article-top">
            <span className="wiki-tag">{categoryLabel(entry.category)}</span>
            {entry.tags.map((t) => (
              <span key={t} className="badge badge-ghost">
                {t}
              </span>
            ))}
            {user?.isAdmin && (
              <Link href="/admin/wiki" className="wiki-edit">
                编辑词条
              </Link>
            )}
          </div>

          <h1 className="wiki-article-title">{entry.title}</h1>
          {entry.summary && <p className="wiki-article-lead">{entry.summary}</p>}

          <div className="wiki-article-meta">
            <span>更新于 {fmtDay(entry.updatedAt)}</span>
            <span>·</span>
            <span>{entry.views} 次浏览</span>
            <span>·</span>
            <span>维护者 {entry.author}</span>
          </div>

          <div className="wiki-body">
            <Markdown text={entry.body} className="md-body wiki-md" />
          </div>
        </article>

        {related.length > 0 && (
          <>
            <h2 className="section-title" style={{ marginTop: 16 }}>
              同类词条
            </h2>
            <div className="wiki-grid">
              {related.map((it) => (
                <Link key={it.id} href={`/wiki/${it.slug}`} className="card wiki-card">
                  <div className="wiki-card-top">
                    <span className="wiki-tag">{categoryLabel(it.category)}</span>
                  </div>
                  <h2 className="wiki-card-title">{it.title}</h2>
                  <p className="wiki-card-desc">{it.summary || '还没有写摘要。'}</p>
                  <div className="wiki-card-foot">
                    <span>更新于 {fmtDay(it.updatedAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      <aside className="rail">
        {toc.length > 1 && (
          <div className="card rail-card wiki-toc">
            <div className="rail-title">本页目录</div>
            <nav>
              {toc.map((h) => (
                <a key={h.id} href={`#${h.id}`}>
                  {h.label}
                </a>
              ))}
            </nav>
          </div>
        )}

        <div className="card rail-card">
          <div className="rail-title">维护</div>
          <Link href={`/wiki/${slug}/history`} className="wiki-hist-link">
            <span>
              <b>历史版本</b>
              <i>{revisions.length > 0 ? `共 ${revisions.length} 个` : '还没有历史版本'}</i>
            </span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className="card rail-card">
          <div className="rail-title">词条信息</div>
          <div className="wiki-info">
            <span>分类</span>
            <b>{cat?.label ?? '其他'}</b>
            <span>创建</span>
            <b>{fmtDay(entry.createdAt)}</b>
            <span>最近更新</span>
            <b>{fmtDay(entry.updatedAt)}</b>
            <span>维护者</span>
            <b>{entry.author}</b>
          </div>
          <p className="small muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
            内容有误或想补充？在工单里贴出词条链接，管理员会核对后修改。
          </p>
          <Link href="/tickets" className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 8 }}>
            反馈问题
          </Link>
        </div>
      </aside>
    </div>
  );
}
