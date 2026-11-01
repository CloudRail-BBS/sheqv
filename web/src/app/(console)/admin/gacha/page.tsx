import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { apiGetOr } from '@/lib/api-client';
import { AdminGacha, type Card } from '@/components/admin-gacha';

export const dynamic = 'force-dynamic';

export default async function AdminGachaPage() {
  const gate = await getAdminGate();
  if (!gate.ok) {
    return (
      <div className="col-main">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  const data = await apiGetOr<{ items: Card[]; config: { cost: number; enabled: boolean } }>(
    '/api/v1/admin/gacha',
    { items: [], config: { cost: 20, enabled: true } },
  );

  return <AdminGacha initial={data.items ?? []} initialConfig={data.config} />;
}
