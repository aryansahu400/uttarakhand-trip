import { sql } from "drizzle-orm";

// No "server-only" imports here, so scripts/test-offline.ts can run this against an in-memory database.

type Executor = { execute: (q: ReturnType<typeof sql>) => PromiseLike<unknown> };

/**
 * Deletes one expense or settlement and, in the same statement, remembers its client id (if it has one) in
 * deleted_client_ids. A phone that never got the answer to the original save may send it again later; the
 * server then answers "deleted" (410) instead of adding the entry back.
 */
export async function deleteWithTombstone(db: Executor, kind: "expense" | "settlement", id: number, person: string): Promise<void> {
  if (kind === "expense") {
    await db.execute(sql`
      WITH d AS (DELETE FROM expenses WHERE id = ${id} RETURNING client_id)
      INSERT INTO deleted_client_ids (client_id, kind, deleted_by)
      SELECT client_id, 'expense', ${person} FROM d WHERE client_id IS NOT NULL
      ON CONFLICT (client_id) DO NOTHING`);
  } else {
    await db.execute(sql`
      WITH d AS (DELETE FROM settlements WHERE id = ${id} RETURNING client_id)
      INSERT INTO deleted_client_ids (client_id, kind, deleted_by)
      SELECT client_id, 'settlement', ${person} FROM d WHERE client_id IS NOT NULL
      ON CONFLICT (client_id) DO NOTHING`);
  }
}
