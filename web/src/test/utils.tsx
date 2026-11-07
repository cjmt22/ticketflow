import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { App } from '../App';
import { setAccessToken } from '../api/client';
import type { Role, Ticket } from '../api/types';
import { AuthProvider } from '../auth/AuthContext';
import { queryClient } from '../queryClient';

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function makeUser(role: Role = 'ADMIN') {
  return {
    id: 'user-1',
    email: 'alex@acme.test',
    fullName: role === 'CUSTOMER' ? 'Carl Customer' : 'Alex Admin',
    role,
    organisationId: 'org-1',
  };
}

export function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'ticket-1',
    title: 'Printer is broken',
    description: 'It will not print',
    status: 'OPEN',
    priority: 'MEDIUM',
    category: 'General',
    requesterId: 'cust-1',
    assigneeId: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-02T10:00:00.000Z',
    requester: { id: 'cust-1', fullName: 'Carl Customer' },
    assignee: null,
    ...overrides,
  };
}

export function page(tickets: Ticket[], total = tickets.length, pageNumber = 1) {
  return { data: tickets, page: pageNumber, pageSize: 10, total };
}

export interface Call {
  method: string;
  url: URL;
  body?: unknown;
}

type Handler = (call: Call) => Response | Promise<Response>;

/** Replaces fetch with fake API routes, keyed like "GET /tickets". Returns every call made. */
export function mockApi(routes: Record<string, Handler>, role: Role = 'ADMIN'): Call[] {
  const calls: Call[] = [];
  const all: Record<string, Handler> = {
    'POST /auth/refresh': () =>
      jsonResponse(200, { accessToken: 'token', user: makeUser(role) }),
    ...routes,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      const call: Call = {
        method,
        url,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);
      const key = `${method} ${url.pathname.replace('/api/v1', '')}`;
      const handler = all[key];
      return handler ? handler(call) : jsonResponse(404, { message: `No mock for ${key}` });
    }),
  );
  return calls;
}

/** Renders the whole app at a path, with a fresh query cache and a logged-in user. */
export function renderApp(path = '/tickets') {
  setAccessToken(null);
  queryClient.clear();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}