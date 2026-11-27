"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { PEOPLE } from "@/lib/people";
import { CATEGORIES, categoryOf } from "@/lib/categories";
import { computeBalances, personalLends, toPaise, toRupees, type Transfer } from "@/lib/balances";
import { NAVEEN_PER_PERSON, NAVEEN_PER_PERSON_PAISE, naveenShares } from "@/lib/naveen";
import { formatDate, formatINR, formatINR0 } from "@/lib/format";
import { downloadCSV } from "@/lib/csv";
import {
  EMPTY_FILTERS,
  applyFilters,
  awards,
  categoryTotals,
  dailySeries,
  dayKey,
  dayLabel,
  kpis,
  paidByPerson,
  personStatement,
  settlementStatus,
  shareOf,
  topExpenses,
  type Filters,
  type TypeFilter,
} from "@/lib/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Expense, Settlement } from "../types";
import { Chevron, Collapse, ExpenseDetails } from "../expense-details";
import { Avatar, PersonName } from "../avatar";
import { C, CumulativeChart, DailySpendChart, Donut, Gauge, MoneyFlow, NetBalanceChart, PersonBarChart } from "./charts";

const TYPE_LABELS: Record<TypeFilter, string> = {
  trip: "Trip expenses",
  personal: "Personal lends",
  naveen: "Naveen payments",
  all: "Everything",
};
/** Shorter option text for the Type select so it never clips in a half-width phone column. */
const TYPE_OPTIONS: Record<TypeFilter, string> = { trip: "Trip", personal: "Lends", naveen: "Naveen", all: "Everything" };

const EXPORTS = [
  ["filtered", "Expenses (current filters)"],
  ["all", "All expenses"],
  ["settlements", "Settlements"],
  ["balances", "Balances & Naveen summary"],
] as const;
type ExportKind = (typeof EXPORTS)[number][0];

/* ---------------- money display helpers ---------------- */

/** Treat sub-paisa float noise as exactly 0 so a settled person never reads "-₹0" or "+₹0.01". */
const clean = (n: number) => (Math.abs(n) < 0.005 ? 0 : n);
/** "+₹1,500", "−₹200", "₹0". The sign is part of one nowrap string so it can never wrap on its own. */
const signed = (n: number) => {
  const v = clean(n);
  return v > 0 ? `+${formatINR(v)}` : v < 0 ? `−${formatINR(-v)}` : formatINR(0);
};
const tone = (n: number) => (clean(n) > 0 ? "text-emerald-700" : clean(n) < 0 ? "text-red-700" : "text-muted-foreground");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
/**
 * A money value for a CSV cell: rounded to whole paise, returned as a number (paise / 100 always prints
 * as its exact 2-decimal form, so a spreadsheet never sees 6714.280000000001 or -0).
 */
const csvMoney = (v: number | string | null | undefined) => toRupees(toPaise(v ?? 0));

/** Wording for the date-range chip: "19 Dec", "19–23 Dec", "28 Dec – 2 Jan", "From 19 Dec", "Until 23 Dec". */
function rangeLabel(from: string, to: string) {
  if (from && to) {
    if (from === to) return dayLabel(from);
    if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))}–${dayLabel(to)}`;
    return `${dayLabel(from)} – ${dayLabel(to)}`;
  }
  return from ? `From ${dayLabel(from)}` : `Until ${dayLabel(to)}`;
}

/** True on touch-first devices, so hints say "Tap" instead of "Click". False during SSR. */
function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return coarse;
}

export function Dashboard({
  expenses,
  settlements,
  loading,
}: {
  expenses: Expense[];
  settlements: Settlement[];
  /** True until AppShell's first fetch resolves: show skeletons, not zeros. */
  loading?: boolean;
}) {
  if (loading) return <DashboardSkeleton />;
  return <DashboardBody expenses={expenses} settlements={settlements} />;
}

function DashboardBody({ expenses, settlements }: { expenses: Expense[]; settlements: Settlement[] }) {
  const [f, setF] = useState<Filters>(EMPTY_FILTERS);
  // A day picked from the Daily spend chart. Kept apart from the From/To range so the chart can keep
  // drawing every day of the range (with the picked one highlighted) while everything else narrows to it.
  const [day, setDay] = useState<string | null>(null);
  const set = (patch: Partial<Filters>) => {
    if ("from" in patch || "to" in patch) setDay(null);
    setF((x) => ({ ...x, ...patch }));
  };
  const coarse = useCoarsePointer();
  const verb = coarse ? "Tap" : "Click";

  const rangeRows = useMemo(() => applyFilters(expenses, f), [expenses, f]);
  const rows = useMemo(() => (day ? rangeRows.filter((e) => dayKey(e.dateTime) === day) : rangeRows), [rangeRows, day]);
  const daily = useMemo(() => dailySeries(rangeRows), [rangeRows]);
  const k = useMemo(() => kpis(rows), [rows]);
  // Lends are not trip spend: the per-person KPI only ever looks at trip rows.
  const tripK = useMemo(() => kpis(rows.filter((e) => e.type === "trip")), [rows]);
  const personShare = useMemo(() => (f.person ? shareOf(rows, f.person) : 0), [rows, f.person]);
  const byPerson = useMemo(() => paidByPerson(rows), [rows]);
  const byCategory = useMemo(() => categoryTotals(rows), [rows]);
  const top = useMemo(() => topExpenses(rows), [rows]);

  // Whole-trip widgets (balances only make sense across everything)
  const status = useMemo(() => settlementStatus(expenses, settlements), [expenses, settlements]);
  const bal = useMemo(() => computeBalances([...PEOPLE], expenses, settlements), [expenses, settlements]);
  const lends = useMemo(() => personalLends(expenses), [expenses]);
  const naveen = useMemo(() => naveenShares(PEOPLE, expenses), [expenses]);
  const tripAwards = useMemo(() => awards(expenses), [expenses]);
  const naveenTarget = NAVEEN_PER_PERSON * PEOPLE.length;
  const naveenLeft = Math.max(0, naveenTarget - naveen.total);
  const naveenPct = Math.min(1, naveen.total / naveenTarget);
  // Never claim 100% while anything is still pending: 99.6% would otherwise round up, and pct alone can't be
  // trusted to agree with the transfer list in edge cases. The bar follows the same rule as the number.
  const stillPending = status.transfers.length > 0 || status.pending > 0.005;
  const settledProgress = stillPending ? Math.min(status.pct, 0.99) : Math.min(1, Math.max(0, status.pct));
  const settledPct = stillPending ? Math.min(99, Math.floor(status.pct * 100)) : Math.round(settledProgress * 100);
  /** Settlements paid minus received: the column that makes Net add up by hand. */
  const settledNet = (p: string) => (bal.settledPaid[p] ?? 0) - (bal.settledReceived[p] ?? 0);

  const toggleDay = (d: string) => setDay((cur) => (cur === d ? null : d));
  const togglePerson = (p: string) => set({ person: f.person === p ? "" : p });
  const toggleCategory = (c: string) => set({ category: f.category === c ? "" : c });

  const chips = [
    f.person && { label: f.person, clear: () => set({ person: "" }) },
    f.type !== "trip" && { label: TYPE_LABELS[f.type], clear: () => set({ type: "trip" }) },
    f.category && { label: categoryOf(f.category).label, clear: () => set({ category: "" }) },
    (f.from || f.to) && { label: rangeLabel(f.from, f.to), clear: () => set({ from: "", to: "" }) },
    day && { label: `On ${dayLabel(day)}`, clear: () => setDay(null) },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  // The first KPI's wording depends on what the rows contain (lends are never called "spend").
  const lendTotal = rows.filter((e) => e.type === "personal").reduce((s, e) => s + Number(e.amount), 0);
  const totalKpi =
    f.type === "personal"
      ? { label: "Amount lent", sub: plural(k.count, "lend") }
      : f.type === "all"
        ? { label: "Spend + lends", sub: `${formatINR0(tripK.total)} trip · ${formatINR0(lendTotal)} lent` }
        : { label: "Total spend", sub: plural(k.count, "expense") };
  const shareKpi =
    f.type === "personal"
      ? { label: f.person ? `${f.person}'s share` : "Average per person", value: "–", sub: "Lends aren't split" }
      : f.person
        ? { label: `${f.person}'s share`, value: formatINR0(personShare), sub: "Their split of the trip expenses shown" }
        : { label: "Average per person", value: formatINR0(tripK.share), sub: `Trip total ÷ ${PEOPLE.length}` };

  function exportCSV(kind: ExportKind) {
    const stamp = dayKey(new Date());
    if (kind === "settlements")
      return downloadCSV(`settlements-${stamp}.csv`, ["Date", "From", "To", "Amount", "Note"], settlements.map((s) => [formatDate(s.createdAt), s.fromPerson, s.toPerson, csvMoney(s.amount), s.note ?? ""]));
    if (kind === "balances")
      return downloadCSV(
        `balances-${stamp}.csv`,
        ["Person", "Paid (trip)", "Share (trip)", "Lent personally", "Borrowed personally", "Settlements paid", "Settlements received", "Net (+ gets back / - owes)", "Naveen paid", "Naveen remaining"],
        // Every money cell goes through paise so the file holds exact 2-decimal values.
        PEOPLE.map((p) => {
          const naveenPaidP = toPaise(naveen.paid[p] ?? 0);
          return [
            p, csvMoney(bal.spent[p]), csvMoney(bal.share[p]), csvMoney(bal.lent[p]), csvMoney(bal.borrowed[p]),
            csvMoney(bal.settledPaid[p]), csvMoney(bal.settledReceived[p]),
            csvMoney(status.net[p]), toRupees(naveenPaidP), toRupees(Math.max(0, NAVEEN_PER_PERSON_PAISE - naveenPaidP)),
          ];
        })
      );
    const list = kind === "filtered" ? rows : expenses;
    downloadCSV(
      `expenses-${kind}-${stamp}.csv`,
      ["Date", "Description", "Amount", "Category", "Type", "Paid by", "Split among / Borrowed by", "Naveen"],
      list.map((e) => [
        formatDate(e.dateTime),
        e.description,
        csvMoney(e.amount),
        categoryOf(e.category).label,
        e.type === "trip" ? "Trip" : "Personal lend",
        e.paidBy,
        e.type === "personal" ? e.owedTo : e.splitAmong.join(" / "),
        e.naveenPayment ?? "",
      ])
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ---------- Filters ----------
          Phones: 2 columns (Person/Type, Category, From/To pair, Export full width).
          sm and up: 3 columns × 2 rows. The page is capped at ~870px, so one row of 6 would squeeze the
          date inputs to ~135px even on wide screens. Same padding and gaps as the Expenses tab. */}
      <Card>
        <CardContent className="space-y-3 pt-5">
          {/* 2 columns until md: in a 3-column grid at 640-688px the date fields get narrower than Chrome's
              date text + calendar icon, which then slides under the clear (×) button. */}
          <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-3">
            <Field label="Person">
              <Select value={f.person} onChange={(e) => set({ person: e.target.value })}>
                <option value="">All people</option>
                {PEOPLE.map((p) => <option key={p}>{p}</option>)}
              </Select>
            </Field>
            <Field label="Type">
              <Select value={f.type} onChange={(e) => set({ type: e.target.value as TypeFilter })}>
                {Object.entries(TYPE_OPTIONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Category" className="col-span-2 md:col-span-1">
              <Select value={f.category} onChange={(e) => set({ category: e.target.value })}>
                <option value="">All categories</option>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
            <DateField label="From" value={f.from} onChange={(v) => set({ from: v })} className="max-[359px]:col-span-2" />
            <DateField label="To" value={f.to} onChange={(v) => set({ to: v })} className="max-[359px]:col-span-2" />
            <ExportMenu onExport={exportCSV} className="col-span-2 md:col-span-1" />
          </div>
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={c.clear}
                  aria-label={`Remove filter ${c.label}`}
                  className={cn("flex h-8 items-center gap-1 rounded-full border bg-muted/50 pl-3 pr-2 text-xs transition-colors hover:bg-muted active:bg-muted", HIT_40)}
                >
                  {c.label} <X className="h-3 w-3" />
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setF(EMPTY_FILTERS);
                  setDay(null);
                }}
                className={cn("h-8 rounded-full px-2 text-xs text-muted-foreground underline-offset-2 transition-colors [-webkit-tap-highlight-color:transparent] hover:underline active:bg-muted", HIT_40)}
              >
                Clear all
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Tip: {verb.toLowerCase()} a bar or slice in any chart to filter the whole dashboard by it.</p>
        </CardContent>
      </Card>

      {/* ---------- KPI cards ---------- */}
      <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
        <Kpi label={totalKpi.label} value={formatINR0(k.total)} sub={totalKpi.sub} />
        <Kpi label={shareKpi.label} value={shareKpi.value} sub={shareKpi.sub} />
        <Kpi label="Average per day" value={formatINR0(k.avgDaily)} sub={`${plural(k.days, "day")} with spend`} />
        <Kpi
          label="Largest expense"
          value={k.largest ? formatINR(Number(k.largest.amount)) : "–"}
          sub={k.largest ? `${k.largest.description} · ${k.largest.paidBy}` : "No expenses"}
        />
        <Kpi label="Settled so far" value={`${settledPct}%`} sub={`${formatINR0(status.settled)} paid back`} whole progress={settledProgress} />
        <Kpi label="Left to settle" value={formatINR0(status.pending)} sub={plural(status.transfers.length, "transfer")} whole />
        <Kpi label="Paid to Naveen" value={formatINR0(naveen.total)} sub={`of ${formatINR0(naveenTarget)}`} whole progress={naveenPct} />
        <Kpi label="Naveen remaining" value={formatINR0(naveenLeft)} sub={`${Math.floor(naveenPct * 100)}% complete`} whole />
      </div>

      {/* ---------- Spend over time + category ---------- */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Panel title="Daily spend" sub={day ? `${verb} ${dayLabel(day)} again to show all days` : `${verb} a day to filter`} fill>
          {daily.length ? <DailySpendChart data={daily} selected={day} onSelect={toggleDay} fill /> : <Empty />}
        </Panel>
        <Panel title="Where the money went" sub={`By category · ${verb.toLowerCase()} to filter`}>
          <Donut
            data={byCategory.map((c) => ({ key: c.value, label: c.label, amount: c.amount, color: c.color }))}
            selected={f.category || null}
            onSelect={toggleCategory}
            centerLabel="Total"
            centerValue={formatINR0(k.total)}
          />
        </Panel>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Panel title="Running total" sub="Cumulative spend over the days shown" fill>
          {daily.length ? <CumulativeChart data={daily} fill /> : <Empty />}
        </Panel>
        <Panel title="Paid by person" sub={`Who paid for the expenses shown · ${verb.toLowerCase()} to filter`}>
          <PersonBarChart data={byPerson} selected={f.person || null} onSelect={togglePerson} />
        </Panel>
      </div>

      {/* ---------- Balances ---------- */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Panel title="Net balance" sub="Trip share + personal lends, after settlements · blue gets back, red owes" whole>
          <NetBalanceChart data={PEOPLE.map((p) => ({ person: p, net: clean(status.net[p]) }))} />
        </Panel>
        <Panel title="Money flow" sub="Pending transfers to settle up (trip + lends)" whole>
          <MoneyFlow transfers={status.transfers} />
        </Panel>
      </div>

      {/* ---------- Naveen ---------- */}
      <Panel title="Naveen (travel agency)" sub={`${formatINR(NAVEEN_PER_PERSON)} per person · ${formatINR(naveenTarget)} total`} whole>
        {/* Gauge + donut side by side, per-person bars below: a third of the ~870px page would truncate the legend. */}
        {/* grid-cols-1 is minmax(0,1fr) and children are min-w-0, so at 320px the widest legend row
            truncates inside the card instead of widening the track past the card border. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 [&>*]:min-w-0">
          <div className="flex flex-col items-center justify-center">
            <Gauge value={naveen.total} max={naveenTarget} label={`${formatINR0(naveen.total)} paid`} />
            <p className="mt-2 text-xs text-muted-foreground">{formatINR(naveenLeft)} remaining</p>
          </div>
          <Donut
            data={[
              { key: "direct", label: "Direct (to him)", amount: naveen.direct, color: C.blue },
              { key: "indirect", label: "Indirect (hotel, fuel…)", amount: naveen.indirect, color: C.orange },
            ]}
            stacked
            centerLabel="Paid"
            centerValue={formatINR0(naveen.total)}
          />
          <div className="space-y-2 sm:col-span-2">
            {PEOPLE.map((p) => (
              <div key={p} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2 text-sm min-[360px]:gap-3">
                <span className="truncate">{p}</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (naveen.paid[p] / NAVEEN_PER_PERSON) * 100)}%`, background: C.blue }} />
                </div>
                <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  <span className="text-foreground">{formatINR(naveen.paid[p])}</span>
                  <span className="hidden min-[360px]:inline"> / 21K</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {/* ---------- Person view ---------- */}
      <PersonView expenses={expenses} settlements={settlements} initial={f.person} />

      {/* ---------- Top 5 + awards ---------- */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Panel title="Top 5 expenses" sub="Biggest single expenses shown" flush>
          {top.length === 0 ? (
            <CardContent><Empty /></CardContent>
          ) : (
            <TopList items={top} />
          )}
        </Panel>
        <Panel title="Trip awards" sub="Ties share the award" whole flush>
          {tripAwards.length === 0 ? (
            <CardContent><Empty /></CardContent>
          ) : (
            <ul className="divide-y border-t">
              {tripAwards.map((a) => (
                <li key={a.title} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">{a.title}</div>
                    <div className="break-words font-medium">{a.winner}</div>
                  </div>
                  <span className="shrink-0 text-right text-xs text-muted-foreground">{a.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ---------- Lists + table ---------- */}
      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        <TransferList title="Who pays whom" sub="Final amounts: trip + personal lends" items={status.transfers} empty="Everyone is settled up." />
        <TransferList title="Personal lends" sub="Breakdown only · already included in Who pays whom" items={lends} empty="No personal lends." />
      </div>

      <Panel title="Balances table" sub="Net = Paid − Share + Lends + Settled · Settled = settlements paid − received" whole flush>
        {/* Phones: one compact card per person, Net beside the name so it is never off-screen. */}
        <ul className="divide-y border-t md:hidden">
          {PEOPLE.map((p) => (
            <li key={p} className="px-5 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <PersonName name={p} size={22} />
                <span className={cn("whitespace-nowrap font-semibold tabular-nums", tone(status.net[p]))}>{signed(status.net[p])}</span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <MiniStat label="Paid" value={formatINR(bal.spent[p])} />
                <MiniStat label="Share" value={formatINR(bal.share[p])} />
                <MiniStat label="Lends" value={signed(bal.lent[p] - bal.borrowed[p])} />
                <MiniStat label="Settled" value={signed(settledNet(p))} />
              </dl>
            </li>
          ))}
        </ul>
        {/* md and up: the full table. Numbers never wrap, so a sign can't land on its own line. */}
        <div className="hidden md:block">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH className="pl-5">Person</TH>
                <TH className="text-right">Paid</TH>
                <TH className="text-right">Share</TH>
                <TH className="text-right">Lends</TH>
                <TH className="text-right">Settled</TH>
                <TH className="pr-5 text-right">Net</TH>
              </TR>
            </THead>
            <TBody>
              {PEOPLE.map((p) => (
                <TR key={p}>
                  <TD className="pl-5 font-medium"><PersonName name={p} size={22} /></TD>
                  <TD className="whitespace-nowrap text-right tabular-nums">{formatINR(bal.spent[p])}</TD>
                  <TD className="whitespace-nowrap text-right tabular-nums text-muted-foreground">{formatINR(bal.share[p])}</TD>
                  <TD className="whitespace-nowrap text-right tabular-nums text-muted-foreground">{signed(bal.lent[p] - bal.borrowed[p])}</TD>
                  <TD className="whitespace-nowrap text-right tabular-nums text-muted-foreground">{signed(settledNet(p))}</TD>
                  <TD className={cn("whitespace-nowrap pr-5 text-right font-medium tabular-nums", tone(status.net[p]))}>{signed(status.net[p])}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------- */

const Empty = () => <p className="py-8 text-center text-sm text-muted-foreground">No data for these filters.</p>;
/**
 * Grows a compact (32px) control's tap area to 40px without changing how it looks: an invisible
 * ::before extends 4px above and below. Gaps between chips are 8px, so neighbouring areas never overlap.
 */
// 40px touch target around 32px chips: ::before is measured from the padding box, so bordered chips need 5px (4px + 1px border).
const HIT_40 = "relative before:absolute before:inset-x-0 before:-inset-y-[5px] before:content-['']";
const WholeTag = () => (
  <span className="shrink-0 whitespace-nowrap rounded border px-1 py-px text-[10px] font-normal text-muted-foreground">Whole trip</span>
);

/** A labelled filter control, styled like DateField's label so every control in the bar lines up. */
function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="whitespace-nowrap tabular-nums">{value}</dd>
    </div>
  );
}

/** Height (px) of anything fixed to the bottom of the viewport that could cover the menu (the phone tab bar). */
function bottomObstruction() {
  let top = window.innerHeight;
  // The floating tab bar is the only fixed element near the bottom; find it by its position, not a class name.
  document.querySelectorAll<HTMLElement>("[role=tablist], nav, [data-bottom-nav]").forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden") return;
    const r = el.getBoundingClientRect();
    if (r.height && r.top > window.innerHeight / 2) top = Math.min(top, r.top);
  });
  return window.innerHeight - top;
}

/**
 * Export dropdown. Closes on choosing an item, on a tap/click outside, and on Escape.
 * It opens downward when the items fit above the phone tab bar, otherwise upward when they fit there,
 * otherwise downward and scrolled into view clear of the tab bar. It sits above the tab bar (z-40 > z-30).
 */
function ExportMenu({ onExport, className }: { onExport: (kind: ExportKind) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Decide the direction before paint so the menu never flashes in the wrong place.
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const GAP = 4, EDGE = 8;
    const t = trigger.current.getBoundingClientRect();
    const h = menu.current.offsetHeight;
    const limit = window.innerHeight - bottomObstruction() - EDGE;
    const fitsBelow = t.bottom + GAP + h <= limit;
    const fitsAbove = t.top - GAP - h >= EDGE;
    const goUp = !fitsBelow && fitsAbove;
    setUp(goUp);
    if (!fitsBelow && !fitsAbove) {
      // Neither fits in the current view: scroll so the whole menu sits above the tab bar.
      const overflow = t.bottom + GAP + h - limit;
      // Instant, so the menu is never painted half-covered while a smooth scroll runs.
      window.scrollBy({ top: overflow, behavior: "instant" as ScrollBehavior });
    }
  }, [open]);

  return (
    <div ref={wrap} className={cn("relative", className)}>
      {/* Default Button size: 44px below lg, 36px from lg, the same as the From/To inputs beside it. */}
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 font-normal"
      >
        <Download className="h-4 w-4" /> Export
      </Button>
      {open && (
        <div
          ref={menu}
          role="menu"
          className={cn(
            "absolute left-0 right-0 z-40 w-full sm:left-auto sm:w-64 sm:max-w-[calc(100vw-2rem)] rounded-md border bg-card p-1 text-sm shadow-md",
            up ? "bottom-full mb-1" : "top-full mt-1"
          )}
        >
          {EXPORTS.map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              onClick={() => {
                onExport(kind);
                setOpen(false);
              }}
              className="flex min-h-10 w-full items-center rounded px-2.5 py-2 text-left transition-colors [-webkit-tap-highlight-color:transparent] hover:bg-muted active:bg-muted"
            >
              <span>
                {label} <span className="text-xs text-muted-foreground">.csv</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Neutral placeholder shown until the first fetch lands, so nobody sees "₹0" or "0% settled" as real data. */
function DashboardSkeleton() {
  const bar = "animate-pulse rounded bg-muted";
  return (
    <div className="space-y-4 sm:space-y-6" aria-busy="true">
      <p className="sr-only" role="status">Loading dashboard…</p>
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 pt-5 md:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-1">
              <div className={cn(bar, "h-3 w-12")} />
              <div className={cn(bar, "h-11 lg:h-9")} />
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Card key={i} className="space-y-2 p-3.5 sm:p-4">
            <div className={cn(bar, "h-3 w-20")} />
            <div className={cn(bar, "h-6 w-24")} />
            <div className={cn(bar, "h-3 w-16")} />
          </Card>
        ))}
      </div>
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i} className="space-y-3 p-5">
            <div className={cn(bar, "h-4 w-28")} />
            <div className="flex h-[220px] items-center justify-center rounded bg-muted/40 text-xs text-muted-foreground">Loading…</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TopList({ items }: { items: Expense[] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  return (
    <ol className="divide-y border-t">
      {items.map((e, i) => {
        const open = openId === e.id;
        return (
          <li key={e.id} className="text-sm">
            {/* The whole padded row is the button (56px), with the same press tint as the Expenses list. */}
            <button
              type="button"
              onClick={() => setOpenId(open ? null : e.id)}
              aria-expanded={open}
              className="flex min-h-12 w-full items-center gap-3 px-5 py-2.5 text-left transition-colors [-webkit-tap-highlight-color:transparent] hover:bg-muted/40 active:bg-muted/60"
            >
              <span className="w-4 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: categoryOf(e.category).color }} />
              <div className="min-w-0 flex-1">
                <div className="truncate">{e.description}</div>
                <div className="text-xs text-muted-foreground">
                  {e.paidBy} · {dayLabel(dayKey(e.dateTime))}
                </div>
              </div>
              <span className="whitespace-nowrap font-medium tabular-nums">{formatINR(Number(e.amount))}</span>
              <Chevron open={open} />
            </button>
            <Collapse open={open}>
              <div className="px-5 pb-2.5">
                <ExpenseDetails e={e} />
              </div>
            </Collapse>
          </li>
        );
      })}
    </ol>
  );
}

function Kpi({ label, value, sub, whole, progress }: { label: string; value: string; sub?: string; whole?: boolean; progress?: number }) {
  const [open, setOpen] = useState(false);
  const Body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-xs text-muted-foreground">{label}</span>
        {whole && <span className="hidden sm:inline"><WholeTag /></span>}
      </div>
      <div className="mt-1.5 truncate text-lg font-semibold tabular-nums sm:text-xl">{value}</div>
      {sub && (
        <div className={cn("mt-0.5 text-xs text-muted-foreground", open ? "whitespace-normal break-words" : "truncate")} title={sub}>
          {sub}
        </div>
      )}
    </>
  );
  return (
    <Card className="flex flex-col p-3.5 sm:p-4">
      {sub ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          // Bleeds 6px into the card padding so the press tint has room around the text.
          className="-m-1.5 flex min-w-0 flex-col rounded-md p-1.5 text-left transition-colors [-webkit-tap-highlight-color:transparent] active:bg-muted/60"
        >
          {Body}
        </button>
      ) : (
        Body
      )}
      {progress !== undefined && (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%`, background: C.blue }} />
        </div>
      )}
    </Card>
  );
}

function Panel({
  title,
  sub,
  whole,
  flush,
  fill,
  className,
  children,
}: {
  title: string;
  sub?: string;
  whole?: boolean;
  flush?: boolean;
  /** Let the content grow to the card's full height (a chart beside a taller card fills the row). */
  fill?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("min-w-0", fill && "flex flex-col", className)}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>{title}</CardTitle>
          {whole && <WholeTag />}
        </div>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardHeader>
      {flush ? children : <CardContent className={cn(fill && "flex flex-1 flex-col")}>{children}</CardContent>}
    </Card>
  );
}

function TransferList({ title, sub, items, empty }: { title: string; sub?: string; items: Transfer[]; empty: string }) {
  return (
    <Panel title={title} sub={sub} whole flush>
      {items.length === 0 ? (
        <CardContent><p className="text-sm text-muted-foreground">{empty}</p></CardContent>
      ) : (
        <ul className="divide-y border-t">
          {items.map((t, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
              <span>
                {t.from} <span className="px-1 text-muted-foreground">→</span> {t.to}
              </span>
              <span className="whitespace-nowrap font-medium tabular-nums">{formatINR(t.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function PersonView({ expenses, settlements, initial }: { expenses: Expense[]; settlements: Settlement[]; initial: string }) {
  const [person, setPerson] = useState<string>(initial || PEOPLE[0]);
  useEffect(() => { if (initial) setPerson(initial); }, [initial]);
  const s = useMemo(() => personStatement(person, expenses, settlements), [person, expenses, settlements]);
  const net = clean(s.net);

  const Line = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("whitespace-nowrap tabular-nums", strong && "font-semibold")}>{value}</span>
    </div>
  );
  const List = ({ title, items, other }: { title: string; items: Transfer[]; other: "from" | "to" }) =>
    items.length ? (
      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">{title}</div>
        {items.map((t, i) => <Line key={i} label={t[other]} value={formatINR(t.amount)} />)}
      </div>
    ) : null;

  return (
    <Card>
      <CardHeader className="gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={person} size={36} />
          <div>
            <CardTitle>Person statement</CardTitle>
            <p className="text-xs text-muted-foreground">Everything about one person, whole trip</p>
          </div>
        </div>
        <Select value={person} onChange={(e) => setPerson(e.target.value)} className="w-full sm:w-36" aria-label="Person">
          {PEOPLE.map((p) => <option key={p}>{p}</option>)}
        </Select>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-3">
        <div className="divide-y">
          <Line label="Paid for the group" value={formatINR(s.paid)} />
          <Line label="Their share" value={formatINR(s.share)} />
          <Line label="Lent personally" value={formatINR(s.lent)} />
          <Line label="Borrowed personally" value={formatINR(s.borrowed)} />
          <Line label="Settlements paid" value={formatINR(s.settledPaid)} />
          <Line label="Settlements received" value={formatINR(s.settledReceived)} />
          <div className="flex items-center justify-between py-2 text-sm">
            <span className="font-medium">{net > 0 ? "Gets back" : net < 0 ? "Still owes" : "Settled"}</span>
            <span className={cn("text-base font-semibold tabular-nums", tone(net))}>{formatINR(Math.abs(net))}</span>
          </div>
        </div>
        <div className="space-y-4">
          <List title="Needs to pay (trip + lends)" items={s.paysTo} other="to" />
          <List title="Will receive from (trip + lends)" items={s.getsFrom} other="from" />
          <List title="Lend breakdown: borrowed from" items={s.borrowedFrom} other="to" />
          <List title="Lend breakdown: lent to" items={s.lentTo} other="from" />
          {!s.paysTo.length && !s.getsFrom.length && !s.borrowedFrom.length && !s.lentTo.length && (
            <p className="text-sm text-muted-foreground">Nothing pending for {person}.</p>
          )}
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Naveen</div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="tabular-nums">{formatINR(s.naveenPaid)}</span>
            <span className="text-xs text-muted-foreground">of {formatINR(NAVEEN_PER_PERSON)}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (s.naveenPaid / NAVEEN_PER_PERSON) * 100)}%`, background: C.blue }} />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Involved in <span className="font-medium text-foreground">{s.expenseCount}</span> expense{s.expenseCount === 1 ? "" : "s"}.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
