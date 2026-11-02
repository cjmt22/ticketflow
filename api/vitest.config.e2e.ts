import 'dotenv/config';
import { defineConfig } from 'vitest/config';

// Point the e2e tests at a separate "<name>_test" database so they can never touch dev data.
function testDatabaseUrl(): string {
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error('DATABASE_URL is not set. Check api/.env');
  }
  const url = new URL(base);
  const name = url.pathname.replace(/^\//, '');
  url.pathname = `/${name.endsWith('_test') ? name : `${name}_test`}`;
  return url.toString();
}

const databaseUrl = testDatabaseUrl();
const jwtSecret = 'e2e-test-secret-e2e-test-secret-e2e-test-1234';

// Set before any test code (or Prisma) reads the environment.
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_ACCESS_SECRET = jwtSecret;

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false, // test files share one database, so run them one at a time
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: databaseUrl,
      JWT_ACCESS_SECRET: jwtSecret,
    },
  },
});