import { Pool, PoolClient } from 'pg';

let authPool: Pool | null = null;

export function hasPostgresConfig(): boolean {
  const connectionString = process.env.POSTGRES_URL?.trim();
  if (connectionString) return true;

  return Boolean(
    process.env.POSTGRES_HOST?.trim()
      && process.env.POSTGRES_USER?.trim()
      && process.env.POSTGRES_DB?.trim(),
  );
}

function readBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export function getAuthPool(): Pool {
  if (authPool) return authPool;

  const connectionString = process.env.POSTGRES_URL?.trim();
  const shouldUseSsl = readBooleanEnv(process.env.POSTGRES_SSL, false);

  authPool = connectionString
    ? new Pool({
        connectionString,
        ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
      })
    : new Pool({
        host: process.env.POSTGRES_HOST,
        port: Number(process.env.POSTGRES_PORT || 5432),
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DB,
        ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
      });

  return authPool;
}

export async function withAuthClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getAuthPool();
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export async function initAuthSchema(): Promise<void> {
  await withAuthClient(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        mobile VARCHAR(10) NOT NULL UNIQUE,
        role VARCHAR(50) NOT NULL DEFAULT 'sub_vendor',
        firm_name VARCHAR(255) DEFAULT '',
        profile_image TEXT DEFAULT '',
        last_login_at TIMESTAMPTZ NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE auth_users
      ADD COLUMN IF NOT EXISTS role VARCHAR(50);
    `);
    await client.query(`
      UPDATE auth_users
      SET role = 'sub_vendor'
      WHERE role IS NULL OR role = '';
    `);
    await client.query(`
      ALTER TABLE auth_users
      ALTER COLUMN role SET DEFAULT 'sub_vendor';
    `);
    await client.query(`
      ALTER TABLE auth_users
      ALTER COLUMN role SET NOT NULL;
    `);
    await client.query(`
      ALTER TABLE auth_users
      ADD COLUMN IF NOT EXISTS firm_name VARCHAR(255) DEFAULT '';
    `);
    await client.query(`
      ALTER TABLE auth_users
      ADD COLUMN IF NOT EXISTS profile_image TEXT DEFAULT '';
    `);
    await client.query(`
      ALTER TABLE auth_users
      ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_password_resets (
        id BIGSERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL REFERENCES auth_users(email) ON DELETE CASCADE,
        otp_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        is_verified BOOLEAN NOT NULL DEFAULT FALSE,
        is_used BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_auth_password_resets_email ON auth_password_resets(email);');
  });
}

export async function testAuthDbConnection(): Promise<void> {
  await withAuthClient(async (client) => {
    await client.query('SELECT 1');
  });
}
