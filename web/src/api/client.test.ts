import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  getAccessToken,
  request,
  setAccessToken,
  setSessionExpiredHandler,
} from './client';
import { login } from './auth';

const user = {
  id: 'user-1',
  email: 'alex@acme.test',
  fullName: 'Alex Admin',
  role: 'ADMIN',
  organisationId: 'org-1',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Call = { url: string; init?: RequestInit };

function mockFetch(
  handler: (call: Call, index: number) => Response | Promise<Response>,
): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = { url: String(input), init };
      calls.push(call);
      return handler(call, calls.length - 1);
    }),
  );
  return calls;
}

const bearer = (call: Call) =>
  (call.init?.headers as Record<string, string> | undefined)?.Authorization;

describe('api client', () => {
  beforeEach(() => {
    setAccessToken(null);
    setSessionExpiredHandler(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the access token and returns the parsed JSON', async () => {
    setAccessToken('token-1');
    const calls = mockFetch(() => json(200, { hello: 'world' }));

    const result = await request<{ hello: string }>('/tickets', {
      query: { status: 'OPEN', q: undefined, page: 2 },
    });

    expect(result).toEqual({ hello: 'world' });
    expect(calls[0]?.url).toBe('/api/v1/tickets?status=OPEN&page=2');
    expect(bearer(calls[0]!)).toBe('Bearer token-1');
  });

  it('refreshes an expired token once and retries the request', async () => {
    setAccessToken('expired');
    const calls = mockFetch((call) => {
      if (call.url.endsWith('/auth/refresh')) {
        return json(200, { accessToken: 'fresh', user });
      }
      return bearer(call) === 'Bearer fresh'
        ? json(200, { ok: true })
        : json(401, { message: 'Invalid or expired access token' });
    });

    const result = await request<{ ok: boolean }>('/tickets');

    expect(result).toEqual({ ok: true });
    expect(calls.map((c) => c.url)).toEqual([
      '/api/v1/tickets',
      '/api/v1/auth/refresh',
      '/api/v1/tickets',
    ]);
    expect(getAccessToken()).toBe('fresh');
  });

  it('shares one refresh between simultaneous requests', async () => {
    setAccessToken('expired');
    const calls = mockFetch(async (call) => {
      if (call.url.endsWith('/auth/refresh')) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return json(200, { accessToken: 'fresh', user });
      }
      return bearer(call) === 'Bearer fresh'
        ? json(200, { ok: true })
        : json(401, { message: 'expired' });
    });

    await Promise.all([request('/tickets'), request('/users'), request('/auth/me')]);

    const refreshes = calls.filter((c) => c.url.endsWith('/auth/refresh'));
    expect(refreshes).toHaveLength(1);
  });

  it('signals an expired session when the refresh fails', async () => {
    setAccessToken('expired');
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    mockFetch((call) =>
      call.url.endsWith('/auth/refresh')
        ? json(401, { message: 'Invalid refresh token' })
        : json(401, { message: 'expired' }),
    );

    await expect(request('/tickets')).rejects.toMatchObject({ status: 401 });

    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it('does not try to refresh when a login is rejected', async () => {
    const calls = mockFetch(() => json(401, { message: 'Invalid email or password' }));

    const error = await login('alex@acme.test', 'wrong').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('Invalid email or password');
    expect(calls).toHaveLength(1);
  });

  it('keeps the token from a successful login', async () => {
    mockFetch(() => json(200, { accessToken: 'abc', user }));

    await login('alex@acme.test', 'CorrectHorse123');

    expect(getAccessToken()).toBe('abc');
  });

  it('returns undefined for an empty 204 response', async () => {
    mockFetch(() => new Response(null, { status: 204 }));

    await expect(request('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });
});