import type { OpenAPIObject } from '@nestjs/swagger';
import { z } from 'zod';
import {
  enrichDocument,
  findUndocumentedOperations,
  type OperationDoc,
} from './zod-openapi.js';

function makeDocument(): OpenAPIObject {
  return {
    openapi: '3.0.0',
    info: { title: 'Test', version: '1' },
    paths: {
      '/items': {
        get: { responses: { '200': { description: '' } } },
        post: { responses: { '201': { description: '' } } },
      },
      '/items/{id}': {
        get: {
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: '' } },
        },
      },
    },
  };
}

const registry: Record<string, OperationDoc> = {
  'GET /items': {
    tag: 'Items',
    summary: 'List items',
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
      status: z.enum(['OPEN', 'CLOSED']),
    }),
    errors: [400, 401],
  },
  'POST /items': {
    tag: 'Items',
    summary: 'Create an item',
    public: true,
    body: z.object({ name: z.string().min(2), note: z.string().optional() }),
    errors: [400],
  },
  'GET /items/{id}': {
    tag: 'Items',
    summary: 'Get an item',
    query: z.object({ expand: z.string().optional() }),
    errors: [404],
  },
};

type Doc = Record<string, Record<string, Record<string, unknown>>>;
const paths = (document: OpenAPIObject) => document.paths as unknown as Doc;

describe('enrichDocument', () => {
  it('adds summary, tag and a request body built from the Zod schema', () => {
    const doc = enrichDocument(makeDocument(), registry);
    const op = paths(doc)['/items']?.post as Record<string, any>;

    expect(op.summary).toBe('Create an item');
    expect(op.tags).toEqual(['Items']);
    const schema = op.requestBody.content['application/json'].schema;
    expect(schema.required).toEqual(['name']);
    expect(schema.properties.name).toMatchObject({ type: 'string', minLength: 2 });
  });

  it('turns a query schema into query parameters with required flags and defaults', () => {
    const doc = enrichDocument(makeDocument(), registry);
    const op = paths(doc)['/items']?.get as Record<string, any>;
    const byName = Object.fromEntries(
      (op.parameters as Array<{ name: string }>).map((p) => [p.name, p]),
    );

    expect(Object.keys(byName)).toEqual(['page', 'status']);
    expect(byName.page.required).toBe(false);
    expect(byName.page.schema.default).toBe(1);
    expect(byName.status.required).toBe(true);
    expect(byName.status.schema.enum).toEqual(['OPEN', 'CLOSED']);
  });

  it('keeps existing path parameters when adding query parameters', () => {
    const doc = enrichDocument(makeDocument(), registry);
    const op = paths(doc)['/items/{id}']?.get as Record<string, any>;

    expect(op.parameters.map((p: { name: string }) => p.name)).toEqual([
      'id',
      'expand',
    ]);
  });

  it('requires a bearer token unless the operation is public', () => {
    const doc = enrichDocument(makeDocument(), registry);

    expect((paths(doc)['/items']?.get as any).security).toEqual([{ bearer: [] }]);
    expect((paths(doc)['/items']?.post as any).security).toEqual([]);
  });

  it('adds error responses and keeps the existing success response', () => {
    const doc = enrichDocument(makeDocument(), registry);
    const responses = (paths(doc)['/items']?.get as any).responses;

    expect(Object.keys(responses).sort()).toEqual(['200', '400', '401']);
    expect(responses['401'].description).toMatch(/credentials/i);
  });
});

describe('findUndocumentedOperations', () => {
  it('returns nothing when every operation has an entry', () => {
    expect(findUndocumentedOperations(makeDocument(), registry)).toEqual([]);
  });

  it('lists operations that are missing from the registry', () => {
    const { 'POST /items': _removed, ...incomplete } = registry;
    void _removed;

    expect(findUndocumentedOperations(makeDocument(), incomplete)).toEqual([
      'POST /items',
    ]);
  });
});