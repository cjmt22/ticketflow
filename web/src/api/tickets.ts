import { request } from './client';
import type { ListFilters } from '../features/tickets/params';
import { PAGE_SIZE } from '../features/tickets/params';
import type { Paginated, Ticket, TicketComment, TicketPriority, TicketStatus } from './types';

export function listTickets(filters: ListFilters): Promise<Paginated<Ticket>> {
  return request<Paginated<Ticket>>('/tickets', {
    query: {
      page: filters.page,
      pageSize: PAGE_SIZE,
      q: filters.q.trim() || undefined,
      status: filters.status || undefined,
      priority: filters.priority || undefined,
      sort: filters.sort,
    },
  });
}

export interface NewTicket {
  title: string;
  description: string;
}

export function createTicket(input: NewTicket): Promise<Ticket> {
  return request<Ticket>('/tickets', { method: 'POST', body: input });
}

export function getTicket(id: string): Promise<Ticket> {
  return request<Ticket>(`/tickets/${id}`);
}

export function changeStatus(id: string, status: TicketStatus): Promise<Ticket> {
  return request<Ticket>(`/tickets/${id}/status`, { method: 'PATCH', body: { status } });
}

export function assignTicket(id: string, assigneeId: string | null): Promise<Ticket> {
  return request<Ticket>(`/tickets/${id}/assignee`, { method: 'PATCH', body: { assigneeId } });
}

export function updateTicket(
  id: string,
  changes: { priority?: TicketPriority; category?: string },
): Promise<Ticket> {
  return request<Ticket>(`/tickets/${id}`, { method: 'PATCH', body: changes });
}

// One page of 100 is plenty for a ticket thread; the page shows a note if there are more.
export const COMMENTS_PAGE_SIZE = 100;

export function listComments(ticketId: string): Promise<Paginated<TicketComment>> {
  return request<Paginated<TicketComment>>(`/tickets/${ticketId}/comments`, {
    query: { page: 1, pageSize: COMMENTS_PAGE_SIZE },
  });
}

export function addComment(
  ticketId: string,
  input: { body: string; isInternal: boolean },
): Promise<TicketComment> {
  return request<TicketComment>(`/tickets/${ticketId}/comments`, { method: 'POST', body: input });
}