import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export const PASSWORD = 'CorrectHorse123';

export interface Session {
  token: string;
  userId: string;
  organisationId: string;
  email: string;
}

export function assertTestDatabase(): void {
  const raw = process.env.DATABASE_URL ?? '';
  const name = raw ? new URL(raw).pathname.replace(/^\//, '') : '';
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run: DATABASE_URL points at "${name}", not a *_test database`,
    );
  }
}

export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
}> {
  assertTestDatabase();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  assertTestDatabase();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "refresh_tokens", "audit_logs", "attachments", "comments", "tickets", "users", "organisations" RESTART IDENTITY CASCADE',
  );
}

let counter = 0;
export function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@e2e.test`;
}

export async function registerCompany(
  app: INestApplication,
  companyName: string,
  email: string = uniqueEmail('admin'),
): Promise<Session> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register-organisation')
    .send({
      organisationName: companyName,
      fullName: `${companyName} Admin`,
      email,
      password: PASSWORD,
    })
    .expect(201);
  return {
    token: res.body.accessToken,
    userId: res.body.user.id,
    organisationId: res.body.user.organisationId,
    email,
  };
}

export async function createUser(
  app: INestApplication,
  admin: Session,
  role: 'AGENT' | 'CUSTOMER',
  fullName: string,
): Promise<{ id: string; email: string }> {
  const email = uniqueEmail(role.toLowerCase());
  const res = await request(app.getHttpServer())
    .post('/api/v1/users')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ fullName, email, password: PASSWORD, role })
    .expect(201);
  return { id: res.body.id, email };
}

export function loginRequest(
  app: INestApplication,
  email: string,
  password: string = PASSWORD,
) {
  return request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password });
}