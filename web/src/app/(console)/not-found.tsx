import Link from 'next/link';

/** 后台内的 404：保留控制台外壳，方便直接跳去别的模块 */
export default function ConsoleNotFound() {
  return (
    <div className="col-main">
      <div className="card card-pad" style={{ maxWidth: 480 }}>
        <span className="notfound-code">404</span>
        <h1 className="page-title" style={{ fontSize: 19 }}>
          没有这个后台页面
        </h1>
        <p className="small muted" style={{ marginTop: 8, lineHeight: 1.8 }}>
          后台模块可能已经改名或下线，左侧导航是当前可用的全部入口。
        </p>
        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <Link href="/admin" className="btn btn-primary" style={{ flex: 1 }}>
            回概览
          </Link>
          <Link href="/" className="btn" style={{ flex: 1 }}>
            前台首页
          </Link>
        </div>
      </div>
    </div>
  );
}
