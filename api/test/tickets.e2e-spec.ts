import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createTestApp,
  createUser,
  loginRequest,
  registerCompany,
  resetDatabase,
  type Session,
} from './test-app.js';

interface Person {
  id: string;
  email: string;
  token: string;
}

describe('Tickets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminA: Session;
  let adminB: Session;
  let agentA: Person;
  let customerA1: Person;
  let customerA2: Person;
  let customerB: Person;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => `Bearer ${token}`;
  const post = (path: string, token: string) =>
    http().post(`/api/v1${path}`).set('Authorization', auth(token));
  const get = (path: string, token: string) =>
    http().get(`/api/v1${path}`).set('Authorization', auth(token));
  const patch = (path: string, token: string) =>
    http().patch(`/api/v1${path}`).set('Authorization', auth(token));

  async function person(
    admin: Session,
    role: 'AGENT' | 'CUSTOMER',
    name: string,
  ): Promise<Person> {
    const user = await createUser(app, admin, role, name);
    const login = await loginRequest(app, user.email).expect(200);
    return { ...user, token: login.body.accessToken as string };
  }

  async function newTicket(token: string, title: string) {
    const res = await post('/tickets', token)
      .send({ title, description: 'Something is not working' })
      .expect(201);
    return res.body as { id: string; status: string; priority: string };
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    adminA = await registerCompany(app, 'Acme Pty Ltd');
    adminB = await registerCompany(app, 'Globex Ltd');
    agentA = await person(adminA, 'AGENT', 'Maria Agent');
    customerA1 = await person(adminA, 'CUSTOMER', 'Carl Customer');
    customerA2 = await person(adminA, 'CUSTOMER', 'Cora Customer');
    customerB = await person(adminB, 'CUSTOMER', 'Gina Customer');
  }, 90_000);

  afterAll(async () => {
    await app.close();
  });

  it('creates a ticket owned by the caller, open and medium priority', async () => {
    const res = await post('/tickets', customerA1.token)
      .send({
        title: 'Cannot log in',
        description: 'The login page shows an error',
        organisationId: adminB.organisationId, // must be ignored
      })
      .expect(201);

    expect(res.body.status).toBe('OPEN');
    expect(res.body.priority).toBe('MEDIUM');
    expect(res.body.requester.id).toBe(customerA1.id);

    const stored = await prisma.ticket.findUnique({ where: { id: res.body.id } });
    expect(stored?.organisationId).toBe(adminA.organisationId);
  });

  it('rejects invalid input with 400', async () => {
    await post('/tickets', customerA1.token)
      .send({ title: 'ab', description: '' })
      .expect(400);
    await get('/tickets?page=0', agentA.token).expect(400);
    await get('/tickets?status=NOPE', agentA.token).expect(400);
    await get('/tickets/not-a-uuid', agentA.token).expect(400);
  });

  it('keeps each company in its own ticket list', async () => {
    const ticketA = await newTicket(customerA1.token, 'List probe A');
    const ticketB = await newTicket(customerB.token, 'List probe B');

    const listA = await get('/tickets?pageSize=100', adminA.token).expect(200);
    const idsA = listA.body.data.map((t: { id: string }) => t.id);
    expect(idsA).toContain(ticketA.id);
    expect(idsA).not.toContain(ticketB.id);

    const listB = await get('/tickets?pageSize=100', adminB.token).expect(200);
    const idsB = listB.body.data.map((t: { id: string }) => t.id);
    expect(idsB).toContain(ticketB.id);
    expect(idsB).not.toContain(ticketA.id);
  });

  it('shows customers only their own tickets, even inside the same company', async () => {
    const mine = await newTicket(customerA1.token, 'Visible to Carl only');
    const hers = await newTicket(customerA2.token, 'Visible to Cora only');

    const listA1 = await get('/tickets?pageSize=100', customerA1.token).expect(200);
    const ids = listA1.body.data.map((t: { id: string }) => t.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(hers.id);

    await get(`/tickets/${hers.id}`, customerA1.token).expect(404);
    await get(`/tickets/${hers.id}`, agentA.token).expect(200);
  });

  it("treats another company's ticket exactly like one that does not exist", async () => {
    const foreign = await newTicket(customerB.token, 'Globex secret');

    const cross = await get(`/tickets/${foreign.id}`, adminA.token).expect(404);
    const missing = await get(`/tickets/${randomUUID()}`, adminA.token).expect(404);
    expect(cross.body).toEqual(missing.body);

    await patch(`/tickets/${foreign.id}`, adminA.token)
      .send({ priority: 'URGENT' })
      .expect(404);
    await patch(`/tickets/${foreign.id}/status`, adminA.token)
      .send({ status: 'IN_PROGRESS' })
      .expect(404);
    await patch(`/tickets/${foreign.id}/assignee`, adminA.token)
      .send({ assigneeId: adminA.userId })
      .expect(404);

    const stored = await prisma.ticket.findUnique({ where: { id: foreign.id } });
    expect(stored?.status).toBe('OPEN');
    expect(stored?.priority).toBe('MEDIUM');
    expect(stored?.assigneeId).toBeNull();
  });

  it('hides AI fields from customers but shows them to agents', async () => {
    const ticket = await newTicket(customerA1.token, 'AI fields probe');
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { aiSummary: 'Secret AI summary', aiSentiment: 'Frustrated' },
    });

    const asCustomer = await get(`/tickets/${ticket.id}`, customerA1.token).expect(200);
    expect(asCustomer.body).not.toHaveProperty('aiSummary');
    expect(asCustomer.body).not.toHaveProperty('aiSentiment');

    const asAgent = await get(`/tickets/${ticket.id}`, agentA.token).expect(200);
    expect(asAgent.body.aiSummary).toBe('Secret AI summary');
  });

  it('filters, searches, sorts and paginates', async () => {
    for (const n of [1, 2, 3]) {
      await newTicket(customerA1.token, `Pagination probe ${n}`);
    }
    const urgent = await newTicket(customerA1.token, 'Filter probe urgent');
    await patch(`/tickets/${urgent.id}`, agentA.token)
      .send({ priority: 'URGENT', category: 'Network' })
      .expect(200);

    const page1 = await get(
      '/tickets?q=pagination%20probe&pageSize=2&page=1&sort=oldest',
      agentA.token,
    ).expect(200);
    const page2 = await get(
      '/tickets?q=pagination%20probe&pageSize=2&page=2&sort=oldest',
      agentA.token,
    ).expect(200);
    expect(page1.body.total).toBe(3);
    expect(page1.body.data).toHaveLength(2);
    expect(page2.body.data).toHaveLength(1);
    const titles = [...page1.body.data, ...page2.body.data].map(
      (t: { title: string }) => t.title,
    );
    expect(titles).toEqual([
      'Pagination probe 1',
      'Pagination probe 2',
      'Pagination probe 3',
    ]);

    const byPriority = await get(
      '/tickets?priority=URGENT&q=filter%20probe',
      agentA.token,
    ).expect(200);
    expect(byPriority.body.total).toBe(1);
    const noMatch = await get(
      '/tickets?priority=LOW&q=filter%20probe',
      agentA.token,
    ).expect(200);
    expect(noMatch.body.total).toBe(0);

    const byCategory = await get('/tickets?category=Network', agentA.token).expect(200);
    expect(byCategory.body.data.map((t: { id: string }) => t.id)).toContain(urgent.id);
  });

  it('moves a ticket through its status flow and writes audit logs', async () => {
    const ticket = await newTicket(customerA1.token, 'Status flow probe');

    await patch(`/tickets/${ticket.id}/status`, agentA.token)
      .send({ status: 'CLOSED' })
      .expect(400); // cannot skip steps

    for (const status of ['IN_PROGRESS', 'RESOLVED', 'CLOSED']) {
      const res = await patch(`/tickets/${ticket.id}/status`, agentA.token)
        .send({ status })
        .expect(200);
      expect(res.body.status).toBe(status);
    }

    const logs = await prisma.auditLog.findMany({
      where: { entityId: ticket.id },
    });
    expect(logs.map((l) => l.action).sort()).toEqual(
      [
        'TICKET_STATUS_CHANGED OPEN->IN_PROGRESS',
        'TICKET_STATUS_CHANGED IN_PROGRESS->RESOLVED',
        'TICKET_STATUS_CHANGED RESOLVED->CLOSED',
      ].sort(),
    );
    expect(logs.every((l) => l.actorId === agentA.id)).toBe(true);
  });

  it('lets a customer reopen their own resolved ticket but not close it', async () => {
    const ticket = await newTicket(customerA1.token, 'Reopen probe');
    await patch(`/tickets/${ticket.id}/status`, agentA.token)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    await patch(`/tickets/${ticket.id}/status`, agentA.token)
      .send({ status: 'RESOLVED' })
      .expect(200);

    await patch(`/tickets/${ticket.id}/status`, customerA1.token)
      .send({ status: 'CLOSED' })
      .expect(403);
    await patch(`/tickets/${ticket.id}/status`, customerA2.token)
      .send({ status: 'OPEN' })
      .expect(404); // someone else's ticket
    const reopened = await patch(`/tickets/${ticket.id}/status`, customerA1.token)
      .send({ status: 'OPEN' })
      .expect(200);
    expect(reopened.body.status).toBe('OPEN');
  });

  it('keeps staff-only actions away from customers', async () => {
    const ticket = await newTicket(customerA1.token, 'Staff only probe');

    await patch(`/tickets/${ticket.id}`, customerA1.token)
      .send({ priority: 'URGENT' })
      .expect(403);
    await patch(`/tickets/${ticket.id}/assignee`, customerA1.token)
      .send({ assigneeId: agentA.id })
      .expect(403);
  });

  it('assigns only to active agents or admins of the same company', async () => {
    const ticket = await newTicket(customerA1.token, 'Assign probe');

    const assigned = await patch(`/tickets/${ticket.id}/assignee`, agentA.token)
      .send({ assigneeId: agentA.id })
      .expect(200);
    expect(assigned.body.assignee.id).toBe(agentA.id);

    await patch(`/tickets/${ticket.id}/assignee`, agentA.token)
      .send({ assigneeId: customerA2.id })
      .expect(400); // customers cannot own tickets
    await patch(`/tickets/${ticket.id}/assignee`, agentA.token)
      .send({ assigneeId: adminB.userId })
      .expect(400); // other company

    const unassigned = await patch(`/tickets/${ticket.id}/assignee`, agentA.token)
      .send({ assigneeId: null })
      .expect(200);
    expect(unassigned.body.assigneeId).toBeNull();

    const logs = await prisma.auditLog.findMany({ where: { entityId: ticket.id } });
    expect(logs.map((l) => l.action).sort()).toEqual([
      'TICKET_ASSIGNED',
      'TICKET_UNASSIGNED',
    ]);
  });

  it('filters tickets by assignee', async () => {
    const ticket = await newTicket(customerA1.token, 'Assignee filter probe');
    await patch(`/tickets/${ticket.id}/assignee`, agentA.token)
      .send({ assigneeId: agentA.id })
      .expect(200);

    const res = await get(
      `/tickets?assigneeId=${agentA.id}&q=assignee%20filter%20probe`,
      agentA.token,
    ).expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].id).toBe(ticket.id);
  });
});