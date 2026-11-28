/**
 * Offline-mode tests: a save can be retried any number of times and is stored exactly once.
 *
 *   npx tsx scripts/test-offline.ts      (part of npm test)
 *
 * Runs the real save functions (app/api/expenses/save.ts, app/api/settlements/save.ts) and the delete helper
 * (lib/tombstones.ts) against an in-memory PGlite database with every migration applied. Exits non-zero on the
 * first failure.
 */
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { PEOPLE } from "../lib/people";
import { NAVEEN_MEMBERS, NAVEEN_PER_PERSON, NAVEEN_TOTAL, isNaveenMember } from "../lib/naveen";
import { expenseSchema } from "../lib/validate";
import { DraftClientId, savedOnServer } from "../lib/client-id";

let checks = 0;
function assert(cond: unknown, msg: string, ...ctx: unknown[]): asserts cond {
  checks++;
  if (!cond) {
    console.error(`FAIL: ${msg}`, ...ctx.map((c) => JSON.stringify(c, (_, v) => (typeof v === "bigint" ? `${v}n` : v))));
    throw new Error(`Assertion failed: ${msg}`);
  }
}
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), msg, { got: a, want: b });

const uuid = () => crypto.randomUUID();
const ARYAN = { person: "Aryan", isAdmin: true };
const KRISH = { person: "Krish", isAdmin: false };

const expense = (over: Record<string, unknown> = {}) => ({
  description: "Dinner",
  amount: 2400,
  dateTime: "2026-12-18T15:30:00.000Z",
  paidBy: "Aryan",
  type: "trip",
  splitAmong: [...PEOPLE],
  owedTo: null,
  naveenPayment: null,
  category: "food",
  ...over,
});

/* ---------------------------------------------------------------- Naveen's package: the original seven only */
{
  eq([...NAVEEN_MEMBERS], ["Aryan", "Krish", "Tejas", "Anshul", "Shlok", "Sarthak", "Krishnam"], "Naveen's package: the original seven");
  assert(NAVEEN_MEMBERS.every((p) => (PEOPLE as readonly string[]).includes(p)), "every package member is a trip member");
  eq(NAVEEN_TOTAL, 147000, "Naveen's package total: 7 × ₹21,000");
  eq(PEOPLE.filter((p) => !isNaveenMember(p)), ["Riya", "Rashi", "Amisha"], "Riya, Rashi and Amisha are not on the package");
  const naveen = (splitAmong: string[], paidBy = "Aryan") =>
    expenseSchema.safeParse({ description: "Naveen advance", amount: 7000, dateTime: "2026-12-18T05:00:00.000Z", paidBy, type: "trip", splitAmong, naveenPayment: "direct" });
  assert(naveen([...NAVEEN_MEMBERS]).success, "a Naveen payment split among the seven is valid");
  assert(naveen(["Krish", "Tejas"], "Rashi").success, "anyone may be the payer of a Naveen payment");
  const withRiya = naveen(["Aryan", "Riya"]);
  assert(!withRiya.success && /only be split among the 7 people on his package \(not Riya\)/.test(withRiya.error.issues[0].message), "a Naveen split with Riya is refused", withRiya);
  assert(!naveen([...PEOPLE]).success, "a Naveen split among all 10 is refused");
  const dinner = expenseSchema.safeParse({ description: "Dinner", amount: 3000, dateTime: "2026-12-18T15:00:00.000Z", paidBy: "Riya", type: "trip", splitAmong: [...PEOPLE] });
  assert(dinner.success, "an ordinary expense still splits among all 10");
}

/* ---------------------------------------------------------------- form draft ids (lib/client-id.ts) */
{
  let n = 0;
  const d = new DraftClientId(() => `id-${++n}`);
  const details = { description: "Dinner", amount: 100 };
  eq([d.pending(), d.peek(details)], [null, null], "draft: nothing pending at first");
  const a = d.idFor(details);
  eq([d.idFor({ ...details }), d.peek(details), d.pending()], [a, a, a], "draft: same details keep the same id");
  const b = d.idFor({ ...details, amount: 200 });
  assert(b !== a, "draft: changed details get a new id");
  eq(d.peek(details), null, "draft: the old details no longer match");
  d.clear();
  eq(d.pending(), null, "draft: cleared");
  assert(d.idFor(details) !== a, "draft: after clear, the same details get a new id (a new entry)");
  eq([savedOnServer("x", [{ clientId: "y" }, { clientId: "x" }]), savedOnServer("x", [{ clientId: null }]), savedOnServer(null, [{ clientId: null }])], [true, false, false], "savedOnServer");
}

async function main() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schema = await import("../db/schema");
  const { saveExpense } = await import("../app/api/expenses/save");
  const { saveSettlement } = await import("../app/api/settlements/save");
  const { deleteWithTombstone } = await import("../lib/tombstones");
  type Db = Parameters<typeof saveExpense>[0];

  const pg = drizzle(new PGlite(), { schema });
  const migrationsFolder = path.join(__dirname, "..", "drizzle");
  await migrate(pg, { migrationsFolder });
  const db = pg as unknown as Db;
  const rows = async () => pg.select().from(schema.expenses);
  const reset = async () => {
    await pg.execute(sql`DELETE FROM expenses`);
    await pg.execute(sql`DELETE FROM settlements`);
    await pg.execute(sql`DELETE FROM deleted_client_ids`);
  };

  /* ---------------------------------------------------------------- migration 0007 can be run twice */
  {
    const m = fs.readFileSync(path.join(migrationsFolder, "0007_offline.sql"), "utf8");
    for (const stmt of m.split("--> statement-breakpoint")) if (stmt.trim()) await pg.execute(sql.raw(stmt));
    const cols = await pg.execute(sql`SELECT table_name, column_name FROM information_schema.columns WHERE column_name IN ('client_id','last_seen_at','waiting_count') ORDER BY 1, 2`);
    eq(
      cols.rows.map((r) => `${r.table_name}.${r.column_name}`),
      ["deleted_client_ids.client_id", "expenses.client_id", "people.last_seen_at", "people.waiting_count", "settlements.client_id"],
      "0007: tables and columns exist after a second run"
    );
  }

  /* ---------------------------------------------------------------- old clients (no clientId) behave as before */
  {
    await reset();
    const a = await saveExpense(db, ARYAN, expense());
    const b = await saveExpense(db, ARYAN, expense());
    eq([a.status, b.status], [201, 201], "no clientId: each save is stored (today's behaviour)");
    eq((await rows()).length, 2, "no clientId: two rows");
    assert(a.body.clientId === null, "no clientId: stored as null", a.body);
  }

  /* ---------------------------------------------------------------- a retry returns the stored row, one row */
  {
    await reset();
    const cid = uuid();
    const first = await saveExpense(db, ARYAN, expense({ clientId: cid, asPerson: "Aryan" }));
    eq(first.status, 201, "first save: 201");
    eq(first.body.clientId, cid, "first save: echoes the clientId");
    const again = await saveExpense(db, ARYAN, expense({ clientId: cid, asPerson: "Aryan" }));
    eq(again.status, 200, "retry: 200");
    eq([again.body.id, again.body.replay, again.body.conflict], [first.body.id, true, undefined], "retry: same row, no conflict");
    eq((await rows()).length, 1, "retry: still one row");
    // Upper-case form of the same id is the same entry.
    const upper = await saveExpense(db, ARYAN, expense({ clientId: cid.toUpperCase() }));
    eq([upper.status, upper.body.id], [200, first.body.id], "retry with the id in upper case: same row");
  }

  /* ---------------------------------------------------------------- 20 copies at once: one row */
  {
    await reset();
    const cid = uuid();
    const results = await Promise.all(Array.from({ length: 20 }, () => saveExpense(db, ARYAN, expense({ clientId: cid }))));
    eq(results.filter((r) => r.status === 201).length, 1, "20 concurrent: exactly one 201");
    eq(results.filter((r) => r.status === 200).length, 19, "20 concurrent: nineteen 200");
    eq(new Set(results.map((r) => r.body.id)).size, 1, "20 concurrent: all answers are the same row");
    eq((await rows()).length, 1, "20 concurrent: one row");
  }

  /* ---------------------------------------------------------------- the stored row wins over a changed body */
  {
    await reset();
    const cid = uuid();
    const first = await saveExpense(db, ARYAN, expense({ clientId: cid, amount: 100 }));
    const changed = await saveExpense(db, ARYAN, expense({ clientId: cid, amount: 200 }));
    eq([changed.status, changed.body.id, changed.body.conflict, changed.body.amount], [200, first.body.id, true, "100.00"], "changed body: stored row returned with conflict");
    eq((await rows()).length, 1, "changed body: no second row");
    // The lookup runs before validation: even a body that would not validate is acknowledged.
    const bare = await saveExpense(db, ARYAN, { clientId: cid });
    eq([bare.status, bare.body.id, bare.body.conflict], [200, first.body.id, true], "id only: stored row acknowledged");
  }

  /* ---------------------------------------------------------------- deleted after saving: a retry never brings it back */
  {
    await reset();
    const cid = uuid();
    const first = await saveExpense(db, ARYAN, expense({ clientId: cid }));
    await deleteWithTombstone(pg, "expense", first.body.id as number, "Aryan");
    eq((await rows()).length, 0, "delete: row gone");
    const ghost = await saveExpense(db, ARYAN, expense({ clientId: cid }));
    eq([ghost.status, ghost.body.code], [410, "deleted"], "retry after delete: 410 deleted");
    eq((await rows()).length, 0, "retry after delete: not added back");
    const plain = await saveExpense(db, ARYAN, expense());
    await deleteWithTombstone(pg, "expense", plain.body.id as number, "Aryan");
    const tombs = await pg.select().from(schema.deletedClientIds);
    eq(tombs.map((t) => [t.clientId, t.kind, t.deletedBy]), [[cid, "expense", "Aryan"]], "delete without clientId: no tombstone");
  }

  /* ---------------------------------------------------------------- wrong person, bad ids, invalid bodies */
  {
    await reset();
    const wrong = await saveExpense(db, ARYAN, expense({ clientId: uuid(), asPerson: "Krish" }));
    eq([wrong.status, wrong.body.code], [409, "wrong_user"], "saved by Krish, sent as Aryan: 409 wrong_user");
    for (const bad of ["00000000-0000-0000-0000-000000000000", "ffffffff-ffff-ffff-ffff-ffffffffffff", "not-a-uuid", 42]) {
      const r = await saveExpense(db, ARYAN, expense({ clientId: bad }));
      eq([r.status, r.body.code], [400, "invalid"], `clientId ${String(bad)}: 400 invalid`);
    }
    const invalid = await saveExpense(db, ARYAN, expense({ clientId: uuid(), amount: -5 }));
    eq([invalid.status, invalid.body.code], [400, "invalid"], "negative amount: 400 invalid");
    eq((await rows()).length, 0, "nothing stored by rejected saves");
  }

  /* ---------------------------------------------------------------- Naveen: a retry at exactly ₹21,000 is not "over the limit" */
  {
    await reset();
    const cid = uuid();
    const pay = (over: Record<string, unknown>) => expense({ description: "Naveen advance", splitAmong: ["Aryan"], naveenPayment: "direct", category: "stay", ...over });
    const first = await saveExpense(db, ARYAN, pay({ clientId: cid, amount: NAVEEN_PER_PERSON }));
    eq(first.status, 201, "Naveen ₹21,000 for Aryan: 201");
    const retry = await saveExpense(db, ARYAN, pay({ clientId: cid, amount: NAVEEN_PER_PERSON }));
    eq([retry.status, retry.body.id], [200, first.body.id], "Naveen retry at the limit: 200 with the same row");
    const more = await saveExpense(db, ARYAN, pay({ clientId: uuid(), amount: 0.01 }));
    eq([more.status, more.body.code], [400, "naveen_over_cap"], "a new ₹0.01 Naveen payment: 400 naveen_over_cap");
    eq((await rows()).length, 1, "Naveen: one row");

    await reset();
    const cid2 = uuid();
    const burst = await Promise.all(Array.from({ length: 10 }, () => saveExpense(db, ARYAN, pay({ clientId: cid2, amount: NAVEEN_PER_PERSON }))));
    eq(burst.filter((r) => r.status === 201).length, 1, "10 concurrent Naveen copies at the limit: one 201");
    assert(burst.every((r) => r.status === 201 || r.status === 200), "10 concurrent Naveen copies: never reported as over the limit", burst.map((r) => r.status));
    eq((await rows()).length, 1, "10 concurrent Naveen copies: one row");
  }

  /* ---------------------------------------------------------------- Naveen payments can't include Riya, Rashi or Amisha */
  {
    await reset();
    const pay = (over: Record<string, unknown>) => expense({ description: "Naveen", naveenPayment: "direct", category: "stay", amount: 7000, ...over });
    const bad = await saveExpense(db, ARYAN, pay({ clientId: uuid(), splitAmong: ["Aryan", "Rashi"] }));
    eq([bad.status, bad.body.code], [400, "invalid"], "Naveen split with Rashi: 400 invalid");
    const ok = await saveExpense(db, ARYAN, pay({ clientId: uuid(), splitAmong: [...NAVEEN_MEMBERS], paidBy: "Amisha" }));
    eq(ok.status, 201, "Naveen split among the seven, paid by Amisha: 201");
    // A retry of an entry already stored is acknowledged even if today's rules would refuse it.
    const cid = uuid();
    await pg.insert(schema.expenses).values({ description: "old", amount: "700.00", dateTime: new Date("2026-12-18T05:00:00Z"), paidBy: "Aryan", type: "trip", splitAmong: ["Aryan", "Riya"], naveenPayment: "direct", clientId: cid });
    const old = await saveExpense(db, ARYAN, pay({ clientId: cid, splitAmong: ["Aryan", "Riya"], description: "old", amount: 700 }));
    eq(old.status, 200, "a stored entry is still acknowledged on retry");
  }

  /* ---------------------------------------------------------------- one client id, one entry (across kinds) */
  {
    await reset();
    const s = (over: Record<string, unknown> = {}) => ({ fromPerson: "Krish", toPerson: "Aryan", amount: 500, ...over });
    const cid = uuid();
    eq((await saveExpense(db, ARYAN, expense({ clientId: cid }))).status, 201, "expense with id X");
    const clash = await saveSettlement(db, KRISH, s({ clientId: cid }));
    eq([clash.status, clash.body.code], [400, "invalid"], "a settlement can't reuse an expense's id");
    const sid = uuid();
    eq((await saveSettlement(db, KRISH, s({ clientId: sid }))).status, 201, "settlement with id Y");
    const clash2 = await saveExpense(db, ARYAN, expense({ clientId: sid }));
    eq([clash2.status, clash2.body.code], [400, "invalid"], "an expense can't reuse a settlement's id");
    // Deleted expense X: an expense retry gets 410, a settlement with X is refused (not told "deleted").
    const [row] = await pg.select().from(schema.expenses);
    await deleteWithTombstone(pg, "expense", row.id, "Aryan");
    eq((await saveExpense(db, ARYAN, expense({ clientId: cid }))).status, 410, "expense retry after delete: 410");
    const afterDelete = await saveSettlement(db, KRISH, s({ clientId: cid }));
    eq([afterDelete.status, afterDelete.body.code], [400, "invalid"], "deleted expense's id can't become a settlement");
    eq((await pg.select().from(schema.settlements)).length, 1, "only the real settlement exists");
  }

  /* ---------------------------------------------------------------- settlements: same rules */
  {
    await reset();
    const s = (over: Record<string, unknown> = {}) => ({ fromPerson: "Krish", toPerson: "Aryan", amount: 500, note: "UPI", ...over });
    const cid = uuid();
    const first = await saveSettlement(db, KRISH, s({ clientId: cid, asPerson: "Krish" }));
    eq([first.status, first.body.clientId], [201, cid], "settlement: 201 with the clientId");
    const again = await saveSettlement(db, KRISH, s({ clientId: cid, asPerson: "Krish" }));
    eq([again.status, again.body.id, again.body.conflict], [200, first.body.id, undefined], "settlement retry: 200, same row");
    const burst = await Promise.all(Array.from({ length: 10 }, () => saveSettlement(db, KRISH, s({ clientId: cid }))));
    assert(burst.every((r) => r.status === 200 && r.body.id === first.body.id), "settlement: 10 concurrent retries return the same row");
    const changed = await saveSettlement(db, KRISH, s({ clientId: cid, amount: 900 }));
    eq([changed.status, changed.body.conflict, changed.body.amount], [200, true, "500.00"], "settlement changed body: stored row wins");
    eq((await pg.select().from(schema.settlements)).length, 1, "settlement: one row");
    const wrong = await saveSettlement(db, ARYAN, s({ clientId: uuid(), asPerson: "Krish" }));
    eq([wrong.status, wrong.body.code], [409, "wrong_user"], "settlement wrong person: 409");
    await deleteWithTombstone(pg, "settlement", first.body.id as number, "Aryan");
    const ghost = await saveSettlement(db, KRISH, s({ clientId: cid }));
    eq([ghost.status, ghost.body.code], [410, "deleted"], "settlement retry after delete: 410");
    eq((await pg.select().from(schema.settlements)).length, 0, "settlement: not added back");
    const old = await saveSettlement(db, KRISH, s());
    eq(old.status, 201, "settlement without clientId: 201 (old clients)");
  }

  console.log(`ok: ${checks} offline checks passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
