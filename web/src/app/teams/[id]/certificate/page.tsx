import { OrgCertificatePage } from '@/components/org-certificate-page';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({ title: '负责人证书', noIndex: true });
}

export default async function TeamCertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrgCertificatePage kind="team" id={id} />;
}
