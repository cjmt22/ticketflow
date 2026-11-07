import { describe, expect, it } from 'vitest';
import { hasActiveFilters, parseFilters, toSearchParams } from './params';

const parse = (query: string) => parseFilters(new URLSearchParams(query));

describe('parseFilters', () => {
  it('uses sensible defaults for an empty address', () => {
    expect(parse('')).toEqual({
      q: '',
      status: '',
      priority: '',
      sort: 'newest',
      page: 1,
    });
  });

  it('reads valid values', () => {
    expect(parse('q=printer&status=OPEN&priority=URGENT&sort=oldest&page=3')).toEqual({
      q: 'printer',
      status: 'OPEN',
      priority: 'URGENT',
      sort: 'oldest',
      page: 3,
    });
  });

  it('ignores invalid values instead of sending them to the API', () => {
    expect(parse('status=NOPE&priority=low&sort=random&page=-2')).toEqual({
      q: '',
      status: '',
      priority: '',
      sort: 'newest',
      page: 1,
    });
    expect(parse('page=abc').page).toBe(1);
    expect(parse('page=0').page).toBe(1);
  });

  it('trims the search text and limits its length', () => {
    expect(parse('q=%20%20printer%20%20').q).toBe('printer');
    expect(parse(`q=${'x'.repeat(200)}`).q).toHaveLength(100);
  });
});

describe('toSearchParams', () => {
  it('leaves out defaults so the address stays clean', () => {
    const params = toSearchParams({ q: '', status: '', priority: '', sort: 'newest', page: 1 });

    expect(params.toString()).toBe('');
  });

  it('includes everything that was chosen', () => {
    const params = toSearchParams({
      q: ' vpn ',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      sort: 'updated',
      page: 2,
    });

    expect(Object.fromEntries(params)).toEqual({
      q: 'vpn',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      sort: 'updated',
      page: '2',
    });
  });

  it('round-trips with parseFilters', () => {
    const filters = parse('q=vpn&status=RESOLVED&sort=oldest&page=4');

    expect(parseFilters(toSearchParams(filters))).toEqual(filters);
  });
});

describe('hasActiveFilters', () => {
  it('is true only when something filters the list', () => {
    expect(hasActiveFilters(parse(''))).toBe(false);
    expect(hasActiveFilters(parse('sort=oldest&page=2'))).toBe(false);
    expect(hasActiveFilters(parse('status=OPEN'))).toBe(true);
    expect(hasActiveFilters(parse('q=x'))).toBe(true);
  });
});