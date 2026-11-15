import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessages } from '../../api/errors';
import { assignTicket, changeStatus, updateTicket } from '../../api/tickets';
import { TICKET_PRIORITIES, type Ticket, type TicketPriority, type User } from '../../api/types';
import { PRIORITY_LABELS } from '../../components/Badges';
import { FormError } from '../../components/FormError';
import { actionLabel, nextStatuses } from './status';

interface Props {
  ticket: Ticket;
  user: User;
}

const buttonClass =
  'rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-60';

export function TicketActions({ ticket, user }: Props) {
  const queryClient = useQueryClient();
  const isStaff = user.role !== 'CUSTOMER';
  const [category, setCategory] = useState(ticket.category);

  // Every action returns the updated ticket, so the page can show it straight away.
  async function refresh(updated: Ticket) {
    queryClient.setQueryData(['ticket', ticket.id], updated);
    await queryClient.invalidateQueries({ queryKey: ['tickets'] });
  }

  const status = useMutation({
    mutationFn: (next: Ticket['status']) => changeStatus(ticket.id, next),
    onSuccess: refresh,
    // A 409 means someone else changed the ticket first: show their version.
    onError: () => void queryClient.invalidateQueries({ queryKey: ['ticket', ticket.id] }),
  });
  const assign = useMutation({
    mutationFn: (assigneeId: string | null) => assignTicket(ticket.id, assigneeId),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: (changes: { priority?: TicketPriority; category?: string }) =>
      updateTicket(ticket.id, changes),
    onSuccess: refresh,
  });

  const errors = [status, assign, update].flatMap((mutation) =>
    mutation.isError ? errorMessages(mutation.error) : [],
  );
  const busy = status.isPending || assign.isPending || update.isPending;

  // Clear old errors whenever a new action starts.
  function clearErrors() {
    status.reset();
    assign.reset();
    update.reset();
  }

  const moves = nextStatuses(user.role, ticket.status);
  const trimmedCategory = category.trim();
  const categoryChanged = trimmedCategory !== '' && trimmedCategory !== ticket.category;

  return (
    <div className="space-y-4">
      <FormError messages={errors} />

      {moves.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-slate-500">Status</h3>
          <div className="flex flex-wrap gap-2">
            {moves.map((next) => (
              <button
                key={next}
                type="button"
                disabled={busy}
                onClick={() => {
                  clearErrors();
                  status.mutate(next);
                }}
                className={buttonClass}
              >
                {actionLabel(next)}
              </button>
            ))}
          </div>
        </div>
      )}

      {isStaff && (
        <>
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase text-slate-500">Assignee</h3>
            <div className="flex flex-wrap gap-2">
              {ticket.assigneeId !== user.id && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    clearErrors();
                    assign.mutate(user.id);
                  }}
                  className={buttonClass}
                >
                  Assign to me
                </button>
              )}
              {ticket.assigneeId !== null && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    clearErrors();
                    assign.mutate(null);
                  }}
                  className={buttonClass}
                >
                  Unassign
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="priority" className="block text-xs font-semibold uppercase text-slate-500">
              Priority
            </label>
            <select
              id="priority"
              value={ticket.priority}
              disabled={busy}
              onChange={(event) => {
                clearErrors();
                update.mutate({ priority: event.target.value as TicketPriority });
              }}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              {TICKET_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
          </div>

          <form
            className="space-y-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (!categoryChanged) return;
              clearErrors();
              update.mutate({ category: trimmedCategory });
            }}
          >
            <label htmlFor="category" className="block text-xs font-semibold uppercase text-slate-500">
              Category
            </label>
            <div className="flex gap-2">
              <input
                id="category"
                maxLength={50}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
              <button type="submit" disabled={busy || !categoryChanged} className={buttonClass}>
                Save
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}