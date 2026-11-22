import { PEOPLE } from "./people";
import { CATEGORIES } from "./categories";
import { computeBalances, personalLends, settle, toPaise, toRupees, tripShareOf, type Transfer } from "./balances";
import { naveenShares } from "./naveen";
import { dayKeyIST, dayLabelIST, hourIST } from "./format";
import type { Expense, Settlement } from "@/components/types";

export type TypeFilter = "trip" | "personal" | "naveen" | "all";
export type Filters = { from: string; to: string; person: string; type: TypeFilter; category: string };
export const EMPTY_FILTERS: Filters = { from: "", to: "", person: "", type: "trip", category: "" };

/**
 * Daily charts fill empty days only when the first and last spend days are at most this many days
 * apart (a trip); beyond that (e.g. an advance booking weeks earlier) only days with spend are plotted.
 */
export const MAX_FILLED_DAYS = 14;

/** India (Asia/Kolkata) calendar day, YYYY-MM-DD — the same on every device. */
export const dayKey = (d: string | Date) => dayKeyIST(d);
/** "19 Dec" for a day key (or an instant). */
export const dayLabel = (key: string) => dayLabelIST(key);

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

/** Paise-exact sum of row amounts, in rupees. */
const sumPaise = (rows: Expense[]) => rows.reduce((s, e) => s + toPaise(e.amount), 0);
const sum = (rows: Expense[]) => toRupees(sumPaise(rows));

/** Next calendar day of a YYYY-MM-DD key (pure UTC date maths, timezone independent). */
const nextDay = (key: string) => {
  const d = new Date(key + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);

/**
 * One point per IST calendar day. Gaps between the first and last day are filled with 0 when the
 * span is at most MAX_FILLED_DAYS (14) days; for longer spans (e.g. an advance booking weeks earlier)
 * only days with spend are returned, so one stray row can't squash the trip into a corner of the chart.
 */
export function dailySeries(rows: Expense[]) {
  if (!rows.length) return [];
  const byDay = new Map<string, number>();
  rows.forEach((e) => {
    const k = dayKey(e.dateTime);
    byDay.set(k, (byDay.get(k) ?? 0) + toPaise(e.amount));
  });
  const keys = [...byDay.keys()].sort();
  const first = keys[0], last = keys[keys.length - 1];
  const days: string[] = [];
  if (daysBetween(first, last) <= MAX_FILLED_DAYS) for (let k = first; k <= last; k = nextDay(k)) days.push(k);
  else days.push(...keys);
  const out: { day: string; label: string; total: number; cumulative: number }[] = [];
  let cum = 0;
  for (const k of days) {
    const p = byDay.get(k) ?? 0;
    cum += p;
    out.push({ day: k, label: dayLabel(k), total: toRupees(p), cumulative: toRupees(cum) });
  }
  return out;
}

export function paidByPerson(rows: Expense[]) {
  return PEOPLE.map((p) => ({ person: p, amount: sum(rows.filter((e) => e.paidBy === p)) }));
}

export function categoryTotals(rows: Expense[]) {
  return CATEGORIES.map((c) => ({ ...c, amount: sum(rows.filter((e) => e.category === c.value)) }));
}

/**
 * Headline numbers for the filtered rows. `days` is the number of distinct IST days that have
 * spend, and `avgDaily` = total / days (so an advance booking weeks earlier doesn't dilute it).
 * `share` is total ÷ number of trip members (use shareOf() for one person's real share).
 */
export function kpis(rows: Expense[]) {
  const totalP = sumPaise(rows);
  const days = new Set(rows.map((e) => dayKey(e.dateTime))).size;
  const largest = rows.reduce<Expense | null>((m, e) => (!m || toPaise(e.amount) > toPaise(m.amount) ? e : m), null);
  return {
    total: toRupees(totalP),
    count: rows.length,
    share: toRupees(Math.round(totalP / PEOPLE.length)),
    avgDaily: days ? toRupees(Math.round(totalP / days)) : 0,
    days,
    largest,
  };
}

/**
 * `person`'s real share of the trip expenses in `rows`: the exact equal shares (amount ÷ split size),
 * summed exactly and rounded to the nearest paisa once — the same value as computeBalances().share.
 * Personal lends are not trip spend, so they count 0.
 */
export function shareOf(rows: Expense[], person: string): number {
  return tripShareOf(rows, PEOPLE, person);
}

const pendingPaise = (transfers: Transfer[]) => transfers.reduce((s, t) => s + toPaise(t.amount), 0);

/**
 * Whole-trip settlement status (never filtered: partial balances would be misleading).
 * pct is progress: 1 - pending / initialPending, where initialPending is what was owed before any
 * settlement was recorded, clamped to [0, 1]. Overpayments therefore never count as progress.
 * When nothing was ever owed (initialPending 0), pct is 1 if nothing is pending either, else 0 — so a
 * stray settlement with no expenses shows 0% next to its pending transfer, never "100% settled".
 */
export function settlementStatus(expenses: Expense[], settlements: Settlement[]) {
  const { net, settledPaid } = computeBalances([...PEOPLE], expenses, settlements);
  const transfers = settle(net);
  const settled = toRupees(Object.values(settledPaid).reduce((s, v) => s + toPaise(v), 0));
  const pendingP = pendingPaise(transfers);
  const initialP = pendingPaise(settle(computeBalances([...PEOPLE], expenses, []).net));
  const pct = initialP > 0 ? Math.min(1, Math.max(0, 1 - pendingP / initialP)) : pendingP === 0 ? 1 : 0;
  return { net, transfers, settled, pending: toRupees(pendingP), pct };
}

export function topExpenses(rows: Expense[], n = 5) {
  return [...rows].sort((a, b) => toPaise(b.amount) - toPaise(a.amount)).slice(0, n);
}

export type Award = { title: string; winner: string; detail: string };

/** Fun whole-trip awards. Ties are shared: winner becomes "Krish & Krishnam". */
export function awards(expenses: Expense[]): Award[] {
  const trip = expenses.filter((e) => e.type === "trip");
  const personal = expenses.filter((e) => e.type === "personal");
  // Scores are integers (paise or counts), so ties compare exactly.
  const best = (score: (p: string) => number) => {
    const scored = PEOPLE.map((p) => ({ p, v: score(p) }));
    const top = Math.max(...scored.map((s) => s.v));
    if (!(top > 0)) return null;
    return { p: scored.filter((s) => s.v === top).map((s) => s.p).join(" & "), v: top };
  };
  const fmt = (paise: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.round(paise / 100) || 0);
  const lateNight = (e: Expense) => {
    const h = hourIST(e.dateTime);
    return h >= 22 || h < 4;
  };
  const each = (w: { p: string }) => (w.p.includes(" & ") ? " each" : "");
  const out: (Award | null)[] = [
    ((w) => w && { title: "Biggest spender", winner: w.p, detail: `${fmt(w.v)} paid for the group${each(w)}` })(
      best((p) => sumPaise(trip.filter((e) => e.paidBy === p)))
    ),
    ((w) => w && { title: "Most frequent payer", winner: w.p, detail: `Paid ${w.v} time${w.v === 1 ? "" : "s"}${each(w)}` })(
      best((p) => trip.filter((e) => e.paidBy === p).length)
    ),
    ((w) => w && { title: "Most generous lender", winner: w.p, detail: `${fmt(w.v)} lent personally${each(w)}` })(
      best((p) => sumPaise(personal.filter((e) => e.paidBy === p)))
    ),
    ((w) => w && { title: "Biggest borrower", winner: w.p, detail: `${fmt(w.v)} borrowed${each(w)}` })(
      best((p) => sumPaise(personal.filter((e) => e.owedTo === p)))
    ),
    ((w) => w && { title: "Night owl", winner: w.p, detail: `${w.v} payment${w.v === 1 ? "" : "s"} after 10 pm${each(w)}` })(
      best((p) => expenses.filter((e) => e.paidBy === p && lateNight(e)).length)
    ),
  ];
  return out.filter((a): a is Award => !!a);
}

export function personStatement(person: string, expenses: Expense[], settlements: Settlement[]) {
  const { spent, share, lent, borrowed, net, settledPaid, settledReceived } = computeBalances([...PEOPLE], expenses, settlements);
  const transfers = settle(net);
  const lends = personalLends(expenses);
  const naveen = naveenShares(PEOPLE, expenses);
  const pick = (list: Transfer[], key: "from" | "to") => list.filter((t) => t[key] === person);
  return {
    paid: spent[person] ?? 0,
    share: share[person] ?? 0,
    lent: lent[person] ?? 0,
    borrowed: borrowed[person] ?? 0,
    net: net[person] ?? 0,
    paysTo: pick(transfers, "from"),
    getsFrom: pick(transfers, "to"),
    borrowedFrom: pick(lends, "from"),
    lentTo: pick(lends, "to"),
    settledPaid: settledPaid[person] ?? 0,
    settledReceived: settledReceived[person] ?? 0,
    naveenPaid: naveen.paid[person] ?? 0,
    expenseCount: expenses.filter((e) => involves(e, person)).length,
  };
}
