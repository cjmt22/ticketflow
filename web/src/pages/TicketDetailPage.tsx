import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { errorMessages } from '../api/errors';
import { getTicket } from '../api/tickets';
import { useAuth } from '../auth/AuthContext';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import { FormError } from '../components/FormError';
import { AiPanel } from '../features/tickets/AiPanel';
import { Comments } from '../features/tickets/Comments';
import { TicketActions } from '../features/tickets/TicketActions';
import { formatDateTime } from '../lib/format';

function BackLink() {
  return (
    <Link to="/tickets" className="text-sm text-indigo-600 hover:underline">
      ← Back to tickets
    </Link>
  );
}

export function TicketDetailPage() {
  const { id = '' } = useParams();
  const { state } = useAuth();

  const query = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => getTicket(id),
    // A missing ticket will not appear by retrying.
    retry: (count, error) =>
      !(error instanceof ApiError && [400, 403, 404].includes(error.status)) && count < 2,
  });

  if (state.status !== 'authenticated') return null;
  const { user } = state;
  const isStaff = user.role !== 'CUSTOMER';

  if (query.isPending) return <p className="py-8 text-center text-slate-500">Loading ticket…</p>;

  if (query.isError) {
    // 400 = the address is not a valid ticket id, 404 = no such ticket (or not yours to see).
    const notFound =
      query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 400);
    return (
      <section className="space-y-3">
        <BackLink />
        {notFound ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
            <h1 className="text-xl font-semibold">Ticket not found</h1>
            <p className="mt-1 text-sm text-slate-600">
              It may have been removed, or you may not have access to it.
            </p>
          </div>
        ) : (
          <>
            <FormError messages={errorMessages(query.error)} />
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              Retry
            </button>
          </>
        )}
      </section>
    );
  }

  const ticket = query.data;

  return (
    <section className="space-y-4">
      <BackLink />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{ticket.title}</h1>
        <StatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-1 text-xs font-semibold uppercase text-slate-500">Description</h2>
            <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
          </div>
          <Comments ticketId={ticket.id} ticketStatus={ticket.status} role={user.role} />
        </div>

        <aside className="space-y-4">
          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Requester</dt>
                <dd className="font-medium">{ticket.requester.fullName}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Assignee</dt>
                <dd className="font-medium">{ticket.assignee?.fullName ?? 'Unassigned'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Category</dt>
                <dd className="font-medium">{ticket.category}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Created</dt>
                <dd>{formatDateTime(ticket.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Updated</dt>
                <dd>{formatDateTime(ticket.updatedAt)}</dd>
              </div>
            </dl>
            <hr className="border-slate-200" />
            {/* key: a fresh form whenever the ticket's category changes elsewhere */}
            <TicketActions key={`${ticket.id}-${ticket.category}`} ticket={ticket} user={user} />
          </div>
          {isStaff && <AiPanel ticket={ticket} />}
        </aside>
      </div>
    </section>
  );
}