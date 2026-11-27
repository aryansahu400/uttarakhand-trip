"use client";
import { useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { PEOPLE, canDelete } from "@/lib/people";
import { useMe } from "./me";
import { formatDate, formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useRowDelete } from "@/components/ui/use-row-delete";
import type { Expense, Reload } from "./types";
import { Chevron, Collapse, ExpenseDetails } from "./expense-details";
import { categoryOf } from "@/lib/categories";

const uniq = (a: string[]) => [...new Set(a)];
const splitLabel = (e: Expense) => {
  const s = uniq(e.splitAmong);
  const left = PEOPLE.filter((p) => !s.includes(p));
  if (!s.length || !left.length) return "split among everyone"; // an empty list also means everyone
  // With 10 members, "everyone except Amisha" is shorter than nine names and shows who is left out.
  if (left.length < s.length && s.every((p) => (PEOPLE as readonly string[]).includes(p)))
    return `split among everyone except ${left.join(", ")}`;
  return `split among ${s.join(", ")}`;
};
const who = (e: Expense) => (e.type === "personal" ? `${e.paidBy} lent to ${e.owedTo}` : `${e.paidBy} paid · ${splitLabel(e)}`);

// Compact two-line date for the desktop table ("18 Dec" / "9:30 pm"), always in trip time (IST).
const shortDay = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const shortTime = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

const deleteUrl = (id: number) => `/api/expenses/${id}`;

export function RawExpenses({ expenses, onChanged, loading = false }: { expenses: Expense[]; onChanged: Reload; loading?: boolean }) {
  const me = useMe();
  const [person, setPerson] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const { remove, isDeleting, removed }  = useRowDelete(deleteUrl, "expense", onChanged);
  const toggle = (id: number) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const rows = useMemo(() => {
    // Filter dates are IST calendar days (the trip's timezone), independent of the device's zone.
    const f = from ? new Date(`${from}T00:00:00+05:30`).getTime() : -Infinity;
    const t = to ? new Date(`${to}T23:59:59.999+05:30`).getTime() : Infinity;
    return expenses
      .filter((e) => !removed.has(e.id))
      .filter((e) => (!type ? true : type === "naveen" ? !!e.naveenPayment : e.type === type))
      .filter((e) => !person || e.paidBy === person || e.owedTo === person || e.splitAmong.includes(person))
      .filter((e) => {
        const d = new Date(e.dateTime).getTime();
        return d >= f && d <= t;
      })
      .sort((a, b) => +new Date(b.dateTime) - +new Date(a.dateTime));
  }, [expenses, removed, person, type, from, to]);

  const filtered = !!(person || type || from || to);

  const deleteButton = (e: Expense, compact: boolean, tabIndex?: number) => {
    const busy = isDeleting(e.id);
    return compact ? (
      <Button variant="ghost" size="icon" onClick={() => remove(e.id)} disabled={busy} aria-busy={busy} aria-label="Delete expense">
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Trash2 className="h-4 w-4 text-destructive" />}
      </Button>
    ) : (
      // min-w fits "Deleting…" too, so the button (and the row) does not change width while deleting.
      <Button variant="outline" size="sm" className="min-w-[7.75rem] text-destructive" onClick={() => remove(e.id)} disabled={busy} aria-busy={busy} tabIndex={tabIndex}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} {busy ? "Deleting…" : "Delete"}
      </Button>
    );
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="grid grid-cols-2 items-end gap-3 lg:grid-cols-4">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-muted-foreground">Person</span>
            <Select value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">All people</option>
              {PEOPLE.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-muted-foreground">Type</span>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              <option value="trip">Trip</option>
              <option value="personal">Personal</option>
              <option value="naveen">Naveen&apos;s payments</option>
            </Select>
          </label>
          {/* Below 360px a half-width date field cannot fit the date plus the 40px clear button. */}
          <DateField label="From" value={from} onChange={setFrom} className="max-[359px]:col-span-2" />
          <DateField label="To" value={to} onChange={setTo} className="max-[359px]:col-span-2" />
        </div>
        <div className="flex min-h-10 items-center justify-between gap-3 text-xs text-muted-foreground lg:min-h-8">
          <span aria-live="polite" className="min-w-0 tabular-nums">
            {loading ? "Loading expenses…" : `${rows.length} expense${rows.length === 1 ? "" : "s"} · ${formatINR(rows.reduce((s, e) => s + Number(e.amount), 0))}`}
          </span>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              className="-mr-3 shrink-0 text-foreground underline underline-offset-2"
              aria-label="Clear filters"
              onClick={() => {
                setPerson("");
                setType("");
                setFrom("");
                setTo("");
              }}
            >
              {/* Short label on phones so the count line never wraps (and moves the list) when this appears. */}
              <span className="sm:hidden">Clear</span>
              <span className="max-sm:hidden">Clear filters</span>
            </Button>
          )}
        </div>

        {/* Phones + tablets: stacked, expandable list */}
        <ul className="-mx-5 divide-y border-t lg:hidden" aria-busy={loading}>
          {loading &&
            [0, 1, 2, 3].map((i) => (
              <li key={i} className="space-y-2 px-5 py-3">
                <div className="flex justify-between gap-3"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-16" /></div>
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </li>
            ))}
          {!loading && rows.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-muted-foreground">{filtered ? "No expenses match these filters" : "No expenses yet"}</li>
          )}
          {!loading &&
            rows.map((e) => {
              const open = expanded.has(e.id);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => toggle(e.id)}
                    aria-expanded={open}
                    aria-controls={`exp-${e.id}`}
                    className="flex w-full items-start gap-2 px-5 py-3 text-left transition-colors [-webkit-tap-highlight-color:transparent] active:bg-muted/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate font-medium">{e.description}</span>
                        <span className="shrink-0 font-medium tabular-nums">{formatINR(Number(e.amount))}</span>
                      </div>
                      <div className="mt-0.5 truncate text-sm text-muted-foreground">{who(e)}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{formatDate(e.dateTime)}</span>
                        <Badge>{e.type === "trip" ? "Trip" : "Personal"}</Badge>
                        {e.type === "trip" && <Badge>{categoryOf(e.category).label}</Badge>}
                        {e.naveenPayment && <Badge>Naveen · {e.naveenPayment}</Badge>}
                      </div>
                    </div>
                    <Chevron open={open} className="mt-1" />
                  </button>
                  <div id={`exp-${e.id}`} className="px-5">
                    <Collapse open={open}>
                      <div className="pb-3">
                        <ExpenseDetails e={e}>
                          <div className="mt-2 flex justify-end">
                            {canDelete(me, e.createdBy) ? (
                              deleteButton(e, false, open ? 0 : -1)
                            ) : (
                              <span className="text-xs text-muted-foreground">Only {e.createdBy ?? "the admin"} can delete this</span>
                            )}
                          </div>
                        </ExpenseDetails>
                      </div>
                    </Collapse>
                  </div>
                </li>
              );
            })}
        </ul>

        {/* Desktop (lg+): fixed-layout table. Description takes the free width and clamps to 2 lines. */}
        <Table containerClassName="hidden lg:block" className="table-fixed" aria-busy={loading}>
          <colgroup>
            <col className="w-[5.5rem]" />
            <col />
            <col className="w-[8.5rem]" />
            <col className="w-[7rem]" />
            <col className="w-[5rem]" />
          </colgroup>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Description</TH>
              <TH>Type</TH>
              <TH className="text-right">Amount</TH>
              <TH><span className="sr-only">Actions</span></TH>
            </TR>
          </THead>
          <TBody>
            {loading &&
              [0, 1, 2, 3].map((i) => (
                <TR key={i}>
                  <TD><Skeleton className="h-4 w-12" /></TD>
                  <TD><Skeleton className="h-4 w-2/3" /><Skeleton className="mt-1.5 h-3 w-1/2" /></TD>
                  <TD><Skeleton className="h-4 w-14" /></TD>
                  <TD><Skeleton className="ml-auto h-4 w-16" /></TD>
                  <TD />
                </TR>
              ))}
            {!loading && rows.length === 0 && (
              <TR>
                <TD colSpan={5} className="py-10 text-center text-muted-foreground">{filtered ? "No expenses match these filters" : "No expenses yet"}</TD>
              </TR>
            )}
            {!loading &&
              rows.map((e) => (
                <TR key={e.id}>
                  <TD className="align-top text-xs leading-5 tabular-nums" title={formatDate(e.dateTime)}>
                    <div className="font-medium text-foreground">{shortDay.format(new Date(e.dateTime))}</div>
                    <div className="text-muted-foreground">{shortTime.format(new Date(e.dateTime))}</div>
                  </TD>
                  <TD className="align-top">
                    <div className="line-clamp-2 break-words font-medium" title={e.description}>{e.description}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground" title={who(e)}>{who(e)}</div>
                  </TD>
                  <TD className="align-top">
                    <div className="flex flex-wrap gap-1">
                      <Badge>{e.type === "trip" ? categoryOf(e.category).label : "Personal lend"}</Badge>
                      {e.naveenPayment && <Badge>Naveen · {e.naveenPayment}</Badge>}
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap text-right align-top font-medium tabular-nums">{formatINR(Number(e.amount))}</TD>
                  <TD className="py-1.5 text-right align-top">
                    {canDelete(me, e.createdBy) ? (
                      deleteButton(e, true)
                    ) : (
                      <span className="inline-block pt-1 text-xs text-muted-foreground" title={`Only ${e.createdBy ?? "the admin"} can delete this`}>
                        by {e.createdBy ?? "—"}
                      </span>
                    )}
                  </TD>
                </TR>
              ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}
