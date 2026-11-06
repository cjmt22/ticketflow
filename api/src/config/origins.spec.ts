import { parseOrigins } from './origins.js';

describe('parseOrigins', () => {
  it('splits a comma-separated list and trims spaces', () => {
    expect(parseOrigins('http://a.com, http://b.com')).toEqual([
      'http://a.com',
      'http://b.com',
    ]);
  });

  it('removes trailing slashes, because browsers send origins without them', () => {
    expect(parseOrigins('http://a.com/')).toEqual(['http://a.com']);
  });

  it('ignores empty entries', () => {
    expect(parseOrigins('http://a.com,, ,')).toEqual(['http://a.com']);
    expect(parseOrigins('')).toEqual([]);
  });
});