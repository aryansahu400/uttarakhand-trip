import { splitMembers, toPaise, toRupees, unitScale, unitsToPaise } from "./balances";

/** Travel agency (Naveen) package cost per person. */
export const NAVEEN_PER_PERSON = 21000;
/** The same cap in integer paise. */
export const NAVEEN_PER_PERSON_PAISE = NAVEEN_PER_PERSON * 100;

export type NaveenMode = "direct" | "indirect";

type ExpenseLike = {
  amount: number | string;
  type: "trip" | "personal";
  splitAmong: string[];
  naveenPayment?: NaveenMode | null;
};

/**
 * Per-person Naveen payments as EXACT units (see lib/balances.ts: 1 paisa = `scale` units, 420 for
 * every split of ≤ 7 people). A payment of P paise split n ways adds P * scale / n to each member —
 * the same formula as the SQL cap check in app/api/expenses/naveen-insert.ts. No rounding, so
 * instalments such as 14 × ₹10,000 + ₹7,000 split 7 ways land on exactly ₹21,000 for everyone.
 */
export function naveenPaidUnits(people: readonly string[], expenses: ExpenseLike[]) {
  const rows = expenses
    .filter((e) => e.type === "trip" && e.naveenPayment)
    .map((e) => ({ e, paise: toPaise(e.amount), members: splitMembers(e.splitAmong, people) }));
  const scale = unitScale(rows.map((r) => r.members.length));
  const paid = new Map<string, bigint>(people.map((p) => [p, 0n]));
  let direct = 0;
  let indirect = 0;
  for (const { e, paise, members } of rows) {
    if (members.length) {
      const part = (BigInt(paise) * scale) / BigInt(members.length);
      for (const p of members) paid.set(p, (paid.get(p) ?? 0n) + part);
    }
    if (e.naveenPayment === "direct") direct += paise;
    else indirect += paise;
  }
  return { paid, scale, direct, indirect };
}

/**
 * How much of each person's 21K has been paid to Naveen so far (directly or indirectly), in rupees.
 * `paid[p]` is the exact amount rounded to the nearest paisa (display); `total`, `direct` and
 * `indirect` are exact sums of the rows.
 */
export function naveenShares(people: readonly string[], expenses: ExpenseLike[]) {
  const { paid, scale, direct, indirect } = naveenPaidUnits(people, expenses);
  const rupees = Object.fromEntries([...paid].map(([p, u]) => [p, toRupees(unitsToPaise(u, scale))])) as Record<string, number>;
  return { paid: rupees, direct: toRupees(direct), indirect: toRupees(indirect), total: toRupees(direct + indirect) };
}

/**
 * People whose Naveen total would go over 21K if `next` were added. Empty array = OK.
 * Exact comparison in units with NO tolerance: exactly ₹21,000 is allowed, anything above it
 * (even a fraction of a paisa from an uneven split) is not. `over` is rounded UP to whole paise so
 * it never shows as ₹0. Only people `next` actually charges are checked, so a legacy over-cap row
 * for one person never blocks payments for everyone else.
 */
export function naveenOverCap(people: readonly string[], existing: ExpenseLike[], next: ExpenseLike) {
  if (next.type !== "trip" || !next.naveenPayment) return [];
  if (toPaise(next.amount) <= 0) return [];
  const charged = new Set(splitMembers(next.splitAmong, people));
  const { paid, scale } = naveenPaidUnits(people, [...existing, next]);
  const cap = BigInt(NAVEEN_PER_PERSON_PAISE) * scale;
  const out: { person: string; over: number }[] = [];
  for (const [person, u] of paid) {
    if (!charged.has(person) || u <= cap) continue;
    const overU = u - cap;
    out.push({ person, over: toRupees(Number((overU + scale - 1n) / scale)) });
  }
  return out;
}
