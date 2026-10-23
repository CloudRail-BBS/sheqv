import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';
import { countUsers } from '@/lib/users';
import { publicCaptchaId } from '@/lib/geetest';
import { getSettings } from '@/lib/settings';
import { LoginForm } from '@/components/auth-forms';
import { BrandMark } from '@/components/brand-mark';

export const dynamic = 'force-dynamic';

/** 第三方登录失败时带上来的错误码 */
const ERRORS: Record<string, string> = {
  provider_disabled: '该登录方式尚未启用',
  register_closed: '站点暂时关闭了注册，无法自动创建账号',
  account_banned: '该账号已被封禁，请联系管理员',
  account_inactive: 'CNKD 账号当前状态不可用于登录',
  access_denied: '你取消了授权',
  state_mismatch: '登录会话已过期，请重新发起',
  missing_pkce: '登录会话已过期，请重新发起',
  unknown_provider: '未知的登录方式',
  oauth_failed: '第三方登录失败，请稍后再试',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
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
            <LoginForm
              captchaId={captchaId}
              providers={providers}
              logo={<BrandMark settings={settings} />}
              siteName={settings.siteName}
              hint={settings.loginHint}
              initialError={initialError}
            />
          )}
        </div>
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">登录方式</div>
          <div className="rule-list">
            <div className="rule-row">
              <span className="n">1</span>
              <span>用户名或邮箱 + 密码</span>
            </div>
            {providers.github && (
              <div className="rule-row">
                <span className="n">2</span>
                <span>GitHub 授权登录，免注册</span>
              </div>
            )}
            {providers.cnkd && (
              <div className="rule-row">
                <span className="n">3</span>
                <span>CNKD 一证通行，免注册</span>
              </div>
            )}
          </div>
          <p className="small muted" style={{ marginTop: 10, lineHeight: 1.75 }}>
            第三方登录不会读取你的邮箱或密码，只用于确认「你是同一个人」。
          </p>
        </div>

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
