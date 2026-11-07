import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { OPERATIONS } from '../src/docs/operations.js';
import { findUndocumentedOperations } from '../src/docs/zod-openapi.js';
import { createTestApp } from './test-app.js';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

describe('API docs (e2e)', () => {
  let app: INestApplication;
  let doc: OpenAPIObject;
  const paths = () => doc.paths as unknown as Record<string, Record<string, any>>;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    doc = res.body as OpenAPIObject;
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the OpenAPI document', () => {
    expect(doc.info.title).toBe('TicketFlow API');
    expect(Object.keys(doc.paths).length).toBeGreaterThan(10);
  });

  it('documents every route, and has no entries for routes that no longer exist', () => {
    expect(findUndocumentedOperations(doc, OPERATIONS)).toEqual([]);

    const actual = new Set<string>();
    for (const [path, item] of Object.entries(paths())) {
      for (const method of Object.keys(item)) {
        if (METHODS.includes(method)) actual.add(`${method.toUpperCase()} ${path}`);
      }
    }
    const stale = Object.keys(OPERATIONS).filter((key) => !actual.has(key));
    expect(stale).toEqual([]);
  });

  it('builds request bodies from the validation schemas', () => {
    const schema =
      paths()['/api/v1/auth/login']?.post.requestBody.content['application/json']
        .schema;

    expect(schema.required).toEqual(['email', 'password']);
    expect(schema.properties.password).toMatchObject({ type: 'string', maxLength: 72 });
  });

  it('describes query parameters, including filters and sort', () => {
    const params = paths()['/api/v1/tickets']?.get.parameters as Array<{
      name: string;
      in: string;
      schema: { enum?: string[] };
    }>;
    const names = params.map((p) => p.name);

    expect(names).toEqual(
      expect.arrayContaining(['status', 'priority', 'assigneeId', 'q', 'sort', 'page']),
    );
    expect(params.every((p) => p.in === 'query')).toBe(true);
    expect(params.find((p) => p.name === 'status')?.schema.enum).toContain('IN_PROGRESS');
  });

  it('marks public routes as open and the rest as needing a bearer token', () => {
    expect(paths()['/api/v1/auth/login']?.post.security).toEqual([]);
    expect(paths()['/api/v1/health']?.get.security).toEqual([]);
    expect(paths()['/api/v1/tickets']?.get.security).toEqual([{ bearer: [] }]);
    expect(paths()['/api/v1/users']?.get.security).toEqual([{ bearer: [] }]);
  });

  it('serves the docs page with a policy that lets it load, while the API keeps the strict one', async () => {
    const page = await request(app.getHttpServer()).get('/api/docs').expect(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.headers['content-security-policy']).not.toContain(
      'upgrade-insecure-requests',
    );

    const api = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(api.headers['content-security-policy']).toContain(
      'upgrade-insecure-requests',
    );
  });
});