import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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

describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminA: Session;
  let adminB: Session;
  let agentA: { id: string; email: string };
  let agentB: { id: string; email: string };

  const as = (who: Session) => `Bearer ${who.token}`;
  const get = (path: string, who: Session) =>
    request(app.getHttpServer()).get(path).set('Authorization', as(who));
  const patch = (path: string, who: Session) =>
    request(app.getHttpServer()).patch(path).set('Authorization', as(who));

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    adminA = await registerCompany(app, 'Acme Pty Ltd');
    adminB = await registerCompany(app, 'Globex Ltd');
    agentA = await createUser(app, adminA, 'AGENT', 'Maria Agent');
    agentB = await createUser(app, adminB, 'AGENT', 'Ben Agent');
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it("lists only the caller's own organisation", async () => {
    const resA = await get('/api/v1/users', adminA).expect(200);
    const emailsA = resA.body.data.map((u: { email: string }) => u.email);
    expect(emailsA).toEqual(
      expect.arrayContaining([adminA.email, agentA.email]),
    );
    expect(emailsA).not.toContain(adminB.email);
    expect(emailsA).not.toContain(agentB.email);
    expect(resA.body.total).toBe(2);

    const resB = await get('/api/v1/users', adminB).expect(200);
    const emailsB = resB.body.data.map((u: { email: string }) => u.email);
    expect(emailsB).not.toContain(adminA.email);
    expect(emailsB).not.toContain(agentA.email);
    expect(resB.body.total).toBe(2);
  });

  it('never returns password hashes', async () => {
    const res = await get('/api/v1/users', adminA).expect(200);
    for (const user of res.body.data) {
      expect(user).not.toHaveProperty('passwordHash');
      expect(user).not.toHaveProperty('password');
    }
  });

  it("treats another company's user exactly like a user that does not exist", async () => {
    const crossTenant = await patch(`/api/v1/users/${agentA.id}`, adminB)
      .send({ fullName: 'Hacked Name' })
      .expect(404);
    const missing = await patch(`/api/v1/users/${randomUUID()}`, adminB)
      .send({ fullName: 'Hacked Name' })
      .expect(404);

    // Same response, so an attacker cannot tell the ID exists.
    expect(crossTenant.body).toEqual(missing.body);

    const stored = await prisma.user.findUnique({ where: { id: agentA.id } });
    expect(stored?.fullName).toBe('Maria Agent');
  });

  it("cannot deactivate another company's user", async () => {
    await patch(`/api/v1/users/${agentA.id}/deactivate`, adminB).expect(404);

    const stored = await prisma.user.findUnique({ where: { id: agentA.id } });
    expect(stored?.isActive).toBe(true);
    const login = await loginRequest(app, agentA.email);
    expect(login.status).toBe(200);
  });

  it('ignores an organisationId smuggled into the request body', async () => {
    const email = `smuggled-${Date.now()}@e2e.test`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', as(adminB))
      .send({
        fullName: 'Smuggled User',
        email,
        password: 'CorrectHorse123',
        role: 'AGENT',
        organisationId: adminA.organisationId,
      })
      .expect(201);

    const stored = await prisma.user.findUnique({ where: { id: res.body.id } });
    expect(stored?.organisationId).toBe(adminB.organisationId);
  });

  it('rejects a token signed with a different secret', async () => {
    const forged = new JwtService({
      secret: 'a-completely-different-secret-1234567890',
    }).sign({ sub: adminA.userId, org: adminA.organisationId, role: 'ADMIN' });

    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
  });

  it('forbids non-admins from managing users', async () => {
    const login = await loginRequest(app, agentA.email).expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(403);
  });

  it('shows each admin only their own organisation on /auth/me', async () => {
    const a = await get('/api/v1/auth/me', adminA).expect(200);
    const b = await get('/api/v1/auth/me', adminB).expect(200);
    expect(a.body.organisationName).toBe('Acme Pty Ltd');
    expect(b.body.organisationName).toBe('Globex Ltd');
  });

  it('positive control: an admin can deactivate their own company user', async () => {
    const temp = await createUser(app, adminA, 'AGENT', 'Temp Agent');

    const res = await patch(
      `/api/v1/users/${temp.id}/deactivate`,
      adminA,
    ).expect(200);
    expect(res.body.isActive).toBe(false);

    const login = await loginRequest(app, temp.email);
    expect(login.status).toBe(401);
  });
});