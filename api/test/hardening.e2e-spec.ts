import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-app.js';

const ALLOWED = 'http://localhost:5173';
const EVIL = 'https://evil.example';

describe('Hardening (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('sends security headers and hides the framework', async () => {
    const res = await http().get('/api/v1/health').expect(200);

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('answers a preflight request from the allowed origin', async () => {
    const res = await http()
      .options('/api/v1/auth/login')
      .set('Origin', ALLOWED)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')
      .expect(204);

    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not allow other origins on a preflight request', async () => {
    const res = await http()
      .options('/api/v1/auth/login')
      .set('Origin', EVIL)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('only adds CORS headers to real requests from the allowed origin', async () => {
    const ok = await http().get('/api/v1/health').set('Origin', ALLOWED).expect(200);
    expect(ok.headers['access-control-allow-origin']).toBe(ALLOWED);

    const bad = await http().get('/api/v1/health').set('Origin', EVIL).expect(200);
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});