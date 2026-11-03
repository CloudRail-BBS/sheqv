import { getCurrentUser } from '@/lib/current-user';
import { apiGetOr } from '@/lib/api-client';
import { ShopView } from '@/components/shop-view';
import { buildMetadata } from '@/lib/seo';
import type { ShopSnapshot } from '@/lib/shop-types';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({ title: '积分商城', path: '/shop' });
}

export default async function ShopPage() {
  const [user, data] = await Promise.all([
    getCurrentUser(),
    apiGetOr<ShopSnapshot>('/api/v1/shop', { items: [], orders: [], points: 0 }),
  ]);

  return (
    <div className="col-main">
      <ShopView initial={data} loggedIn={Boolean(user)} />
    </div>
  );
}
