import { getCurrentUser } from '@/lib/current-user';
import { apiGetOr } from '@/lib/api-client';
import { EventsView } from '@/components/events-view';
import { buildMetadata } from '@/lib/seo';
import type { EventItem } from '@/lib/event-types';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({ title: '社区活动', path: '/events' });
}

export default async function EventsPage() {
  const [user, data] = await Promise.all([
    getCurrentUser(),
    apiGetOr<{ items: EventItem[] }>('/api/v1/events', { items: [] }),
  ]);

  return <EventsView initial={data.items ?? []} loggedIn={Boolean(user)} />;
}
