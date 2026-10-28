import Link from 'next/link';
import { listChangelog } from '@/lib/changelog-store';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({
    title: '更新日志',
    description: '站点每次上线的功能、修复与调整，最新的在最前面。',
    path: '/changelog',
  });
}

const day = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export default async function ChangelogPage() {
  const items = await listChangelog();

  return (
    <div className="cols">
      <div className="col-main">
        <div className="crumb">
          <Link href="/">首页</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <span>更新日志</span>
        </div>

        <div className="card card-pad" style={{ marginBottom: 12 }}>
          <h1 className="page-title" style={{ fontSize: 20 }}>
            更新日志
          </h1>
          <p className="small muted" style={{ marginTop: 6, lineHeight: 1.8 }}>
            这里记录每次上线的功能、修复与调整，最新的在最前面。共 {items.length} 个版本。
          </p>
        </div>

        {items.length === 0 ? (
          <div className="card empty-state">
            <b>还没有更新记录</b>
            <p>管理员在「后台 → 更新日志」发布后会出现在这里。</p>
          </div>
        ) : (
          items.map((e) => (
            <section key={e.id} className="card card-pad cl-item">
              <div className="cl-head">
                <h2 className="cl-title">{e.title}</h2>
                {e.version && <span className="cl-ver mono">{e.version}</span>}
                <span className="cl-date mono">{day(e.releasedAt)}</span>
              </div>

              <ul className="cl-list">
                {e.body
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((text, i) => (
                    <li key={`${e.id}-${i}`} className="cl-row">
                      <span className="cl-tag" data-tag={e.tag || '功能'}>
                        {e.tag || '功能'}
                      </span>
                      <span>{text}</span>
                    </li>
                  ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">版本号怎么读</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            形如 <code>2026.10.28.2</code>：年份.月份.日期.当天第几次发布。同一天多次上线时末位递增。
          </p>
        </div>
        <div className="card rail-card">
          <div className="rail-title">想看细节</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            更技术的说明在开发文档的「变更记录」章节；这里只讲用户能感知到的变化。
          </p>
        </div>
      </aside>
    </div>
  );
}
