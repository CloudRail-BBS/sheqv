import Link from 'next/link';
import { listWiki, WIKI_CATEGORIES, categoryLabel, fmtDay } from '@/lib/wiki';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({
    title: '百科',
    description: '社区百科：入门、玩法机制、服务器、开发与社区规则，都在这里。',
    path: '/wiki',
  });
}

export default async function WikiPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const active = WIKI_CATEGORIES.some((c) => c.key === sp.category) ? sp.category! : '';

  const [items, all] = await Promise.all([
    listWiki({ q, category: active }),
    q || active ? listWiki({}) : Promise.resolve(null),
  ]);

  const counts = new Map<string, number>();
  for (const it of all ?? items) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
  const total = all ? all.length : items.length;

  const href = (patch: { category?: string; q?: string }) => {
    const sp2 = new URLSearchParams();
    const cat = patch.category ?? active;
    const query = patch.q ?? q;
    if (cat) sp2.set('category', cat);
    if (query) sp2.set('q', query);
    const s = sp2.toString();
    return `/wiki${s ? `?${s}` : ''}`;
  };

  return (
    <div className="cols">
      <div className="col-main">
        <section className="card wiki-hero">
          <span className="wiki-kicker">WIKI</span>
          <h1 className="wiki-title">社区百科</h1>
          <p className="wiki-lead">
            开服参数、约战流程、资源规范、身份组与公约——常见问题的答案都收在这里，
            找不到就去工单里问。
          </p>
          <form action="/wiki" className="wiki-search">
            {active && <input type="hidden" name="category" value={active} />}
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input name="q" defaultValue={q} placeholder="搜词条：怎么开服、约战怎么判负、资源怎么发…" />
            <button type="submit" className="btn btn-primary btn-sm">
              搜索
            </button>
          </form>
          <div className="wiki-stat">
            共 <b className="mono">{total}</b> 条词条 · 由站长维护
          </div>
        </section>

        <div className="wiki-cats">
          <Link href={href({ category: '' })} className="chip" data-on={!active}>
            全部
          </Link>
          {WIKI_CATEGORIES.map((c) => (
            <Link key={c.key} href={href({ category: c.key })} className="chip" data-on={active === c.key}>
              {c.label}
              {(counts.get(c.key) ?? 0) > 0 && <span className="wiki-cat-n">{counts.get(c.key)}</span>}
            </Link>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="card card-pad wiki-empty">
            <b>{q ? '没有找到相关词条' : '这个词条分类还是空的'}</b>
            <p className="small muted">
              {q ? '换个关键词试试，或者去工单里提问，站长会补进百科。' : '站长可以在后台「内容 → 百科」里添加。'}
            </p>
            {q && (
              <Link href="/wiki" className="btn btn-sm btn-ghost">
                清空搜索
              </Link>
            )}
          </div>
        ) : (
          <div className="wiki-grid">
            {items.map((it) => (
              <Link key={it.id} href={`/wiki/${it.slug}`} className="card wiki-card">
                <div className="wiki-card-top">
                  <span className="wiki-tag">{categoryLabel(it.category)}</span>
                  {it.tags.slice(0, 2).map((t) => (
                    <span key={t} className="badge badge-ghost">
                      {t}
                    </span>
                  ))}
                </div>
                <h2 className="wiki-card-title">{it.title}</h2>
                <p className="wiki-card-desc">{it.summary || '这条词条还没有写摘要。'}</p>
                <div className="wiki-card-foot">
                  <span>更新于 {fmtDay(it.updatedAt)}</span>
                  <span className="mono">{it.views} 次浏览</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">分类</div>
          <div className="wiki-rail-list">
            {WIKI_CATEGORIES.map((c) => (
              <Link key={c.key} href={href({ category: c.key })} className="wiki-rail-row">
                <b>{c.label}</b>
                <span>{c.desc}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card rail-card">
          <div className="rail-title">找不到答案？</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            百科只收稳定结论；具体到你自己的情况，去工单里描述清楚，管理员会回复。
          </p>
          <Link href="/tickets" className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 10 }}>
            提交工单
          </Link>
        </div>
      </aside>
    </div>
  );
}
