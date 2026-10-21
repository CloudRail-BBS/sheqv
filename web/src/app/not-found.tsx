import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="cols">
      <div className="col-main">
        <div className="card card-pad" style={{ maxWidth: 520, margin: '28px auto 0' }}>
          <h1 className="page-title" style={{ fontSize: 19 }}>
            404 · 没有这个页面
          </h1>
          <p className="small muted" style={{ marginTop: 8, lineHeight: 1.8 }}>
            链接可能已经失效，或者对应的内容被删除了。帖子、资源、比赛被删后，旧链接都会落到这里。
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
    </div>
  );
}
