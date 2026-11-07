import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { listTickets } from '../api/tickets';
import { errorMessages } from '../api/errors';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PRIORITY_LABELS, PriorityBadge, STATUS_LABELS, StatusBadge } from '../components/Badges';
import { FormError } from '../components/FormError';
import {
  PAGE_SIZE,
  hasActiveFilters,
  parseFilters,
  toSearchParams,
  type ListFilters,
  type TicketSort,
} from '../features/tickets/params';
import { formatDate } from '../lib/format';

const SORT_LABELS: Record<TicketSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  updated: 'Recently updated',
};

const selectClass = 'rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';

export function TicketsPage() {
  const { state } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseFilters(searchParams);
  const [searchText, setSearchText] = useState(filters.q);

  // Always build on the latest address-bar values, so a pending search can never overwrite a newer filter.
  const update = useCallback(
    (changes: Partial<ListFilters>, replace = false) => {
      setSearchParams((previous) => toSearchParams({ ...parseFilters(previous), ...changes }), {
        replace,
      });
    },
    [setSearchParams],
  );

  // Search as you type, but only after a short pause.
  useEffect(() => {
    const trimmed = searchText.trim();
    if (trimmed === filters.q) return;
    const timer = setTimeout(() => update({ q: trimmed, page: 1 }, true), 300);
    return () => clearTimeout(timer);
  }, [searchText, filters.q, update]);

  const query = useQuery({
    queryKey: ['tickets', filters],
    queryFn: () => listTickets(filters),
    placeholderData: keepPreviousData,
  });

  if (state.status !== 'authenticated') return null;
  const isStaff = state.user.role !== 'CUSTOMER';
  const columns = isStaff ? 6 : 4;

  function clearFilters() {
    setSearchText('');
    setSearchParams(new URLSearchParams());
  }

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tickets</h1>
        <Link
          to="/tickets/new"
          className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          New ticket
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex-1 space-y-1" style={{ minWidth: '12rem' }}>
          <label htmlFor="search" className="block text-xs font-medium text-slate-600">
            Search
          </label>
          <input
            id="search"
            type="search"
            placeholder="Title or description"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="status" className="block text-xs font-medium text-slate-600">
            Status
          </label>
          <select
            id="status"
            value={filters.status}
            onChange={(event) =>
              update({ status: event.target.value as ListFilters['status'], page: 1 })
            }
            className={selectClass}
          >
            <option value="">All statuses</option>
            {TICKET_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="priority" className="block text-xs font-medium text-slate-600">
            Priority
          </label>
          <select
            id="priority"
            value={filters.priority}
            onChange={(event) =>
              update({ priority: event.target.value as ListFilters['priority'], page: 1 })
            }
            className={selectClass}
          >
            <option value="">All priorities</option>
            {TICKET_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="sort" className="block text-xs font-medium text-slate-600">
            Sort
          </label>
          <select
            id="sort"
            value={filters.sort}
            onChange={(event) => update({ sort: event.target.value as TicketSort, page: 1 })}
            className={selectClass}
          >
            {(Object.keys(SORT_LABELS) as TicketSort[]).map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </div>
        {hasActiveFilters(filters) && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded px-2 py-1.5 text-sm text-indigo-600 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {query.isPending && <p className="py-8 text-center text-slate-500">Loading tickets…</p>}

      {query.isError && (
        <div className="space-y-2">
          <FormError messages={errorMessages(query.error)} />
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            Retry
          </button>
        </div>
      )}

      {query.data && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Priority</th>
                {isStaff && <th className="px-3 py-2">Requester</th>}
                {isStaff && <th className="px-3 py-2">Assignee</th>}
                <th className="px-3 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {query.data.data.length === 0 && (
                <tr>
                  <td colSpan={columns} className="px-3 py-8 text-center text-slate-500">
                    {total > 0
                      ? 'That page does not exist.'
                      : hasActiveFilters(filters)
                        ? 'No tickets match your filters.'
                        : 'No tickets yet. Create the first one with “New ticket”.'}
                  </td>
                </tr>
              )}
              {query.data.data.map((ticket) => (
                <tr key={ticket.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-medium">{ticket.title}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={ticket.status} />
                  </td>
                  <td className="px-3 py-2">
                    <PriorityBadge priority={ticket.priority} />
                  </td>
                  {isStaff && <td className="px-3 py-2">{ticket.requester.fullName}</td>}
                  {isStaff && (
                    <td className="px-3 py-2 text-slate-600">
                      {ticket.assignee?.fullName ?? 'Unassigned'}
                    </td>
                  )}
                  <td className="px-3 py-2 text-slate-600">{formatDate(ticket.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {query.data && total > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {filters.page} of {totalPages} · {total} {total === 1 ? 'ticket' : 'tickets'}
            {query.isFetching && ' · Updating…'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={filters.page <= 1}
              onClick={() => update({ page: filters.page - 1 })}
              className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={filters.page >= totalPages}
              onClick={() => update({ page: filters.page + 1 })}
              className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}