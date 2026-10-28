import Link from 'next/link';

/**
 * 根级 404：处理「路径根本没有对应路由」的情况。
 * 组内的 `(site)/not-found.tsx` 仍带完整导航，两者各管一段。
 */
export const dynamic = 'force-dynamic';

export default function RootNotFound() {
  return (
    <div className="notfound-screen">
      <div className="card card-pad notfound-card">
        <span className="notfound-code">404</span>
        <h1 className="page-title" style={{ fontSize: 20 }}>
          没有这个页面
        </h1>
        <p className="small muted" style={{ marginTop: 8, lineHeight: 1.8 }}>
          地址可能输错了，或者这个页面已经下线。
        </p>
        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <Link href="/" className="btn btn-primary" style={{ flex: 1 }}>
            回首页
          </Link>
          <Link href="/search" className="btn" style={{ flex: 1 }}>
            搜索
          </Link>
        </div>
      </div>
    </div>
  );
}
