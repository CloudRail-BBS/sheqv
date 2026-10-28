import Link from 'next/link';
import { getSnapshot, formatAmount, formatDate } from '@/lib/sponsor-store';
import { afdianConfigured, afdianPageUrl } from '@/lib/afdian';
import { getCurrentUser } from '@/lib/current-user';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({
    title: '赞助者',
    description: '支持过云轨社区的玩家名单，按累计赞助金额排序。',
    path: '/sponsors',
  });
}

export default async function SponsorsPage() {
  const [snap, user] = await Promise.all([getSnapshot(), getCurrentUser()]);
  const [configured, pageUrl] = await Promise.all([afdianConfigured(), afdianPageUrl()]);
  

  const top = snap.sponsors.slice(0, 3);
  const rest = snap.sponsors.slice(3);

  return (
    <div className="cols">
      <div className="col-main">
        <div className="sp-hero">
          <div>
            <h1 className="page-title">赞助者</h1>
            <p className="small muted" style={{ marginTop: 4, lineHeight: 1.8 }}>
              服务器、域名与赛事奖品都由这里出。名单来自爱发电公开数据，按累计金额排序。
            </p>
          </div>
          {pageUrl && (
            <a className="btn btn-primary" href={pageUrl} target="_blank" rel="noreferrer noopener">
              去爱发电支持
            </a>
          )}
        </div>

        <div className="me-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="card">
            <b>¥{formatAmount(snap.totalAmount)}</b>
            <span>累计赞助</span>
          </div>
          <div className="card">
            <b>{snap.count}</b>
            <span>赞助人数</span>
          </div>
          <div className="card">
            <b style={{ fontSize: 13, paddingTop: 4 }}>
              {snap.syncedAt ? new Date(snap.syncedAt).toISOString().slice(0, 10) : '未同步'}
            </b>
            <span>数据更新</span>
          </div>
        </div>

        {snap.sponsors.length === 0 ? (
          <div className="card empty-state">
            <div className="empty-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26">
                <path
                  d="M12 20s-7-4.35-7-9a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 4.65-7 9-7 9Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3>还没有赞助记录</h3>
            <p>
              {configured
                ? '管理员还没同步爱发电数据。赞助之后回来看看，或者催一下管理员。'
                : '本站还没有对外同步赞助名单。'}
            </p>
            {pageUrl && (
              <a className="btn btn-primary btn-sm" href={pageUrl} target="_blank" rel="noreferrer noopener">
                去爱发电
              </a>
            )}
          </div>
        ) : (
          <>
            <div className="sp-top">
              {top.map((s, i) => (
                <div key={s.id} className="card sp-card" data-rank={i + 1}>
                  <span className="sp-rank">#{i + 1}</span>
                  <div className="sp-face">
                    {s.avatar ? (
                      // 头像来自爱发电 CDN，配置 remotePatterns 意义不大，直接用 img
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                      s.name.slice(0, 1)
                    )}
                  </div>
                  <div className="sp-name">{s.name}</div>
                  <div className="sp-amount">¥{formatAmount(s.amount)}</div>
                  <div className="sp-meta">
                    {s.planTitle ? s.planTitle : '一次性支持'}
                    {s.lastPayAt ? ` · ${formatDate(s.lastPayAt)}` : ''}
                  </div>
                </div>
              ))}
            </div>

            {rest.length > 0 && (
              <div className="card" style={{ overflow: 'hidden' }}>
                <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
                  <h3 style={{ fontSize: 13 }}>全部赞助者</h3>
                  <span className="small muted">{snap.count} 人</span>
                </div>
                {rest.map((s, i) => (
                  <div key={s.id} className="sp-row">
                    <span className="sp-idx mono">{i + 4}</span>
                    <div className="sp-face sm">
                      {s.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        s.name.slice(0, 1)
                      )}
                    </div>
                    <span className="sp-row-name">{s.name}</span>
                    <span className="sp-row-plan">{s.planTitle ?? '一次性支持'}</span>
                    <span className="sp-row-date mono">{formatDate(s.lastPayAt)}</span>
                    <span className="sp-row-amount mono">¥{formatAmount(s.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">赞助去向</div>
          <div className="rule-list">
            <div className="rule-row">
              <span className="n">1</span>
              <span>服务器与带宽：赛事期间的流量峰值最贵</span>
            </div>
            <div className="rule-row">
              <span className="n">2</span>
              <span>赛事奖品与仲裁激励：让裁定有人愿意做</span>
            </div>
            <div className="rule-row">
              <span className="n">3</span>
              <span>不投放广告，也不卖榜单位置</span>
            </div>
          </div>
        </div>

        <div className="card rail-card">
          <div className="rail-title">关于名单</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            金额与时间来自爱发电开放接口，按累计赞助额排序，同额按最近一次支持时间。
            需要匿名的赞助者可在爱发电侧设置，或联系管理员在后台隐藏。
          </p>
          <div className="rail-item" style={{ marginTop: 10, paddingLeft: 0, paddingRight: 0 }}>
            <span className="small muted">数据来源</span>
            <span className="mono small" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
              {configured ? '自动同步' : '未同步'}
            </span>
          </div>
        </div>

        <div className="card rail-card">
          <div className="rail-title">快捷</div>
          <div className="rail-list">
            <Link href="/" className="rail-item">
              <span>回社区</span>
              <span style={{ marginLeft: 'auto', color: 'var(--blue)' }}>→</span>
            </Link>
            <Link href="/announcements" className="rail-item">
              <span>公告</span>
              <span style={{ marginLeft: 'auto', color: 'var(--blue)' }}>→</span>
            </Link>
            {user?.isAdmin && (
              <Link href="/admin/sponsors" className="rail-item">
                <span>赞助管理</span>
                <span style={{ marginLeft: 'auto', color: 'var(--blue)' }}>→</span>
              </Link>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
