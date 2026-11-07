import { request } from './client';
import type { ListFilters } from '../features/tickets/params';
import { PAGE_SIZE } from '../features/tickets/params';
import type { Paginated, Ticket } from './types';

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