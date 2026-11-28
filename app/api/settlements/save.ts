import { eq } from "drizzle-orm";
import { deletedClientIds, expenses, settlements } from "@/db/schema";
import { clientIdOf, firstError, settlementSchema } from "@/lib/validate";
import { paiseToDecimal, toPaise } from "@/lib/balances";
import type { Db, SaveResult } from "../expenses/save";

// No "server-only" imports here, so scripts/test-offline.ts can run this against an in-memory database.

type Row = typeof settlements.$inferSelect;

/** The fields that identify a settlement, after the server's normalisation (amount in paise, trimmed note). */
export function sameSettlement(row: Row, raw: unknown): boolean {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const note = typeof r.note === "string" ? r.note.trim() : "";
  return (
    typeof r.amount === "number" &&
    Math.round(r.amount * 100) === toPaise(row.amount) &&
    r.fromPerson === row.fromPerson &&
    r.toPerson === row.toPerson &&
    note === (row.note ?? "")
  );
}

const replay = (row: Row, raw: unknown): SaveResult => ({
  status: 200,
  body: { ...row, replay: true, ...(sameSettlement(row, raw) ? {} : { conflict: true }) },
});

const byClientId = async (db: Db, cid: string) =>
  (await db.select().from(settlements).where(eq(settlements.clientId, cid)).limit(1))[0];

/** Records one settlement; the same rules and order as saveExpense (app/api/expenses/save.ts), without the cap. */
export async function saveSettlement(db: Db, member: { person: string; isAdmin: boolean }, raw: unknown): Promise<SaveResult> {
  const cid = clientIdOf(raw);
  if (cid) {
    const stored = await byClientId(db, cid);
    if (stored) return replay(stored, raw);
    const [gone] = await db.select({ kind: deletedClientIds.kind }).from(deletedClientIds).where(eq(deletedClientIds.clientId, cid)).limit(1);
    if (gone?.kind === "settlement")
      return { status: 410, body: { error: "This settlement was recorded earlier and deleted since, so it was not added again", code: "deleted" } };
    // One id, one entry: an id used by an expense (now or before it was deleted) can't become a settlement.
    const [other] = await db.select({ id: expenses.id }).from(expenses).where(eq(expenses.clientId, cid)).limit(1);
    if (gone || other) return { status: 400, body: { error: "This entry's id is already used by another entry", code: "invalid" } };
  }

  const parsed = settlementSchema.safeParse(raw);
  if (!parsed.success) return { status: 400, body: { error: firstError(parsed.error), code: "invalid" } };
  const v = parsed.data;
  if (v.asPerson && v.asPerson !== member.person)
    return {
      status: 409,
      body: { error: `${v.asPerson} saved this on the phone, but you are signed in as ${member.person}. Sign in as ${v.asPerson} to add it.`, code: "wrong_user" },
    };

  const clientId = v.clientId ?? null;
  const [row] = await db
    .insert(settlements)
    .values({
      fromPerson: v.fromPerson,
      toPerson: v.toPerson,
      amount: paiseToDecimal(toPaise(v.amount)),
      note: v.note || null,
      createdBy: member.person,
      clientId,
    })
    .onConflictDoNothing({ target: settlements.clientId })
    .returning();
  if (row) return { status: 201, body: row };
  if (clientId) {
    const stored = await byClientId(db, clientId);
    if (stored) return replay(stored, raw);
  }
  throw new Error("Settlement insert returned no row");
}
