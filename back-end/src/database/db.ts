import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../config/env.js";
import * as schema from "./schemas/index.js";

const { Pool } = pg;

let _pool: pg.Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;

function getPool(): pg.Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 25,
      min: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_000,
      statement_timeout: 30_000,
      maxUses: 7500,
    });
  }
  return _pool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop) {
    const dbInstance = getDb();
    const value = Reflect.get(dbInstance as object, prop);
    return typeof value === "function" ? value.bind(dbInstance) : value;
  },
});

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
