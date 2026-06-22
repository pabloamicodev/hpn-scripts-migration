import { Client } from "pg";

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is required for production mutation locking.");
  }
  return value;
}

/**
 * Serializes rare admin mutations across Vercel instances.
 * The lock is session-scoped and always released when the callback finishes.
 */
export async function withDatabaseLock<T>(
  lockKey: string,
  callback: () => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();

  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [lockKey]);
    return await callback();
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
    } finally {
      await client.end();
    }
  }
}
