import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  loginRequest,
  registerCompany,
  resetDatabase,
  uniqueEmail,
} from './test-app.js';

function refreshSetCookie(res: { headers: Record<string, unknown> }): string {
  const header = res.headers['set-cookie'];
  const cookies = (Array.isArray(header) ? header : [header]).filter(
    (c): c is string => typeof c === 'string',
  );
  const cookie = cookies.find((c) => c.startsWith('refresh_token='));
  if (!cookie) {
    throw new Error('No refresh_token cookie in the response');
  }
  return cookie;
}

// "refresh_token=abc; Path=...; HttpOnly" -> "refresh_token=abc"
const cookiePair = (setCookie: string) => setCookie.split(';')[0] ?? '';

describe('Auth flow (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const created = await createTestApp();
    app = created.app;
    await resetDatabase(created.prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('login sets an httpOnly refresh cookie and keeps the token out of the body', async () => {
    const admin = await registerCompany(app, 'Flow Co');

    const res = await loginRequest(app, admin.email).expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body).not.toHaveProperty('refreshToken');
    const setCookie = refreshSetCookie(res);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Path=/api/v1/auth');
  });

  it('refresh rotates the cookie and returns a new access token', async () => {
    const admin = await registerCompany(app, 'Rotate Co');
    const login = await loginRequest(app, admin.email).expect(200);
    const first = cookiePair(refreshSetCookie(login));

    const res = await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', first)
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(cookiePair(refreshSetCookie(res))).not.toBe(first);
  });

  it('treats reuse of an old refresh token as theft and revokes every session', async () => {
    const admin = await registerCompany(app, 'Reuse Co');
    const login = await loginRequest(app, admin.email).expect(200);
    const first = cookiePair(refreshSetCookie(login));

    const rotated = await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', first)
      .expect(200);
    const second = cookiePair(refreshSetCookie(rotated));

    await http().post('/api/v1/auth/refresh').set('Cookie', first).expect(401);
    // The legitimate new token is revoked too.
    await http().post('/api/v1/auth/refresh').set('Cookie', second).expect(401);
  });

  it('logout revokes the refresh token', async () => {
    const admin = await registerCompany(app, 'Logout Co');
    const login = await loginRequest(app, admin.email).expect(200);
    const cookie = cookiePair(refreshSetCookie(login));

    await http().post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);
    await http().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('refresh without a cookie is rejected', async () => {
    await http().post('/api/v1/auth/refresh').expect(401);
  });

  it('rejects a wrong password and an unknown email the same way', async () => {
    const admin = await registerCompany(app, 'Wrong Co');

    const wrong = await loginRequest(app, admin.email, 'WrongPassword1');
    const unknown = await loginRequest(app, uniqueEmail('nobody'));

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('rejects registering the same email twice', async () => {
    const admin = await registerCompany(app, 'Dupe Co');

    await http()
      .post('/api/v1/auth/register-organisation')
      .send({
        organisationName: 'Dupe Co 2',
        fullName: 'Someone Else',
        email: admin.email,
        password: 'CorrectHorse123',
      })
      .expect(409);
  });
});