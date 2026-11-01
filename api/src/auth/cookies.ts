import type { CookieOptions } from 'express';
import { REFRESH_COOKIE_PATH, REFRESH_TOKEN_TTL_MS } from './auth.constants.js';

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
  };
}

export function refreshCookieOptions(): CookieOptions {
  return { ...baseOptions(), maxAge: REFRESH_TOKEN_TTL_MS };
}

export function clearRefreshCookieOptions(): CookieOptions {
  return baseOptions();
}

export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}