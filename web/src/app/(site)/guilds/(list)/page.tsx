import { OrgList } from '@/components/org-list';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({
    title: '公会',
    description: '玩家自建公会，按游戏分榜；公会负责人可以导出负责人证书与公会信息分享图。',
    path: '/guilds',
  });
}

export default async function GuildsPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game } = await searchParams;
  return <OrgList kind="guild" game={game} />;
}
