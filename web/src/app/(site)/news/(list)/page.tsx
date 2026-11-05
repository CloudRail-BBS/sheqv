import Link from 'next/link';
import { canExportPaper, listNews, listNewsColumns, newsStamp } from '@/lib/news-store';
import { getCurrentUser } from '@/lib/current-user';
import { buildMetadata } from '@/lib/seo';
import { EmptyState } from '@/components/empty-state';
import { FoldCard } from '@/components/fold-card';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({
    title: '新闻',
    description: '云轨社区的新闻版：社区要闻、赛事报道、开发者动态，按栏目归档，可导出为报刊。',
    path: '/news',
  });
}

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ col?: string }>;
}) {
  const sp = await searchParams;
  const col = (sp.col ?? '').trim();
  const [user, columns, items] = await Promise.all([
    getCurrentUser(),
    listNewsColumns(),
    listNews({ column: col || undefined, limit: 60 }),
  ]);
  const canExport = canExportPaper(user);
  const active = columns.find((c) => c.slug === col);
  const lead = items[0];
  const rest = items.slice(1);

  return (
    <div className="cols">
      <div className="col-main">
        <div className="crumb">
          <Link href="/">首页</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <span>新闻</span>
        </div>

        <div className="between page-head">
          <div>
            <div className="news-eyebrow">CLOUDRAIL NEWS</div>
            <h1 className="page-title">新闻</h1>
            <p className="small muted" style={{ marginTop: 6, maxWidth: 560 }}>
              {active?.intro || '社区要闻、赛事报道与开发者动态，按栏目归档；任意时间段的稿件可以拼成一期报刊。'}
            </p>
          </div>
          {canExport && (
            <Link href="/news/paper" className="btn btn-primary news-cta">
              导出报刊
            </Link>
          )}
        </div>

        <div className="row wrap news-chiprow" style={{ gap: 6 }}>
          <Link href="/news" className="chip" data-on={!col}>
            全部
            <span className="news-count">{columns.reduce((n, c) => n + c.count, 0)}</span>
          </Link>
          {columns.map((c) => (
            <Link key={c.id} href={`/news?col=${encodeURIComponent(c.slug)}`} className="chip" data-on={c.slug === col}>
              {c.name}
              <span className="news-count">{c.count}</span>
            </Link>
          ))}
        </div>

        {items.length === 0 ? (
          <div style={{ marginTop: 14 }}>
            <EmptyState
              title={col ? '这个栏目还没有稿件' : '还没有新闻'}
              desc="管理员在「后台 → 新闻」里写稿并发布，这里就会按时间排开。"
              actionHref="/admin/news"
              actionLabel="去后台写稿"
              icon="bell"
            />
          </div>
        ) : (
          <>
            {lead && (
              <Link href={`/news/${lead.id}`} className="card news-lead">
                {lead.cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="news-lead-cover" src={lead.cover} alt="" loading="eager" decoding="async" />
                )}
                <div className="news-lead-body">
                  <div className="news-meta">
                    {lead.columnName && <span className="news-tag">{lead.columnName}</span>}
                    <span>{newsStamp(lead.publishedAt)}</span>
                    {lead.author && <span>· {lead.author}</span>}
                  </div>
                  <h2 className="news-lead-title">{lead.title}</h2>
                  {lead.summary && <p className="news-lead-summary">{lead.summary}</p>}
                </div>
              </Link>
            )}

            {rest.length > 0 && (
              <div className="news-grid">
                {rest.map((n) => (
                  <Link key={n.id} href={`/news/${n.id}`} className="card news-card">
                    {n.cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="news-card-cover" src={n.cover} alt="" loading="lazy" decoding="async" />
                    )}
                    <div className="news-card-body">
                      <div className="news-meta">
                        {n.columnName && <span className="news-tag">{n.columnName}</span>}
                        <span>{newsStamp(n.publishedAt)}</span>
                      </div>
                      <h3 className="news-card-title">{n.title}</h3>
                      {n.summary && <p className="news-card-summary">{n.summary}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <aside className="rail">
        <FoldCard title="关于新闻">
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            新闻由管理员在后台发布，栏目可以自定义、排序，栏目顺序就是报刊的版面顺序。
          </p>
          <p className="small muted" style={{ lineHeight: 1.8, marginTop: 8 }}>
            报刊不是另存一份：按时间区间现场拼版，改稿后重新导出即可。
          </p>
          {canExport && (
            <Link href="/news/paper" className="btn btn-sm btn-ghost" style={{ marginTop: 10, width: '100%' }}>
              去拼一期报纸
            </Link>
          )}
        </FoldCard>
        <div className="card rail-card">
          <div className="rail-title">栏目</div>
          <div className="rail-list">
            {columns.map((c) => (
              <Link key={c.id} href={`/news?col=${encodeURIComponent(c.slug)}`} className="rail-item">
                <span>{c.name}</span>
                <span className="mono small muted" style={{ marginLeft: 'auto' }}>
                  {c.count}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
