import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';
import { listMyTickets } from '@/lib/tickets';
import { TicketCreate } from '@/components/ticket-create';
import {
  TICKET_STATUS_BADGE,
  TICKET_STATUS_LABEL,
  ticketCategoryLabel,
  type TicketStatus,
} from '@/lib/ticket-types';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({ title: '工单', path: '/tickets', noIndex: true });
}

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'open', label: '待处理' },
  { key: 'replied', label: '已回复' },
  { key: 'closed', label: '已关闭' },
];

const day = (ts: number) => new Date(ts).toISOString().slice(0, 16).replace('T', ' ');

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { status = '' } = await searchParams;
  const items = await listMyTickets(status);

  return (
    <div className="col-main">
      <div className="between" style={{ alignItems: 'flex-end', gap: 12 }}>
        <div>
          <h1 className="page-title">工单</h1>
          <p className="small muted" style={{ marginTop: 4, lineHeight: 1.7 }}>
            账号、举报、故障与建议都可以在这里提交；处理过程会留在工单里，结果会发站内信。
          </p>
        </div>
        <TicketCreate />
      </div>

      <div className="row wrap" style={{ gap: 6, margin: '14px 0 10px' }}>
        {FILTERS.map((f) => (
          <Link
            key={f.key || 'all'}
            href={f.key ? `/tickets?status=${f.key}` : '/tickets'}
            className="chip"
            data-on={status === f.key}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="card empty-state">
          <b>还没有工单</b>
          <p>遇到问题可以点右上角「提交工单」，写清楚分类和复现步骤。</p>
        </div>
      ) : (
        <div className="ticket-list">
          {items.map((t) => (
            <Link key={t.id} href={`/tickets/${t.id}`} className="card ticket-row">
              <div className="ticket-row-main">
                <div className="ticket-row-top">
                  <span className={TICKET_STATUS_BADGE[t.status as TicketStatus] ?? 'badge'}>
                    {TICKET_STATUS_LABEL[t.status as TicketStatus] ?? '待处理'}
                  </span>
                  <span className="badge badge-ghost">{ticketCategoryLabel(t.category)}</span>
                  <b className="ticket-row-subject">{t.subject}</b>
                </div>
                {t.lastMessage && (
                  <p className="ticket-row-last">
                    {t.lastRole === 'user' ? '你' : '管理员'}：{t.lastMessage}
                  </p>
                )}
              </div>
              <div className="ticket-row-side">
                <span>{t.messageCount} 条</span>
                <span className="mono">{day(t.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
