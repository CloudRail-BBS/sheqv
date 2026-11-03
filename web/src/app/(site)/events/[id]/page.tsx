import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';
import { apiGetOr } from '@/lib/api-client';
import { Markdown } from '@/lib/markdown';
import { EventJoin } from '@/components/event-join';
import { buildMetadata } from '@/lib/seo';
import { EVENT_STATUS_LABEL, fmtEventRange, type EventItem } from '@/lib/event-types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await apiGetOr<{ event?: EventItem }>(`/api/v1/events/${id}`, {});
  return buildMetadata({
    title: data.event?.title ?? '活动',
    path: `/events/${id}`,
    description: data.event?.summary,
  });
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, data] = await Promise.all([
    getCurrentUser(),
    apiGetOr<{ event?: EventItem }>(`/api/v1/events/${id}`, {}),
  ]);
  const ev = data.event;
  if (!ev) notFound();

  return (
    <div className="col-main">
      <div className="crumb">
        <Link href="/events">活动</Link>
        <span style={{ margin: '0 7px' }}>/</span>
        <span>详情</span>
      </div>

      <article className="card ev-detail">
        {ev.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="ev-detail-cover" src={ev.cover} alt="" />
        )}
        <div className="ev-detail-body">
          <div className="ev-top">
            <span className="ev-badge" data-status={ev.status}>
              {EVENT_STATUS_LABEL[ev.status]}
            </span>
            <span className="ev-time">{fmtEventRange(ev.startsAt, ev.endsAt)}</span>
            <span className="ev-count">{ev.entryCount} 人参加</span>
          </div>
          <h1 className="page-title">{ev.title}</h1>
          {ev.summary && <p className="ev-summary">{ev.summary}</p>}
          {ev.reward && <p className="ev-reward">奖励 · {ev.reward}</p>}

          <EventJoin
            id={ev.id}
            joined={ev.joined}
            status={ev.status}
            loggedIn={Boolean(user)}
          />

          {ev.body && (
            <div className="ev-detail-md">
              <Markdown text={ev.body} className="md-body" />
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
