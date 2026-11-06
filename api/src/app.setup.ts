import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { env } from './config/env.js';
import { parseOrigins } from './config/origins.js';

// Used by both main.ts and the e2e tests, so they configure the app identically.
export function configureApp(app: INestApplication): void {
  if (env.TRUST_PROXY) {
    // Behind a hosting proxy, use the real client IP (matters for rate limiting).
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  app.use(helmet());

  app.enableCors({
    origin: parseOrigins(env.CORS_ORIGINS),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });

  app.setGlobalPrefix('api/v1');
}