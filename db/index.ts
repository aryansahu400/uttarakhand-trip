import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { PEOPLE } from "@/lib/people";

type DB = NeonHttpDatabase<typeof schema>;

// Survives Next.js dev hot-reloads so we never open the local database twice.
const g = globalThis as unknown as { __db?: Promise<DB> };

/**
 * DATABASE_URL set   → Neon serverless Postgres (production / Vercel).
 * DATABASE_URL unset → embedded local Postgres (PGlite) stored in ./.local-db,
 *                      migrated + seeded automatically. For local development only.
 */
export function getDb(): Promise<DB> {
  if (!g.__db) {
    const url = process.env.DATABASE_URL;
    g.__db = url ? Promise.resolve(drizzle(neon(url), { schema })) : openLocal();
    g.__db.catch(() => (g.__db = undefined));
  }
  return g.__db;
}

async function openLocal(): Promise<DB> {
  if (process.env.VERCEL) throw new Error("DATABASE_URL is not set");
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  // LOCAL_DB_DIR lets a local production test run use its own folder next to `npm run dev`.
  const client = new PGlite(path.join(process.cwd(), process.env.LOCAL_DB_DIR || ".local-db"));
  const db = drizzlePglite(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await db.insert(schema.people).values(PEOPLE.map((name) => ({ name }))).onConflictDoNothing();
  console.log(`[db] Using local embedded Postgres at ${process.env.LOCAL_DB_DIR || ".local-db"}`);
  return db as unknown as DB;
}
