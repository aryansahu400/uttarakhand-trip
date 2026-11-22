"use client";
import { useEffect, useMemo, useState } from "react";
import { Download, X } from "lucide-react";
import { PEOPLE } from "@/lib/people";
import { CATEGORIES, categoryOf } from "@/lib/categories";
import { computeBalances, personalLends, type Transfer } from "@/lib/balances";
import { NAVEEN_PER_PERSON, naveenShares } from "@/lib/naveen";
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
  topExpenses,
  type Filters,
  type TypeFilter,
} from "@/lib/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function Dashboard({ expenses, settlements }: { expenses: Expense[]; settlements: Settlement[] }) {
  const [f, setF] = useState<Filters>(EMPTY_FILTERS);
  const set = (patch: Partial<Filters>) => setF((x) => ({ ...x, ...patch }));

  const rows = useMemo(() => applyFilters(expenses, f), [expenses, f]);
  const k = useMemo(() => kpis(rows), [rows]);
  const daily = useMemo(() => dailySeries(rows), [rows]);
  const byPerson = useMemo(() => paidByPerson(rows), [rows]);
  const byCategory = useMemo(() => categoryTotals(rows), [rows]);
  const top = useMemo(() => topExpenses(rows), [rows]);

  // Whole-trip widgets (balances only make sense across everything)
  const status = useMemo(() => settlementStatus(expenses, settlements), [expenses, settlements]);
  const { spent, share, lent, borrowed } = useMemo(() => computeBalances([...PEOPLE], expenses, settlements), [expenses, settlements]);
  const lends = useMemo(() => personalLends(expenses), [expenses]);
  const naveen = useMemo(() => naveenShares(PEOPLE, expenses), [expenses]);
  const tripAwards = useMemo(() => awards(expenses), [expenses]);
  const naveenTarget = NAVEEN_PER_PERSON * PEOPLE.length;

  const selectedDay = f.from && f.from === f.to ? f.from : null;
  const toggleDay = (d: string) => (selectedDay === d ? set({ from: "", to: "" }) : set({ from: d, to: d }));
  const togglePerson = (p: string) => set({ person: f.person === p ? "" : p });
  const toggleCategory = (c: string) => set({ category: f.category === c ? "" : c });

  const chips = [
    f.person && { label: f.person, clear: () => set({ person: "" }) },
    f.type !== "trip" && { label: TYPE_LABELS[f.type], clear: () => set({ type: "trip" }) },
    f.category && { label: categoryOf(f.category).label, clear: () => set({ category: "" }) },
    (f.from || f.to) && {
      label: selectedDay ? dayLabel(selectedDay) : `${f.from ? dayLabel(f.from) : "Start"} – ${f.to ? dayLabel(f.to) : "Today"}`,
      clear: () => set({ from: "", to: "" }),
    },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  function exportCSV(kind: "filtered" | "all" | "settlements" | "balances") {
    const stamp = dayKey(new Date());
    if (kind === "settlements")
      return downloadCSV(`settlements-${stamp}.csv`, ["Date", "From", "To", "Amount", "Note"], settlements.map((s) => [formatDate(s.createdAt), s.fromPerson, s.toPerson, Number(s.amount), s.note ?? ""]));
    if (kind === "balances")
      return downloadCSV(
        `balances-${stamp}.csv`,
        ["Person", "Paid (trip)", "Share (trip)", "Lent personally", "Borrowed personally", "Settlements paid", "Settlements received", "Net (+ gets back / - owes)", "Naveen paid", "Naveen remaining"],
        PEOPLE.map((p) => [
          p, spent[p], share[p], lent[p], borrowed[p],
          settlements.filter((s) => s.fromPerson === p).reduce((a, s) => a + Number(s.amount), 0),
          settlements.filter((s) => s.toPerson === p).reduce((a, s) => a + Number(s.amount), 0),
          status.net[p], naveen.paid[p], NAVEEN_PER_PERSON - naveen.paid[p],
        ])
      );
    const list = kind === "filtered" ? rows : expenses;
    downloadCSV(
      `expenses-${kind}-${stamp}.csv`,
      ["Date", "Description", "Amount", "Category", "Type", "Paid by", "Split among / Borrowed by", "Naveen"],
      list.map((e) => [
        formatDate(e.dateTime),
        e.description,
        Number(e.amount),
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
      {/* ---------- Filters ---------- */}
      <Card className="p-4">
        <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-3 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
          <Select value={f.person} onChange={(e) => set({ person: e.target.value })} aria-label="Person">
            <option value="">All people</option>
            {PEOPLE.map((p) => <option key={p}>{p}</option>)}
          </Select>
          <Select value={f.type} onChange={(e) => set({ type: e.target.value as TypeFilter })} aria-label="Type">
            {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Select value={f.category} onChange={(e) => set({ category: e.target.value })} aria-label="Category">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
          <DateField label="From" value={f.from} onChange={(v) => set({ from: v })} />
          <DateField label="To" value={f.to} onChange={(v) => set({ to: v })} />
          <details className="relative">
            <summary className="flex h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-md border border-input bg-card px-3 text-sm hover:bg-muted sm:h-9 [&::-webkit-details-marker]:hidden">
              <Download className="h-4 w-4" /> Export
            </summary>
            <div className="absolute right-0 z-30 mt-1 w-56 rounded-md border bg-card p-1 text-sm shadow-md">
              {([
                ["filtered", "Expenses (current filters)"],
                ["all", "All expenses"],
                ["settlements", "Settlements"],
                ["balances", "Balances & Naveen summary"],
              ] as const).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={(e) => {
                    exportCSV(kind);
                    (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
                  }}
                  className="block w-full rounded px-2.5 py-2 text-left hover:bg-muted"
                >
                  {label} <span className="text-xs text-muted-foreground">.csv</span>
                </button>
              ))}
            </div>
          </details>
        </div>
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <button key={c.label} type="button" onClick={c.clear} className="flex items-center gap-1 rounded-full border bg-muted/50 py-1 pl-2.5 pr-1.5 text-xs hover:bg-muted">
                {c.label} <X className="h-3 w-3" />
              </button>
            ))}
            <button type="button" onClick={() => setF(EMPTY_FILTERS)} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
              Clear all
            </button>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Tip: click a bar or slice in any chart to filter the whole dashboard by it.</p>
      </Card>

      {/* ---------- KPI cards ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total spend" value={formatINR0(k.total)} sub={`${k.count} expense${k.count === 1 ? "" : "s"}`} />
        <Kpi label="Equal share / person" value={formatINR0(k.share)} sub="Total ÷ 7" />
        <Kpi label="Average per day" value={formatINR0(k.avgDaily)} sub={`${k.days} day${k.days === 1 ? "" : "s"}`} />
        <Kpi
          label="Largest expense"
          value={k.largest ? formatINR(Number(k.largest.amount)) : "–"}
          sub={k.largest ? `${k.largest.description} · ${k.largest.paidBy}` : "No expenses"}
        />
        <Kpi label="Settled so far" value={`${Math.round(status.pct * 100)}%`} sub={`${formatINR0(status.settled)} paid back`} whole progress={status.pct} />
        <Kpi label="Left to settle" value={formatINR0(status.pending)} sub={`${status.transfers.length} transfer${status.transfers.length === 1 ? "" : "s"}`} whole />
        <Kpi label="Paid to Naveen" value={formatINR0(naveen.total)} sub={`of ${formatINR0(naveenTarget)}`} whole progress={naveen.total / naveenTarget} />
        <Kpi label="Naveen remaining" value={formatINR0(naveenTarget - naveen.total)} sub={`${Math.round((naveen.total / naveenTarget) * 100)}% complete`} whole />
      </div>

      {/* ---------- Spend over time + category ---------- */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Panel title="Daily spend" sub="Click a day to filter">
          {daily.length ? <DailySpendChart data={daily} selected={selectedDay} onSelect={toggleDay} /> : <Empty />}
        </Panel>
        <Panel title="Where the money went" sub="By category · click to filter">
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
        <Panel title="Running total" sub="Cumulative spend over the trip">
          {daily.length ? <CumulativeChart data={daily} /> : <Empty />}
        </Panel>
        <Panel title="Paid by person" sub="Who paid for the expenses shown · click to filter">
          <PersonBarChart data={byPerson} selected={f.person || null} onSelect={togglePerson} />
        </Panel>
      </div>

      {/* ---------- Balances ---------- */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Panel title="Net balance" sub="Trip share + personal lends, after settlements · blue gets back, red owes" whole>
          <NetBalanceChart data={PEOPLE.map((p) => ({ person: p, net: status.net[p] }))} />
        </Panel>
        <Panel title="Money flow" sub="Pending transfers to settle up (trip + lends)" whole>
          <MoneyFlow transfers={status.transfers} />
        </Panel>
      </div>

      {/* ---------- Naveen ---------- */}
      <Panel title="Naveen (travel agency)" sub={`${formatINR(NAVEEN_PER_PERSON)} per person · ${formatINR(naveenTarget)} total`} whole>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col items-center justify-center">
            <Gauge value={naveen.total} max={naveenTarget} label={`${formatINR0(naveen.total)} paid`} />
            <p className="mt-2 text-xs text-muted-foreground">{formatINR(naveenTarget - naveen.total)} remaining</p>
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
          <div className="space-y-2">
            {PEOPLE.map((p) => (
              <div key={p} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-sm">
                <span>{p}</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (naveen.paid[p] / NAVEEN_PER_PERSON) * 100)}%`, background: C.blue }} />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  <span className="text-foreground">{formatINR(naveen.paid[p])}</span> / 21K
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
        <Panel title="Trip awards" sub="Whole trip" flush>
          {tripAwards.length === 0 ? (
            <CardContent><Empty /></CardContent>
          ) : (
            <ul className="divide-y border-t">
              {tripAwards.map((a) => (
                <li key={a.title} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">{a.title}</div>
                    <div className="font-medium">{a.winner}</div>
                  </div>
                  <span className="text-right text-xs text-muted-foreground">{a.detail}</span>
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

      <Panel title="Balances table" sub="Net = Paid − Share + Lends ± Settlements" whole flush>
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH className="pl-5">Person</TH>
              <TH className="text-right">Paid</TH>
              <TH className="text-right">Share</TH>
              <TH className="text-right">Lends</TH>
              <TH className="pr-5 text-right">Net</TH>
            </TR>
          </THead>
          <TBody>
            {PEOPLE.map((p) => (
              <TR key={p}>
                <TD className="pl-5 font-medium"><PersonName name={p} size={22} /></TD>
                <TD className="text-right tabular-nums">{formatINR(spent[p])}</TD>
                <TD className="text-right tabular-nums text-muted-foreground">{formatINR(share[p])}</TD>
                <TD className="text-right tabular-nums text-muted-foreground">
                  {lent[p] - borrowed[p] > 0.005 ? "+" : ""}
                  {formatINR(lent[p] - borrowed[p])}
                </TD>
                <TD className={cn("pr-5 text-right font-medium tabular-nums", tone(status.net[p]))}>
                  {status.net[p] > 0.005 ? "+" : ""}
                  {formatINR(status.net[p])}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------- */

const tone = (n: number) => (n > 0.005 ? "text-emerald-700" : n < -0.005 ? "text-red-700" : "text-muted-foreground");
const Empty = () => <p className="py-8 text-center text-sm text-muted-foreground">No data for these filters.</p>;
const WholeTag = () => <span className="rounded border px-1 py-px text-[10px] font-normal text-muted-foreground">Whole trip</span>;

function TopList({ items }: { items: Expense[] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  return (
    <ol className="divide-y border-t">
      {items.map((e, i) => {
        const open = openId === e.id;
        return (
          <li key={e.id} className="px-5 py-2.5 text-sm">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : e.id)}
              aria-expanded={open}
              className="flex w-full items-center gap-3 text-left [-webkit-tap-highlight-color:transparent]"
            >
              <span className="w-4 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: categoryOf(e.category).color }} />
              <div className="min-w-0 flex-1">
                <div className="truncate">{e.description}</div>
                <div className="text-xs text-muted-foreground">
                  {e.paidBy} · {dayLabel(dayKey(e.dateTime))}
                </div>
              </div>
              <span className="font-medium tabular-nums">{formatINR(Number(e.amount))}</span>
              <Chevron open={open} />
            </button>
            <Collapse open={open}>
              <ExpenseDetails e={e} />
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
        <span className="text-xs text-muted-foreground">{label}</span>
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
          className="flex min-w-0 flex-col text-left [-webkit-tap-highlight-color:transparent]"
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
  className,
  children,
}: {
  title: string;
  sub?: string;
  whole?: boolean;
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>{title}</CardTitle>
          {whole && <WholeTag />}
        </div>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardHeader>
      {flush ? children : <CardContent>{children}</CardContent>}
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
            <li key={i} className="flex items-center justify-between px-5 py-2.5 text-sm">
              <span>
                {t.from} <span className="px-1 text-muted-foreground">→</span> {t.to}
              </span>
              <span className="font-medium tabular-nums">{formatINR(t.amount)}</span>
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

  const Line = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", strong && "font-semibold")}>{value}</span>
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
            <span className="font-medium">{s.net > 0.005 ? "Gets back" : s.net < -0.005 ? "Still owes" : "Settled"}</span>
            <span className={cn("text-base font-semibold tabular-nums", tone(s.net))}>{formatINR(Math.abs(s.net))}</span>
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
