import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../api/client';
import { queryClient } from '../queryClient';
import { jsonResponse, mockApi } from '../test/utils';
import { AuthProvider, useAuth } from './AuthContext';

afterEach(() => {
  vi.unstubAllGlobals();
});

function Probe() {
  const { state, logout } = useAuth();
  return (
    <div>
      <p>status: {state.status}</p>
      <button type="button" onClick={() => void logout()}>
        Log out
      </button>
    </div>
  );
}

describe('AuthProvider', () => {
  it('restores the session from the refresh cookie', async () => {
    setAccessToken(null);
    mockApi({});

    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('status: authenticated')).toBeInTheDocument();
  });

  it('forgets cached server data on logout, so the next person never sees it', async () => {
    setAccessToken(null);
    mockApi({ 'POST /auth/logout': () => new Response(null, { status: 204 }) });
    queryClient.setQueryData(['tickets', 'someone-elses'], { secret: true });

    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>,
    );
    await screen.findByText('status: authenticated');
    expect(queryClient.getQueryData(['tickets', 'someone-elses'])).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(screen.getByText('status: anonymous')).toBeInTheDocument());
    expect(queryClient.getQueryData(['tickets', 'someone-elses'])).toBeUndefined();
  });

  it('starts anonymous when there is no valid refresh cookie', async () => {
    setAccessToken(null);
    mockApi({ 'POST /auth/refresh': () => jsonResponse(401, { message: 'Missing refresh token' }) });

    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('status: anonymous')).toBeInTheDocument();
  });
});