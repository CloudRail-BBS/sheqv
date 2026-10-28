import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';
import { getMyTicket } from '@/lib/tickets';
import { TicketActions } from '@/components/ticket-actions';
import {
  TICKET_STATUS_BADGE,
  TICKET_STATUS_LABEL,
  ticketCategoryLabel,
  type TicketStatus,
} from '@/lib/ticket-types';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: '工单详情', path: `/tickets/${id}`, noIndex: true });
}

const time = (ts: number) => new Date(ts).toISOString().slice(0, 16).replace('T', ' ');

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const ticket = await getMyTicket(id);
  if (!ticket) notFound();

  return (
    <div className="col-main">
      <Link href="/tickets" className="small muted" style={{ marginBottom: 2 }}>
        ← 全部工单
      </Link>

      <div className="card card-pad ticket-head">
        <div className="row wrap" style={{ gap: 6 }}>
          <span className={TICKET_STATUS_BADGE[ticket.status as TicketStatus] ?? 'badge'}>
            {TICKET_STATUS_LABEL[ticket.status as TicketStatus] ?? '待处理'}
          </span>
          <span className="badge badge-ghost">{ticketCategoryLabel(ticket.category)}</span>
          <span className="small muted mono">#{ticket.id}</span>
        </div>
        <h1 className="page-title" style={{ fontSize: 20, marginTop: 8 }}>
          {ticket.subject}
        </h1>
        <p className="small muted" style={{ marginTop: 4 }}>
          提交于 {time(ticket.createdAt)} · 最近更新 {time(ticket.updatedAt)}
        </p>
      </div>

      <div className="ticket-thread">
        {ticket.messages.map((m) => (
          <div key={m.id} className="card ticket-msg" data-role={m.role}>
            <div className="ticket-msg-head">
              <b>
                {m.role === 'admin'
                  ? m.author === '管理员'
                    ? '管理员'
                    : `${m.author}（管理员）`
                  : '我'}
              </b>
              {m.role === 'admin' && <span className="badge badge-live">管理员</span>}
              <span className="small muted mono">{time(m.createdAt)}</span>
            </div>
            <p className="ticket-msg-body">{m.body}</p>
          </div>
        ))}
      </div>

      <div className="card card-pad">
        <TicketActions id={ticket.id} status={ticket.status as TicketStatus} />
      </div>
    </div>
  );
}
