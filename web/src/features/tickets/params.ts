import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketPriority,
  type TicketStatus,
} from '../../api/types';

export const PAGE_SIZE = 10;
export const SORTS = ['newest', 'oldest', 'updated'] as const;
export type TicketSort = (typeof SORTS)[number];

export interface ListFilters {
  q: string;
  status: TicketStatus | '';
  priority: TicketPriority | '';
  sort: TicketSort;
  page: number;
}

function oneOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | undefined {
  return allowed.find((item) => item === value);
}

/** Reads the filters from the address bar, ignoring anything invalid. */
export function parseFilters(params: URLSearchParams): ListFilters {
  const page = Number.parseInt(params.get('page') ?? '', 10);
  return {
    q: (params.get('q') ?? '').trim().slice(0, 100),
    status: oneOf(params.get('status'), TICKET_STATUSES) ?? '',
    priority: oneOf(params.get('priority'), TICKET_PRIORITIES) ?? '',
    sort: oneOf(params.get('sort'), SORTS) ?? 'newest',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** Writes the filters to the address bar, leaving out anything that is the default. */
export function toSearchParams(filters: ListFilters): URLSearchParams {
  const params = new URLSearchParams();
  const q = filters.q.trim();
  if (q) params.set('q', q);
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.sort !== 'newest') params.set('sort', filters.sort);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params;
}

export function hasActiveFilters(filters: ListFilters): boolean {
  return Boolean(filters.q || filters.status || filters.priority);
}