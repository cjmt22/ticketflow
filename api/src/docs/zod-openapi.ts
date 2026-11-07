import type { OpenAPIObject } from '@nestjs/swagger';
import { z, type ZodType } from 'zod';

export interface OperationDoc {
  summary: string;
  tag: string;
  description?: string;
  /** Needs no login. Everything else requires a bearer token. */
  public?: boolean;
  body?: ZodType;
  query?: ZodType;
  /** Error status codes this operation can return. */
  errors?: number[];
}

const ERROR_TEXT: Record<number, string> = {
  400: 'Validation failed or the request is not allowed in the current state',
  401: 'Missing, invalid or expired credentials',
  403: 'Your role does not allow this',
  404: 'Not found (also returned for other organisations)',
  409: 'Conflict with existing data',
  429: 'Too many requests',
};

const HTTP_METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
]);

// Docs and request validation share the same Zod schemas.
function toJsonSchema(schema: ZodType): Record<string, unknown> {
  const { $schema: ignored, ...rest } = z.toJSONSchema(schema, {
    io: 'input',
    target: 'openapi-3.0',
  }) as Record<string, unknown>;
  void ignored;
  return rest;
}

function queryParameters(schema: ZodType) {
  const json = toJsonSchema(schema) as {
    properties?: Record<string, Record<string, unknown>>;
    required?: string[];
  };
  return Object.entries(json.properties ?? {}).map(([name, propertySchema]) => ({
    name,
    in: 'query' as const,
    required: json.required?.includes(name) ?? false,
    schema: propertySchema,
  }));
}

interface Operation {
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: unknown[];
  requestBody?: unknown;
  responses?: Record<string, unknown>;
  security?: Array<Record<string, string[]>>;
}

/** Operations that exist in the app but have no entry in the registry. */
export function findUndocumentedOperations(
  document: OpenAPIObject,
  registry: Record<string, OperationDoc>,
): string[] {
  const missing: string[] = [];
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of Object.keys(item)) {
      if (!HTTP_METHODS.has(method)) continue;
      const key = `${method.toUpperCase()} ${path}`;
      if (!registry[key]) missing.push(key);
    }
  }
  return missing;
}

export function enrichDocument(
  document: OpenAPIObject,
  registry: Record<string, OperationDoc>,
): OpenAPIObject {
  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, value] of Object.entries(item)) {
      if (!HTTP_METHODS.has(method)) continue;
      const doc = registry[`${method.toUpperCase()} ${path}`];
      if (!doc) continue;

      const operation = value as Operation;
      operation.summary = doc.summary;
      operation.description = doc.description;
      operation.tags = [doc.tag];
      operation.security = doc.public ? [] : [{ bearer: [] }];

      if (doc.body) {
        operation.requestBody = {
          required: true,
          content: { 'application/json': { schema: toJsonSchema(doc.body) } },
        };
      }
      if (doc.query) {
        const pathParameters = (operation.parameters ?? []).filter(
          (parameter) => (parameter as { in?: string }).in !== 'query',
        );
        operation.parameters = [...pathParameters, ...queryParameters(doc.query)];
      }

      const responses = operation.responses ?? {};
      for (const code of doc.errors ?? []) {
        responses[String(code)] = { description: ERROR_TEXT[code] ?? 'Error' };
      }
      operation.responses = responses;
    }
  }
  return document;
}