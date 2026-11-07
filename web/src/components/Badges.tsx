import type { TicketPriority, TicketStatus } from '../api/types';

export const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

const STATUS_STYLES: Record<TicketStatus, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  RESOLVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-slate-200 text-slate-700',
};

const PRIORITY_STYLES: Record<TicketPriority, string> = {
  LOW: 'bg-slate-100 text-slate-700',
  MEDIUM: 'bg-sky-100 text-sky-800',
  HIGH: 'bg-orange-100 text-orange-800',
  URGENT: 'bg-red-100 text-red-800',
};

const BASE = 'inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium';

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`${BASE} ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span className={`${BASE} ${PRIORITY_STYLES[priority]}`}>{PRIORITY_LABELS[priority]}</span>
  );
}