import type { Role, TicketStatus } from '../../api/types';

// Mirrors the API's state machine, so the page only offers moves the API will accept.
// The API stays the judge: this is about not showing buttons that can only fail.
const NEXT: Record<TicketStatus, readonly TicketStatus[]> = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
};

export function nextStatuses(role: Role, current: TicketStatus): TicketStatus[] {
  const moves = NEXT[current];
  // Customers may only reopen their own ticket.
  return role === 'CUSTOMER' ? moves.filter((status) => status === 'OPEN') : [...moves];
}

/** Button text for moving a ticket to a status. */
export function actionLabel(to: TicketStatus): string {
  if (to === 'OPEN') return 'Reopen ticket';
  if (to === 'IN_PROGRESS') return 'Start work';
  if (to === 'RESOLVED') return 'Mark as resolved';
  return 'Close ticket';
}