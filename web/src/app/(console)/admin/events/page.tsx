import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { apiGetOr } from '@/lib/api-client';
import { AdminEvents } from '@/components/admin-events';
import type { EventItem } from '@/lib/event-types';

export const dynamic = 'force-dynamic';

export default async function AdminEventsPage() {
  const gate = await getAdminGate();
  if (!gate.ok) {
    return (
      <div className="col-main">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  const data = await apiGetOr<{ items: EventItem[] }>('/api/v1/admin/events', { items: [] });
  return <AdminEvents initial={data.items ?? []} />;
}
