import Link from 'next/link';

/**
 * 后台未授权提示。三种情况分开说，避免"没登录"和"不是管理员"混为一谈。
 */
export function AdminDenied({ loggedIn, nickname }: { loggedIn: boolean; nickname?: string }) {
  if (!loggedIn) {
    return (
      <div className="card card-pad" style={{ maxWidth: 460, margin: '32px auto 0' }}>
        <h1 className="page-title" style={{ fontSize: 19 }}>
          后台需要登录
        </h1>
        <p className="small muted" style={{ marginTop: 8, lineHeight: 1.8 }}>
          本站没有默认管理员账号。第一个注册的账号会自动成为管理员，之后注册的都是普通成员。
        </p>
        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <Link href="/login" className="btn btn-primary" style={{ flex: 1 }}>
            登录
          </Link>
          <Link href="/register" className="btn" style={{ flex: 1 }}>
            注册
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card card-pad" style={{ maxWidth: 460, margin: '32px auto 0' }}>
      <h1 className="page-title" style={{ fontSize: 19 }}>
        403 · 当前账号不是管理员
      </h1>
      <p className="small muted" style={{ marginTop: 8, lineHeight: 1.8 }}>
        你正以 <b>{nickname}</b> 的身份登录，该账号没有后台权限。
        管理员身份只授予第一个注册的账号；如需移交，请直接编辑服务器上的
        <code className="mono"> $DATA_DIR/users.json</code>，把目标账号的 <code className="mono">role</code>
        改成 <code className="mono">admin</code>。
      </p>
      <Link href="/" className="btn btn-ghost" style={{ width: '100%', marginTop: 16 }}>
        返回社区
      </Link>
    </div>
  );
}
