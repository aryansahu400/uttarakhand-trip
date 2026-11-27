import { PEOPLE } from "./people";

export type ExpenseLite = {
  amount: number | string;
  paidBy: string;
  type: "trip" | "personal";
  splitAmong: string[];
  owedTo: string | null;
};
export type SettlementLite = { fromPerson: string; toPerson: string; amount: number | string };
export type Transfer = { from: string; to: string; amount: number };

/* ------------------------------------------------------------------------------------------------
 * Money model.
 *
 * Amounts are stored as rupees with 2 decimals, i.e. whole paise. An equal split of P paise among n
 * people is P/n paise each, which is usually NOT a whole paisa. Instead of rounding every share
 * (which always favours/penalises the same people), every share is kept EXACT as an integer number of
 * "units", where 1 paisa = UNITS_PER_PAISA units:
 *
 *   UNITS_PER_PAISA = lcm(1..MAX_SPLIT)   →   P * UNITS_PER_PAISA / n is an integer for every split
 *   size n ≤ MAX_SPLIT, where MAX_SPLIT = PEOPLE.length (10 people → lcm(1..10) = 2520).
 *
 * Validation restricts split names to PEOPLE and removes duplicates, so n ≤ MAX_SPLIT always holds
 * for new rows. If an old row somehow has more distinct names (unknown names), the scale becomes
 * lcm(1..maxN) instead (see unitScale), which keeps every share exact. All unit maths uses BigInt so
 * no scale can overflow.
 *
 * Rounding to paise happens ONCE, at the end:
 *   - net balances: sum-preserving largest remainder over people (see roundNets), so the rounded nets
 *     sum to exactly 0 and each is within 1 paisa of the exact value — nobody pays systematically more;
 *   - shares / Naveen paid: exact value rounded to the nearest paisa (display only).
 * The Naveen cap SQL (app/api/expenses/naveen-insert.ts) uses the same units formula.
 * ---------------------------------------------------------------------------------------------- */

/** The most people a validated split can have: every trip member. */
export const MAX_SPLIT: number = PEOPLE.length;

/** Rupees (number or a numeric(12,2) string from the DB) -> integer paise. */
export const toPaise = (v: number | string) => {
  const p = Math.round(Number(v) * 100);
  return Number.isFinite(p) ? p || 0 : 0;
};

/** Integer paise -> rupees, normalising -0 to 0. */
export const toRupees = (p: number) => p / 100 || 0;

/** Integer paise -> exact "1234.56" string for numeric(12,2) columns (avoids toFixed's float quirks). */
export const paiseToDecimal = (p: number) => {
  const sign = p < 0 ? "-" : "";
  const a = Math.abs(p);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
};

/**
 * The people an expense is split between: duplicates removed (defensive: old rows may contain them),
 * an empty list meaning "everyone", ordered by `people` order (names not in `people` go last, in the
 * order they first appear).
 */
export function splitMembers(splitAmong: readonly string[], people: readonly string[]): string[] {
  const src = splitAmong.length ? splitAmong : people;
  const uniq = [...new Set(src)];
  const rank = (p: string) => {
    const i = people.indexOf(p);
    return i === -1 ? people.length + uniq.indexOf(p) : i;
  };
  return uniq.sort((a, b) => rank(a) - rank(b));
}

/**
 * Whole-paise equal split by largest remainder within ONE expense (parts sum to exactly `paise`;
 * the leftover paise go to the first members in order). Not used for balances any more (that would
 * bias the same people on every row); only for showing parts of a single expense that add up exactly.
 */
export function splitPaise(paise: number, members: readonly string[]): [string, number][] {
  const n = members.length;
  if (!n) return [];
  const base = Math.floor(paise / n);
  const rem = paise - base * n; // 0 <= rem < n, also for negative amounts
  return members.map((p, i) => [p, base + (i < rem ? 1 : 0)]);
}

/* ---------------------------------------------------------------- exact unit helpers */

const gcd = (a: bigint, b: bigint): bigint => {
  while (b) [a, b] = [b, a % b];
  return a;
};
const lcmCache: bigint[] = [1n, 1n];
/** lcm(1..n) as a BigInt (lcm(1..7) = 420n, lcm(1..10) = 2520n). */
export function lcmUpTo(n: number): bigint {
  for (let k = lcmCache.length; k <= n; k++) {
    const prev = lcmCache[k - 1];
    lcmCache[k] = (prev * BigInt(k)) / gcd(prev, BigInt(k));
  }
  return lcmCache[Math.max(1, n)];
}

/** Units per paisa for any split of the trip members: lcm(1..MAX_SPLIT), 2520 for 10 people. */
export const UNITS_PER_PAISA = Number(lcmUpTo(MAX_SPLIT));

/**
 * Units per paisa for a set of split sizes: lcm(1..max(MAX_SPLIT, largest n)). This is exactly
 * UNITS_PER_PAISA whenever every split has at most MAX_SPLIT distinct people (always true for
 * validated rows); larger only for legacy rows with unknown names, and still exact.
 */
export function unitScale(splitSizes: Iterable<number>): bigint {
  let max = MAX_SPLIT;
  for (const n of splitSizes) if (n > max) max = n;
  return lcmUpTo(max);
}

/** floor(a / b) for b > 0 (BigInt division truncates toward zero). */
export const floorDiv = (a: bigint, b: bigint) => {
  const q = a / b;
  return a % b !== 0n && a < 0n ? q - 1n : q;
};

/** Exact units -> nearest whole paisa (halves round up). */
export const unitsToPaise = (u: bigint, scale: bigint) => Number(floorDiv(2n * u + scale, 2n * scale));

/**
 * Sum-preserving rounding of exact unit values to paise: everyone gets floor(u / scale) paise and
 * the k = (sum of remainders) / scale people with the largest remainders get one more paisa (ties in
 * `keys` order). When the inputs sum to 0 the outputs sum to exactly 0, and each output is within
 * 1 paisa of its exact value. The remainders only depend on the trip-split fractions (settlements
 * and lends are whole paise), so recording settle()'s suggestions always rounds to exactly 0.
 */
export function roundNets(units: Map<string, bigint>, keys: readonly string[], scale: bigint): Record<string, number> {
  const rows = keys.map((k, i) => {
    const u = units.get(k) ?? 0n;
    const q = floorDiv(u, scale);
    return { k, i, q, r: u - q * scale };
  });
  const remSum = rows.reduce((s, x) => s + x.r, 0n);
  let bump = Number(remSum / scale); // exact when the inputs sum to a whole number of paise
  const order = [...rows].sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  const plus = new Set<string>();
  for (const x of order) {
    if (bump <= 0) break;
    if (x.r === 0n) break;
    plus.add(x.k);
    bump--;
  }
  return Object.fromEntries(rows.map((x) => [x.k, Number(x.q) + (plus.has(x.k) ? 1 : 0)]));
}

/** Each member's exact share of a trip expense, in units at `scale` (members from splitMembers). */
const shareUnits = (paise: number, n: number, scale: bigint) => (BigInt(paise) * scale) / BigInt(n);

const addU = (m: Map<string, bigint>, k: string, v: bigint) => m.set(k, (m.get(k) ?? 0n) + v);

/**
 * Each member's share of ONE expense, in rupees, for display (e.g. "Each person's share").
 *
 * Returns the EXACT equal share rounded to the nearest paisa, the same value the balances use
 * (e.g. ₹100 split 3 → 33.33 each; ₹99.99 split 2 → 50.00 each), so the parts may differ from the
 * total by under 1 paisa per person. Pass `{ exactSum: true }` to get whole-paise parts that add up
 * to exactly the amount instead (largest remainder within this expense, extra paise to the first
 * members in `people` order: ₹100 split 3 → 33.34, 33.33, 33.33).
 *
 * Trip expenses: one entry per distinct split member (empty split = everyone), in `people` order.
 * Personal lends: a single entry [owedTo, amount] (the borrower owes the whole amount).
 */
export function expenseShares(
  e: ExpenseLite,
  people: readonly string[],
  opts: { exactSum?: boolean } = {}
): [string, number][] {
  const paise = toPaise(e.amount);
  if (e.type === "personal") return e.owedTo ? [[e.owedTo, toRupees(paise)]] : [];
  const members = splitMembers(e.splitAmong, people);
  if (!members.length) return [];
  if (opts.exactSum) return splitPaise(paise, members).map(([p, v]) => [p, toRupees(v)]);
  const scale = unitScale([members.length]);
  const each = toRupees(unitsToPaise(shareUnits(paise, members.length, scale), scale));
  return members.map((p) => [p, each]);
}

/**
 * Net balance per person. Positive = should receive, negative = should pay.
 * Trip expenses: payer is credited the full amount, each person in splitAmong is debited an exact
 * equal share (amount ÷ n, kept exact in units). Personal lends (paidBy lent to owedTo): lender's
 * balance rises, borrower's falls — so one combined settle-up. Settlements (from -> to): "from" paid
 * "to" cash, so from's balance rises and to's falls. `spent`, `share` and `total` stay trip-only.
 *
 * Everything is accumulated exactly in units; nets are rounded to paise once (roundNets) so they sum
 * to exactly 0 and each is within 1 paisa of the exact amount. `share` is each person's exact share
 * rounded to the nearest paisa (display only). All returned values are rupees.
 */
export function computeBalances(people: string[], expenses: ExpenseLite[], settlements: SettlementLite[]) {
  const trips = expenses
    .filter((e) => e.type === "trip")
    .map((e) => ({ e, paise: toPaise(e.amount), members: splitMembers(e.splitAmong, people) }));
  const scale = unitScale(trips.map((t) => t.members.length));

  const spent = new Map<string, number>(), lent = new Map<string, number>(), borrowed = new Map<string, number>();
  const settledPaid = new Map<string, number>(), settledReceived = new Map<string, number>();
  const shareU = new Map<string, bigint>(), netU = new Map<string, bigint>();
  const addP = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  const whole = (p: number) => BigInt(p) * scale;
  let total = 0;

  for (const { e, paise, members } of trips) {
    total += paise;
    addP(spent, e.paidBy, paise);
    addU(netU, e.paidBy, whole(paise));
    if (!members.length) continue;
    const part = shareUnits(paise, members.length, scale);
    for (const p of members) {
      addU(shareU, p, part);
      addU(netU, p, -part);
    }
  }
  for (const e of expenses) {
    if (e.type !== "personal" || !e.owedTo) continue;
    const paise = toPaise(e.amount);
    addP(lent, e.paidBy, paise);
    addP(borrowed, e.owedTo, paise);
    addU(netU, e.paidBy, whole(paise));
    addU(netU, e.owedTo, -whole(paise));
  }
  for (const s of settlements) {
    const paise = toPaise(s.amount);
    addP(settledPaid, s.fromPerson, paise);
    addP(settledReceived, s.toPerson, paise);
    addU(netU, s.fromPerson, whole(paise));
    addU(netU, s.toPerson, -whole(paise));
  }

  // People first (fixed order = tie order for rounding), then any unknown names in first-seen order.
  const keys = [...new Set([...people, ...spent.keys(), ...shareU.keys(), ...lent.keys(), ...borrowed.keys(), ...settledPaid.keys(), ...settledReceived.keys()])];
  const rupees = (m: Map<string, number>) => Object.fromEntries(keys.map((k) => [k, toRupees(m.get(k) ?? 0)])) as Record<string, number>;
  const netP = roundNets(netU, keys, scale);
  return {
    total: toRupees(total),
    spent: rupees(spent),
    share: Object.fromEntries(keys.map((k) => [k, toRupees(unitsToPaise(shareU.get(k) ?? 0n, scale))])) as Record<string, number>,
    lent: rupees(lent),
    borrowed: rupees(borrowed),
    net: Object.fromEntries(keys.map((k) => [k, toRupees(netP[k])])) as Record<string, number>,
    settledPaid: rupees(settledPaid),
    settledReceived: rupees(settledReceived),
  };
}

/**
 * `person`'s exact share of the trip expenses in `rows`, rounded to the nearest paisa (rupees).
 * Same value as computeBalances(...).share[person] for the same rows. Personal lends count 0.
 */
export function tripShareOf(rows: ExpenseLite[], people: readonly string[], person: string): number {
  const trips = rows.filter((e) => e.type === "trip").map((e) => ({ paise: toPaise(e.amount), members: splitMembers(e.splitAmong, people) }));
  const scale = unitScale(trips.map((t) => t.members.length));
  let u = 0n;
  for (const t of trips) if (t.members.includes(person)) u += shareUnits(t.paise, t.members.length, scale);
  return toRupees(unitsToPaise(u, scale));
}

/**
 * Greedy settle-up in paise: largest debtor pays largest creditor until one side is cleared.
 * Each step clears at least one person, so there are at most n-1 transfers. When the nets sum to 0
 * (always true for computeBalances output), recording every suggested transfer leaves nothing pending.
 * Ties are broken by input order, so the result is deterministic.
 */
export function settle(net: Record<string, number>): Transfer[] {
  const entries = Object.entries(net).map(([p, v], i) => ({ p, v: toPaise(v), i }));
  const cred = entries.filter((x) => x.v > 0);
  const debt = entries.filter((x) => x.v < 0).map((x) => ({ ...x, v: -x.v }));
  const order = (a: { v: number; i: number }, b: { v: number; i: number }) => b.v - a.v || a.i - b.i;
  const out: Transfer[] = [];
  while (debt.length && cred.length) {
    debt.sort(order);
    cred.sort(order);
    const d = debt[0], c = cred[0];
    const amt = Math.min(d.v, c.v);
    out.push({ from: d.p, to: c.p, amount: toRupees(amt) });
    d.v -= amt;
    c.v -= amt;
    if (d.v === 0) debt.shift();
    if (c.v === 0) cred.shift();
  }
  return out;
}

/**
 * Personal lends: payer lent `amount` to owedTo. Netted per pair (in paise): for each unordered pair
 * at most one transfer, debtor -> creditor, for |sum(A lent B) - sum(B lent A)|. Largest first.
 */
export function personalLends(expenses: ExpenseLite[]): Transfer[] {
  const m = new Map<string, number>();
  for (const e of expenses) {
    if (e.type !== "personal" || !e.owedTo) continue;
    const key = `${e.owedTo}|${e.paidBy}`; // debtor|creditor
    const rev = `${e.paidBy}|${e.owedTo}`;
    m.set(key, (m.get(key) ?? 0) + toPaise(e.amount));
    if (m.has(rev)) {
      const d = Math.min(m.get(key)!, m.get(rev)!);
      m.set(key, m.get(key)! - d);
      m.set(rev, m.get(rev)! - d);
    }
  }
  return [...m.entries()]
    .filter(([, v]) => v > 0)
    .map(([k, v]) => {
      const [from, to] = k.split("|");
      return { from, to, amount: toRupees(v) };
    })
    .sort((a, b) => b.amount - a.amount);
}
