import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';
import { countUsers } from '@/lib/users';
import { publicCaptchaId } from '@/lib/geetest';
import { getSettings } from '@/lib/settings';
import { RegisterForm } from '@/components/auth-forms';
import { BrandMark } from '@/components/brand-mark';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  register_closed: '站点暂时关闭了注册',
  provider_disabled: '该登录方式尚未启用',
  account_banned: '该账号已被封禁，请联系管理员',
  account_inactive: 'CNKD 账号当前状态不可用于注册',
  access_denied: '你取消了授权',
  state_mismatch: '登录会话已过期，请重新发起',
  missing_pkce: '登录会话已过期，请重新发起',
  oauth_failed: '第三方登录失败，请稍后再试',
};

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect('/me');

  const [total, settings, captchaId, sp] = await Promise.all([
    countUsers(),
    getSettings(),
    publicCaptchaId(),
    searchParams,
  ]);

  const code = sp.error ?? '';
  const initialError = code ? (ERRORS[code] ?? '第三方登录失败，请稍后再试') : null;

  const providers = {
    github: Boolean(settings.githubEnabled),
    cnkd: Boolean(settings.cnkdEnabled),
  };

  return (
    <div className="cols">
      <div className="col-main">
        <div className="auth-wrap">
          {settings.allowRegister ? (
            <RegisterForm
              captchaId={captchaId}
              providers={providers}
              logo={<BrandMark settings={settings} />}
              siteName={settings.siteName}
              hint={settings.registerHint}
              initialError={initialError}
              isFirst={total === 0}
            />
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
              <span>注册与登录都会做人机验证，防止机器人批量注册</span>
            </div>
            {(providers.github || providers.cnkd) && (
              <div className="rule-row">
                <span className="n">4</span>
                <span>也可以直接用 GitHub / CNKD 登录，自动建号，无需另填密码</span>
              </div>
            )}
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
