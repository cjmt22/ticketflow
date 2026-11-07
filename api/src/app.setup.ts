import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { parseOrigins } from './config/origins.js';
import { setupDocs } from './docs/openapi.js';

const apiHelmet = helmet();

// The docs page is a web page, not an API response. Its assets must not be
// force-upgraded to https on localhost, so it skips that one directive.
const docsHelmet = helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'upgrade-insecure-requests': null,
    },
  },
});

// Used by both main.ts and the e2e tests, so they configure the app identically.
export function configureApp(app: INestApplication): void {
  if (env.TRUST_PROXY) {
    // Behind a hosting proxy, use the real client IP (matters for rate limiting).
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  app.use((req: Request, res: Response, next: NextFunction) =>
    (req.path.startsWith('/api/docs') ? docsHelmet : apiHelmet)(req, res, next),
  );

  app.enableCors({
    origin: parseOrigins(env.CORS_ORIGINS),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });

  app.setGlobalPrefix('api/v1');
  setupDocs(app); // after the prefix, so the paths in the docs are right
}