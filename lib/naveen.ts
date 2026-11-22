/** Travel agency (Naveen) package cost per person. */
export const NAVEEN_PER_PERSON = 21000;

export type NaveenMode = "direct" | "indirect";

type ExpenseLike = {
  amount: number | string;
  type: "trip" | "personal";
  splitAmong: string[];
  naveenPayment?: NaveenMode | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** How much of each person's 21K has been paid to Naveen so far (directly or indirectly). */
export function naveenShares(people: readonly string[], expenses: ExpenseLike[]) {
  const paid: Record<string, number> = Object.fromEntries(people.map((p) => [p, 0]));
  let direct = 0;
  let indirect = 0;
  for (const e of expenses) {
    if (e.type !== "trip" || !e.naveenPayment) continue;
    const amt = Number(e.amount);
    const among = e.splitAmong.length ? e.splitAmong : people;
    among.forEach((p) => (paid[p] = (paid[p] ?? 0) + amt / among.length));
    if (e.naveenPayment === "direct") direct += amt;
    else indirect += amt;
  }
  for (const p of Object.keys(paid)) paid[p] = r2(paid[p]);
  return { paid, direct: r2(direct), indirect: r2(indirect), total: r2(direct + indirect) };
}

/** People whose Naveen share would go over 21K if `next` were added. Empty array = OK. */
export function naveenOverCap(people: readonly string[], existing: ExpenseLike[], next: ExpenseLike) {
  const { paid } = naveenShares(people, [...existing, next]);
  return Object.entries(paid)
    .filter(([, v]) => v > NAVEEN_PER_PERSON + 0.01)
    .map(([person, v]) => ({ person, over: r2(v - NAVEEN_PER_PERSON) }));
}
