import Link from 'next/link';
import { getCurrentUser } from '@/lib/current-user';
import { getDeveloperBoard, listResources } from '@/lib/resource-store';
import { ResourceCard } from '@/components/resource-card';
import { ResourceUpload } from '@/components/resource-upload';
import { listMyDevTeams } from '@/lib/dev-team-store';
import { EmptyState } from '@/components/empty-state';
import { buildMetadata } from '@/lib/seo';
import { getSettings } from '@/lib/settings';
import {
  RESOURCE_CATEGORIES,
  RESOURCE_GAMES,
  fmtNum,
  gameLabel,
  type ResourceView,
} from '@/lib/resource-types';

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
  const [user, items, board, settings] = await Promise.all([
    getCurrentUser(),
    listResources({
      game: sp.game,
      category: sp.category,
      q: sp.q,
      sort: sort as 'new' | 'likes' | 'downloads',
    }),
    getDeveloperBoard(),
    getSettings(),
  ]);
  const teams = user ? await listMyDevTeams() : [];

  const totalLikes = items.reduce((n, r) => n + r.likeCount, 0);
  const totalDownloads = items.reduce((n, r) => n + r.downloadCount, 0);
  const base = { game: sp.game, category: sp.category, sort: sp.sort, q: sp.q };

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">资源库</h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              {settings.resourcesHint || '地图、整合包、材质与工具 · 开发者与团队的作品都在这里'}
            </p>
          </div>
          {user ? (
            <ResourceUpload
              teams={teams.map((t) => ({ id: t.id, name: t.name, tag: t.tag }))}
              nickname={user.nickname}
              avatar={user.avatar}
            />
          ) : (
            <Link href="/login" className="btn btn-primary btn-sm">
              登录后发布
            </Link>
          )}
        </div>

        <div className="res-toolbar">
          <div className="res-stats">
            <span><b className="mono">{items.length}</b> 个资源</span>
            <span><b className="mono">{fmtNum(totalLikes)}</b> 次点赞</span>
            <span><b className="mono">{fmtNum(totalDownloads)}</b> 次下载</span>
          </div>
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
          </div>
        </div>

        <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
          <Link href={buildQuery(base, { game: undefined })} className="chip" data-on={!sp.game}>
            全部游戏
          </Link>
          {RESOURCE_GAMES.map((g) => (
            <Link
              key={g.key}
              href={buildQuery(base, { game: g.key })}
              className="chip"
              data-on={sp.game === g.key}
            >
              {g.label}
            </Link>
          ))}
        </div>

        <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
          <Link href={buildQuery(base, { category: undefined })} className="chip" data-on={!sp.category}>
            全部分类
          </Link>
          {RESOURCE_CATEGORIES.map((c) => (
            <Link
              key={c}
              href={buildQuery(base, { category: c })}
              className="chip"
              data-on={sp.category === c}
            >
              {c}
            </Link>
          ))}
        </div>

        {sp.q && (
          <p className="small muted" style={{ marginBottom: 10 }}>
            搜索「{sp.q}」· <Link href={buildQuery(base, { q: undefined })}>清除</Link>
          </p>
        )}

        {items.length === 0 ? (
          <div className="card" style={{ padding: 8 }}>
            <EmptyState
              title={sp.q || sp.game || sp.category ? '这个筛选下没有资源' : '资源库还是空的'}
              desc={
                sp.q || sp.game || sp.category
                  ? '换个分类或游戏看看，也可以自己发布第一个。'
                  : '发布第一个资源，顺手点亮开发者身份。'
              }
              actionHref={user ? '/resources/new' : '/login'}
              actionLabel={user ? '发布资源' : '登录后发布'}
              icon="box"
            />
          </div>
        ) : (
          <div className="res-grid">
            {items.map((r: ResourceView) => (
              <ResourceCard key={r.id} item={r} />
            ))}
          </div>
        )}
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">开发者榜</div>
          {board.developers.length === 0 ? (
            <p className="small muted" style={{ lineHeight: 1.75 }}>
              还没有人发布资源。第一个资源会自动点亮开发者身份。
            </p>
          ) : (
            <div className="rail-list">
              {board.developers.slice(0, 4).map((d) => (
                <div key={d.userId} className="rail-item">
                  <span className="idx">{d.rank}</span>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.nickname}
                  </span>
                  <span className="mono small muted" style={{ marginLeft: 'auto' }}>
                    {fmtNum(d.downloads)} ↓
                  </span>
                </div>
              ))}
            </div>
          )}
          <Link href="/leaderboard#developers" className="btn btn-sm btn-ghost" style={{ marginTop: 10, width: '100%' }}>
            完整开发者榜
          </Link>
        </div>

        <div className="card rail-card">
          <div className="rail-title">发布说明</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            资源发布后立即可见，不做人工预审；违规内容由后台下架。
            下载按「同一账号同一天」计一次，点赞每个账号只能点一次。
          </p>
          <p className="small muted" style={{ marginTop: 8, lineHeight: 1.8 }}>
            以团队名义发布前，需要先创建或加入一个开发团队。
          </p>
          <Link href="/dev-teams" className="btn btn-sm btn-ghost" style={{ marginTop: 10 }}>
            看看开发团队
          </Link>
        </div>

        {/* 只有真的筛过才显示，否则这张卡只是把上面的选项再抄一遍 */}
        {(sp.game || sp.category || sp.q || sort !== 'new') && (
          <div className="card rail-card">
            <div className="rail-title">当前筛选</div>
            <dl className="kv">
              <dt>游戏</dt>
              <dd>{sp.game ? gameLabel(sp.game) : '全部'}</dd>
              <dt>分类</dt>
              <dd>{sp.category || '全部'}</dd>
              <dt>排序</dt>
              <dd>{sort === 'likes' ? '点赞' : sort === 'downloads' ? '下载' : '最新'}</dd>
            </dl>
          </div>
        )}
      </aside>
    </div>
  );
}
