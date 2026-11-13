import type { CSSProperties } from 'react';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/current-user';
import { listResources } from '@/lib/resource-store';
import { ResourceCard } from '@/components/resource-card';
import { ResourceUpload } from '@/components/resource-upload';
import { RemoteCells } from '@/components/remote-discover';
import { RwCells } from '@/components/rw-discover';
import { listMyDevTeams } from '@/lib/dev-team-store';
import { buildMetadata } from '@/lib/seo';
import { Carousel } from '@/components/carousel';
import { listSlides } from '@/lib/slide-store';
import {
  RESOURCE_GAMES,
  fmtNum,
  gameLabel,
  gameTone,
  type ResourceView,
} from '@/lib/resource-types';
import { catLabel, listCategories } from '@/lib/category-store';
import { CategoryIcon, catHue, gameHue } from '@/components/category-icon';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({
    title: '资源库',
    description: '玩家与开发团队分享的地图、整合包、材质与工具，按游戏与分类筛选，下载量与点赞实时统计。',
    path: '/resources',
  });
}

function buildQuery(base: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) {
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return `/resources${qs ? `?${qs}` : ''}`;
}

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; category?: string; sort?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const sort = sp.sort === 'likes' || sp.sort === 'downloads' ? sp.sort : 'new';
  const [user, items, cats, slides] = await Promise.all([
    getCurrentUser(),
    listResources({
      game: sp.game,
      category: sp.category,
      q: sp.q,
      sort: sort as 'new' | 'likes' | 'downloads',
    }),
    listCategories('resource'),
    // 资源库自己的轮播位（后台「轮播」里把展示位置选成「资源库」）
    listSlides({ activeOnly: true, placement: 'resources' }),
  ]);
  const teams = user ? await listMyDevTeams() : [];
  // 外部站点的条目要「收录」才会进站，等于代站方建资源，只给管理员
  const canImport = Boolean(user?.isAdmin);

  const totalLikes = items.reduce((n, r) => n + r.likeCount, 0);
  // 第一页（无任何筛选）才铺「最近更新」，否则会和下面的筛选结果重复
  const firstPage = !sp.q && !sp.game && !sp.category && sort === 'new';
  const recent = firstPage ? items.slice(0, 6) : [];
  const totalDownloads = items.reduce((n, r) => n + r.downloadCount, 0);
  const base = { game: sp.game, category: sp.category, sort: sp.sort, q: sp.q };
  // 侧栏只剩「当前筛选」这一张，没筛选时整列不占位
  const hasRail = Boolean(sp.game || sp.category || sp.q || sort !== 'new');

  return (
    <div className={hasRail ? 'cols' : 'cols cols-single'}>
      <div className="col-main">
        {/* 顶部是资源库自己的轮播（后台配位）；没配就退回标题 */}
        {slides.length > 0 ? (
          <Carousel slides={slides} />
        ) : (
          <h1 className="page-title">资源库</h1>
        )}

        <div className="res-toolbar">
          <form action="/resources" className="res-search" role="search">
            {sp.game && <input type="hidden" name="game" value={sp.game} />}
            {sp.category && <input type="hidden" name="category" value={sp.category} />}
            {sort !== 'new' && <input type="hidden" name="sort" value={sort} />}
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="m16.5 16.5 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              name="q"
              defaultValue={sp.q ?? ''}
              placeholder="搜索资源名称，或 Modrinth 上的模组…"
              aria-label="搜索资源"
            />
          </form>
          <div className="row res-sort" style={{ gap: 6 }}>
            {[
              { key: 'new', label: '最新' },
              { key: 'likes', label: '最多点赞' },
              { key: 'downloads', label: '最多下载' },
            ].map((s) => (
              <Link
                key={s.key}
                href={buildQuery(base, { sort: s.key === 'new' ? undefined : s.key })}
                className="chip"
                data-on={sort === s.key}
              >
                {s.label}
              </Link>
            ))}
            {user && (
              <ResourceUpload
                teams={teams.map((t) => ({ id: t.id, name: t.name, tag: t.tag }))}
                nickname={user.nickname}
                avatar={user.avatar}
                categories={cats}
              />
            )}
          </div>
        </div>

        {/* rtsbox 的模组接口必须带关键词，没搜的时候就在搜索框下面提醒一句 */}
        {sp.game === 'rusted_warfare' && !sp.q && (!sp.category || sp.category === '模组') && (
          <p className="res-hint-bar">
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="m16 16 4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            <span>
              输入关键词（比如「模组」「战役」），还能搜到 rtsbox 上的铁锈战争模组
            </span>
          </p>
        )}

        {/* 分类是资源库的主维度，放第一行；游戏只是它的二级筛选 */}
        <div className="row wrap" style={{ gap: 6 }}>
          <Link
            href={buildQuery(base, { category: undefined })}
            className="chip"
            data-cat="全部"
            data-on={!sp.category}
          >
            <CategoryIcon name="全部" />
            全部分类
          </Link>
          {cats.map((c) => {
            const hue = catHue(c.key);
            return (
              <Link
                key={c.key}
                href={buildQuery(base, { category: c.key })}
                className="chip"
                data-cat={hue ? c.key : '其它'}
                data-on={sp.category === c.key}
                style={hue ? ({ ['--cat-h']: hue } as CSSProperties) : undefined}
              >
                <CategoryIcon name={c.key} />
                {c.label}
              </Link>
            );
          })}
        </div>

        <div className="row wrap" style={{ gap: 6, marginTop: 8, alignItems: 'center' }}>
          <span className="small muted" style={{ marginRight: 2 }}>游戏</span>
          <Link
            href={buildQuery(base, { game: undefined })}
            className="chip"
            data-cat="全部"
            data-on={!sp.game}
          >
            <CategoryIcon name="全部" />
            全部
          </Link>
          {RESOURCE_GAMES.map((g) => {
            const hue = gameHue(g.key);
            return (
              <Link
                key={g.key}
                href={buildQuery(base, { game: g.key })}
                className="chip"
                data-cat={g.key}
                data-on={sp.game === g.key}
                style={hue ? ({ ['--cat-h']: hue } as CSSProperties) : undefined}
              >
                <CategoryIcon name={g.key} />
                {g.label}
              </Link>
            );
          })}
        </div>

        <div className="between res-summary">
          <span className="small muted">
            共 <b className="mono">{items.length}</b> 个资源 · 赞{' '}
            <b className="mono">{fmtNum(totalLikes)}</b> · 下载{' '}
            <b className="mono">{fmtNum(totalDownloads)}</b>
          </span>
          {sp.q && (
            <Link href={buildQuery(base, { q: undefined })} className="small">
              清除搜索「{sp.q}」
            </Link>
          )}
        </div>

        {recent.length > 0 && (
          <section className="res-recent">
            <div className="res-recent-head">最近更新</div>
            <div className="res-recent-row">
              {recent.map((r) => (
                <Link key={r.id} href={`/resources/${r.id}`} className="res-recent-card">
                  <span className={'res-recent-cover cover-' + gameTone(r.game)}>
                    {r.cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.cover} alt="" loading="lazy" decoding="async" />
                    )}
                  </span>
                  <span className="res-recent-title" title={r.title}>
                    {r.title}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 本站资源与外部站点条目混在同一个网格里：外部的排在后面，点卡片才收录。
            铁锈战争走 rtsbox 模组 + RELAY-CN 地图站（地图是另一套卡型） */}
        <div className="res-grid">
          {items.map((r: ResourceView) => (
            <ResourceCard key={r.id} item={r} categories={cats} />
          ))}
          {sp.game === 'rusted_warfare' ? (
            <RwCells q={sp.q} category={sp.category} canImport={canImport} />
          ) : (
            <RemoteCells q={sp.q} game={sp.game} category={sp.category} canImport={canImport} />
          )}
        </div>
      </div>

      {hasRail && (
        <aside className="rail">
          {/* 只有真的筛过才显示，否则这张卡只是把上面的选项再抄一遍 */}
          <div className="card rail-card">
            <div className="rail-title">当前筛选</div>
            <dl className="kv">
              <dt>游戏</dt>
              <dd>{sp.game ? gameLabel(sp.game) : '全部'}</dd>
              <dt>分类</dt>
              <dd>{sp.category ? catLabel(cats, sp.category) : '全部'}</dd>
              <dt>排序</dt>
              <dd>{sort === 'likes' ? '点赞' : sort === 'downloads' ? '下载' : '最新'}</dd>
            </dl>
          </div>
        </aside>
      )}
    </div>
  );
}
