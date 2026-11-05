import Link from 'next/link';
import { listNews, listNewsColumns, newsDay, shanghaiDay } from '@/lib/news-store';
import { buildMetadata } from '@/lib/seo';
import { PaperToolbar } from '@/components/paper-toolbar';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({
    title: '报刊',
    description: '把一段时间的社区新闻按栏目拼成一份报纸，可直接打印或存为 PDF。',
    path: '/news/paper',
    noIndex: true,
  });
}

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function NewsPaperPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; cols?: string }>;
}) {
  const sp = await searchParams;
  const from = isDay(sp.from ?? '') ? sp.from! : shanghaiDay(-29);
  const to = isDay(sp.to ?? '') ? sp.to! : shanghaiDay();
  const picked = (sp.cols ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const [columns, items] = await Promise.all([
    listNewsColumns(),
    listNews({ from, to, limit: 300 }),
  ]);

  const shown = columns.filter((c) => picked.length === 0 || picked.includes(c.slug));
  const sections = shown
    .map((c) => ({ ...c, articles: items.filter((n) => n.columnSlug === c.slug) }))
    .filter((s) => s.articles.length > 0);
  const loose = items.filter((n) => !n.columnSlug);

  return (
    <div className="paper-wrap">
      <div className="crumb no-print">
        <Link href="/news">新闻</Link>
        <span style={{ margin: '0 7px' }}>/</span>
        <span>报刊</span>
      </div>

      <PaperToolbar
        from={from}
        to={to}
        columns={columns.map((c) => ({ id: c.id, name: c.name, slug: c.slug, count: c.count }))}
        selected={picked}
        total={items.length}
      />

      <article className="paper">
        <header className="paper-masthead">
          <h1 className="paper-masthead-title">云轨社区报</h1>
          <div className="paper-masthead-en">CLOUDRAIL TIMES</div>
          <div className="paper-masthead-rule" />
          <div className="paper-masthead-meta">
            <span>
              {newsDay(new Date(`${from}T00:00:00+08:00`).getTime())} –{' '}
              {newsDay(new Date(`${to}T00:00:00+08:00`).getTime())}
            </span>
            <span>本期 {items.length} 篇</span>
            <span>{sections.length} 个版面</span>
          </div>
        </header>

        {items.length === 0 ? (
          <p className="paper-empty">这段时间还没有发布的稿件，换个区间试试。</p>
        ) : (
          <>
            {sections.map((s) => (
              <section key={s.id} className="paper-section">
                <h2 className="paper-section-title">
                  {s.name}
                  <span className="paper-section-en">{s.slug.toUpperCase()}</span>
                </h2>
                <div className="paper-flow">
                  {s.articles.map((n) => (
                    <article key={n.id} className="paper-article">
                      <h3 className="paper-article-title">{n.title}</h3>
                      <div className="paper-byline">
                        {n.author && <span>记者 {n.author}</span>}
                        {n.source && <span>{n.source}</span>}
                        <span>{newsDay(n.publishedAt)}</span>
                      </div>
                      {n.cover && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="paper-cover" src={n.cover} alt="" loading="lazy" decoding="async" />
                      )}
                      {n.summary && <p className="paper-lead">{n.summary}</p>}
                      {n.body
                        .split(/\n{2,}/)
                        .map((p) => p.trim())
                        .filter(Boolean)
                        .map((p, i) => (
                          <p key={i}>{p}</p>
                        ))}
                    </article>
                  ))}
                </div>
              </section>
            ))}

            {loose.length > 0 && (
              <section className="paper-section">
                <h2 className="paper-section-title">未归档</h2>
                <div className="paper-flow">
                  {loose.map((n) => (
                    <article key={n.id} className="paper-article">
                      <h3 className="paper-article-title">{n.title}</h3>
                      <div className="paper-byline">
                        <span>{newsDay(n.publishedAt)}</span>
                      </div>
                      {n.summary && <p className="paper-lead">{n.summary}</p>}
                      {n.body
                        .split(/\n{2,}/)
                        .map((p) => p.trim())
                        .filter(Boolean)
                        .map((p, i) => (
                          <p key={i}>{p}</p>
                        ))}
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <footer className="paper-foot">
          云轨社区 · 新闻版 · 本版由社区编辑部维护，稿件按发布时间归档
        </footer>
      </article>
    </div>
  );
}
