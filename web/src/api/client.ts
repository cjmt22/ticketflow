import type { AuthResult } from './types';

const BASE = '/api/v1';

// These calls must never trigger a refresh-and-retry: a 401 there is a real answer.
const NO_REFRESH_PATHS = [
  '/auth/login',
  '/auth/register-organisation',
  '/auth/refresh',
  '/auth/logout',
];

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

// The access token lives in memory only, never in localStorage, so a script injected
// into the page cannot read it. The refresh cookie is httpOnly and handled by the browser.
let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;
let refreshInFlight: Promise<AuthResult | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

/**
 * Swaps the refresh cookie for a new access token. Calls made while one is already
 * running share it: the API treats a reused refresh token as theft and ends every
 * session, so two simultaneous refreshes would log the user out.
 */
export function refreshSession(): Promise<AuthResult | null> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${BASE}/auth/refresh`, { method: 'POST' });
      if (!response.ok) {
        accessToken = null;
        return null;
      }
      const result = (await response.json()) as AuthResult;
      accessToken = result.accessToken;
      return result;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const queryString = params.toString();
  return `${BASE}${path}${queryString ? `?${queryString}` : ''}`;
}

function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  return fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const message =
    typeof body === 'object' &&
    body !== null &&
    'message' in body &&
    typeof body.message === 'string'
      ? body.message
      : `Request failed (${response.status})`;
  return new ApiError(response.status, message, body);
}

async function readBody<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await send(path, options);

  if (response.status === 401 && !NO_REFRESH_PATHS.includes(path)) {
    // The access token probably expired: get a new one and try once more.
    const session = await refreshSession().catch(() => null);
    if (!session) {
      onSessionExpired?.();
      throw await toApiError(response);
    }
    const retry = await send(path, options);
    if (!retry.ok) throw await toApiError(retry);
    return readBody<T>(retry);
  }

  if (!response.ok) throw await toApiError(response);
  return readBody<T>(response);
}