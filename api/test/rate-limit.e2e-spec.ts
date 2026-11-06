import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

describe('Rate limiting (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    // The limits are read when the app loads, so set them before importing it.
    process.env.AUTH_RATE_LIMIT_PER_MINUTE = '3';
    process.env.RATE_LIMIT_PER_MINUTE = '5';
    const { createTestApp } = await import('./test-app.js');
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks repeated login attempts with 429 and a Retry-After header', async () => {
    const attempt = () =>
      http()
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@e2e.test', password: 'WrongPassword1' });

    for (let i = 0; i < 3; i++) {
      await attempt().expect(401);
    }
    const blocked = await attempt().expect(429);

    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('never limits the health check', async () => {
    for (let i = 0; i < 12; i++) {
      await http().get('/api/v1/health').expect(200);
    }
  });
});