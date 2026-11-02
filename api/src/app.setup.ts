import type { INestApplication } from '@nestjs/common';

// Used by both main.ts and the e2e tests, so they configure the app identically.
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
}