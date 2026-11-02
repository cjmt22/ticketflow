import { execSync } from 'node:child_process';
import pg from 'pg';

export default async function setup(): Promise<void> {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error('DATABASE_URL is not set');
  }

  const url = new URL(raw);
  const dbName = url.pathname.replace(/^\//, '');
  if (!/^[a-zA-Z0-9_]+_test$/.test(dbName)) {
    throw new Error(
      `Refusing to run e2e tests against "${dbName}": the database name must end with _test`,
    );
  }

  // Connect to the default "postgres" database to create the test database.
  const admin = new URL(raw);
  admin.pathname = '/postgres';
  admin.search = '';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await client.end();
  }

  // Apply all migrations to the test database.
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
}