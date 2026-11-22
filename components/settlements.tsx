"use client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { PEOPLE, canDelete } from "@/lib/people";
import { useMe } from "./me";
import { computeBalances, settle } from "@/lib/balances";
import { formatDate, formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import type { Expense, Settlement } from "./types";

export function Settlements({ expenses, settlements, onChanged }: { expenses: Expense[]; settlements: Settlement[]; onChanged: () => void }) {
  const me = useMe();
  const [from, setFrom] = useState<string>(me.person || PEOPLE[0]);
  const [to, setTo] = useState<string>(PEOPLE.find((p) => p !== me.person) ?? PEOPLE[1]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const pending = useMemo(() => settle(computeBalances([...PEOPLE], expenses, settlements).net), [expenses, settlements]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (from === to) return toast.error("From and To must be different");
    if (!(Number(amount) > 0)) return toast.error("Enter a valid amount");
    setBusy(true);
    try {
      const res = await fetch("/api/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromPerson: from, toPerson: to, amount: Number(amount), note }),
      });
      if (!res.ok) throw new Error();
      toast.success("Settlement recorded");
      setAmount("");
      setNote("");
      onChanged();
    } catch {
      toast.error("Could not save settlement");
    } finally {
      setBusy(false);
    }
  }

  async function del(id: number) {
    if (!confirm("Delete this settlement?")) return;
    const res = await fetch(`/api/settlements/${id}`, { method: "DELETE" });
    if (res.ok) (toast.success("Deleted"), onChanged());
    else toast.error((await res.json().catch(() => null))?.error ?? "Delete failed");
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Pending settlements</CardTitle>
          <p className="text-xs text-muted-foreground">Final amounts, trip expenses and personal lends combined</p>
        </CardHeader>
        {pending.length === 0 ? (
          <CardContent><p className="text-sm text-muted-foreground">Everyone is settled up.</p></CardContent>
        ) : (
          <ul className="divide-y border-t">
            {pending.map((t, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
                <span>{t.from} <span className="px-1 text-muted-foreground">→</span> {t.to}</span>
                <span className="flex items-center gap-3">
                  <span className="font-medium tabular-nums">{formatINR(t.amount)}</span>
                  <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => (setFrom(t.from), setTo(t.to), setAmount(String(t.amount)))}>Use</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader><CardTitle>Add settlement</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid grid-cols-2 gap-4 lg:grid-cols-5 lg:items-end">
            <div className="space-y-2">
              <Label htmlFor="sf">From (paid)</Label>
              <Select id="sf" value={from} onChange={(e) => setFrom(e.target.value)}>{PEOPLE.map((p) => <option key={p}>{p}</option>)}</Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="st">To (received)</Label>
              <Select id="st" value={to} onChange={(e) => setTo(e.target.value)}>{PEOPLE.map((p) => <option key={p}>{p}</option>)}</Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sa">Amount (₹)</Label>
              <Input id="sa" type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sn">Note</Label>
              <Input id="sn" value={note} onChange={(e) => setNote(e.target.value)} placeholder="UPI, cash…" />
            </div>
            <Button type="submit" className="col-span-2 lg:col-span-1" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Add</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Completed settlements</CardTitle></CardHeader>
        <ul className="divide-y border-t sm:hidden">
          {settlements.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted-foreground">No settlements yet</li>}
          {settlements.map((s) => (
            <li key={s.id} className="flex items-start gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span>{s.fromPerson} <span className="px-1 text-muted-foreground">→</span> {s.toPerson}</span>
                  <span className="shrink-0 font-medium tabular-nums">{formatINR(Number(s.amount))}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {formatDate(s.createdAt)}{s.note ? ` · ${s.note}` : ""}
                </div>
              </div>
              {canDelete(me, s.createdBy) ? (
                <Button variant="ghost" size="icon" className="-mr-2 shrink-0" onClick={() => del(s.id)} aria-label="Delete settlement">
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              ) : (
                <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">by {s.createdBy ?? "—"}</span>
              )}
            </li>
          ))}
        </ul>
        <CardContent className="hidden sm:block">
          <Table>
            <THead><TR><TH>Date</TH><TH>From</TH><TH>To</TH><TH className="text-right">Amount</TH><TH>Note</TH><TH /></TR></THead>
            <TBody>
              {settlements.length === 0 && <TR><TD colSpan={6} className="py-8 text-center text-muted-foreground">No settlements yet</TD></TR>}
              {settlements.map((s) => (
                <TR key={s.id}>
                  <TD className="whitespace-nowrap">{formatDate(s.createdAt)}</TD>
                  <TD>{s.fromPerson}</TD>
                  <TD>{s.toPerson}</TD>
                  <TD className="whitespace-nowrap text-right tabular-nums">{formatINR(Number(s.amount))}</TD>
                  <TD className="text-muted-foreground">{s.note}</TD>
                  <TD>
                    {canDelete(me, s.createdBy) ? (
                      <Button variant="ghost" size="icon" onClick={() => del(s.id)} aria-label="Delete settlement"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    ) : (
                      <span className="whitespace-nowrap text-xs text-muted-foreground">by {s.createdBy ?? "—"}</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
