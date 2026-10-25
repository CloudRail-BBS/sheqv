import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPolicy } from '@/lib/policy-store';
import { buildMetadata } from '@/lib/seo';
import { Markdown, markdownToText } from '@/lib/markdown';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const policy = await getPolicy(slug);
  if (!policy) return buildMetadata({ title: '政策', noIndex: true });
  return buildMetadata({
    title: policy.title,
    description: policy.summary || markdownToText(policy.body).slice(0, 120),
    path: `/policies/${policy.slug}`,
  });
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const policy = await getPolicy(slug);
  if (!policy) notFound();

  return (
    <div className="cols">
      <div className="col-main">
        <div className="crumb">
          <Link href="/policies">政策与协议</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <span>{policy.title}</span>
        </div>

        <article className="card card-pad policy-doc">
          <div className="between" style={{ alignItems: 'flex-start', gap: 12 }}>
            <div>
              <h1 className="page-title" style={{ fontSize: 24 }}>
                {policy.title}
              </h1>
              <p className="small muted" style={{ marginTop: 5 }}>
                {policy.version} · 更新于 {policy.updatedAt}
              </p>
            </div>
            <span className="badge">站内政策</span>
          </div>

          {policy.summary && <p className="policy-summary">{policy.summary}</p>}

          <Markdown text={policy.body} className="md-body policy-body" />

          <p className="small muted" style={{ marginTop: 24, paddingTop: 14, borderTop: '1px solid var(--line-soft)', lineHeight: 1.8 }}>
            本页面内容由站点管理员维护。如对条款有疑问，可在社区内联系管理员。
          </p>
        </article>
      </div>
    </div>
  );
}
