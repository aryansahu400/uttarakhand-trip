/**
 * Money-maths, analytics and validation tests. Exits non-zero on the first failure.
 *
 *   npx tsx scripts/test-settle.ts      (npm test)
 *
 * The timezone-sensitive tests (IST day bucketing, daily series, date validation) are re-run
 * automatically in child processes with TZ=UTC, TZ=America/Los_Angeles and TZ=Pacific/Kiritimati, so
 * an IST machine still catches a local-time regression (N11).
 *
 * Includes seeded fuzz/property tests (set SEED=... to reproduce a different run) and a parity fuzz of
 * the SQL Naveen-cap insert against the JS cap check, on an in-memory PGlite database.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  MAX_SPLIT,
  UNITS_PER_PAISA,
  computeBalances,
  expenseShares,
  lcmUpTo,
  paiseToDecimal,
  personalLends,
  settle,
  splitMembers,
  splitPaise,
  toPaise,
  unitScale,
  type ExpenseLite,
} from "../lib/balances";
import { NAVEEN_PER_PERSON_PAISE, naveenOverCap, naveenShares } from "../lib/naveen";
import { cell } from "../lib/csv";
import { PEOPLE, canDelete } from "../lib/people";
import { formatDate, formatINR, formatINR0, dayKeyIST, dayLabelIST, hourIST } from "../lib/format";
import { EMPTY_FILTERS, applyFilters, awards, dailySeries, dayKey, kpis, personalSummary, settlementStatus, shareOf, MAX_FILLED_DAYS } from "../lib/analytics";
import { expenseSchema, firstError, parseId, settlementSchema } from "../lib/validate";
import type { Expense, Settlement } from "../components/types";

/* ---------------------------------------------------------------- tiny test harness */
let checks = 0;
function assert(cond: unknown, msg: string, ...ctx: unknown[]): asserts cond {
  checks++;
  if (!cond) {
    console.error("FAIL:", msg, ...ctx.map((c) => JSON.stringify(c, (_, v) => (typeof v === "bigint" ? `${v}n` : v))));
    throw new Error(`Assertion failed: ${msg}`);
  }
}
const big = (_: string, v: unknown) => (typeof v === "bigint" ? `${v}n` : v);
const eq = (a: unknown, b: unknown, msg: string, ctx?: unknown) =>
  assert(JSON.stringify(a, big) === JSON.stringify(b, big), msg, { got: a, want: b, ...(ctx === undefined ? {} : { ctx }) });

/** Deterministic PRNG (mulberry32) so fuzz failures are reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = Number(process.env.SEED ?? 20261123);
const rand = rng(SEED);
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T>(xs: readonly T[]) => xs[int(0, xs.length - 1)];
const subset = (xs: readonly string[]) => {
  const s = xs.filter(() => rand() < 0.5);
  return s.length ? s : [pick(xs)];
};
const sumP = (m: Record<string, number>) => Object.values(m).reduce((s, v) => s + toPaise(v), 0);
const People = [...PEOPLE];
/** The original seven members (Riya, Rashi and Amisha joined later): older expenses are split among them. */
const Seven = People.slice(0, 7);

let nextId = 1;
const exp = (p: Omit<Partial<Expense>, "amount"> & { amount: string | number; paidBy: string }): Expense => ({
  id: nextId++,
  description: "t",
  dateTime: "2026-12-19T06:00:00.000Z",
  type: "trip",
  splitAmong: [],
  owedTo: null,
  naveenPayment: null,
  category: "other",
  createdBy: null,
  ...p,
  amount: String(p.amount),
});
const stl = (fromPerson: string, toPerson: string, amount: number | string): Settlement => ({
  id: nextId++,
  fromPerson,
  toPerson,
  amount: String(amount),
  note: null,
  createdAt: "2026-12-20T00:00:00.000Z",
  createdBy: null,
});
/** Turn suggested transfers into recorded settlements. */
const record = (ts: { from: string; to: string; amount: number }[]) => ts.map((t) => stl(t.from, t.to, t.amount));

/* ---------------------------------------------------------------- independent exact oracles (units = paise * UNITS_PER_PAISA = 2520) */
const U = BigInt(UNITS_PER_PAISA);
const membersOf = (split: readonly string[]) => [...new Set(split.length ? split : People)];
/** Exact net per person in units, written independently of lib/balances. */
function exactNetUnits(rows: ExpenseLite[], settlements: { fromPerson: string; toPerson: string; amount: number | string }[]) {
  const m: Record<string, bigint> = Object.fromEntries(People.map((p) => [p, 0n]));
  const add = (k: string, v: bigint) => (m[k] = (m[k] ?? 0n) + v);
  for (const e of rows) {
    const u = BigInt(toPaise(e.amount)) * U;
    if (e.type === "personal") {
      if (!e.owedTo) continue;
      add(e.paidBy, u);
      add(e.owedTo, -u);
      continue;
    }
    const mem = membersOf(e.splitAmong);
    add(e.paidBy, u);
    for (const p of mem) add(p, -u / BigInt(mem.length));
  }
  for (const s of settlements) {
    add(s.fromPerson, BigInt(toPaise(s.amount)) * U);
    add(s.toPerson, -BigInt(toPaise(s.amount)) * U);
  }
  return m;
}
/** Exact per-person Naveen units (oracle). */
function exactNaveenUnits(rows: { amount: number | string; type: string; splitAmong: string[]; naveenPayment?: string | null }[]) {
  const m: Record<string, bigint> = Object.fromEntries(People.map((p) => [p, 0n]));
  for (const e of rows) {
    if (e.type !== "trip" || !e.naveenPayment) continue;
    const mem = membersOf(e.splitAmong);
    for (const p of mem) m[p] = (m[p] ?? 0n) + (BigInt(toPaise(e.amount)) * U) / BigInt(mem.length);
  }
  return m;
}
/** Nearest paisa of exact units (half up). */
const nearestPaise = (u: bigint) => {
  const t = 2n * u + U, d = 2n * U;
  const q = t / d;
  return Number(t % d !== 0n && t < 0n ? q - 1n : q);
};
const absB = (x: bigint) => (x < 0n ? -x : x);

/* ---------------------------------------------------------------- original tests (kept) */
{
  const P = ["A", "B", "C"];
  const { net, total } = computeBalances(P, [{ amount: 300, paidBy: "A", type: "trip", splitAmong: P, owedTo: null }], []);
  assert(total === 300 && net.A === 200 && net.B === -100, "balances", net);
  const t = settle(net);
  assert(t.length === 2 && t.every((x) => x.to === "A" && x.amount === 100), "settle", t);
  const after = computeBalances(P, [{ amount: 300, paidBy: "A", type: "trip", splitAmong: P, owedTo: null }], [{ fromPerson: "B", toPerson: "A", amount: 100 }]);
  assert(after.net.B === 0 && after.net.A === 100, "settlement reduces", after.net);
  assert(after.settledPaid.B === 100 && after.settledReceived.A === 100 && after.settledPaid.A === 0, "settledPaid/Received", after);
  // Personal lends are included in the combined settle-up
  const withLend = computeBalances(
    P,
    [
      { amount: 300, paidBy: "A", type: "trip", splitAmong: P, owedTo: null },
      { amount: 100, paidBy: "B", type: "personal", splitAmong: [], owedTo: "C" },
    ],
    []
  );
  assert(withLend.net.A === 200 && withLend.net.B === 0 && withLend.net.C === -200, "lend in net", withLend.net);
  assert(withLend.total === 300 && withLend.lent.B === 100 && withLend.borrowed.C === 100, "lend not in trip total");
  const lt = settle(withLend.net);
  assert(lt.length === 1 && lt[0].from === "C" && lt[0].to === "A" && lt[0].amount === 200, "one combined transfer", lt);

  // Naveen cap: 21K per person
  const N = ["A", "B"];
  const base = [{ amount: 40000, type: "trip" as const, splitAmong: N, naveenPayment: "direct" as const }];
  assert(naveenShares(N, base).paid.A === 20000, "naveen share");
  assert(naveenOverCap(N, base, { amount: 2000, type: "trip", splitAmong: N, naveenPayment: "indirect" }).length === 0, "exactly 21K ok");
  const over = naveenOverCap(N, base, { amount: 1500, type: "trip", splitAmong: ["A"], naveenPayment: "indirect" });
  assert(over.length === 1 && over[0].person === "A" && over[0].over === 500, "over cap for A only", over);
  assert(naveenOverCap(N, base, { amount: 99999, type: "trip", splitAmong: N, naveenPayment: null }).length === 0, "non-naveen ignored");

  // Ownership: only who added it, or the admin
  const krish = { person: "Krish", isAdmin: false };
  const aryan = { person: "Aryan", isAdmin: true };
  assert(canDelete(krish, "Krish") === true, "own entry");
  assert(canDelete(krish, "Tejas") === false, "someone else's entry");
  assert(canDelete(krish, null) === false, "unowned entry: not for non-admin");
  assert(canDelete(aryan, "Tejas") === true && canDelete(aryan, null) === true, "admin can delete anything");
}

/* ---------------------------------------------------------------- F2: regression cases from QA */
{
  // splitPaise (single-expense whole-paise parts, used only for exactSum display) still sums exactly.
  const parts = splitPaise(10000, splitMembers(Seven, People));
  eq(parts.map(([, v]) => v), [1429, 1429, 1429, 1429, 1428, 1428, 1428], "100 / 7 whole-paise parts");
  eq(splitPaise(10000, splitMembers([], People)).map(([, v]) => v), Array(10).fill(1000), "100 / everyone (10) whole-paise parts");
  // Balances use the exact share 100/7 = 14.2857… for everyone (no one is charged the extra paise).
  const b = computeBalances(People, [exp({ amount: 100, paidBy: "Aryan", splitAmong: Seven })], []);
  assert(sumP(b.net) === 0, "100/7 nets sum to 0", b.net);
  assert(Seven.every((p) => b.share[p] === 14.29), "100/7 shares: exact 14.2857 shown as 14.29 for all", b.share);
  assert(["Riya", "Rashi", "Amisha"].every((p) => b.share[p] === 0 && b.net[p] === 0), "a split of the original seven leaves the new members out", b);
  const t = settle(b.net);
  const cleared = computeBalances(People, [exp({ amount: 100, paidBy: "Aryan", splitAmong: Seven })], record(t));
  assert(Object.values(cleared.net).every((v) => v === 0 && !Object.is(v, -0)), "100/7 fully cleared, no -0", cleared.net);
  // 8, 9 and 10-way splits (possible now there are 10 members) are exact too: lcm(1..10) = 2520 units per paisa.
  eq([MAX_SPLIT, UNITS_PER_PAISA, unitScale([10])], [10, 2520, 2520n], "the unit scale covers every split of the 10 members");
  for (const n of [8, 9, 10]) {
    const rows = [exp({ amount: 100, paidBy: "Riya", splitAmong: People.slice(0, n) })];
    const bn = computeBalances(People, rows, []);
    assert(sumP(bn.net) === 0, `100/${n} nets sum to 0`, bn.net);
    const exactU = exactNetUnits(rows, []);
    People.forEach((p) => assert(absB(BigInt(toPaise(bn.net[p])) * U - exactU[p]) < U, `100/${n} net within 1 paisa of exact`, p));
    eq(settle(computeBalances(People, rows, record(settle(bn.net))).net), [], `100/${n} clears after recording`);
  }

  // Rs 1000 paid by Aryan split 3 ways: exact share 333.333… each; nets rounded once, sum-preserving.
  const e3 = [exp({ amount: 1000, paidBy: "Aryan", splitAmong: ["Aryan", "Krish", "Tejas"] })];
  const b3 = computeBalances(People, e3, []);
  eq([b3.share.Aryan, b3.share.Krish, b3.share.Tejas], [333.33, 333.33, 333.33], "1000/3 shares (exact, rounded for display)");
  eq([b3.net.Aryan, b3.net.Krish, b3.net.Tejas], [666.67, -333.33, -333.34], "1000/3 nets: largest remainder, ties in PEOPLE order");
  const t3 = settle(b3.net);
  eq(t3, [{ from: "Tejas", to: "Aryan", amount: 333.34 }, { from: "Krish", to: "Aryan", amount: 333.33 }], "1000/3 transfers");
  const after3 = computeBalances(People, e3, record(t3));
  assert(Object.values(after3.net).every((v) => Object.is(v, 0)), "1000/3 cleared with +0 everywhere", after3.net);

  // QA minimal failing case.
  const m = [
    exp({ amount: 2.29, paidBy: "Tejas", splitAmong: ["Aryan", "Krish"] }),
    exp({ amount: 2.8, paidBy: "Krishnam", splitAmong: ["Aryan", "Shlok"] }),
    exp({ amount: 4.85, paidBy: "Sarthak", splitAmong: ["Anshul"] }),
  ];
  const tm = settle(computeBalances(People, m, []).net);
  eq(settle(computeBalances(People, m, record(tm)).net), [], "minimal case clears");
  eq(settlementStatus(m, record(tm)).pct, 1, "minimal case reaches 100%");
}

/* ---------------------------------------------------------------- F3: duplicates */
{
  const dup = computeBalances(People, [exp({ amount: 70, paidBy: "Krish", splitAmong: ["Krish", "Krish", "Tejas"] })], []);
  assert(dup.share.Krish === 35 && dup.share.Tejas === 35, "duplicate split names de-duplicated", dup.share);
  const n = naveenShares(People, [exp({ amount: 70, paidBy: "Krish", splitAmong: ["Tejas", "Krish", "Tejas"], naveenPayment: "direct" })]);
  assert(n.paid.Krish === 35 && n.paid.Tejas === 35, "naveen duplicates de-duplicated", n.paid);
  eq(splitMembers(["Tejas", "Krish", "Tejas", "Zed"], People), ["Krish", "Tejas", "Zed"], "splitMembers order + dedupe");
}

/* ---------------------------------------------------------------- F25: Naveen cap exactness */
{
  const all = People.map((p) => exp({ amount: 21000, paidBy: p, splitAmong: [p], naveenPayment: "direct" }));
  const nv = (amount: number | string, splitAmong: string[]) => ({ amount, type: "trip" as const, splitAmong, naveenPayment: "direct" as const });
  assert(naveenOverCap(People, [], nv(21000, ["Aryan"])).length === 0, "21000.00 allowed");
  assert(naveenOverCap(People, [], nv(21000.01, ["Aryan"])).length === 1, "21000.01 rejected");
  assert(naveenOverCap(People, [], nv(63000, ["Aryan", "Krish", "Tejas"])).length === 0, "63000 / 3 allowed");
  assert(naveenOverCap(People, [], nv(63000.01, ["Aryan", "Krish", "Tejas"])).length === 3, "63000.01 / 3 rejected (each 1/3 paisa over, no tolerance)");
  assert(naveenOverCap(People, [], nv(63000.03, ["Aryan", "Krish", "Tejas"])).length === 3, "63000.03 / 3 rejected");
  assert(naveenOverCap(People, all, nv(0.07, Seven)).length === 7, "0.07 / 7 on a full cap rejected");
  assert(naveenOverCap(People, all, nv(0.1, People)).length === 10, "0.10 / 10 on a full cap rejected");
  assert(naveenOverCap(People, all, nv(0.02, ["Aryan", "Krish", "Tejas"])).length === 3, "0.02 / 3 on a full cap: all three charged 0.0067 → rejected");
  eq(naveenOverCap(People, all, nv(0.02, ["Aryan", "Krish", "Tejas"]))[0].over, 0.01, "fractional overage rounds UP to 0.01 (never ₹0)");
  assert(naveenOverCap(People, all.slice(1), nv(0.01, ["Aryan"])).length === 0, "others full, Aryan still has room");
  // A legacy over-cap person doesn't block payments that don't charge them.
  const legacy = [exp({ amount: 22000, paidBy: "Aryan", splitAmong: ["Aryan"], naveenPayment: "direct" })];
  assert(naveenOverCap(People, legacy, nv(100, ["Krish"])).length === 0, "legacy over-cap row doesn't block others");
  assert(naveenOverCap(People, legacy, nv(100, ["Aryan"])).length === 1, "but does block more for that person");

  // F25 regression: realistic instalments must reach EXACTLY ₹21,000 for everyone (no rounding drift).
  const seq = (n: number, amount: number, split: string[]) => Array.from({ length: n }, () => exp({ amount, paidBy: "Aryan", splitAmong: split, naveenPayment: "direct" }));
  const three = ["Aryan", "Krish", "Tejas"];
  const four = ["Aryan", "Krish", "Tejas", "Anshul"];
  const eight = People.slice(0, 8);
  const nine = People.slice(0, 9);
  const cases: [string, Expense[], number, string[]][] = [
    ["14 x 10000 + 7000 split 7", seq(14, 10000, Seven), 7000, Seven],
    ["7 x 20000 + 7000 split 7", seq(7, 20000, Seven), 7000, Seven],
    ["29 x 5000 + 2000 split 7", seq(29, 5000, Seven), 2000, Seven],
    ["4 x 35000 + 7000 split 7", seq(4, 35000, Seven), 7000, Seven],
    ["63000 split 3 as 3 x 21000/3", seq(2, 21000, three), 21000, three],
    ["63000 split 3 in one go", [], 63000, three],
    ["3 x 27999.99/4 + 0.03/4", seq(3, 27999.99, four), 0.03, four], // 3 × 6999.9975 = 20999.9925, + 0.0075 = exactly 21,000
    ["146999.99 split 7 + 0.01 split 7", [exp({ amount: 146999.99, paidBy: "Aryan", splitAmong: Seven, naveenPayment: "direct" })], 0.01, Seven],
    ["1000 x 147 split 7", seq(146, 1000, Seven), 1000, Seven],
    ["21 x 10000 split 10", seq(20, 10000, People), 10000, People],
    ["209999.99 split 10 + 0.01 split 10", [exp({ amount: 209999.99, paidBy: "Aryan", splitAmong: People, naveenPayment: "direct" })], 0.01, People],
    ["3 x 62999.99/9 + 0.03/9", seq(3, 62999.99, nine), 0.03, nine], // 3 × 6999.99888… + 0.00333… = exactly 21,000
    ["8 x 21000 split 8", seq(7, 21000, eight), 21000, eight],
  ];
  for (const [label, rows, last, split] of cases) {
    const over = naveenOverCap(People, rows, nv(last, split));
    const exact = exactNaveenUnits([...rows, { ...nv(last, split) }]);
    const shouldPass = split.every((p) => exact[p] <= BigInt(NAVEEN_PER_PERSON_PAISE) * U);
    eq(over.length === 0, shouldPass, `instalments: ${label} matches exact oracle`);
  }
  for (const [label, rows, last, split] of cases) {
    eq(naveenOverCap(People, rows, nv(last, split)), [], `instalments: ${label} reaches exactly 21,000 and is accepted`);
    const paid = naveenShares(People, [...rows, exp({ amount: last, paidBy: "Aryan", splitAmong: split, naveenPayment: "direct" })]).paid;
    assert(split.every((p) => paid[p] === 21000), `instalments: ${label} shows ₹21,000`, paid);
    assert(naveenOverCap(People, [...rows, exp({ amount: last, paidBy: "Aryan", splitAmong: split, naveenPayment: "direct" })], nv(0.01, [split[split.length - 1]])).length === 1, `instalments: ${label} then +0.01 rejected`);
  }
  assert(naveenOverCap(People, seq(3, 27999.99, four), nv(0.04, four)).length === 4, "3 x 27999.99/4 + 0.04/4 → 21000.0025 each: rejected");
  for (const p of People) assert(naveenOverCap(People, [], nv(21000.01, [p])).length === 1, `21000.01 for ${p} rejected`);

  // N9: paid is the exact value rounded to the nearest paisa (0.29, 4.35 etc. must not lose a paisa).
  const odd = [0.29, 4.35, 1.15, 0.07, 2.01].map((a, i) => exp({ amount: a, paidBy: "Aryan", splitAmong: People.slice(0, (i % 7) + 1), naveenPayment: "indirect" }));
  const ns = naveenShares(People, odd);
  const ex = exactNaveenUnits(odd);
  People.forEach((p) => eq(toPaise(ns.paid[p]), nearestPaise(ex[p]), `naveen paid exact paise for ${p}`));
  eq(toPaise(ns.total), 29 + 435 + 115 + 7 + 201, "naveen total is the exact row sum");
  eq(naveenShares(People, [exp({ amount: 0.29, paidBy: "Aryan", splitAmong: ["Aryan"], naveenPayment: "direct" })]).paid.Aryan, 0.29, "0.29 stays 0.29");
}

/* ---------------------------------------------------------------- F16: expenseShares (display helper) */
{
  eq(expenseShares(exp({ amount: 100, paidBy: "Aryan", splitAmong: ["Tejas", "Aryan", "Krish"] }), People), [["Aryan", 33.33], ["Krish", 33.33], ["Tejas", 33.33]], "100/3 nearest");
  eq(expenseShares(exp({ amount: 100, paidBy: "Aryan", splitAmong: ["Tejas", "Aryan", "Krish"] }), People, { exactSum: true }), [["Aryan", 33.34], ["Krish", 33.33], ["Tejas", 33.33]], "100/3 exactSum");
  eq(expenseShares(exp({ amount: 99.99, paidBy: "Aryan", splitAmong: ["Aryan", "Krish"] }), People), [["Aryan", 50], ["Krish", 50]], "99.99/2 nearest (49.995 → 50.00)");
  eq(expenseShares(exp({ amount: 99.99, paidBy: "Aryan", splitAmong: ["Aryan", "Krish"] }), People, { exactSum: true }), [["Aryan", 50], ["Krish", 49.99]], "99.99/2 exactSum");
  eq(expenseShares(exp({ amount: 70, paidBy: "Aryan", splitAmong: [] }), People).length, People.length, "empty split = everyone (all 10)");
  eq(expenseShares(exp({ amount: 500, paidBy: "Aryan", type: "personal", owedTo: "Krish" }), People), [["Krish", 500]], "personal: borrower owes all");
  const bs = computeBalances(People, [exp({ amount: 100, paidBy: "Aryan", splitAmong: ["Aryan", "Krish", "Tejas"] })], []);
  eq(bs.share.Krish, expenseShares(exp({ amount: 100, paidBy: "Aryan", splitAmong: ["Aryan", "Krish", "Tejas"] }), People)[1][1], "expenseShares == balances share");
}

/* ---------------------------------------------------------------- N13: CSV formula injection */
{
  eq(cell("=1+1"), "'=1+1", "= prefixed");
  eq(cell('=HYPERLINK("http://x","click")'), `"'=HYPERLINK(""http://x"",""click"")"`, "formula with quotes/comma prefixed and quoted");
  eq(cell("+91 98"), "'+91 98", "+ prefixed");
  eq(cell("-cmd"), "'-cmd", "- text prefixed");
  eq(cell("@SUM(A1)"), "'@SUM(A1)", "@ prefixed");
  eq(cell("\tx"), "'\tx", "tab prefixed");
  eq(cell("-12.50"), "-12.50", "negative numeric string untouched");
  eq(cell(-12.5), "-12.5", "negative number untouched");
  eq(cell("Dinner, drinks"), '"Dinner, drinks"', "comma quoted");
  eq(cell(null), "", "null empty");
}

/* ---------------------------------------------------------------- N10: personal lends pairwise netting */
{
  const l = personalLends([
    exp({ amount: 100, paidBy: "Aryan", type: "personal", owedTo: "Krish" }),
    exp({ amount: 30, paidBy: "Krish", type: "personal", owedTo: "Aryan" }),
  ]);
  eq(l, [{ from: "Krish", to: "Aryan", amount: 70 }], "A lends B 100, B lends A 30 → single B→A 70");
  eq(personalLends([exp({ amount: 50, paidBy: "Aryan", type: "personal", owedTo: "Krish" }), exp({ amount: 50, paidBy: "Krish", type: "personal", owedTo: "Aryan" })]), [], "equal lends cancel");
}

/* ---------------------------------------------------------------- F16: formatting */
{
  const f = (n: number) => formatINR(n).replace(/ /g, " ");
  eq(f(27801.6), "₹27,801.60", "always 2 decimals");
  eq(f(1200), "₹1,200", "whole rupees: no decimals");
  eq(f(99.999), "₹100", "rounds to whole → no decimals");
  eq(f(-0), "₹0", "-0 → ₹0");
  eq(f(-0.001), "₹0", "tiny negative → ₹0");
  eq(f(-12.5), "-₹12.50", "negative 2dp");
  eq(f(110399.5), "₹1,10,399.50", "Indian grouping");
  eq(formatINR0(-0.07), "₹0", "formatINR0 never -₹0");
  eq(formatINR0(1234.5), "₹1,235", "formatINR0 rounds");
  eq(paiseToDecimal(100), "1.00", "paiseToDecimal");
  eq(paiseToDecimal(5), "0.05", "paiseToDecimal small");
  eq(paiseToDecimal(-1234567), "-12345.67", "paiseToDecimal negative");
}

/* ---------------------------------------------------------------- timezone-sensitive tests (re-run under several TZs) */
function tzTests() {
/* ---------------------------------------------------------------- F29: IST day bucketing (any device TZ) */
{
  const late = exp({ amount: 200, paidBy: "Krish", dateTime: "2026-12-18T18:45:00.000Z" }); // 00:15 IST, 19 Dec
  const owl = exp({ amount: 50, paidBy: "Tejas", dateTime: "2026-12-18T17:00:00.000Z" }); // 22:30 IST, 18 Dec
  eq(dayKeyIST(late.dateTime), "2026-12-19", "dayKeyIST after midnight IST");
  eq(dayKey(owl.dateTime), "2026-12-18", "dayKey 22:30 IST");
  eq(hourIST(owl.dateTime), 22, "hourIST");
  eq(dayLabelIST("2026-12-19"), "19 Dec", "dayLabel from key");
  eq(dayLabelIST(late.dateTime), "19 Dec", "dayLabel from instant");
  assert(/19 Dec 2026/.test(formatDate(late.dateTime)) && /12:15/.test(formatDate(late.dateTime)), "formatDate in IST", formatDate(late.dateTime));
  eq(applyFilters([late, owl], { ...EMPTY_FILTERS, from: "2026-12-19", to: "2026-12-19" }).map((e) => e.id), [late.id], "filter by IST day");
  const a = awards([late, owl]);
  const nightOwl = a.find((x) => x.title === "Night owl");
  assert(nightOwl && nightOwl.winner === "Krish & Tejas", "night owl uses IST hours (both late)", a);
  eq(dailySeries([late, owl]).map((d) => d.day), ["2026-12-18", "2026-12-19"], "daily series IST days");
  // Same instants evaluated as "midday IST" must stay on the same day.
  eq(dayKey("2026-12-19T23:59:59.999+05:30"), "2026-12-19", "end of IST day");
  eq(dayKey("2026-12-20T00:00:00.000+05:30"), "2026-12-20", "start of IST day");
}

/* ---------------------------------------------------------------- F24/F8: daily series + kpis */
{
  const trip = [1, 2, 3].map((d) => exp({ amount: 300, paidBy: "Aryan", dateTime: `2026-12-1${d}T06:00:00.000Z` }));
  const advance = exp({ amount: 100.5, paidBy: "Aryan", dateTime: "2026-11-23T06:00:00.000Z" });
  const k = kpis([...trip, advance]);
  assert(k.days === 4 && k.total === 1000.5 && k.avgDaily === 250.13, "avgDaily over distinct spend days", k);
  // F24: advance booking on 23 Nov with the trip on 11-13 Dec (20-day span) → only the 4 spend days.
  const withAdvance = dailySeries([...trip, advance]);
  assert(withAdvance.length === 4 && withAdvance[3].cumulative === 1000.5, "advance booking 18+ days earlier: only spend days", withAdvance.length);
  eq(MAX_FILLED_DAYS, 14, "fill limit is 14 days");
  const at = (d: string) => exp({ amount: 10, paidBy: "Aryan", dateTime: `${d}T06:00:00.000Z` });
  eq(dailySeries([at("2026-12-11"), at("2026-12-25")]).length, 15, "span of exactly 14 days: gaps filled (15 points)");
  eq(dailySeries([at("2026-12-11"), at("2026-12-26")]).length, 2, "span of 15 days: only spend days");
  eq(dailySeries([at("2026-12-18"), at("2026-12-23")]).map((d) => d.total), [10, 0, 0, 0, 0, 10], "a trip: empty days filled with 0");
  const far = exp({ amount: 1, paidBy: "Aryan", dateTime: "2025-01-01T06:00:00.000Z" });
  const sparse = dailySeries([...trip, far]);
  assert(sparse.length === 4, `span > ${MAX_FILLED_DAYS} days: only spend days`, sparse.length);
  eq(kpis([]), { total: 0, count: 0, share: 0, avgDaily: 0, days: 0, largest: null }, "empty kpis");
}

  // Date validation uses the IST year.
  const okD = { description: "Dinner", amount: 1, paidBy: "Krish", type: "trip", splitAmong: ["Krish"] };
  assert(expenseSchema.safeParse({ ...okD, dateTime: "2024-12-31T19:00:00Z" }).success, "2025-01-01 00:30 IST is in range");
  assert(!expenseSchema.safeParse({ ...okD, dateTime: "2030-12-31T19:00:00Z" }).success, "2031-01-01 00:30 IST is out of range");
}
tzTests();
if (process.env.TEST_TZ_ONLY) {
  console.log(`ok: ${checks} timezone checks passed (TZ=${process.env.TZ})`);
  process.exit(0);
}

/* ---------------------------------------------------------------- F27: settlement progress */
{
  const e = [exp({ amount: 300, paidBy: "Aryan", splitAmong: ["Aryan", "Krish", "Tejas"] })];
  eq(settlementStatus(e, []).pct, 0, "nothing paid → 0%");
  eq(settlementStatus(e, [stl("Krish", "Aryan", 100)]).pct, 0.5, "half paid → 50%");
  // Krish overpays 250 against a 100 debt: Tejas still owes 100 and Aryan now owes Krish 50 → 150 of 200 pending.
  eq(settlementStatus(e, [stl("Krish", "Aryan", 250)]).pct, 0.25, "overpayment isn't progress (was 62.5%)");
  // F27: a stray settlement with no expenses leaves 100 pending → 0%, never "100% settled".
  const stray = settlementStatus([], [stl("Krish", "Aryan", 100)]);
  assert(stray.pct === 0 && stray.pending === 100 && stray.transfers.length === 1, "stray settlement only → 0% with 100 pending", stray);
  eq(settlementStatus([], []).pct, 1, "nothing owed, nothing pending → 100%");
  const s = settlementStatus(e, [stl("Krish", "Aryan", 100), stl("Tejas", "Aryan", 100)]);
  assert(s.pct === 1 && s.pending === 0 && s.settled === 200 && s.transfers.length === 0, "fully settled", s);
}

/* ---------------------------------------------------------------- F28: award ties */
{
  const a = awards([exp({ amount: 100, paidBy: "Krish" }), exp({ amount: 100, paidBy: "Krishnam" })]);
  eq(a.find((x) => x.title === "Biggest spender")?.winner, "Krish & Krishnam", "tie → co-winners");
  eq(a.find((x) => x.title === "Most frequent payer")?.winner, "Krish & Krishnam", "count tie → co-winners");
  eq(awards([]), [], "no awards without data");
  // Everyone paid once: "Most frequent payer" would go to all 10, so it is not awarded at all.
  const everyone = People.map((p) => exp({ amount: 100, paidBy: p }));
  assert(!awards(everyone).some((x) => x.title === "Most frequent payer"), "no award when all members tie");
  assert(!awards(everyone).some((x) => x.title === "Biggest spender"), "no spender award when all paid the same");
}

/* ---------------------------------------------------------------- F23: shareOf */
{
  const rows = [
    exp({ amount: 700, paidBy: "Aryan", splitAmong: ["Aryan", "Krish"] }),
    exp({ amount: 5000, paidBy: "Tejas", type: "personal", owedTo: "Krish" }),
  ];
  eq(shareOf(rows, "Krish"), 350, "shareOf is the real share, lends excluded");
  eq(shareOf(rows, "Tejas"), 0, "shareOf for someone not in the split");
}

/* ---------------------------------------------------------------- Home: personalSummary */
{
  // Hand-checked scenario: Aryan pays 700 for the original seven; Krish pays 300 split Krish+Tejas;
  // Shlok lends Aryan 50; Tejas settles 100 to Aryan.
  const rows = [
    exp({ amount: 700, paidBy: "Aryan", splitAmong: Seven, category: "food", dateTime: "2026-12-18T15:00:00.000Z", createdBy: "Aryan" }),
    exp({ amount: 300, paidBy: "Krish", splitAmong: ["Krish", "Tejas"], category: "travel", dateTime: "2026-12-19T15:00:00.000Z", createdBy: "Krish" }),
    exp({ amount: 50, paidBy: "Shlok", type: "personal", owedTo: "Aryan", dateTime: "2026-12-20T15:00:00.000Z", createdBy: "Shlok" }),
  ];
  const sts = [stl("Tejas", "Aryan", 100)];
  const a = personalSummary("Aryan", rows, sts);
  eq([a.paid, a.share, a.lent, a.borrowed, a.settledPaid, a.settledReceived], [700, 100, 0, 50, 0, 100], "Aryan: breakdown figures");
  eq(a.net, 450, "Aryan: 700 - 100 - 50 - 100 = 450");
  eq(a.rounding, 0, "Aryan: breakdown adds up exactly");
  eq(a.netBeforeSettlements, 550, "Aryan: before the settlement he was owed 550");
  assert(Math.abs(a.settledPct - (1 - 450 / 550)) < 1e-12, "Aryan: settled share of his balance", a.settledPct);
  eq(a.getsFrom.reduce((s, t) => s + toPaise(t.amount), 0), toPaise(450), "Aryan: transfers to him add up to his balance");
  eq(a.paysTo, [], "Aryan pays nobody");
  eq(a.youOwePersonally, [{ from: "Aryan", to: "Shlok", amount: 50 }], "Aryan owes Shlok 50 personally");
  // Others' average paid: (300 + 0 * 8) / 9 = 33.33; Aryan paid 700 → 666.67 above, about 20x.
  eq(a.paidVsOthers.avg, 33.33, "others' average paid");
  eq(a.paidVsOthers.diff, 666.67, "difference vs others' average paid");
  assert(a.paidVsOthers.pct !== null && Math.abs(a.paidVsOthers.pct - (700 - 33.33) / 33.33) < 1e-12, "percent vs others' average", a.paidVsOthers);
  eq(a.payerRank, 1, "Aryan is the top payer");
  eq([a.tripCount, a.paidCount, a.added.expenses], [1, 1, 1], "Aryan: counts");
  eq(a.byCategory.find((c) => c.value === "food")?.amount, 100, "Aryan's share is all food");
  eq(a.daily.map((d) => d.share), [100], "Aryan's daily share");
  eq(a.recent.map((r) => r.role), ["borrowed", "paid"], "Aryan's recent activity, newest first");
  eq(a.recent[1].share, 100, "paid row also carries his share");
  // Tejas: share 100 (food) + 150 (travel) = 250, settled 100 → owes 150.
  const t = personalSummary("Tejas", rows, sts);
  eq([t.paid, t.share, t.settledPaid, t.net], [0, 250, 100, -150], "Tejas: owes 150 after settling 100");
  eq(t.paysTo.reduce((s, x) => s + toPaise(x.amount), 0), toPaise(150), "Tejas: his transfers add up to what he owes");
  eq(t.daily.map((d) => d.share), [100, 150], "Tejas: share per day (18, 19 Dec)");
  eq(t.payerRank, 3, "Tejas ties with the other zero payers behind Aryan and Krish");
  assert(t.payerRankTied, "Tejas's rank is shared");
  // Someone in nothing at all.
  const k = personalSummary("Krishnam", [], []);
  eq([k.paid, k.share, k.net, k.tripCount, k.settledPct], [0, 0, 0, 0, 1], "empty: nothing to settle");
  eq(k.paidVsOthers.pct, null, "empty: no percentage against a zero average");
}

/* ---------------------------------------------------------------- seeded fuzz: personalSummary */
{
  for (let i = 0; i < 300; i++) {
    const rows: Expense[] = Array.from({ length: int(0, 25) }, (_, j) =>
      rand() < 0.2
        ? exp({ amount: paiseToDecimal(int(1, 500000)), paidBy: pick(People), type: "personal", owedTo: pick(People), dateTime: `2026-12-${String(int(10, 28))}T${String(int(0, 23)).padStart(2, "0")}:00:00.000Z`, createdBy: pick(People) })
        : exp({ amount: paiseToDecimal(int(1, 2000000)), paidBy: pick(People), splitAmong: rand() < 0.4 ? [] : subset(People), category: pick(["food", "travel", "stay", "activities", "shopping", "other"]), dateTime: `2026-12-${String(int(10, 28))}T${String(int(0, 23)).padStart(2, "0")}:00:00.000Z`, createdBy: pick(People) })
    ).filter((e) => !(e.type === "personal" && e.owedTo === e.paidBy));
    const sts = Array.from({ length: int(0, 4) }, () => stl(pick(People), pick(People), paiseToDecimal(int(1, 300000))));
    const b = computeBalances(People, rows, sts);
    let netSum = 0;
    for (const p of People) {
      const s = personalSummary(p, rows, sts);
      const ctx = { i, p };
      eq(s.net, b.net[p], "home net == computeBalances net", ctx);
      assert(Math.abs(toPaise(s.rounding)) <= 1, "breakdown is within 1 paisa of the balance", ctx, s.rounding);
      netSum += toPaise(s.net);
      eq(s.paysTo.reduce((x, t) => x + toPaise(t.amount), 0), Math.max(0, -toPaise(s.net)), "pays-to adds up to what they owe", ctx);
      eq(s.getsFrom.reduce((x, t) => x + toPaise(t.amount), 0), Math.max(0, toPaise(s.net)), "gets-from adds up to what they are owed", ctx);
      const catP = s.byCategory.reduce((x, c) => x + toPaise(c.amount), 0);
      assert(Math.abs(catP - toPaise(s.share)) <= s.byCategory.length, "category shares add up to the share (±1 paisa each)", ctx);
      const dayP = s.daily.reduce((x, d) => x + toPaise(d.share), 0);
      assert(Math.abs(dayP - toPaise(s.share)) <= s.daily.length, "daily shares add up to the share (±1 paisa each)", ctx);
      const others = People.filter((q) => q !== p);
      const avgP = Math.round(others.reduce((x, q) => x + toPaise(b.spent[q]), 0) / others.length);
      eq(toPaise(s.paidVsOthers.avg), avgP, "others' average paid", ctx);
      assert(s.settledPct >= 0 && s.settledPct <= 1, "settled % in [0,1]", ctx, s.settledPct);
      assert(s.payerRank >= 1 && s.payerRank <= People.length, "rank in range", ctx);
      assert(s.recent.length <= 6 && s.recent.every((r, j) => j === 0 || Date.parse(s.recent[j - 1].expense.dateTime) >= Date.parse(r.expense.dateTime)), "recent: newest first, at most 6", ctx);
    }
    eq(netSum, 0, "everyone's home balances sum to 0", { i });
  }
}

/* ---------------------------------------------------------------- F3/F7/F8: validation */
{
  const ok = {
    description: "Dinner",
    amount: 120.5,
    dateTime: "2026-12-19T10:00:00.000Z",
    paidBy: "Krish",
    type: "trip",
    splitAmong: ["Krish", "Tejas"],
  };
  const bad = (patch: Record<string, unknown>, expect: RegExp, label: string) => {
    const r = expenseSchema.safeParse({ ...ok, ...patch });
    assert(!r.success, `${label}: rejected`, patch);
    assert(expect.test(firstError(r.error)), `${label}: message`, firstError(r.error));
  };
  const good = expenseSchema.safeParse(ok);
  assert(good.success && good.data.amount === 120.5 && good.data.dateTime instanceof Date, "valid expense passes", good);
  assert(expenseSchema.safeParse({ ...ok, amount: 0.01 }).success, "0.01 allowed");
  assert(expenseSchema.safeParse({ ...ok, paidBy: "Amisha", splitAmong: ["Riya", "Rashi", "Amisha"] }).success, "new members can pay and be in a split");
  assert(expenseSchema.safeParse({ ...ok, amount: 0.1 + 0.2 }).success, "float noise (0.30000000000000004) allowed");
  assert(expenseSchema.safeParse({ ...ok, dateTime: "2026-12-19T10:00:00+05:30" }).success, "offset date allowed");
  bad({ amount: 0.004 }, /2 decimal/, "0.004");
  bad({ amount: 10.005 }, /2 decimal/, "10.005");
  bad({ amount: 0 }, /at least/, "zero");
  bad({ amount: -5 }, /at least/, "negative");
  bad({ amount: 10_000_000.01 }, /at most/, "too big");
  bad({ amount: "5" }, /must be a number/, "string amount");
  bad({ amount: true }, /must be a number/, "boolean amount");
  bad({ amount: [5] }, /must be a number/, "array amount");
  bad({ splitAmong: ["Krish", "Krish", "Tejas"] }, /only be in the split once/, "duplicate split");
  bad({ splitAmong: ["Bob"] }, /trip members/, "unknown person in split");
  bad({ paidBy: "Bob" }, /Paid by/, "unknown payer");
  bad({ dateTime: null }, /ISO/, "null date");
  bad({ dateTime: 0 }, /ISO/, "numeric date");
  bad({ dateTime: true }, /ISO/, "boolean date");
  bad({ dateTime: "2026-12-19" }, /ISO/, "date without time");
  bad({ dateTime: "1970-01-01T00:00:00Z" }, /between 2025 and 2030/, "1970");
  bad({ dateTime: "2031-01-01T00:00:00Z" }, /between 2025 and 2030/, "2031");
  bad({ description: "   " }, /Description/, "blank description");
  bad({ type: "personal", owedTo: "Krish", splitAmong: [] }, /yourself/, "lend to self");
  bad({ naveenPayment: "direct", type: "personal", owedTo: "Tejas", splitAmong: [] }, /Naveen/, "naveen must be trip");
  bad({ description: "ZZTEST a\u0000b" }, /invalid characters/, "NUL in description (N2)");
  bad({ description: "a\u001bb" }, /invalid characters/, "ESC in description");
  bad({ description: 5 }, /must be text/, "numeric description (N19)");
  bad({ description: undefined }, /Description is required/, "missing description");
  bad({ amount: 1e308 }, /at most/, "1e308 says at most (N19)");
  bad({ amount: -1e308 }, /at least/, "-1e308 says at least");
  assert(!settlementSchema.safeParse({ fromPerson: "Krish", toPerson: "Tejas", amount: 1, note: "a\u0000" }).success, "NUL in note rejected");
  assert(settlementSchema.safeParse({ fromPerson: "Krish", toPerson: "Tejas", amount: 1, note: "line 1\nline 2" }).success, "newline in note ok");
  const nb = expenseSchema.safeParse(null);
  assert(!nb.success && /JSON object/.test(firstError(nb.error)), "null body message", nb);

  const s = settlementSchema.safeParse({ fromPerson: "Krish", toPerson: "Krish", amount: 5 });
  assert(!s.success && firstError(s.error) === "From and To must differ", "settlement self", s);
  assert(!settlementSchema.safeParse({ fromPerson: "Krish", toPerson: "Tejas", amount: 1.235 }).success, "settlement 3dp rejected");
  assert(settlementSchema.safeParse({ fromPerson: "Krish", toPerson: "Tejas", amount: 1.23, note: "" }).success, "settlement ok");

  eq(["1", "42", "2147483647"].map(parseId), [1, 42, 2147483647], "valid ids");
  eq(["0", "-1", "1e3", "0x10", "2147483648", "99999999999", "01", "1.0", "", " 1"].map(parseId), Array(10).fill(null), "invalid ids");
}

/* ---------------------------------------------------------------- seeded fuzz: balances / settle / analytics */
{
  const SCENARIOS = 3000;
  for (let i = 0; i < SCENARIOS; i++) {
    const rows: Expense[] = [];
    const n = int(1, 12);
    for (let j = 0; j < n; j++) {
      const amount = paiseToDecimal(rand() < 0.3 ? int(1, 999) : int(1, 5_000_000));
      if (rand() < 0.2) {
        const payer = pick(People);
        const owed = pick(People.filter((p) => p !== payer));
        rows.push(exp({ amount, paidBy: payer, type: "personal", owedTo: owed }));
      } else {
        // occasionally include duplicates / empty (= everyone) to exercise the defensive paths
        const split = rand() < 0.1 ? [] : rand() < 0.1 ? [...subset(People), pick(People)] : subset(People);
        rows.push(exp({ amount, paidBy: pick(People), splitAmong: split, dateTime: new Date(Date.UTC(2026, 11, 15) + int(0, 10 * 86400) * 1000).toISOString() }));
      }
    }
    // Some random partial settlements too.
    const settlements = Array.from({ length: int(0, 3) }, () => {
      const from = pick(People);
      return stl(from, pick(People.filter((p) => p !== from)), paiseToDecimal(int(1, 1_000_000)));
    });
    const ctx = { seed: SEED, i };

    const b = computeBalances(People, rows, settlements);
    assert(sumP(b.net) === 0, "nets sum to exactly 0", ctx, b.net);
    const tripP = rows.filter((e) => e.type === "trip").reduce((s, e) => s + toPaise(e.amount), 0);
    assert(toPaise(b.total) === tripP, "total is the trip sum", ctx);
    // Shares are exact values rounded for display: within half a paisa each of the exact share.
    assert(Math.abs(sumP(b.share) - tripP) <= People.length / 2, "display shares sum to trip total ± rounding", ctx);
    // Nets: each within 1 paisa of the exact (units) value, and sum to exactly 0.
    const exactU = exactNetUnits(rows, settlements);
    People.forEach((p) => assert(absB(BigInt(toPaise(b.net[p])) * U - exactU[p]) < U, "net within 1 paisa of exact", ctx, p));
    assert(Object.values(b.net).every((v) => Number.isInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6), "nets are whole paise", ctx);

    const t = settle(b.net);
    const nonZero = Object.values(b.net).filter((v) => v !== 0).length;
    assert(t.length <= Math.max(0, nonZero - 1), "transfers <= n-1", ctx, t);
    assert(t.every((x) => x.amount > 0 && x.from !== x.to), "transfers positive, no self", ctx, t);
    const done = computeBalances(People, rows, [...settlements, ...record(t)]);
    assert(Object.values(done.net).every((v) => Object.is(v, 0)), "recording suggestions clears everything (+0)", ctx, done.net);
    eq(settle(done.net), [], `nothing pending after recording (#${i})`);

    const st = settlementStatus(rows, settlements);
    assert(st.pct >= 0 && st.pct <= 1, "pct in [0,1]", ctx, st.pct);
    assert(settlementStatus(rows, [...settlements, ...record(t)]).pct === 1, "pct 100% after recording", ctx);

    People.forEach((p) => assert(shareOf(rows, p) === b.share[p], "shareOf == computeBalances share", ctx, p));

    // N10: pairwise-net oracle for personal lends.
    const pair = new Map<string, number>(); // "A|B" (A<B) → sum(A lent B) - sum(B lent A), paise
    for (const e of rows) {
      if (e.type !== "personal" || !e.owedTo) continue;
      const [a, c] = [e.paidBy, e.owedTo].sort();
      const sign = a === e.paidBy ? 1 : -1;
      pair.set(`${a}|${c}`, (pair.get(`${a}|${c}`) ?? 0) + sign * toPaise(e.amount));
    }
    const wantL = [...pair].filter(([, v]) => v !== 0).map(([k, v]) => {
      const [a, c] = k.split("|");
      return v > 0 ? `${c}>${a}:${v}` : `${a}>${c}:${-v}`; // debtor>creditor
    }).sort();
    const gotL = personalLends(rows).map((x) => `${x.from}>${x.to}:${toPaise(x.amount)}`).sort();
    eq(gotL, wantL, `personal lends pairwise-net oracle (#${i})`);

    const series = dailySeries(rows);
    if (series.length) assert(toPaise(series[series.length - 1].cumulative) === rows.reduce((s, e) => s + toPaise(e.amount), 0), "daily cumulative == sum", ctx);
  }
}

/* ---------------------------------------------------------------- F2 fairness: no systematic drift */
{
  // 10,000 random small splits among everyone (10 people, amounts 0.01..9.99) paid by random people, settled as one trip.
  const rows: Expense[] = Array.from({ length: 10_000 }, () => exp({ amount: paiseToDecimal(int(1, 999)), paidBy: pick(People), splitAmong: [] }));
  const b = computeBalances(People, rows, []);
  const exactU = exactNetUnits(rows, []);
  const drift = People.map((p) => Number(absB(BigInt(toPaise(b.net[p])) * U - exactU[p])) / UNITS_PER_PAISA);
  assert(Math.max(...drift) < 1, "max |net drift| < 1 paisa per person over 10,000 splits", drift);
  assert(sumP(b.net) === 0, "10,000 splits: nets sum to 0");
  const t = settle(b.net);
  eq(settle(computeBalances(People, rows, record(t)).net), [], "10,000 splits: settle then record clears");
  // Shares: everyone in all rows → identical shares, nobody pays the leftover paise every time.
  assert(People.every((p) => b.share[p] === b.share.Aryan), "equal shares for everyone", b.share);
  // Unknown names (legacy rows) beyond the 10 members still split exactly (scale = lcm(1..n)).
  const big = [...People, "Zed", "Yan", "Xi"];
  eq([lcmUpTo(10), lcmUpTo(13)], [2520n, 360360n], "lcm(1..10), lcm(1..13)");
  const bb = computeBalances(People, [exp({ amount: 100, paidBy: "Aryan", splitAmong: big })], []);
  assert(sumP(bb.net) === 0 && bb.share.Zed === 7.69, "13-way legacy split exact", bb);
}

/* ---------------------------------------------------------------- seeded fuzz: Naveen cap is exact */
{
  for (let i = 0; i < 3000; i++) {
    const existing = Array.from({ length: int(0, 6) }, () =>
      exp({ amount: paiseToDecimal(int(1, 4_000_000)), paidBy: pick(People), splitAmong: subset(People), naveenPayment: pick(["direct", "indirect"] as const) })
    );
    const next = { amount: paiseToDecimal(int(1, 3_000_000)), type: "trip" as const, splitAmong: subset(People), naveenPayment: "direct" as const };
    // Exact oracle (units = paise * UNITS_PER_PAISA), checked only for people `next` charges.
    const after = exactNaveenUnits([...existing, next]);
    const charged = membersOf(next.splitAmong);
    const want = charged.filter((p) => after[p] > BigInt(NAVEEN_PER_PERSON_PAISE) * U).sort();
    const got = naveenOverCap(People, existing, next).map((o) => o.person).sort();
    eq(got, want, `naveen cap oracle (#${i})`);
    // N9: displayed paid == exact rounded to the nearest paisa, for every person.
    const before = exactNaveenUnits(existing);
    const shown = naveenShares(People, existing);
    People.forEach((p) => assert(toPaise(shown.paid[p]) === nearestPaise(before[p]), "naveen paid paise == exact oracle", { i, p }));
    eq(toPaise(shown.total), existing.reduce((s, e) => s + toPaise(e.amount), 0), `naveen total exact (#${i})`);
  }
}

/* ---------------------------------------------------------------- SQL Naveen cap == JS Naveen cap (PGlite) */
async function sqlParity() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { sql } = await import("drizzle-orm");
  const { insertNaveenWithinCap } = await import("../app/api/expenses/naveen-insert");
  const schema = await import("../db/schema");

  const db = drizzle(new PGlite(), { schema }); // in-memory, throwaway
  await migrate(db, { migrationsFolder: path.join(__dirname, "..", "drizzle") });
  const dbl = db as unknown as Parameters<typeof insertNaveenWithinCap>[0];

  const tryInsert = (amount: string, splitAmong: string[]) =>
    insertNaveenWithinCap(
      dbl,
      {
        description: "fuzz",
        amount,
        paise: toPaise(amount),
        dateTime: new Date("2026-12-19T06:00:00Z"),
        paidBy: "Aryan",
        splitAmong,
        naveenPayment: "direct",
        category: "other",
        createdBy: "Aryan",
      },
      PEOPLE
    );
  const existingRows = async () =>
    (await db.select().from(schema.expenses)).map((r) => ({ ...r, splitAmong: r.splitAmong as string[] }));

  // Exact boundaries.
  assert((await tryInsert("21000.00", ["Aryan"])) !== null, "SQL: 21000.00 allowed");
  assert((await tryInsert("0.01", ["Aryan"])) === null, "SQL: 1 paisa over rejected");
  assert((await tryInsert("63000.00", ["Krish", "Tejas", "Anshul"])) !== null, "SQL: 63000 / 3 allowed");
  assert((await tryInsert("0.02", ["Shlok", "Sarthak", "Krish"])) === null, "SQL: 0.02/3 charges full Krish 0.0067 → rejected");
  assert((await tryInsert("0.03", ["Shlok", "Sarthak", "Krishnam"])) !== null, "SQL: 0.03/3 for people with room");

  // F25: instalment patterns reach exactly ₹21,000 in SQL too, and 1 more paisa is rejected.
  const three = ["Aryan", "Krish", "Tejas"];
  const instalments: [string, number, string, string[]][] = [
    ["14 x 10000 + 7000 / 7", 14, "10000.00", Seven],
    ["7 x 20000 + 7000 / 7", 7, "20000.00", Seven],
    ["29 x 5000 + 2000 / 7", 29, "5000.00", Seven],
    ["4 x 35000 + 7000 / 7", 4, "35000.00", Seven],
    ["63000 / 3 in one go", 1, "63000.00", three],
    ["3 x 21000 / 3", 3, "21000.00", three],
    ["20 x 10000 + 10000 / 10", 20, "10000.00", People],
    ["3 x 62999.99 + 0.03 / 9", 3, "62999.99", People.slice(0, 9)],
  ];
  for (const [label, n, amt, split] of instalments) {
    await db.execute(sql`DELETE FROM expenses`);
    for (let k = 0; k < n; k++) assert((await tryInsert(amt, split)) !== null, `SQL instalments ${label}: #${k + 1} accepted`);
    const total = BigInt(NAVEEN_PER_PERSON_PAISE) * BigInt(split.length) - BigInt(n) * BigInt(toPaise(amt));
    if (total > 0n) assert((await tryInsert(paiseToDecimal(Number(total)), split)) !== null, `SQL instalments ${label}: final payment accepted`);
    const paid = naveenShares(PEOPLE, await existingRows()).paid;
    assert(split.every((p) => paid[p] === 21000), `SQL instalments ${label}: exactly 21,000`, paid);
    assert((await tryInsert("0.01", [split[split.length - 1]])) === null, `SQL instalments ${label}: +0.01 rejected`);
    assert((await tryInsert("0.01", split)) === null, `SQL instalments ${label}: +0.01 split rejected`);
  }

  // Fuzz: random existing rows (inserted raw, may even contain duplicates / be over cap), random candidate.
  let accepted = 0, rejected = 0;
  for (let i = 0; i < 600; i++) {
    if (i % 25 === 0) await db.execute(sql`DELETE FROM expenses`);
    if (rand() < 0.5) {
      const split = rand() < 0.15 ? [] : rand() < 0.15 ? [...subset(People), pick(People)] : subset(People);
      // Mix of round instalments (which must land exactly on the cap) and random paise amounts.
      const seedAmt = rand() < 0.4 ? pick([1000, 2000, 5000, 7000, 10000, 20000, 21000, 35000, 63000]) * 100 * (rand() < 0.5 ? 1 : split.length || 7) / 7 : int(1, 3_000_000);
      await db.insert(schema.expenses).values({
        description: "seed",
        amount: paiseToDecimal(Math.round(seedAmt)),
        dateTime: new Date("2026-12-19T06:00:00Z"),
        paidBy: "Aryan",
        type: "trip",
        splitAmong: split,
        naveenPayment: pick(["direct", "indirect"] as const),
      });
    }
    const split = subset(People);
    // Candidates near the boundary: tiny amounts, random, or exactly what fills someone's remaining room.
    const rows0 = await existingRows();
    const room = Number(BigInt(NAVEEN_PER_PERSON_PAISE) * BigInt(split.length) - exactNaveenUnits(rows0)[split[0]] * BigInt(split.length) / U);
    const r = rand();
    const amount = paiseToDecimal(r < 0.3 ? int(1, 20) : r < 0.55 && room > 0 ? room + int(-1, 1) || 1 : int(1, 3_000_000));
    const before = await existingRows();
    const expectOk = naveenOverCap(PEOPLE, before, { amount, type: "trip", splitAmong: split, naveenPayment: "direct" }).length === 0;
    const id = await tryInsert(amount, split);
    assert((id !== null) === expectOk, "SQL cap == JS cap", { seed: SEED, i, amount, split, before: before.map((r) => [r.amount, r.splitAmong]) });
    if (id !== null) accepted++;
    else rejected++;
  }
  assert(accepted > 20 && rejected > 20, "SQL fuzz exercised both outcomes", { accepted, rejected });

  // N14: the insert pins READ COMMITTED itself, even if the database default is stricter.
  await db.execute(sql`SET default_transaction_isolation = 'repeatable read'`);
  // Concurrency: 5 simultaneous 1-paisa payments when only 2 paise of room are left → exactly 2 succeed.
  await db.execute(sql`DELETE FROM expenses`);
  assert((await tryInsert("20999.98", ["Aryan"])) !== null, "SQL: 20999.98 seeded");
  const results = await Promise.all(Array.from({ length: 5 }, () => tryInsert("0.01", ["Aryan"])));
  eq(results.filter((r) => r !== null).length, 2, "SQL: concurrent inserts stop exactly at the cap");
  const total = (await existingRows()).reduce((s, r) => s + toPaise(r.amount), 0);
  eq(total, NAVEEN_PER_PERSON_PAISE, "SQL: Aryan ends at exactly ₹21,000.00");
  await db.execute(sql`RESET default_transaction_isolation`);
  // Legacy 13-person split (3 unknown names) still exact in SQL: scale becomes lcm(1..13) = 360360.
  await db.execute(sql`DELETE FROM expenses`);
  const thirteen = [...PEOPLE, "Zed", "Yan", "Xi"];
  await db.insert(schema.expenses).values({ description: "legacy", amount: "272999.99", dateTime: new Date("2026-12-19T06:00:00Z"), paidBy: "Aryan", type: "trip", splitAmong: thirteen, naveenPayment: "direct" });
  const legacyRows = await existingRows();
  // 272999.99 / 13 leaves everyone 1/13 paisa short of the cap, so 0.01 split 13 ways fills it exactly.
  const legacyCases: [string, string[], boolean][] = [["0.01", ["Aryan"], false], ["0.01", [...thirteen], true], ["0.02", [...thirteen], false], ["0.02", ["Krish", "Zed"], false]];
  for (const [amt, split, ok] of legacyCases) {
    const expectOk = naveenOverCap(PEOPLE, legacyRows, { amount: amt, type: "trip", splitAmong: split, naveenPayment: "direct" }).length === 0;
    eq(expectOk, ok, "JS cap on a legacy 13-way split", { amt, split });
    const id = await tryInsert(amt, split);
    assert((id !== null) === expectOk, "SQL == JS for a legacy 13-way split", { amt, split, expectOk });
    if (id !== null) await db.execute(sql`DELETE FROM expenses WHERE id = ${id}`);
  }

  // Migration 0006: an old "everyone" row (empty split) keeps meaning the original seven now that Riya,
  // Rashi and Amisha have joined. Re-run its SQL on such a row, a lend and a row with named people.
  await db.execute(sql`DELETE FROM expenses`);
  const at = { dateTime: new Date("2026-12-19T06:00:00Z"), paidBy: "Aryan" };
  await db.insert(schema.expenses).values([
    { ...at, description: "old everyone", amount: "700.00", type: "trip", splitAmong: [] },
    { ...at, description: "lend", amount: "50.00", type: "personal", splitAmong: [], owedTo: "Krish" },
    { ...at, description: "named", amount: "30.00", type: "trip", splitAmong: ["Riya", "Aryan"] },
  ]);
  const m0006 = fs.readFileSync(path.join(__dirname, "..", "drizzle", "0006_freeze_everyone_splits.sql"), "utf8");
  for (const stmt of m0006.split("--> statement-breakpoint")) if (stmt.trim()) await db.execute(sql.raw(stmt));
  const migrated = await existingRows();
  const splitOf = (d: string) => migrated.find((r) => r.description === d)?.splitAmong;
  eq(splitOf("old everyone"), Seven, "0006: an empty trip split becomes the original seven");
  eq([splitOf("lend"), splitOf("named")], [[], ["Riya", "Aryan"]], "0006: lends and named splits are untouched");
  const shares = computeBalances(People, migrated, []).share;
  eq([shares.Aryan, shares.Krish, shares.Riya, shares.Amisha], [115, 100, 15, 0], "0006: new members owe nothing for old everyone rows");
  console.log(`  SQL parity: ${accepted} accepted, ${rejected} rejected — all matched the JS cap`);
}

/** N11: re-run the timezone-sensitive tests under other device timezones (child processes). */
function otherTimezones() {
  const tsx = path.join(__dirname, "..", "node_modules", ".bin", "tsx");
  for (const tz of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati"]) {
    const r = spawnSync(tsx, [__filename], { env: { ...process.env, TZ: tz, TEST_TZ_ONLY: "1" }, stdio: "inherit" });
    assert(r.status === 0, `timezone tests pass under TZ=${tz}`, { status: r.status, error: r.error?.message });
  }
}

sqlParity()
  .then(() => {
    otherTimezones();
    console.log(`ok: ${checks} checks passed (seed ${SEED}, TZ=${process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone})`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
