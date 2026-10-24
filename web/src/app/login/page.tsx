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

  // 后台「登录页能力条」优先；没配则按当前可用的登录方式生成
  const customPoints = settings.loginPoints
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf('|');
      return at < 0
        ? { title: line, desc: '' }
        : { title: line.slice(0, at).trim(), desc: line.slice(at + 1).trim() };
    })
    .filter((p) => p.title)
    .slice(0, 3);

  const methods = [
    { title: '账号密码', desc: '用户名或邮箱 + 密码' },
    ...(settings.emailLoginEnabled ? [{ title: '邮箱验证码', desc: '收信即登录，免密码' }] : []),
    ...(providers.github ? [{ title: 'GitHub', desc: '授权登录，免注册' }] : []),
    ...(providers.cnkd ? [{ title: 'CNKD', desc: '一证通行，免注册' }] : []),
  ];

  const points = customPoints.length > 0 ? customPoints : methods.slice(0, 3);

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <aside className="auth-brand">
          <span className="auth-eyebrow">
            <i />
            {settings.siteName}
          </span>

          <h1 className="auth-brand-title">
            欢迎回到
            <br />
            {settings.siteName}
          </h1>

          <p className="auth-brand-desc">
            {settings.loginHint || '登录后可发帖、评论、签署公约与进入后台。'}
          </p>

          <div className="auth-orbit" aria-hidden="true">
            <span className="auth-orbit-1" />
            <span className="auth-orbit-2" />
            <span className="auth-orbit-mark">
              <BrandMark settings={settings} />
            </span>
          </div>

          <ul className="auth-points">
            {points.map((m) => (
              <li key={m.title}>
                <b>{m.title}</b>
                <span>{m.desc}</span>
              </li>
            ))}
          </ul>
        </aside>

        <div className="auth-panel">
          {total === 0 ? (
            <>
              <h2 className="auth-panel-title">还没有任何账号</h2>
              <p className="small muted" style={{ marginTop: 8, lineHeight: 1.8 }}>
                本站没有内置管理员。第一个注册的账号将成为管理员。
              </p>
              <Link href="/register" className="btn btn-primary" style={{ width: '100%', marginTop: 18 }}>
                去注册（第一个账号即管理员）
              </Link>
            </>
          ) : (
            <>
              <p className="auth-eyebrow-sm">Secure Login</p>
              <h2 className="auth-panel-title" style={{ marginTop: 8 }}>
                欢迎回来
              </h2>
              <p className="small muted" style={{ marginTop: 6 }}>
                请登录你的账号继续
              </p>
              <div style={{ marginTop: 22 }}>
                <LoginForm
                  captchaId={captchaId}
                  providers={providers}
                  logo={<BrandMark settings={settings} />}
                  siteName={settings.siteName}
                  hint={settings.loginHint}
                  initialError={initialError}
                  emailEnabled={settings.emailLoginEnabled}
                  bare
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
