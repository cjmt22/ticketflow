import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, makeTicket, mockApi, page, renderApp } from '../test/utils';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TicketsPage', () => {
  it('lists tickets with requester and assignee for staff', async () => {
    const calls = mockApi({
      'GET /tickets': () =>
        jsonResponse(
          200,
          page([
            makeTicket({
              title: 'Printer is broken',
              assignee: { id: 'agent-1', fullName: 'Maria Agent' },
            }),
            makeTicket({ id: 'ticket-2', title: 'VPN will not connect', status: 'RESOLVED' }),
          ]),
        ),
    });
    renderApp('/tickets');

    expect(await screen.findByText('Printer is broken')).toBeInTheDocument();
    expect(screen.getByText('VPN will not connect')).toBeInTheDocument();
    expect(screen.getByText('Maria Agent')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Requester' })).toBeInTheDocument();

    const list = calls.find((call) => call.url.pathname.endsWith('/tickets'));
    expect(Object.fromEntries(list!.url.searchParams)).toEqual({
      page: '1',
      pageSize: '10',
      sort: 'newest',
    });
  });

  it('hides the requester and assignee columns from customers', async () => {
    mockApi({ 'GET /tickets': () => jsonResponse(200, page([makeTicket()])) }, 'CUSTOMER');
    renderApp('/tickets');

    expect(await screen.findByText('Printer is broken')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Requester' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Assignee' })).not.toBeInTheDocument();
  });

  it('shows a friendly message when there are no tickets', async () => {
    mockApi({ 'GET /tickets': () => jsonResponse(200, page([])) });
    renderApp('/tickets');

    expect(await screen.findByText(/No tickets yet/)).toBeInTheDocument();
  });

  it('asks the API for the chosen status', async () => {
    const calls = mockApi({ 'GET /tickets': () => jsonResponse(200, page([makeTicket()])) });
    renderApp('/tickets');
    await screen.findByText('Printer is broken');

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'OPEN');

    await waitFor(() =>
      expect(calls.some((call) => call.url.searchParams.get('status') === 'OPEN')).toBe(true),
    );
  });

  it('searches after a short pause while typing', async () => {
    const calls = mockApi({ 'GET /tickets': () => jsonResponse(200, page([makeTicket()])) });
    renderApp('/tickets');
    await screen.findByText('Printer is broken');

    await userEvent.type(screen.getByLabelText('Search'), 'printer');

    await waitFor(
      () => expect(calls.some((call) => call.url.searchParams.get('q') === 'printer')).toBe(true),
      { timeout: 3000 },
    );
    // Typing must not send one request per letter.
    const searches = calls.filter((call) => call.url.searchParams.has('q'));
    expect(searches.length).toBeLessThanOrEqual(2);
  });

  it('starts from the filters in the address', async () => {
    const calls = mockApi({ 'GET /tickets': () => jsonResponse(200, page([makeTicket()], 25, 2)) });
    renderApp('/tickets?status=RESOLVED&priority=HIGH&sort=oldest&page=2');

    await screen.findByText('Printer is broken');

    const list = calls.find((call) => call.url.pathname.endsWith('/tickets'));
    expect(Object.fromEntries(list!.url.searchParams)).toMatchObject({
      status: 'RESOLVED',
      priority: 'HIGH',
      sort: 'oldest',
      page: '2',
    });
    expect(screen.getByLabelText('Status')).toHaveValue('RESOLVED');
  });

  it('moves between pages', async () => {
    const calls = mockApi({
      'GET /tickets': ({ url }) =>
        jsonResponse(
          200,
          page(
            [makeTicket({ title: `Ticket on page ${url.searchParams.get('page')}` })],
            25,
            Number(url.searchParams.get('page')),
          ),
        ),
    });
    renderApp('/tickets');

    expect(await screen.findByText('Ticket on page 1')).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Ticket on page 2')).toBeInTheDocument();
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument();
    expect(calls.some((call) => call.url.searchParams.get('page') === '2')).toBe(true);
  });

  it('clears the filters', async () => {
    mockApi({ 'GET /tickets': () => jsonResponse(200, page([makeTicket()])) });
    renderApp('/tickets?status=OPEN');
    await screen.findByText('Printer is broken');

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    await waitFor(() => expect(screen.getByLabelText('Status')).toHaveValue(''));
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('shows an error with a retry button, and recovers', async () => {
    let failing = true;
    mockApi({
      'GET /tickets': () =>
        failing
          ? jsonResponse(500, { message: 'Internal server error' })
          : jsonResponse(200, page([makeTicket()])),
    });
    renderApp('/tickets');

    expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error');

    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Printer is broken')).toBeInTheDocument();
    expect(within(document.body).queryByRole('alert')).not.toBeInTheDocument();
  });
});