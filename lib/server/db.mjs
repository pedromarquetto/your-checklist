import { Pool } from "pg";
let pool;
export function configured() {
  return (
    !!process.env.DATABASE_URL &&
    !!process.env.BETTER_AUTH_SECRET &&
    !!process.env.BETTER_AUTH_URL
  );
}
export function getPool() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL não configurada.");
  return (pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
  }));
}
export async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
