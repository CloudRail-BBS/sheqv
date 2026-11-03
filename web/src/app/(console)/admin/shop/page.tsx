import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { apiGetOr } from '@/lib/api-client';
import { AdminShop } from '@/components/admin-shop';
import type { ShopItem } from '@/lib/shop-types';

export const dynamic = 'force-dynamic';

export default async function AdminShopPage() {
  const gate = await getAdminGate();
  if (!gate.ok) {
    return (
      <div className="col-main">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  const data = await apiGetOr<{ items: ShopItem[] }>('/api/v1/admin/shop', { items: [] });
  return <AdminShop initial={data.items ?? []} />;
}
