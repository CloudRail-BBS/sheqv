import { OrgList } from '@/components/org-list';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({
    title: '战队',
    description: '战队独立于公会：自己的负责人、自己的战绩与单独一张榜，按游戏分组排名。',
    path: '/teams',
  });
}

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game } = await searchParams;
  return <OrgList kind="team" game={game} />;
}
