import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminRewards } from '@/components/admin-rewards';

export const dynamic = 'force-dynamic';

export default async function AdminRewardsPage() {
  const gate = await getAdminGate();
  if (!gate.ok) {
    return (
      <div className="col-main">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  return (
    <div className="col-main">
      <h1 className="page-title">福利中心</h1>
      <p className="small muted" style={{ marginTop: 4 }}>
        发礼品卡、生成兑换码、配置抽奖奖池。卡被拆开或兑换后才会发奖，删除只对未使用的卡生效。
      </p>

      <AdminRewards />
    </div>
  );
}
