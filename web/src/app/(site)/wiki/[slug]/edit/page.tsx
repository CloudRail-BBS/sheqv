import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';
import { isCommunitySigned } from '@/lib/agreement-state';
import { getSettings } from '@/lib/settings';
import { getWiki } from '@/lib/wiki';
import { WikiEditor } from '@/components/wiki-editor';
import { listCategories } from '@/lib/category-store';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return buildMetadata({
    title: '编辑词条',
    description: '提交对百科词条的修改，审核通过后生效。',
    path: `/wiki/${encodeURIComponent(slug)}/edit`,
    noIndex: true,
  });
}

export default async function WikiEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getWiki(slug);
  if (!data) notFound();

  const [user, signed, settings, categories] = await Promise.all([
    getCurrentUser(),
    isCommunitySigned(),
    getSettings(),
    listCategories('wiki'),
  ]);
  if (!user) redirect(`/login?next=/wiki/${encodeURIComponent(slug)}/edit`);

  return (
    <div className="cols">
      <div className="col-main">
        {signed ? (
          <WikiEditor
            slug={slug}
            captchaId={settings.geetestId ?? ''}
            categories={categories}
            initial={{
              title: data.entry.title,
              summary: data.entry.summary,
              category: data.entry.category,
              body: data.entry.body,
              tags: data.entry.tags,
            }}
          />
        ) : (
          <div className="card card-pad hint-box">
            未签署《社区公约》不能编辑百科。
            <Link href="/agreements">去签署</Link>
          </div>
        )}
      </div>
    </div>
  );
}
