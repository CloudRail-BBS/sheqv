import { OrgCertificatePage } from '@/components/org-certificate-page';

export const dynamic = 'force-dynamic';

export default async function GuildCertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrgCertificatePage kind="guild" id={id} />;
}
