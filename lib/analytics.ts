import { PEOPLE } from "./people";
import { CATEGORIES } from "./categories";
import { computeBalances, personalLends, settle, type Transfer } from "./balances";
import { naveenShares } from "./naveen";
import type { Expense, Settlement } from "@/components/types";

export type TypeFilter = "trip" | "personal" | "naveen" | "all";
export type Filters = { from: string; to: string; person: string; type: TypeFilter; category: string };
export const EMPTY_FILTERS: Filters = { from: "", to: "", person: "", type: "trip", category: "" };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Local calendar day, YYYY-MM-DD. */
export const dayKey = (d: string | Date) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
export const dayLabel = (key: string) =>
  new Date(key + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export const involves = (e: Expense, p: string) => e.paidBy === p || e.owedTo === p || e.splitAmong.includes(p);

export function applyFilters(expenses: Expense[], f: Filters) {
  return expenses.filter((e) => {
    if (f.type === "trip" && e.type !== "trip") return false;
    if (f.type === "personal" && e.type !== "personal") return false;
    if (f.type === "naveen" && !e.naveenPayment) return false;
    if (f.person && !involves(e, f.person)) return false;
    if (f.category && e.category !== f.category) return false;
    const k = dayKey(e.dateTime);
    if (f.from && k < f.from) return false;
    if (f.to && k > f.to) return false;
    return true;
  });
}

const sum = (rows: Expense[]) => r2(rows.reduce((s, e) => s + Number(e.amount), 0));

/** One point per calendar day from first to last expense (gaps filled with 0). */
export function dailySeries(rows: Expense[]) {
  if (!rows.length) return [];
  const byDay = new Map<string, number>();
  rows.forEach((e) => byDay.set(dayKey(e.dateTime), (byDay.get(dayKey(e.dateTime)) ?? 0) + Number(e.amount)));
  const keys = [...byDay.keys()].sort();
  const out: { day: string; label: string; total: number; cumulative: number }[] = [];
  let cum = 0;
  for (let d = new Date(keys[0] + "T00:00:00"); dayKey(d) <= keys[keys.length - 1]; d.setDate(d.getDate() + 1)) {
    const k = dayKey(d);
    const total = r2(byDay.get(k) ?? 0);
    cum = r2(cum + total);
    out.push({ day: k, label: dayLabel(k), total, cumulative: cum });
  }
  return out;
}

export function paidByPerson(rows: Expense[]) {
  return PEOPLE.map((p) => ({ person: p, amount: sum(rows.filter((e) => e.paidBy === p)) }));
}

export function categoryTotals(rows: Expense[]) {
  return CATEGORIES.map((c) => ({ ...c, amount: sum(rows.filter((e) => e.category === c.value)) }));
}

export function kpis(rows: Expense[]) {
  const total = sum(rows);
  const days = dailySeries(rows).length;
  const largest = rows.reduce<Expense | null>((m, e) => (!m || Number(e.amount) > Number(m.amount) ? e : m), null);
  return { total, count: rows.length, share: r2(total / PEOPLE.length), avgDaily: days ? r2(total / days) : 0, days, largest };
}

/** Whole-trip settlement status (never filtered: partial balances would be misleading). */
export function settlementStatus(expenses: Expense[], settlements: Settlement[]) {
  const { net } = computeBalances([...PEOPLE], expenses, settlements);
  const transfers = settle(net);
  const settled = r2(settlements.reduce((s, x) => s + Number(x.amount), 0));
  const pending = r2(transfers.reduce((s, t) => s + t.amount, 0));
  const pct = settled + pending > 0 ? settled / (settled + pending) : 1;
  return { net, transfers, settled, pending, pct };
}

export function topExpenses(rows: Expense[], n = 5) {
  return [...rows].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, n);
}

export type Award = { title: string; winner: string; detail: string };

export function awards(expenses: Expense[]): Award[] {
  const trip = expenses.filter((e) => e.type === "trip");
  const personal = expenses.filter((e) => e.type === "personal");
  const best = (score: (p: string) => number) => {
    const ranked = PEOPLE.map((p) => ({ p, v: score(p) })).sort((a, b) => b.v - a.v);
    return ranked[0].v > 0 ? ranked[0] : null;
  };
  const fmt = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
  const lateNight = (e: Expense) => {
    const h = new Date(e.dateTime).getHours();
    return h >= 22 || h < 4;
  };
  const out: (Award | null)[] = [
    ((w) => w && { title: "Biggest spender", winner: w.p, detail: `${fmt(w.v)} paid for the group` })(
      best((p) => sum(trip.filter((e) => e.paidBy === p)))
    ),
    ((w) => w && { title: "Most frequent payer", winner: w.p, detail: `Paid ${w.v} time${w.v === 1 ? "" : "s"}` })(
      best((p) => trip.filter((e) => e.paidBy === p).length)
    ),
    ((w) => w && { title: "Most generous lender", winner: w.p, detail: `${fmt(w.v)} lent personally` })(
      best((p) => sum(personal.filter((e) => e.paidBy === p)))
    ),
    ((w) => w && { title: "Biggest borrower", winner: w.p, detail: `${fmt(w.v)} borrowed` })(
      best((p) => sum(personal.filter((e) => e.owedTo === p)))
    ),
    ((w) => w && { title: "Night owl", winner: w.p, detail: `${w.v} payment${w.v === 1 ? "" : "s"} after 10 pm` })(
      best((p) => expenses.filter((e) => e.paidBy === p && lateNight(e)).length)
    ),
  ];
  return out.filter((a): a is Award => !!a);
}

export function personStatement(person: string, expenses: Expense[], settlements: Settlement[]) {
  const { spent, share, lent, borrowed, net } = computeBalances([...PEOPLE], expenses, settlements);
  const transfers = settle(net);
  const lends = personalLends(expenses);
  const naveen = naveenShares(PEOPLE, expenses);
  const pick = (list: Transfer[], key: "from" | "to") => list.filter((t) => t[key] === person);
  return {
    paid: spent[person],
    share: share[person],
    lent: lent[person],
    borrowed: borrowed[person],
    net: net[person],
    paysTo: pick(transfers, "from"),
    getsFrom: pick(transfers, "to"),
    borrowedFrom: pick(lends, "from"),
    lentTo: pick(lends, "to"),
    settledPaid: r2(settlements.filter((s) => s.fromPerson === person).reduce((a, s) => a + Number(s.amount), 0)),
    settledReceived: r2(settlements.filter((s) => s.toPerson === person).reduce((a, s) => a + Number(s.amount), 0)),
    naveenPaid: naveen.paid[person] ?? 0,
    expenseCount: expenses.filter((e) => involves(e, person)).length,
  };
}
