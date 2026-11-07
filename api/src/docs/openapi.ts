import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { OPERATIONS } from './operations.js';
import { enrichDocument } from './zod-openapi.js';

export function buildDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('TicketFlow API')
    .setDescription(
      'Multi-tenant helpdesk API. Register a company, log in, then click Authorize and paste the access token.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .addTag('System', 'Health check')
    .addTag('Auth', 'Registration, login and sessions')
    .addTag('Users', 'Managing the people in your organisation')
    .addTag('Tickets', 'Support tickets')
    .addTag('Comments', 'Replies and internal notes on a ticket')
    .build();

  return enrichDocument(SwaggerModule.createDocument(app, config), OPERATIONS);
}

export function setupDocs(app: INestApplication): void {
  SwaggerModule.setup('api/docs', app, buildDocument(app), {
    customSiteTitle: 'TicketFlow API',
    swaggerOptions: { persistAuthorization: true },
  });
}