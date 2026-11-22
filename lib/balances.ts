export type ExpenseLite = {
  amount: number | string;
  paidBy: string;
  type: "trip" | "personal";
  splitAmong: string[];
  owedTo: string | null;
};
export type SettlementLite = { fromPerson: string; toPerson: string; amount: number | string };
export type Transfer = { from: string; to: string; amount: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Net balance per person. Positive = should receive, negative = should pay.
 * Trip expenses: payer is credited the full amount, each person in splitAmong is debited an equal share.
 * Personal lends (paidBy lent to owedTo): lender's balance rises, borrower's falls — so one combined settle-up.
 * Settlements (from -> to): "from" paid "to" cash, so from's balance rises and to's falls.
 * `spent`, `share` and `total` stay trip-only; lends are not trip spend.
 */
export function computeBalances(people: string[], expenses: ExpenseLite[], settlements: SettlementLite[]) {
  const spent: Record<string, number> = {};
  const share: Record<string, number> = {};
  const lent: Record<string, number> = {};
  const borrowed: Record<string, number> = {};
  const net: Record<string, number> = {};
  people.forEach((p) => ((spent[p] = 0), (share[p] = 0), (lent[p] = 0), (borrowed[p] = 0), (net[p] = 0)));
  let total = 0;

  for (const e of expenses) {
    if (e.type === "personal") {
      if (!e.owedTo) continue;
      const amt = Number(e.amount);
      lent[e.paidBy] = (lent[e.paidBy] ?? 0) + amt;
      borrowed[e.owedTo] = (borrowed[e.owedTo] ?? 0) + amt;
      continue;
    }
    const amt = Number(e.amount);
    const among = e.splitAmong.length ? e.splitAmong : people;
    total += amt;
    spent[e.paidBy] = (spent[e.paidBy] ?? 0) + amt;
    const each = amt / among.length;
    among.forEach((p) => (share[p] = (share[p] ?? 0) + each));
  }
  people.forEach((p) => (net[p] = spent[p] - share[p] + lent[p] - borrowed[p]));
  for (const s of settlements) {
    const a = Number(s.amount);
    net[s.fromPerson] = (net[s.fromPerson] ?? 0) + a;
    net[s.toPerson] = (net[s.toPerson] ?? 0) - a;
  }
  people.forEach((p) => {
    spent[p] = r2(spent[p]);
    share[p] = r2(share[p]);
    lent[p] = r2(lent[p]);
    borrowed[p] = r2(borrowed[p]);
    net[p] = r2(net[p]);
  });
  return { total: r2(total), spent, share, lent, borrowed, net };
}

/** Greedy: largest debtor pays largest creditor. */
export function settle(net: Record<string, number>): Transfer[] {
  const cred = Object.entries(net).filter(([, v]) => v > 0.005).map(([p, v]) => ({ p, v }));
  const debt = Object.entries(net).filter(([, v]) => v < -0.005).map(([p, v]) => ({ p, v: -v }));
  const out: Transfer[] = [];
  while (debt.length && cred.length) {
    debt.sort((a, b) => b.v - a.v);
    cred.sort((a, b) => b.v - a.v);
    const d = debt[0], c = cred[0];
    const amt = Math.min(d.v, c.v);
    out.push({ from: d.p, to: c.p, amount: r2(amt) });
    d.v -= amt;
    c.v -= amt;
    if (d.v <= 0.005) debt.shift();
    if (c.v <= 0.005) cred.shift();
  }
  return out;
}

/** Personal lends: payer lent `amount` to owedTo. Netted per pair. */
export function personalLends(expenses: ExpenseLite[]): Transfer[] {
  const m = new Map<string, number>();
  for (const e of expenses) {
    if (e.type !== "personal" || !e.owedTo) continue;
    const key = `${e.owedTo}|${e.paidBy}`; // debtor|creditor
    const rev = `${e.paidBy}|${e.owedTo}`;
    m.set(key, (m.get(key) ?? 0) + Number(e.amount));
    if (m.has(rev)) {
      const d = Math.min(m.get(key)!, m.get(rev)!);
      m.set(key, m.get(key)! - d);
      m.set(rev, m.get(rev)! - d);
    }
  }
  return [...m.entries()].filter(([, v]) => v > 0.005).map(([k, v]) => {
    const [from, to] = k.split("|");
    return { from, to, amount: r2(v) };
  }).sort((a, b) => b.amount - a.amount);
}
