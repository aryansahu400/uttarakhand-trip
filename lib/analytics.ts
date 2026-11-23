import { PEOPLE } from "./people";
import { CATEGORIES } from "./categories";
import { computeBalances, expenseShares, personalLends, settle, splitMembers, toPaise, toRupees, tripShareOf, type Transfer } from "./balances";
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
    const winners = scored.filter((s) => s.v === top);
    // Everyone tied: nobody stands out, so there is no award.
    if (winners.length === PEOPLE.length) return null;
    return { p: winners.map((s) => s.p).join(" & "), v: top };
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

/* ------------------------------------------------------------------------------------------------
 * Home screen: everything about one member, whole trip.
 * ---------------------------------------------------------------------------------------------- */

/** One recent row and what it meant for the member. */
export type ActivityItem = {
  expense: Expense;
  /** paid: a trip expense they paid · share: a trip expense someone else paid · lent / borrowed: a personal lend. */
  role: "paid" | "share" | "lent" | "borrowed";
  /** Amount they paid (trip rows they paid), else 0. */
  paid: number;
  /** Their exact share of a trip row (0 if they paid but are not in the split), or the lend amount. */
  share: number;
};

/** How one figure compares with the average of the OTHER members. pct is null when that average is 0. */
export type VsOthers = { avg: number; diff: number; pct: number | null };

export type PersonalSummary = ReturnType<typeof personalSummary>;

/**
 * Personal metrics for the Home screen. Money figures come from computeBalances (paise-exact), so
 * they match the Dashboard and Settlements to the paisa. `rounding` is the (at most ±₹0.01) gap between
 * the step-by-step breakdown (paid − share + lent − borrowed + settled paid − settled received), which
 * uses per-person rounded figures, and the real balance, which is rounded once over everyone.
 */
export function personalSummary(person: string, expenses: Expense[], settlements: Settlement[]) {
  const b = computeBalances([...PEOPLE], expenses, settlements);
  const before = computeBalances([...PEOPLE], expenses, []);
  const transfers = settle(b.net);
  const lends = personalLends(expenses);
  const naveen = naveenShares(PEOPLE, expenses);
  const trips = expenses.filter((e) => e.type === "trip");
  const others = PEOPLE.filter((p) => p !== person);
  const val = (rec: Record<string, number>, p: string) => rec[p] ?? 0;

  const paid = val(b.spent, person);
  const share = val(b.share, person);
  const lent = val(b.lent, person);
  const borrowed = val(b.borrowed, person);
  const settledPaid = val(b.settledPaid, person);
  const settledReceived = val(b.settledReceived, person);
  const net = val(b.net, person);
  const stepsP = toPaise(paid) - toPaise(share) + toPaise(lent) - toPaise(borrowed) + toPaise(settledPaid) - toPaise(settledReceived);
  const rounding = toRupees(toPaise(net) - stepsP);

  // Averages over the other members, summed in paise and rounded once.
  const avgOthers = (rec: Record<string, number>) =>
    others.length ? toRupees(Math.round(others.reduce((s, p) => s + toPaise(val(rec, p)), 0) / others.length)) : 0;
  const vs = (mine: number, avg: number): VsOthers => ({
    avg,
    diff: toRupees(toPaise(mine) - toPaise(avg)),
    pct: avg > 0 ? (mine - avg) / avg : null,
  });
  // 1 + number of others strictly ahead; equal amounts share a rank.
  const rankBy = (rec: Record<string, number>) => 1 + others.filter((p) => toPaise(val(rec, p)) > toPaise(val(rec, person))).length;
  const tiedBy = (rec: Record<string, number>) => others.some((p) => toPaise(val(rec, p)) === toPaise(val(rec, person)));

  const myTrips = trips.filter((e) => splitMembers(e.splitAmong, PEOPLE).includes(person));
  const paidTrips = trips.filter((e) => e.paidBy === person);
  const biggestPaid = paidTrips.reduce<Expense | null>((m, e) => (!m || toPaise(e.amount) > toPaise(m.amount) ? e : m), null);

  // Their share by category (each category exact, rounded once).
  const byCategory = CATEGORIES.map((c) => ({ ...c, amount: tripShareOf(myTrips.filter((e) => e.category === c.value), PEOPLE, person) }));

  // Their share per IST day, with the same gap rule as dailySeries().
  const dayRows = new Map<string, Expense[]>();
  for (const e of myTrips) {
    const k = dayKey(e.dateTime);
    dayRows.set(k, [...(dayRows.get(k) ?? []), e]);
  }
  const keys = [...dayRows.keys()].sort();
  const days: string[] = [];
  if (keys.length) {
    const first = keys[0], last = keys[keys.length - 1];
    if (daysBetween(first, last) <= MAX_FILLED_DAYS) for (let k = first; k <= last; k = nextDay(k)) days.push(k);
    else days.push(...keys);
  }
  const daily = days.map((k) => ({ day: k, label: dayLabel(k), share: dayRows.has(k) ? tripShareOf(dayRows.get(k)!, PEOPLE, person) : 0 }));
  const activeDays = keys.length;
  const avgPerDay = activeDays ? toRupees(Math.round(toPaise(share) / activeDays)) : 0;

  // Most recent rows that involve them (newest first).
  const recent: ActivityItem[] = expenses
    .filter((e) => involves(e, person))
    .sort((a, c) => Date.parse(c.dateTime) - Date.parse(a.dateTime) || c.id - a.id)
    .slice(0, 6)
    .map((e) => {
      const amount = toRupees(toPaise(e.amount));
      if (e.type === "personal") return { expense: e, role: e.paidBy === person ? "lent" : "borrowed", paid: 0, share: amount };
      const mine = expenseShares(e, PEOPLE).find(([p]) => p === person)?.[1] ?? 0;
      return { expense: e, role: e.paidBy === person ? "paid" : "share", paid: e.paidBy === person ? amount : 0, share: mine };
    });

  // How much of their original (pre-settlement) balance is cleared. Overpaying past zero counts as cleared.
  const startP = toPaise(val(before.net, person));
  const nowP = toPaise(net);
  const settledPct =
    startP === 0 ? (nowP === 0 ? 1 : 0) : Math.sign(nowP) === Math.sign(startP) ? Math.min(1, Math.max(0, 1 - Math.abs(nowP) / Math.abs(startP))) : 1;

  return {
    person,
    tripTotal: b.total,
    paid,
    share,
    lent,
    borrowed,
    settledPaid,
    settledReceived,
    net,
    rounding,
    netBeforeSettlements: val(before.net, person),
    settledPct,
    /** Final settle-up transfers (trip + lends combined) that involve them. */
    paysTo: transfers.filter((t) => t.from === person),
    getsFrom: transfers.filter((t) => t.to === person),
    /** Personal-lend breakdown (already included in the transfers above). */
    owesYouPersonally: lends.filter((t) => t.to === person),
    youOwePersonally: lends.filter((t) => t.from === person),
    naveenPaid: naveen.paid[person] ?? 0,
    paidVsOthers: vs(paid, avgOthers(b.spent)),
    shareVsOthers: vs(share, avgOthers(b.share)),
    payerRank: rankBy(b.spent),
    payerRankTied: tiedBy(b.spent),
    shareOfTrip: b.total > 0 ? share / b.total : 0,
    tripCount: myTrips.length,
    paidCount: paidTrips.length,
    biggestPaid,
    added: { expenses: expenses.filter((e) => e.createdBy === person).length, settlements: settlements.filter((s) => s.createdBy === person).length },
    byCategory,
    daily,
    activeDays,
    avgPerDay,
    recent,
    awards: awards(expenses).filter((a) => a.winner.split(" & ").includes(person)),
    /** Everyone's paid / share / balance, for the comparison chart. */
    peers: PEOPLE.map((p) => ({ person: p, paid: val(b.spent, p), share: val(b.share, p), net: val(b.net, p) })),
  };
}
