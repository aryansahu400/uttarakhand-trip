import { sql, type SQL } from "drizzle-orm";
import { MAX_SPLIT } from "@/lib/balances";
import { NAVEEN_PER_PERSON_PAISE } from "@/lib/naveen";

/**
 * Race-safe insert of a Naveen payment (finding F26).
 *
 * The cap check and the insert are ONE conditional `INSERT ... SELECT ... WHERE NOT EXISTS (over cap)`
 * statement, run after taking a transaction-scoped advisory lock. The lock serialises concurrent Naveen
 * inserts, and because Postgres at READ COMMITTED takes a fresh snapshot per statement, the conditional
 * insert that runs after the lock is granted always sees the rows committed by whoever held it before.
 *
 * Isolation (N14): this is only race-safe at READ COMMITTED (under REPEATABLE READ the snapshot could
 * predate the lock wait). So the transaction PINS it: its first statement is
 * `SET TRANSACTION ISOLATION LEVEL READ COMMITTED` (valid as the first statement of any transaction,
 * whatever the database / role default is), and the lock statement returns current_setting(
 * 'transaction_isolation'), which is asserted to be 'read committed' — otherwise we throw (→ JSON 503).
 *
 * - Neon (production, neon-http driver): no interactive transactions, so set + lock + insert are sent as
 *   one non-interactive transaction with db.batch().
 * - PGlite (local dev): db.transaction().
 *
 * Cap maths (must match lib/naveen.ts naveenPaidUnits): exact integer "units", 1 paisa = L units with
 * L = lcm(1..max(MAX_SPLIT, largest split)) = 2520 for every split of the 10 trip members. A payment
 * of P paise split between n distinct members (empty split = everyone) adds P * L / n units to each —
 * exact, no rounding.
 * Someone is over the cap when their total exceeds 2,100,000 * L units (no tolerance).
 * scripts/test-settle.ts fuzzes this SQL against the JS version on an in-memory PGlite.
 */

/** Arbitrary constant key for pg_advisory_xact_lock: "the Naveen cap". */
export const NAVEEN_LOCK_KEY = 21000;

export type NewNaveenExpense = {
  description: string;
  /** Exact decimal string, e.g. "1234.56". */
  amount: string;
  paise: number;
  dateTime: Date;
  paidBy: string;
  splitAmong: string[];
  naveenPayment: "direct" | "indirect";
  category: string;
  createdBy: string;
  /** The phone's id for this entry (see lib/validate.ts clientId); null for saves without one. */
  clientId?: string | null;
};

type ExecResult = { rows?: Record<string, unknown>[] } | Record<string, unknown>[];
/** The bits of the drizzle database we need; satisfied by both the neon-http and the PGlite drivers. */
export type DbLike = {
  execute: (q: SQL) => PromiseLike<unknown>;
  batch?: (queries: never) => Promise<unknown[]>;
  transaction?: (fn: (tx: { execute: (q: SQL) => PromiseLike<unknown> }) => Promise<unknown>) => Promise<unknown>;
};

const rowsOf = (r: unknown) => {
  const x = r as ExecResult;
  return (Array.isArray(x) ? x : x.rows ?? []) as Record<string, unknown>[];
};

/**
 * The conditional insert. Inserts nothing (returns no row) if anyone it charges would end above the cap, or if a
 * row with the same client id already exists (a retry of a save that already went through). The caller tells the
 * two apart by looking the client id up afterwards (app/api/expenses/save.ts), so a retried payment is never
 * stored twice and never reported as over the cap.
 */
export function naveenConditionalInsert(v: NewNaveenExpense, roster: readonly string[]): SQL {
  const rosterJson = JSON.stringify(roster);
  const splitJson = JSON.stringify(v.splitAmong);
  return sql`
    INSERT INTO expenses (description, amount, date_time, paid_by, type, split_among, owed_to, naveen_payment, category, created_by, client_id)
    SELECT ${v.description}, ${v.amount}::numeric, ${v.dateTime.toISOString()}::timestamptz, ${v.paidBy}, 'trip',
           ${splitJson}::jsonb, NULL, ${v.naveenPayment}, ${v.category}, ${v.createdBy}, ${v.clientId ?? null}::uuid
    WHERE NOT EXISTS (
      WITH RECURSIVE
      naveen_rows AS (                       -- every Naveen payment, plus the new one as rid 0
        SELECT e.id AS rid, round(e.amount * 100)::bigint AS paise, e.split_among AS split
          FROM expenses e
         WHERE e.type = 'trip' AND e.naveen_payment IS NOT NULL
        UNION ALL
        SELECT 0, ${v.paise}::bigint, ${splitJson}::jsonb
      ),
      members AS (                           -- distinct split members (empty split = everyone)
        SELECT DISTINCT nr.rid, nr.paise, m.name
          FROM naveen_rows nr
          CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE WHEN jsonb_array_length(nr.split) = 0 THEN ${rosterJson}::jsonb ELSE nr.split END
          ) AS m(name)
      ),
      sized AS (
        SELECT rid, paise, name, count(*) OVER (PARTITION BY rid) AS n FROM members
      ),
      lcm_upto(k, l) AS (                    -- l = lcm(1..k); stops at max(MAX_SPLIT, largest split) → 2520
        SELECT 1, 1::numeric
        UNION ALL
        SELECT k + 1, lcm(l, (k + 1)::numeric) FROM lcm_upto
         WHERE k < (SELECT greatest(${MAX_SPLIT}::int, coalesce(max(n), 0)) FROM sized)
      ),
      scale AS (
        SELECT l FROM lcm_upto ORDER BY k DESC LIMIT 1
      ),
      units AS (                             -- exact integer units: paise * L / n (always divisible)
        SELECT s.rid, s.name, div(s.paise::numeric * sc.l, s.n::numeric) AS u
          FROM sized s CROSS JOIN scale sc
      )
      SELECT 1
        FROM units
       WHERE name IN (SELECT name FROM units WHERE rid = 0 AND u > 0)
       GROUP BY name
      HAVING sum(u) > ${NAVEEN_PER_PERSON_PAISE}::numeric * (SELECT l FROM scale)
    )
    ON CONFLICT (client_id) DO NOTHING
    RETURNING id`;
}

/**
 * Inserts the Naveen payment if it keeps everyone it charges within the cap.
 * Returns the new row id, or null when the cap would be exceeded (nothing inserted).
 */
export async function insertNaveenWithinCap(db: DbLike, v: NewNaveenExpense, roster: readonly string[]): Promise<number | null> {
  const isolation = sql`SET TRANSACTION ISOLATION LEVEL READ COMMITTED`;
  const lock = sql`SELECT pg_advisory_xact_lock(${NAVEEN_LOCK_KEY}), current_setting('transaction_isolation') AS iso`;
  const insert = naveenConditionalInsert(v, roster);
  let lockRows: Record<string, unknown>[];
  let rows: Record<string, unknown>[];
  if (typeof db.batch === "function") {
    // neon-http: one HTTP round trip, executed as a single transaction.
    const results = await db.batch([db.execute(isolation), db.execute(lock), db.execute(insert)] as never);
    lockRows = rowsOf(results[1]);
    rows = rowsOf(results[2]);
  } else if (typeof db.transaction === "function") {
    [lockRows, rows] = (await db.transaction(async (tx) => {
      await tx.execute(isolation);
      const l = rowsOf(await tx.execute(lock));
      if (l[0]?.iso !== "read committed") throw new Error(`Naveen insert needs READ COMMITTED, got ${String(l[0]?.iso)}`);
      return [l, rowsOf(await tx.execute(insert))];
    })) as [Record<string, unknown>[], Record<string, unknown>[]];
  } else {
    throw new Error("Database driver supports neither batch nor transaction");
  }
  // Post-commit check for the batch path (a non-interactive batch can't abort midway). If this ever
  // fires, the database ignored SET TRANSACTION; surface it loudly rather than trusting the cap.
  if (lockRows[0]?.iso !== "read committed") throw new Error(`Naveen insert ran at ${String(lockRows[0]?.iso)}, expected read committed`);
  return rows.length ? Number(rows[0].id) : null;
}
