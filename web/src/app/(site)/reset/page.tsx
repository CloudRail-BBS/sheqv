import Link from 'next/link';
import { AuthModal } from '@/components/auth-modal';
import { ResetForm } from '@/components/reset-form';
import { getSettings } from '@/lib/settings';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata() {
  return buildMetadata({ title: '找回密码', path: '/reset', noIndex: true });
}

export default async function ResetPage() {
  const settings = await getSettings();
  return (
    <AuthModal
      settings={settings}
      title="找回密码"
      desc="用注册邮箱接收验证码，验证通过后设置新密码。"
      footer={
        <span>
          想起来了？{' '}
          <Link href="/login" className="auth-link">
            返回登录
          </Link>
        </span>
      }
    >
      <ResetForm />
    </AuthModal>
  );
}
