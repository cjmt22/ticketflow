import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ticket, TicketComment } from '../api/types';
import { jsonResponse, makeTicket, mockApi, page, renderApp } from '../test/utils';

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeComment(overrides: Partial<TicketComment> = {}): TicketComment {
  return {
    id: 'comment-1',
    ticketId: 'ticket-1',
    body: 'Have you tried turning it off and on again?',
    isInternal: false,
    createdAt: '2026-11-03T09:30:00.000Z',
    author: { id: 'agent-1', fullName: 'Maria Agent', role: 'AGENT' },
    ...overrides,
  };
}

const list = (comments: TicketComment[]) => jsonResponse(200, page(comments as never[]));

describe('TicketDetailPage', () => {
  it('shows the ticket, its thread, internal notes and AI suggestions to staff', async () => {
    mockApi({
      'GET /tickets/ticket-1': () =>
        jsonResponse(
          200,
          makeTicket({ aiCategory: 'Hardware', aiSentiment: 'frustrated', aiSummary: 'Printer down.' }),
        ),
      'GET /tickets/ticket-1/comments': () =>
        list([
          makeComment(),
          makeComment({ id: 'comment-2', body: 'Customer is a VIP', isInternal: true }),
        ]),
    });
    renderApp('/tickets/ticket-1');

    expect(await screen.findByRole('heading', { name: 'Printer is broken' })).toBeInTheDocument();
    expect(screen.getByText('It will not print')).toBeInTheDocument();
    expect(await screen.findByText('Have you tried turning it off and on again?')).toBeInTheDocument();
    expect(screen.getByText('Customer is a VIP')).toBeInTheDocument();
    expect(screen.getByText('Internal note')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI suggestions' })).toBeInTheDocument();
    expect(screen.getByText('Hardware')).toBeInTheDocument();
    expect(screen.getByLabelText(/Internal note/)).toBeInTheDocument();
  });

  it('gives customers a plain view: no internal notes, no AI, no staff controls', async () => {
    mockApi(
      {
        'GET /tickets/ticket-1': () => jsonResponse(200, makeTicket()),
        'GET /tickets/ticket-1/comments': () => list([makeComment()]),
      },
      'CUSTOMER',
    );
    renderApp('/tickets/ticket-1');

    expect(await screen.findByText('Have you tried turning it off and on again?')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Internal note/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'AI suggestions' })).not.toBeInTheDocument();
    expect(screen.queryByText('Assign to me')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Priority')).not.toBeInTheDocument();
    // An open ticket has nothing a customer may do to its status.
    expect(screen.queryByRole('button', { name: 'Start work' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reopen ticket' })).not.toBeInTheDocument();
  });

  it('moves a ticket to the next status and shows the new status', async () => {
    let ticket: Ticket = makeTicket();
    const calls = mockApi({
      'GET /tickets/ticket-1': () => jsonResponse(200, ticket),
      'GET /tickets/ticket-1/comments': () => list([]),
      'PATCH /tickets/ticket-1/status': (call) => {
        ticket = { ...ticket, status: (call.body as { status: Ticket['status'] }).status };
        return jsonResponse(200, ticket);
      },
    });
    const user = userEvent.setup();
    renderApp('/tickets/ticket-1');

    await user.click(await screen.findByRole('button', { name: 'Start work' }));

    expect(await screen.findByText('In progress')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark as resolved' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start work' })).not.toBeInTheDocument();
    const patch = calls.find((call) => call.method === 'PATCH');
    expect(patch?.body).toEqual({ status: 'IN_PROGRESS' });
  });

  it('lets a customer reopen a resolved ticket', async () => {
    let ticket: Ticket = makeTicket({ status: 'RESOLVED' });
    const calls = mockApi(
      {
        'GET /tickets/ticket-1': () => jsonResponse(200, ticket),
        'GET /tickets/ticket-1/comments': () => list([]),
        'PATCH /tickets/ticket-1/status': () => {
          ticket = { ...ticket, status: 'OPEN' };
          return jsonResponse(200, ticket);
        },
      },
      'CUSTOMER',
    );
    const user = userEvent.setup();
    renderApp('/tickets/ticket-1');

    await user.click(await screen.findByRole('button', { name: 'Reopen ticket' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reopen ticket' })).toBeNull());
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ status: 'OPEN' });
  });

  it('shows the API’s message when a status change is refused', async () => {
    mockApi({
      'GET /tickets/ticket-1': () => jsonResponse(200, makeTicket()),
      'GET /tickets/ticket-1/comments': () => list([]),
      'PATCH /tickets/ticket-1/status': () =>
        jsonResponse(409, {
          message: 'This ticket was just changed by someone else. Refresh and try again.',
        }),
    });
    const user = userEvent.setup();
    renderApp('/tickets/ticket-1');

    await user.click(await screen.findByRole('button', { name: 'Start work' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('just changed by someone else');
  });

  it('posts an internal note, clears the form and shows the note', async () => {
    const comments: TicketComment[] = [];
    const calls = mockApi({
      'GET /tickets/ticket-1': () => jsonResponse(200, makeTicket()),
      'GET /tickets/ticket-1/comments': () => list(comments),
      'POST /tickets/ticket-1/comments': (call) => {
        const input = call.body as { body: string; isInternal: boolean };
        const created = makeComment({ id: 'new-1', ...input });
        comments.push(created);
        return jsonResponse(201, created);
      },
    });
    const user = userEvent.setup();
    renderApp('/tickets/ticket-1');

    await screen.findByText('No comments yet.');
    const box = screen.getByLabelText('Add a comment');
    await user.type(box, 'Checked the logs');
    await user.click(screen.getByLabelText(/Internal note/));
    await user.click(screen.getByRole('button', { name: 'Add internal note' }));

    expect(await screen.findByText('Checked the logs')).toBeInTheDocument();
    expect(box).toHaveValue('');
    const post = calls.find((call) => call.method === 'POST' && call.url.pathname.endsWith('/comments'));
    expect(post?.body).toEqual({ body: 'Checked the logs', isInternal: true });
  });

  it('does not post an empty comment', async () => {
    const calls = mockApi({
      'GET /tickets/ticket-1': () => jsonResponse(200, makeTicket()),
      'GET /tickets/ticket-1/comments': () => list([]),
    });
    const user = userEvent.setup();
    renderApp('/tickets/ticket-1');

    await screen.findByText('No comments yet.');
    await user.type(screen.getByLabelText('Add a comment'), '   ');
    expect(screen.getByRole('button', { name: 'Add comment' })).toBeDisabled();
    expect(calls.some((call) => call.url.pathname.endsWith('/comments') && call.method === 'POST')).toBe(false);
  });

  it('replaces the comment form with a message on a closed ticket', async () => {
    mockApi({
      'GET /tickets/ticket-1': () => jsonResponse(200, makeTicket({ status: 'CLOSED' })),
      'GET /tickets/ticket-1/comments': () => list([]),
    });
    renderApp('/tickets/ticket-1');

    expect(await screen.findByText(/This ticket is closed/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Add a comment')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reopen ticket' })).toBeInTheDocument();
  });

  it('assigns the ticket to the signed-in agent, and unassigns it again', async () => {
    let ticket: Ticket = makeTicket();
    const calls = mockApi({
      'GET /tickets/ticket-1': () => jsonResponse(200, ticket),
      'GET /tickets/ticket-1/comments': () => list([]),
      'PATCH /tickets/ticket-1/assignee': (call) => {
        const { assigneeId } = call.body as { assigneeId: string | null };
        ticket = {
          ...ticket,
          assigneeId,
          assignee: assigneeId ? { id: assigneeId, fullName: 'Alex Admin' } : null,
        };
        return jsonResponse(200, ticket);
      },
    });
    const user = userEvent.setup();
    renderApp('/tickets/ticket-1');

    await user.click(await screen.findByRole('button', { name: 'Assign to me' }));
    expect(await screen.findByRole('button', { name: 'Unassign' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign to me' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Unassign' }));
    expect(await screen.findByRole('button', { name: 'Assign to me' })).toBeInTheDocument();

    const bodies = calls.filter((call) => call.method === 'PATCH').map((call) => call.body);
    expect(bodies).toEqual([{ assigneeId: 'user-1' }, { assigneeId: null }]);
  });

  it('lets staff override the priority and the category', async () => {
    let ticket: Ticket = makeTicket();
    const calls = mockApi({
      'GET /tickets/ticket-1': () => jsonResponse(200, ticket),
      'GET /tickets/ticket-1/comments': () => list([]),
      'PATCH /tickets/ticket-1': (call) => {
        ticket = { ...ticket, ...(call.body as Partial<Ticket>) };
        return jsonResponse(200, ticket);
      },
    });
    const user = userEvent.setup();
    renderApp('/tickets/ticket-1');

    await user.selectOptions(await screen.findByLabelText('Priority'), 'HIGH');
    await waitFor(() => expect(screen.getByLabelText('Priority')).toHaveValue('HIGH'));

    const category = screen.getByLabelText('Category');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await user.clear(category);
    await user.type(category, 'Hardware');
    await user.click(save);

    await waitFor(() => expect(screen.getByLabelText('Category')).toHaveValue('Hardware'));
    const bodies = calls.filter((call) => call.method === 'PATCH').map((call) => call.body);
    expect(bodies).toEqual([{ priority: 'HIGH' }, { category: 'Hardware' }]);
    const sidebar = screen.getByText('Requester').closest('dl')!;
    expect(within(sidebar).getByText('Hardware')).toBeInTheDocument();
  });

  it('shows a friendly page when the ticket does not exist', async () => {
    mockApi({
      'GET /tickets/missing': () => jsonResponse(404, { message: 'Ticket not found' }),
    });
    renderApp('/tickets/missing');

    expect(await screen.findByRole('heading', { name: 'Ticket not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to tickets/ })).toHaveAttribute('href', '/tickets');
  });

  it('links each row of the list to its detail page', async () => {
    mockApi({
      'GET /tickets': () => jsonResponse(200, page([makeTicket()])),
      'GET /tickets/ticket-1': () => jsonResponse(200, makeTicket()),
      'GET /tickets/ticket-1/comments': () => list([]),
    });
    const user = userEvent.setup();
    renderApp('/tickets');

    await user.click(await screen.findByRole('link', { name: 'Printer is broken' }));

    expect(await screen.findByRole('heading', { name: 'Printer is broken' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to tickets/ })).toBeInTheDocument();
  });
});