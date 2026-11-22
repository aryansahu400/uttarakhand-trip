"use client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { PEOPLE } from "@/lib/people";
import { formatDate, formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import type { Expense } from "./types";
import { Chevron, Collapse, ExpenseDetails } from "./expense-details";
import { categoryOf } from "@/lib/categories";

const splitLabel = (e: Expense) => (e.splitAmong.length === PEOPLE.length ? "split among everyone" : `split among ${e.splitAmong.join(", ")}`);

export function RawExpenses({ expenses, onChanged }: { expenses: Expense[]; onChanged: () => void }) {
  const [person, setPerson] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const rows = useMemo(() => {
    const f = from ? new Date(from + "T00:00:00").getTime() : -Infinity;
    const t = to ? new Date(to + "T23:59:59.999").getTime() : Infinity;
    return expenses
      .filter((e) => (!type ? true : type === "naveen" ? !!e.naveenPayment : e.type === type))
      .filter((e) => !person || e.paidBy === person || e.owedTo === person || e.splitAmong.includes(person))
      .filter((e) => {
        const d = new Date(e.dateTime).getTime();
        return d >= f && d <= t;
      })
      .sort((a, b) => +new Date(b.dateTime) - +new Date(a.dateTime));
  }, [expenses, person, type, from, to]);

  async function del(id: number) {
    if (!confirm("Delete this expense?")) return;
    const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Deleted");
      onChanged();
    } else toast.error("Delete failed");
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
          <Select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person">
            <option value="">All people</option>
            {PEOPLE.map((p) => <option key={p}>{p}</option>)}
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
            <option value="">All types</option>
            <option value="trip">Trip</option>
            <option value="personal">Personal</option>
            <option value="naveen">Naveen&apos;s payments</option>
          </Select>
          <DateField label="From" value={from} onChange={setFrom} />
          <DateField label="To" value={to} onChange={setTo} />
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {rows.length} expense{rows.length === 1 ? "" : "s"} · {formatINR(rows.reduce((s, e) => s + Number(e.amount), 0))}
          </span>
          {(person || type || from || to) && (
            <button
              type="button"
              onClick={() => {
                setPerson("");
                setType("");
                setFrom("");
                setTo("");
              }}
              className="text-foreground underline underline-offset-2"
            >
              Clear filters
            </button>
          )}
        </div>
        {/* Phone: stacked list */}
        <ul className="-mx-5 divide-y border-t sm:hidden">
          {rows.length === 0 && <li className="px-5 py-10 text-center text-sm text-muted-foreground">No expenses found</li>}
          {rows.map((e) => {
            const open = expanded.has(e.id);
            return (
              <li key={e.id} className="px-5 py-3">
                <button
                  type="button"
                  onClick={() => toggle(e.id)}
                  aria-expanded={open}
                  aria-controls={`exp-${e.id}`}
                  className="flex w-full items-start gap-2 text-left [-webkit-tap-highlight-color:transparent]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium">{e.description}</span>
                      <span className="shrink-0 font-medium tabular-nums">{formatINR(Number(e.amount))}</span>
                    </div>
                    <div className="mt-0.5 truncate text-sm text-muted-foreground">
                      {e.type === "personal" ? `${e.paidBy} lent to ${e.owedTo}` : `${e.paidBy} paid · ${splitLabel(e)}`}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{formatDate(e.dateTime)}</span>
                      <Badge>{e.type === "trip" ? "Trip" : "Personal"}</Badge>
                      {e.type === "trip" && <Badge>{categoryOf(e.category).label}</Badge>}
                      {e.naveenPayment && <Badge>Naveen · {e.naveenPayment}</Badge>}
                    </div>
                  </div>
                  <Chevron open={open} className="mt-1" />
                </button>
                <div id={`exp-${e.id}`}>
                  <Collapse open={open}>
                    <ExpenseDetails e={e}>
                      <div className="mt-2 flex justify-end">
                        <Button variant="outline" size="sm" className="text-destructive" onClick={() => del(e.id)} tabIndex={open ? 0 : -1}>
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </Button>
                      </div>
                    </ExpenseDetails>
                  </Collapse>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Tablet / desktop: table */}
        <Table className="hidden sm:table">
          <THead>
            <TR>
              <TH>Date/Time</TH><TH>Description</TH><TH className="text-right">Amount</TH><TH>Paid by</TH><TH>Type</TH><TH>Split among / Owed to</TH><TH />
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 && (
              <TR><TD colSpan={7} className="py-10 text-center text-muted-foreground">No expenses found</TD></TR>
            )}
            {rows.map((e) => (
              <TR key={e.id}>
                <TD className="whitespace-nowrap">{formatDate(e.dateTime)}</TD>
                <TD className="min-w-[140px] font-medium">{e.description}</TD>
                <TD className="whitespace-nowrap text-right tabular-nums">{formatINR(Number(e.amount))}</TD>
                <TD>{e.paidBy}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    <Badge>{e.type === "trip" ? "Trip" : "Personal"}</Badge>
                  {e.type === "trip" && <Badge>{categoryOf(e.category).label}</Badge>}
                    {e.naveenPayment && (
                      <Badge>
                        Naveen · {e.naveenPayment}
                      </Badge>
                    )}
                  </div>
                </TD>
                <TD className="min-w-[160px] text-muted-foreground">
                  {e.type === "personal" ? e.owedTo : splitLabel(e)}
                </TD>
                <TD>
                  <Button variant="ghost" size="icon" onClick={() => del(e.id)} aria-label="Delete expense">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}
