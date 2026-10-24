import { OrgList } from '@/components/org-list';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '战队 · 方块竞技场',
  description: '战队独立于公会：自己的负责人、自己的战绩与榜单',
};

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game } = await searchParams;
  return <OrgList kind="team" game={game} />;
}
