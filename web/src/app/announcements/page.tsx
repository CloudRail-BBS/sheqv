import Link from 'next/link';
import { getRequestCaps } from '@/lib/request-caps';
import { ANNOUNCEMENTS } from '@/lib/data';

const KIND_STYLE: Record<string, string> = {
  规则: 'badge badge-warn',
  版本: 'badge badge-mc',
  活动: 'badge badge-rw',
  系统: 'badge',
};

export default async function AnnouncementsPage() {
  const caps = await getRequestCaps();
  const sorted = [...ANNOUNCEMENTS].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  const counts = {
    规则: ANNOUNCEMENTS.filter((a) => a.kind === '规则').length,
    版本: ANNOUNCEMENTS.filter((a) => a.kind === '版本').length,
    活动: ANNOUNCEMENTS.filter((a) => a.kind === '活动').length,
    系统: ANNOUNCEMENTS.filter((a) => a.kind === '系统').length,
  };

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">公告</h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              规则、版本、活动与系统通知。涉及确权的规则变更会同步到约战页。
            </p>
          </div>
          <button className="btn btn-sm btn-ghost">全部已读</button>
        </div>

        <div className="row wrap" style={{ gap: 6 }}>
          {['全部', '规则', '版本', '活动', '系统'].map((f, i) => (
            <button key={f} className="chip" data-on={i === 0}>
              {f}
              {f !== '全部' && (
                <span className="mono" style={{ marginLeft: 6, opacity: 0.7 }}>
                  {counts[f as keyof typeof counts]}
                </span>
              )}
            </button>
          ))}
        </div>

        {sorted.map((a) => (
          <article key={a.id} className="card an-item">
            <div className="an-title">
              {a.pinned && <span className="post-pin">置顶</span>}
              <span className={KIND_STYLE[a.kind]}>{a.kind}</span>
              {a.title}
            </div>
            <p className="an-body">{a.body}</p>
            <div className="an-meta">
              <span className="mono">{a.date}</span>
              <span>·</span>
              <span>{a.views.toLocaleString('zh-CN')} 次阅读</span>
              <span style={{ marginLeft: 'auto', color: 'var(--blue)' }}>展开全文</span>
            </div>
          </article>
        ))}
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">分类</div>
          <div className="rail-list">
            {Object.entries(counts).map(([k, v]) => (
              <div key={k} className="rail-item">
                <span className={KIND_STYLE[k]}>{k}</span>
                <span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
                  {v}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card rail-card">
          <div className="rail-title">订阅方式</div>
          <p className="small muted" style={{ lineHeight: 1.75 }}>
            {caps.capabilities.realtime.backgroundPush
              ? '系统推送已开启，规则变更会即时推送到设备。'
              : '当前形态只有站内通知：公告更新不会主动提醒，可在首页红点查看。'}
            {caps.isWeChat && ' 微信内不会收到任何推送。'}
          </p>
          <Link href="/me" className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 10 }}>
            去我的 · 通知偏好
          </Link>
        </div>

        <div className="card rail-card">
          <div className="rail-title">重要公告</div>
          <div className="rail-list">
            {ANNOUNCEMENTS.filter((a) => a.kind === '规则').map((a) => (
              <div key={a.id} className="rail-item">
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
