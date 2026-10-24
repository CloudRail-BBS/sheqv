import { OrgDetail } from '@/components/org-detail';
import { getOrg } from '@/lib/orgs';
import { gameLabel } from '@/lib/org-types';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await getOrg('guild', id);
  if (!org) return buildMetadata({ title: '公会', path: `/guilds/${id}`, noIndex: true });
  return buildMetadata({
    title: org.name,
    description: org.intro || `${org.name} · ${gameLabel(org.game)} 公会，积分 ${org.points}，战绩 ${org.wins} 胜 ${org.losses} 负。`,
    path: `/guilds/${id}`,
  });
}

export default async function GuildDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrgDetail kind="guild" id={id} />;
}
