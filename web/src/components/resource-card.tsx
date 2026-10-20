import Link from 'next/link';
import { GAME_LABEL, type ResourceItem } from '@/lib/data';
import { formatBytes } from '@/lib/capabilities';

export function ResourceCard({ item, directDownload }: { item: ResourceItem; directDownload: boolean }) {
  const isMc = item.game === 'mc';
  return (
    <Link href={`/resources/${item.id}`} className="card res-card">
      <div className={'res-cover ' + (isMc ? 'cover-mc' : 'cover-rw')}>
        <span className={'badge ' + (isMc ? 'badge-mc' : 'badge-rw')}>{GAME_LABEL[item.game]}</span>
        <span className="glyph" aria-hidden="true">
          {isMc ? 'MC' : 'RW'}
        </span>
        <span className="ver">{item.version}</span>
      </div>
      <div className="res-body">
        <div className="res-title">{item.title}</div>
        <div className="res-meta">
          <span>{item.category}</span>
          <span>·</span>
          <span>{item.author}</span>
          <span className="score" style={{ marginLeft: 'auto' }}>
            ★ {item.rating.toFixed(1)}
          </span>
        </div>
        <div className="res-foot">
          <span className="small muted mono">{formatBytes(item.sizeBytes)}</span>
          <span className="how">{directDownload ? '直接下载' : '预览 · 收藏'}</span>
        </div>
      </div>
    </Link>
  );
}
