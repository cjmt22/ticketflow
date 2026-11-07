import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, makeTicket, mockApi, page, renderApp } from '../test/utils';

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fillAndSubmit() {
  await userEvent.type(await screen.findByLabelText('Title'), 'Cannot log in');
  await userEvent.type(screen.getByLabelText('Description'), 'The login page shows an error');
  await userEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
}

describe('NewTicketPage', () => {
  it('creates the ticket and returns to the list', async () => {
    const created = makeTicket({ id: 'ticket-9', title: 'Cannot log in' });
    const calls = mockApi({
      'POST /tickets': () => jsonResponse(201, created),
      'GET /tickets': () => jsonResponse(200, page([created])),
    });
    renderApp('/tickets/new');

    await fillAndSubmit();

    expect(await screen.findByRole('heading', { name: 'Tickets' })).toBeInTheDocument();
    expect(await screen.findByText('Cannot log in')).toBeInTheDocument();
    const post = calls.find((call) => call.method === 'POST' && call.url.pathname.endsWith('/tickets'));
    expect(post?.body).toEqual({
      title: 'Cannot log in',
      description: 'The login page shows an error',
    });
  });

  it('shows the validation messages from the API and stays on the form', async () => {
    mockApi({
      'POST /tickets': () =>
        jsonResponse(400, {
          message: 'Validation failed',
          errors: [{ path: 'description', message: 'Too small: expected at least 5 characters' }],
        }),
    });
    renderApp('/tickets/new');

    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent('description: Too small');
    expect(screen.getByRole('heading', { name: 'New ticket' })).toBeInTheDocument();
  });
});