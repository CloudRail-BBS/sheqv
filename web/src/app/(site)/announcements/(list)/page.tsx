import Link from 'next/link';
import { listAnnouncements, type AnnouncementKind } from '@/lib/announcement-store';
import { EmptyState } from '@/components/empty-state';
import { buildMetadata } from '@/lib/seo';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({
    title: '公告',
    description: '站点规则、版本更新与活动公告。',
    path: '/announcements',
  });
}

const KIND_CLASS: Record<AnnouncementKind, string> = {
  规则: 'badge badge-warn',
  版本: 'badge badge-live',
  活动: 'badge badge-ghost',
  系统: 'badge',
};

const fmt = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export default async function AnnouncementsPage() {
  const [items, settings] = await Promise.all([
    listAnnouncements({ publishedOnly: true }),
    getSettings(),
  ]);
  const pinned = items.filter((a) => a.pinned);
  const rest = items.filter((a) => !a.pinned);

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">公告</h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              {settings.announcementsHint || '赛季规则、版本更新与仲裁结果都在这里，由管理员在后台发布。'}
            </p>
          </div>
          <span className="badge">{items.length} 条</span>
        </div>

        {items.length === 0 ? (
          <div style={{ marginTop: 12 }}>
            <EmptyState
              title="还没有公告"
              desc="管理员登录后台，在「公告」里发布第一条之后，这里会按置顶与时间排序展示。"
              actionHref="/admin/announcements"
              actionLabel="去后台发布"
              icon="bell"
            />
          </div>
        ) : (
          <div className="card" style={{ overflow: 'hidden', marginTop: 12 }}>
            {[...pinned, ...rest].map((a) => (
              <Link key={a.id} href={`/announcements/${a.id}`} className="an-item">
                <div className="an-row">
                  <span className={KIND_CLASS[a.kind]}>{a.kind}</span>
                  {a.pinned && <span className="badge badge-warn">置顶</span>}
                  <span className="an-title">{a.title}</span>
                  <span className="mono small muted" style={{ marginLeft: 'auto', flex: 'none' }}>
                    {fmt(a.createdAt)}
                  </span>
                </div>
                <p className="an-excerpt">{a.body.slice(0, 90)}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">怎么看公告</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            置顶的排在最上面；分类只有规则 / 版本 / 活动 / 系统四种。
            公告由管理员在后台维护，改完立即生效，不需要重新部署。
          </p>
        </div>
        <div className="card rail-card">
          <div className="rail-title">相关</div>
          <div className="rail-list">
            <Link href="/agreements" className="rail-item">
              <span>公约</span>
              <span style={{ marginLeft: 'auto', color: 'var(--blue)' }}>→</span>
            </Link>
            <Link href="/matches" className="rail-item">
              <span>约战</span>
              <span style={{ marginLeft: 'auto', color: 'var(--blue)' }}>→</span>
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
