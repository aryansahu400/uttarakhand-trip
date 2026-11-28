import { eq, isNotNull } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/db/schema";
import { deletedClientIds, expenses } from "@/db/schema";
import { clientIdOf, expenseSchema, firstError } from "@/lib/validate";
import { NAVEEN_PER_PERSON, naveenOverCap } from "@/lib/naveen";
import { PEOPLE } from "@/lib/people";
import { formatINR } from "@/lib/format";
import { paiseToDecimal, toPaise } from "@/lib/balances";
import { insertNaveenWithinCap, type DbLike } from "./naveen-insert";

// No "server-only" imports here, so scripts/test-offline.ts can run this against an in-memory database.

export type Db = NeonHttpDatabase<typeof schema>;
export type SaveResult = { status: number; body: Record<string, unknown> };
type Row = typeof expenses.$inferSelect;

/** The five fields that identify an expense, compared after the same normalisation the server applies. */
export function sameExpense(row: Row, raw: unknown): boolean {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return (
    typeof r.description === "string" &&
    r.description.trim() === row.description &&
    typeof r.amount === "number" &&
    Math.round(r.amount * 100) === toPaise(row.amount) &&
    r.paidBy === row.paidBy &&
    (r.type ?? "trip") === row.type &&
    typeof r.dateTime === "string" &&
    Date.parse(r.dateTime) === new Date(row.dateTime).getTime()
  );
}

/**
 * A retry of a save that already went through: answer 200 with the stored row, never insert again. If the body
 * differs from what is stored (a client bug), the stored row still wins and `conflict` tells the app to say so;
 * the app never turns this into a second row.
 */
function replay(row: Row, raw: unknown): SaveResult {
  return { status: 200, body: { ...row, replay: true, ...(sameExpense(row, raw) ? {} : { conflict: true }) } };
}

const byClientId = async (db: Db, cid: string) => (await db.select().from(expenses).where(eq(expenses.clientId, cid)).limit(1))[0];

/**
 * Saves one expense. Safe to call any number of times with the same client id: it is stored once, and every
 * retry gets 200 with that row. The order matters:
 *   1. the client id is looked up BEFORE validation, so a stored entry is always acknowledged;
 *   2. an id deleted after it was saved answers 410, so a late retry can't bring it back;
 *   3. validation (400 invalid);
 *   4. a different signed-in person than the one who saved it on the phone answers 409 wrong_user;
 *   5. insert with ON CONFLICT (client_id) DO NOTHING, also inside the Naveen cap statement;
 *   6. nothing inserted: a concurrent copy won (200 with its row) or the Naveen cap was reached (400).
 */
export async function saveExpense(db: Db, member: { person: string; isAdmin: boolean }, raw: unknown): Promise<SaveResult> {
  const cid = clientIdOf(raw);
  if (cid) {
    const stored = await byClientId(db, cid);
    if (stored) return replay(stored, raw);
    const [gone] = await db.select({ id: deletedClientIds.clientId }).from(deletedClientIds).where(eq(deletedClientIds.clientId, cid)).limit(1);
    if (gone) return { status: 410, body: { error: "This expense was added earlier and deleted since, so it was not added again", code: "deleted" } };
  }

  const parsed = expenseSchema.safeParse(raw);
  if (!parsed.success) return { status: 400, body: { error: firstError(parsed.error), code: "invalid" } };
  const v = parsed.data;
  if (v.asPerson && v.asPerson !== member.person)
    return {
      status: 409,
      body: { error: `${v.asPerson} saved this on the phone, but you are signed in as ${member.person}. Sign in as ${v.asPerson} to add it.`, code: "wrong_user" },
    };

  // The schema already rounded to exact paise; store exactly that value.
  const paise = toPaise(v.amount);
  const amount = paiseToDecimal(paise);
  const clientId = v.clientId ?? null;

  if (v.type === "trip" && v.naveenPayment) {
    // Cap check + insert in one serialised statement, so concurrent requests can't both pass.
    const id = await insertNaveenWithinCap(
      db as unknown as DbLike,
      {
        description: v.description,
        amount,
        paise,
        dateTime: v.dateTime,
        paidBy: v.paidBy,
        splitAmong: v.splitAmong,
        naveenPayment: v.naveenPayment,
        category: v.category,
        createdBy: member.person,
        clientId,
      },
      PEOPLE
    );
    if (id !== null) {
      const [row] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
      return { status: 201, body: row };
    }
    if (clientId) {
      const stored = await byClientId(db, clientId);
      if (stored) return replay(stored, raw);
    }
    return { status: 400, body: { error: await overCapMessage(db, v), code: "naveen_over_cap" } };
  }

  const [row] = await db
    .insert(expenses)
    .values({
      description: v.description,
      amount,
      dateTime: v.dateTime,
      paidBy: v.paidBy,
      type: v.type,
      splitAmong: v.type === "trip" ? v.splitAmong : [],
      owedTo: v.type === "personal" ? v.owedTo! : null,
      naveenPayment: null,
      category: v.category,
      createdBy: member.person,
      clientId,
    })
    .onConflictDoNothing({ target: expenses.clientId })
    .returning();
  if (row) return { status: 201, body: row };
  if (clientId) {
    const stored = await byClientId(db, clientId);
    if (stored) return replay(stored, raw);
  }
  throw new Error("Expense insert returned no row");
}

/** Explains a rejected Naveen payment: who would go over and by how much (same maths as the SQL). */
async function overCapMessage(db: Db, v: Parameters<typeof naveenOverCap>[2]) {
  const existing = await db.select().from(expenses).where(isNotNull(expenses.naveenPayment));
  const over = naveenOverCap(PEOPLE, existing, v);
  const who = over.length ? `: ${over.map((o) => `${o.person} (+${formatINR(o.over)})`).join(", ")}` : "";
  return `Naveen's payments would exceed ${formatINR(NAVEEN_PER_PERSON)} per person${who}`;
}
