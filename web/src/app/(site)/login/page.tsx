import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';
import { countUsers } from '@/lib/users';
import { publicCaptchaId } from '@/lib/geetest';
import { getSettings } from '@/lib/settings';
import { LoginForm } from '@/components/auth-forms';
import { AuthModal } from '@/components/auth-modal';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({ title: '登录', path: '/login', noIndex: true });
}

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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
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

  if (total === 0) {
    return (
      <AuthModal
        settings={settings}
        title="还没有任何账号"
        desc="本站没有内置管理员，第一个注册的账号会成为管理员。"
        footer={<span>注册后即可发帖、评论与签署公约。</span>}
      >
        <Link href="/register" className="btn btn-primary" style={{ width: '100%' }}>
          去注册
        </Link>
      </AuthModal>
    );
  }

  return (
    <AuthModal
      settings={settings}
      title="登录"
      desc="登录后可发帖、评论、签署公约与进入后台。"
      footer={
        settings.allowRegister ? (
          <span>
            还没有账号？{' '}
            <Link href="/register" className="auth-link">
              注册一个
            </Link>
          </span>
        ) : (
          <span>站点暂时关闭了新账号注册。</span>
        )
      }
    >
      <LoginForm
        captchaId={captchaId}
        providers={providers}
        logo={null}
        siteName={settings.siteName}
        hint={settings.loginHint}
        initialError={initialError}
        emailEnabled={settings.emailLoginEnabled}
        bare
      />
    </AuthModal>
  );
}
