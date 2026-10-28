import { apiGetOr } from './api-client';
import type { Ticket, TicketDetail } from './ticket-types';

/** 工单的服务端读取（仅服务端；提交/回复在客户端组件里直接打 API） */

export async function listMyTickets(status = ''): Promise<Ticket[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const d = await apiGetOr<{ items: Ticket[] }>(`/api/v1/me/tickets${q}`, { items: [] });
  return d.items ?? [];
}

export async function getMyTicket(id: string): Promise<TicketDetail | null> {
  const d = await apiGetOr<{ item: TicketDetail | null }>(
    `/api/v1/me/tickets/${encodeURIComponent(id)}`,
    { item: null },
  );
  return d.item ?? null;
}
