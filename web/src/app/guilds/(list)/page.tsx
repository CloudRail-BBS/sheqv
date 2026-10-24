import { OrgList } from '@/components/org-list';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '公会 · 方块竞技场',
  description: '玩家自建公会，按游戏分榜；负责人可导出证书与分享图',
};

export default async function GuildsPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game } = await searchParams;
  return <OrgList kind="guild" game={game} />;
}
