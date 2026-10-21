import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';
import { countUsers } from '@/lib/users';
import { publicCaptchaId } from '@/lib/geetest';
import { getSettings } from '@/lib/settings';
import { RegisterForm } from '@/components/auth-forms';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect('/me');

  const [total, settings] = await Promise.all([countUsers(), getSettings()]);

  return (
    <div className="cols">
      <div className="col-main">
        <div className="auth-wrap">
          {settings.allowRegister ? (
            <RegisterForm captchaId={await publicCaptchaId()} isFirst={total === 0} />
          ) : (
            <div className="card card-pad">
              <h1 className="page-title" style={{ fontSize: 20 }}>
                暂停注册
              </h1>
              <p className="small muted" style={{ marginTop: 8, lineHeight: 1.8 }}>
                管理员暂时关闭了新账号注册。已有账号仍可正常登录。
              </p>
              <a href="/login" className="btn btn-primary" style={{ width: '100%', marginTop: 16 }}>
                去登录
              </a>
            </div>
          )}
        </div>
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">关于账号</div>
          <div className="rule-list">
            <div className="rule-row">
              <span className="n">1</span>
              <span>第一个注册的账号自动成为管理员，没有内置管理员账号</span>
            </div>
            <div className="rule-row">
              <span className="n">2</span>
              <span>密码用 scrypt 加盐哈希存储，服务端不可还原</span>
            </div>
            <div className="rule-row">
              <span className="n">3</span>
              <span>注册与登录都要求通过人机验证（需部署者配置 GeeTest）</span>
            </div>
          </div>
        </div>

        <div className="card rail-card">
          <div className="rail-title">注册之后</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            还要签署《社区公约》才能发帖与评论；参与约战需要另外签署《诚信公约》。
          </p>
          <Link href="/agreements" className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 10 }}>
            查看两份公约
          </Link>
        </div>
      </aside>
    </div>
  );
}
