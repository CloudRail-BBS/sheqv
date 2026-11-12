import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canExportPaper, getNews, newsDay } from '@/lib/news-store';
import { getCurrentUser } from '@/lib/current-user';
import { breadcrumbJsonLd, buildMetadata, newsArticleJsonLd } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getNews(id);
  if (!item) return buildMetadata({ title: '新闻', path: `/news/${id}`, noIndex: true });
  return buildMetadata({
    title: item.title,
    description: item.summary || item.body.replace(/\s+/g, ' ').slice(0, 120),
    path: `/news/${id}`,
    type: 'article',
    publishedTime: item.publishedAt,
    authors: item.author ? [item.author] : undefined,
  });
}

export default async function NewsDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [item, user] = await Promise.all([getNews(id), getCurrentUser()]);
  if (!item) notFound();
  const canExport = canExportPaper(user);

  const paragraphs = item.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const jsonLd = await newsArticleJsonLd({
    id: item.id,
    title: item.title,
    summary: item.summary,
    body: item.body,
    author: item.author,
    cover: item.cover,
    columnName: item.columnName,
    publishedAt: item.publishedAt,
  });
  const crumbs = await breadcrumbJsonLd([
    { name: '首页', path: '/' },
    { name: '新闻', path: '/news' },
    ...(item.columnName
      ? [{ name: item.columnName, path: `/news?column=${encodeURIComponent(item.columnSlug || '')}` }]
      : []),
    { name: item.title, path: `/news/${encodeURIComponent(item.id)}` },
  ]);

  return (
    <div className="cols">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: crumbs }}
      />
      <div className="col-main">
        <div className="crumb">
          <Link href="/news">新闻</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <span>{item.columnName || '未归档'}</span>
        </div>

        <article className="card news-detail">
          <div className="news-detail-head">
            <div className="news-meta">
              {item.columnName && <span className="news-tag">{item.columnName}</span>}
              <span className="mono">{newsDay(item.publishedAt)}</span>
            </div>
            <h1 className="news-detail-title">{item.title}</h1>
            {item.summary && <p className="news-detail-summary">{item.summary}</p>}
            <div className="news-detail-byline">
              {item.author && <span>记者 {item.author}</span>}
              {item.source && <span>{item.source}</span>}
            </div>
          </div>

          {item.cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="news-detail-cover" src={item.cover} alt={item.title} decoding="async" />
          )}

          <div className="news-detail-body">
            {paragraphs.length === 0 ? (
              <p className="small muted">这篇稿件还没有正文。</p>
            ) : (
              paragraphs.map((p, i) => <p key={i}>{p}</p>)
            )}
          </div>

          <div className="news-detail-foot">
            <Link href="/news" className="btn btn-sm btn-ghost">
              ← 回新闻版
            </Link>
            {canExport && (
              <Link href="/news/paper" className="btn btn-sm btn-ghost">
                导出为报刊
              </Link>
            )}
          </div>
        </article>
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">栏目</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            {item.columnName
              ? `这篇稿件归在「${item.columnName}」栏目，报刊里也会排在对应版面。`
              : '这篇稿件还没有归档，报刊里会排在「未归档」版面。'}
          </p>
        </div>
        <div className="card rail-card">
          <div className="rail-title">报刊</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            挑一个时间区间，把这段时间的稿件按栏目拼成一份报纸，可打印或存为 PDF。
          </p>
          <Link href="/news/paper" className="btn btn-sm btn-ghost" style={{ marginTop: 10, width: '100%' }}>
            去拼报纸
          </Link>
        </div>
      </aside>
    </div>
  );
}
