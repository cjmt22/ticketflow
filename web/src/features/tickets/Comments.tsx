import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { errorMessages } from '../../api/errors';
import { COMMENTS_PAGE_SIZE, addComment, listComments } from '../../api/tickets';
import type { Role, TicketStatus } from '../../api/types';
import { FormError } from '../../components/FormError';
import { formatDateTime } from '../../lib/format';

interface Props {
  ticketId: string;
  ticketStatus: TicketStatus;
  role: Role;
}

export function Comments({ ticketId, ticketStatus, role }: Props) {
  const queryClient = useQueryClient();
  const isStaff = role !== 'CUSTOMER';
  const [body, setBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);

  const comments = useQuery({
    queryKey: ['comments', ticketId],
    queryFn: () => listComments(ticketId),
  });

  const post = useMutation({
    mutationFn: () => addComment(ticketId, { body: body.trim(), isInternal }),
    onSuccess: async () => {
      setBody('');
      setIsInternal(false);
      // A new comment also bumps the ticket's "last updated" time.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['comments', ticketId] }),
        queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] }),
        queryClient.invalidateQueries({ queryKey: ['tickets'] }),
      ]);
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (body.trim() === '') return;
    post.mutate();
  }

  const isClosed = ticketStatus === 'CLOSED';

  return (
    <section aria-labelledby="comments-heading" className="space-y-3">
      <h2 id="comments-heading" className="text-lg font-semibold">
        Conversation
      </h2>

      {comments.isPending && <p className="text-sm text-slate-500">Loading comments…</p>}
      {comments.isError && (
        <div className="space-y-2">
          <FormError messages={errorMessages(comments.error)} />
          <button
            type="button"
            onClick={() => void comments.refetch()}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            Retry
          </button>
        </div>
      )}

      {comments.data && comments.data.data.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          No comments yet.
        </p>
      )}

      {comments.data && comments.data.data.length > 0 && (
        <ul className="space-y-3">
          {comments.data.data.map((comment) => (
            <li
              key={comment.id}
              className={
                comment.isInternal
                  ? 'rounded-lg border border-amber-300 bg-amber-50 p-3'
                  : 'rounded-lg border border-slate-200 bg-white p-3'
              }
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{comment.author.fullName}</span>
                {comment.author.role !== 'CUSTOMER' && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                    Staff
                  </span>
                )}
                {comment.isInternal && (
                  <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xs font-medium text-amber-900">
                    Internal note
                  </span>
                )}
                <span className="text-xs text-slate-500">{formatDateTime(comment.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}

      {comments.data && comments.data.total > COMMENTS_PAGE_SIZE && (
        <p className="text-xs text-slate-500">
          Showing the first {COMMENTS_PAGE_SIZE} of {comments.data.total} comments.
        </p>
      )}

      {isClosed ? (
        <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
          This ticket is closed. Reopen it to add a comment.
        </p>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-lg border border-slate-200 bg-white p-3"
        >
          {post.isError && <FormError messages={errorMessages(post.error)} />}
          <div className="space-y-1">
            <label htmlFor="comment-body" className="block text-sm font-medium">
              Add a comment
            </label>
            <textarea
              id="comment-body"
              rows={3}
              maxLength={5000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {isStaff ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(event) => setIsInternal(event.target.checked)}
                />
                Internal note (only staff can see it)
              </label>
            ) : (
              <span />
            )}
            <button
              type="submit"
              disabled={post.isPending || body.trim() === ''}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {post.isPending ? 'Posting…' : isInternal ? 'Add internal note' : 'Add comment'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}