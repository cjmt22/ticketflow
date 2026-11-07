import { request, setAccessToken } from './client';
import type { AuthResult, RegisterInput } from './types';

export async function login(email: string, password: string): Promise<AuthResult> {
  const result = await request<AuthResult>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  setAccessToken(result.accessToken);
  return result;
}

export async function registerOrganisation(
  input: RegisterInput,
): Promise<AuthResult> {
  const result = await request<AuthResult>('/auth/register-organisation', {
    method: 'POST',
    body: input,
  });
  setAccessToken(result.accessToken);
  return result;
}

export async function logout(): Promise<void> {
  try {
    await request<void>('/auth/logout', { method: 'POST' });
  } finally {
    setAccessToken(null);
  }
}