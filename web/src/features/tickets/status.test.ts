import { describe, expect, it } from 'vitest';
import { actionLabel, nextStatuses } from './status';

describe('nextStatuses', () => {
  it('offers staff exactly the moves the API allows', () => {
    expect(nextStatuses('AGENT', 'OPEN')).toEqual(['IN_PROGRESS']);
    expect(nextStatuses('AGENT', 'IN_PROGRESS')).toEqual(['RESOLVED']);
    expect(nextStatuses('ADMIN', 'RESOLVED')).toEqual(['CLOSED', 'OPEN']);
    expect(nextStatuses('ADMIN', 'CLOSED')).toEqual(['OPEN']);
  });

  it('lets customers reopen, and nothing else', () => {
    expect(nextStatuses('CUSTOMER', 'OPEN')).toEqual([]);
    expect(nextStatuses('CUSTOMER', 'IN_PROGRESS')).toEqual([]);
    expect(nextStatuses('CUSTOMER', 'RESOLVED')).toEqual(['OPEN']);
    expect(nextStatuses('CUSTOMER', 'CLOSED')).toEqual(['OPEN']);
  });
});

describe('actionLabel', () => {
  it('describes each move in plain words', () => {
    expect(actionLabel('IN_PROGRESS')).toBe('Start work');
    expect(actionLabel('RESOLVED')).toBe('Mark as resolved');
    expect(actionLabel('CLOSED')).toBe('Close ticket');
    expect(actionLabel('OPEN')).toBe('Reopen ticket');
  });
});