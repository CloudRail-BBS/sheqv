import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';
import { countUsers } from '@/lib/users';
import { publicCaptchaId } from '@/lib/geetest';
import { LoginForm } from '@/components/auth-forms';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect('/me');

  const total = await countUsers();

  return (
    <div className="cols">
      <div className="col-main">
        <div className="auth-wrap">
          {total === 0 ? (
            <div className="card card-pad">
              <h1 className="page-title" style={{ fontSize: 20 }}>
                还没有任何账号
              </h1>
              <p className="small muted" style={{ marginTop: 8, lineHeight: 1.8 }}>
                本站没有内置管理员。第一个注册的账号将成为管理员。
              </p>
              <Link href="/register" className="btn btn-primary" style={{ width: '100%', marginTop: 16 }}>
                去注册（第一个账号即管理员）
              </Link>
            </div>
          ) : (
            <LoginForm captchaId={await publicCaptchaId()} />
          )}
        </div>
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">忘记密码</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            当前版本不支持自助找回密码。请联系站点管理员重置；忘记的是管理员账号时，
            可由运维人员协助恢复。
          </p>
        </div>
      </aside>
    </div>
  );
}
