import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';
import { countUsers } from '@/lib/users';
import { publicCaptchaId } from '@/lib/geetest';
import { getSettings } from '@/lib/settings';
import { RegisterForm } from '@/components/auth-forms';
import { AuthModal } from '@/components/auth-modal';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({ title: '注册', path: '/register', noIndex: true });
}

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

export default async function RegisterPage({
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

  if (!settings.allowRegister) {
    return (
      <AuthModal
        settings={settings}
        title="暂停注册"
        desc="管理员暂时关闭了新账号注册，已有账号仍可正常登录。"
        footer={<span>如果你已经有账号，直接登录即可。</span>}
      >
        <Link href="/login" className="btn btn-primary" style={{ width: '100%' }}>
          去登录
        </Link>
      </AuthModal>
    );
  }

  return (
    <AuthModal
      settings={settings}
      title={total === 0 ? '创建第一个账号' : '创建账号'}
      desc={
        total === 0
          ? '这是本站的第一个账号，注册后自动成为管理员。'
          : settings.registerHint || '注册后即可发帖、评论与签署公约。'
      }
      footer={
        <span>
          已有账号？{' '}
          <Link href="/login" className="auth-link">
            直接登录
          </Link>
        </span>
      }
    >
      <RegisterForm
        captchaId={captchaId}
        providers={providers}
        logo={null}
        siteName={settings.siteName}
        hint={settings.registerHint}
        initialError={initialError}
        isFirst={total === 0}
        bare
      />
    </AuthModal>
  );
}
