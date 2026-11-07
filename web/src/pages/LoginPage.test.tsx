import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../api/client';
import { AuthProvider } from '../auth/AuthContext';
import { LoginPage } from './LoginPage';

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

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/tickets" element={<p>Ticket list page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    setAccessToken(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the API error when the password is wrong', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('/auth/refresh')
          ? json(401, { message: 'Invalid refresh token' })
          : json(401, { message: 'Invalid email or password' }),
      ),
    );
    renderLogin();

    await userEvent.type(await screen.findByLabelText('Email'), 'alex@acme.test');
    await userEvent.type(screen.getByLabelText('Password'), 'WrongPassword1');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid email or password',
    );
  });

  it('goes to the ticket list after a successful login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('/auth/refresh')
          ? json(401, { message: 'Invalid refresh token' })
          : json(200, { accessToken: 'abc', user }),
      ),
    );
    renderLogin();

    await userEvent.type(await screen.findByLabelText('Email'), 'alex@acme.test');
    await userEvent.type(screen.getByLabelText('Password'), 'CorrectHorse123');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() =>
      expect(screen.getByText('Ticket list page')).toBeInTheDocument(),
    );
  });

  it('shows a friendly message when too many attempts were made', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('/auth/refresh')
          ? json(401, { message: 'Invalid refresh token' })
          : json(429, { message: 'ThrottlerException: Too Many Requests' }),
      ),
    );
    renderLogin();

    await userEvent.type(await screen.findByLabelText('Email'), 'alex@acme.test');
    await userEvent.type(screen.getByLabelText('Password'), 'WrongPassword1');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
  });
});