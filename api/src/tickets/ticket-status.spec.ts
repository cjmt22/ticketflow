import {
  canTransition,
  TICKET_STATUSES,
  type TicketStatus,
} from './ticket-status.js';

describe('canTransition', () => {
  const allowed: Array<[TicketStatus, TicketStatus]> = [
    ['OPEN', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'RESOLVED'],
    ['RESOLVED', 'CLOSED'],
    ['RESOLVED', 'OPEN'],
    ['CLOSED', 'OPEN'],
  ];

  it.each(allowed)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it('rejects every other move', () => {
    for (const from of TICKET_STATUSES) {
      for (const to of TICKET_STATUSES) {
        const isAllowed = allowed.some(([f, t]) => f === from && t === to);
        if (!isAllowed) {
          expect(canTransition(from, to), `${from} -> ${to}`).toBe(false);
        }
      }
    }
  });
});