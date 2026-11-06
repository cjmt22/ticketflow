import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  // Comma-separated list of frontend addresses allowed to call the API.
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  // Set to true behind a hosting proxy (Render, Vercel) so rate limits use the real client IP.
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(100),
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
});

export const env = schema.parse(process.env);