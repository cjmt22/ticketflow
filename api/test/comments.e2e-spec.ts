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

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Comments (e2e)', () => {
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

  const comment = (
    ticketId: string,
    token: string,
    body: Record<string, unknown>,
  ) => post(`/tickets/${ticketId}/comments`, token).send(body);

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
    return res.body as { id: string };
  }

  async function setStatus(ticketId: string, token: string, status: string) {
    await patch(`/tickets/${ticketId}/status`, token).send({ status }).expect(200);
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

  it('lets a customer comment on their own ticket', async () => {
    const ticket = await newTicket(customerA1.token, 'Comment probe');

    const res = await comment(ticket.id, customerA1.token, {
      body: 'It happens every morning',
    }).expect(201);

    expect(res.body.body).toBe('It happens every morning');
    expect(res.body.isInternal).toBe(false);
    expect(res.body.author).toEqual({
      id: customerA1.id,
      fullName: 'Carl Customer',
      role: 'CUSTOMER',
    });
  });

  it('keeps internal notes away from customers', async () => {
    const ticket = await newTicket(customerA1.token, 'Internal note probe');
    await comment(ticket.id, customerA1.token, { body: 'Customer message' }).expect(201);
    await comment(ticket.id, agentA.token, { body: 'Public reply' }).expect(201);
    await comment(ticket.id, agentA.token, {
      body: 'Internal: check the server logs',
      isInternal: true,
    }).expect(201);

    const asAgent = await get(`/tickets/${ticket.id}/comments`, agentA.token).expect(200);
    expect(asAgent.body.total).toBe(3);
    expect(asAgent.body.data.map((c: { body: string }) => c.body)).toContain(
      'Internal: check the server logs',
    );

    const asCustomer = await get(
      `/tickets/${ticket.id}/comments`,
      customerA1.token,
    ).expect(200);
    expect(asCustomer.body.total).toBe(2);
    expect(asCustomer.body.data.every((c: { isInternal: boolean }) => !c.isInternal)).toBe(
      true,
    );
    expect(JSON.stringify(asCustomer.body)).not.toContain('server logs');
  });

  it('stops customers posting internal notes', async () => {
    const ticket = await newTicket(customerA1.token, 'Sneaky probe');

    await comment(ticket.id, customerA1.token, {
      body: 'Hidden from the agents?',
      isInternal: true,
    }).expect(403);

    const internalCount = await prisma.comment.count({
      where: { ticketId: ticket.id, isInternal: true },
    });
    expect(internalCount).toBe(0);
  });

  it("hides one customer's thread from another customer in the same company", async () => {
    const ticket = await newTicket(customerA1.token, 'Private thread');

    await get(`/tickets/${ticket.id}/comments`, customerA2.token).expect(404);
    await comment(ticket.id, customerA2.token, { body: 'Hello?' }).expect(404);
    await get(`/tickets/${ticket.id}/comments`, agentA.token).expect(200);
  });

  it("treats another company's ticket exactly like one that does not exist", async () => {
    const foreign = await newTicket(customerB.token, 'Globex thread');
    await comment(foreign.id, customerB.token, { body: 'Globex only' }).expect(201);

    const cross = await get(`/tickets/${foreign.id}/comments`, adminA.token).expect(404);
    const missing = await get(
      `/tickets/${randomUUID()}/comments`,
      adminA.token,
    ).expect(404);
    expect(cross.body).toEqual(missing.body);

    await comment(foreign.id, adminA.token, { body: 'Intruder' }).expect(404);

    const stored = await prisma.comment.findMany({ where: { ticketId: foreign.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.body).toBe('Globex only');
  });

  it('ignores an author or ticket id sent in the body', async () => {
    const ticket = await newTicket(customerA1.token, 'Spoof probe');
    const other = await newTicket(customerA1.token, 'Other ticket');

    const res = await comment(ticket.id, customerA1.token, {
      body: 'Not who I say I am',
      authorId: adminA.userId,
      ticketId: other.id,
    }).expect(201);

    const stored = await prisma.comment.findUnique({ where: { id: res.body.id } });
    expect(stored?.authorId).toBe(customerA1.id);
    expect(stored?.ticketId).toBe(ticket.id);
  });

  it('rejects comments on a closed ticket until it is reopened', async () => {
    const ticket = await newTicket(customerA1.token, 'Closed probe');
    for (const status of ['IN_PROGRESS', 'RESOLVED', 'CLOSED']) {
      await setStatus(ticket.id, agentA.token, status);
    }

    await comment(ticket.id, customerA1.token, { body: 'One more thing' }).expect(400);
    await comment(ticket.id, agentA.token, { body: 'Staff too' }).expect(400);

    await setStatus(ticket.id, customerA1.token, 'OPEN');
    await comment(ticket.id, customerA1.token, { body: 'One more thing' }).expect(201);
  });

  it('counts a comment as activity on the ticket', async () => {
    const ticket = await newTicket(customerA1.token, 'Activity probe');
    const before = await get(`/tickets/${ticket.id}`, agentA.token).expect(200);

    await pause(25);
    await comment(ticket.id, agentA.token, { body: 'Looking into it' }).expect(201);

    const after = await get(`/tickets/${ticket.id}`, agentA.token).expect(200);
    expect(new Date(after.body.updatedAt).getTime()).toBeGreaterThan(
      new Date(before.body.updatedAt).getTime(),
    );
  });

  it('rejects invalid input with 400', async () => {
    const ticket = await newTicket(customerA1.token, 'Validation probe');

    await comment(ticket.id, customerA1.token, { body: '' }).expect(400);
    await comment(ticket.id, customerA1.token, { body: '   ' }).expect(400);
    await comment(ticket.id, customerA1.token, { body: 'x'.repeat(5001) }).expect(400);
    await comment(ticket.id, agentA.token, {
      body: 'Fine text',
      isInternal: 'yes',
    }).expect(400);
    await get('/tickets/not-a-uuid/comments', agentA.token).expect(400);
    await get(`/tickets/${ticket.id}/comments?page=0`, agentA.token).expect(400);
  });

  it('lists comments oldest first and paginates', async () => {
    const ticket = await newTicket(customerA1.token, 'Pagination probe');
    for (const body of ['First', 'Second', 'Third']) {
      await comment(ticket.id, agentA.token, { body }).expect(201);
      await pause(5);
    }

    const page1 = await get(
      `/tickets/${ticket.id}/comments?pageSize=2&page=1`,
      agentA.token,
    ).expect(200);
    const page2 = await get(
      `/tickets/${ticket.id}/comments?pageSize=2&page=2`,
      agentA.token,
    ).expect(200);

    expect(page1.body.total).toBe(3);
    expect(page1.body.data.map((c: { body: string }) => c.body)).toEqual([
      'First',
      'Second',
    ]);
    expect(page2.body.data.map((c: { body: string }) => c.body)).toEqual(['Third']);
  });
});