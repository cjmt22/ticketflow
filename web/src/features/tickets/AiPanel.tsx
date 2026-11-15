import type { Ticket } from '../../api/types';

const FIELDS = [
  ['aiCategory', 'Category'],
  ['aiPriority', 'Priority'],
  ['aiSentiment', 'Sentiment'],
] as const;

/** AI suggestions for agents. The API never sends them to customers, so this is staff-only. */
export function AiPanel({ ticket }: { ticket: Ticket }) {
  const hasAnalysis = [ticket.aiCategory, ticket.aiPriority, ticket.aiSentiment, ticket.aiSummary].some(
    Boolean,
  );

  return (
    <section
      aria-labelledby="ai-heading"
      className="space-y-2 rounded-lg border border-violet-200 bg-violet-50 p-3"
    >
      <h3 id="ai-heading" className="text-xs font-semibold uppercase text-violet-800">
        AI suggestions
      </h3>
      {hasAnalysis ? (
        <dl className="space-y-1 text-sm">
          {FIELDS.map(([key, label]) =>
            ticket[key] ? (
              <div key={key} className="flex justify-between gap-2">
                <dt className="text-slate-600">{label}</dt>
                <dd className="font-medium">{ticket[key]}</dd>
              </div>
            ) : null,
          )}
          {ticket.aiSummary && <p className="pt-1 text-slate-700">{ticket.aiSummary}</p>}
        </dl>
      ) : (
        <p className="text-sm text-slate-600">No AI analysis for this ticket yet.</p>
      )}
    </section>
  );
}