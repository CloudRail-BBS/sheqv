import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';
import { isCommunitySigned } from '@/lib/agreement-state';
import { getSettings } from '@/lib/settings';
import { WikiEditor } from '@/components/wiki-editor';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({
    title: '投稿百科',
    description: '任何人都可以为社区百科新建词条，提交后经审核公开。',
    path: '/wiki/submit',
    noIndex: true,
  });
}

export default async function WikiSubmitPage() {
  const [user, signed, settings] = await Promise.all([
    getCurrentUser(),
    isCommunitySigned(),
    getSettings(),
  ]);
  if (!user) redirect('/login?next=/wiki/submit');

  return (
    <div className="cols">
      <div className="col-main">
        {signed ? (
          <WikiEditor captchaId={settings.geetestId ?? ''} />
        ) : (
          <div className="card card-pad hint-box">
            未签署《社区公约》不能投稿。
            <Link href="/agreements">去签署</Link>
          </div>
        )}
      </div>
    </div>
  );
}
