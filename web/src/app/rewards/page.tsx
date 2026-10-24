import Link from 'next/link';
import { getCurrentUser } from '@/lib/current-user';
import { getRewards } from '@/lib/reward-store';
import { RewardCenter } from '@/components/reward-center';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({ title: '福利中心', path: '/rewards', noIndex: true });
}

export default async function RewardsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="col-main">
        <h1 className="page-title">福利中心</h1>
        <div className="card card-pad" style={{ marginTop: 14, maxWidth: 480 }}>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            礼品卡、兑换码与抽奖需要登录后使用。登录后可以在卡包里拆开点名发给你的礼品卡。
          </p>
          <Link href="/login" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
            去登录
          </Link>
        </div>
      </div>
    );
  }

  const snapshot = await getRewards();

  return (
    <div className="col-main">
      <RewardCenter initial={snapshot} />
    </div>
  );
}
