import pg from "pg";

export function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!globalThis.speechPool) {
    globalThis.speechPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 8,
      connectionTimeoutMillis: 10000,
    });
    globalThis.speechPool.on("error", (error) =>
      console.error(
        "[database] Idle connection error:",
        error.code || error.name,
      ),
    );
  }
  return globalThis.speechPool;
}

export async function transaction(work) {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
