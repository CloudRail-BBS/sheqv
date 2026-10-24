import { OrgDetail } from '@/components/org-detail';

export const dynamic = 'force-dynamic';

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrgDetail kind="team" id={id} />;
}
