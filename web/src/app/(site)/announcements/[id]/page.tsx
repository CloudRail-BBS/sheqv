import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAnnouncement } from '@/lib/announcement-store';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getAnnouncement(id);
  if (!item || !item.published) {
    return buildMetadata({ title: '公告', path: `/announcements/${id}`, noIndex: true });
  }
  return buildMetadata({
    title: item.title,
    description: item.body.replace(/\s+/g, ' ').slice(0, 120),
    path: `/announcements/${id}`,
    type: 'article',
  });
}

const fmt = (ts: number) => new Date(ts).toLocaleString('zh-CN', { hour12: false });

export default async function AnnouncementDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getAnnouncement(id);

  // 未发布的不对公众可见；管理员也要从后台看
  if (!item || !item.published) notFound();

  return (
    <div className="cols">
      <div className="col-main">
        <div className="crumb">
          <Link href="/announcements">公告</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <span>{item.kind}</span>
        </div>

        <article className="card card-pad an-detail">
          <div className="row" style={{ gap: 6 }}>
            <span className="badge">{item.kind}</span>
            {item.pinned && <span className="badge badge-gold" data-shine="">置顶</span>}
          </div>
          <h1 className="an-detail-title">{item.title}</h1>
          <div className="an-detail-meta mono">
            发布于 {fmt(item.createdAt)}
            {item.updatedAt > item.createdAt ? ` · 更新于 ${fmt(item.updatedAt)}` : ''}
          </div>
          <div className="an-detail-body">{item.body}</div>
        </article>
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">更多</div>
          <div className="rail-list">
            <Link href="/announcements" className="rail-item">
              <span>全部公告</span>
              <span style={{ marginLeft: 'auto', color: 'var(--blue)' }}>→</span>
            </Link>
            <Link href="/" className="rail-item">
              <span>回社区</span>
              <span style={{ marginLeft: 'auto', color: 'var(--blue)' }}>→</span>
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
