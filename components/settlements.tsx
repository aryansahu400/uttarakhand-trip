"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { PEOPLE, canDelete } from "@/lib/people";
import { useMe } from "./me";
import { computeBalances, settle } from "@/lib/balances";
import { formatDate, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useRowDelete } from "@/components/ui/use-row-delete";
import { toastApiFailure, type Expense, type Reload, type Settlement } from "./types";

const deleteUrl = (id: number) => `/api/settlements/${id}`;

export function Settlements({
  expenses,
  settlements,
  onChanged,
  loading = false,
}: {
  expenses: Expense[];
  settlements: Settlement[];
  onChanged: Reload;
  loading?: boolean;
}) {
  const me = useMe();
  const [from, setFrom] = useState<string>(me.person || PEOPLE[0]);
  const [to, setTo] = useState<string>(PEOPLE.find((p) => p !== me.person) ?? PEOPLE[1]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const amountInput = useRef<HTMLInputElement>(null);
  const { remove, isDeleting, removed } = useRowDelete(deleteUrl, "settlement", onChanged);

  const visible = useMemo(() => settlements.filter((s) => !removed.has(s.id)), [settlements, removed]);
  const pending = useMemo(() => settle(computeBalances([...PEOPLE], expenses, visible).net), [expenses, visible]);

  // Drop the highlight ring shortly after "Use" fills the form.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 1400);
    return () => clearTimeout(t);
  }, [flash]);

  /** "Use": prefill the form, bring it into view (it is below the fold on phones), focus Amount. */
  function applySuggestion(t: { from: string; to: string; amount: number }) {
    setFrom(t.from);
    setTo(t.to);
    setAmount(String(t.amount));
    setFlash(true);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Centre the Amount field (not the whole card) so Amount and the Add button below it clear the
    // floating phone nav; the card itself gets the highlight ring.
    amountInput.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    amountInput.current?.focus({ preventScroll: true });
    // Fixed id: tapping Use again replaces this toast instead of stacking another one.
    toast.success(`Filled: ${t.from} → ${t.to} ${formatINR(t.amount)}`, { id: "use-suggestion", description: "Check the amount, then tap Add." });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (from === to) return toast.error("From and To must be different");
    if (!(Number(amount) > 0)) return toast.error("Enter a valid amount");
    setBusy(true);
    try {
      const res = await fetch("/api/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromPerson: from, toPerson: to, amount: Number(amount), note }),
      });
      if (!res.ok) {
        await toastApiFailure(res, "Could not save settlement"); // 401/403 redirect to sign-in
        return;
      }
      setAmount("");
      setNote("");
      await onChanged(); // pending list reflects the new settlement before we confirm
      toast.success("Settlement recorded");
    } catch {
      toast.error("Could not save settlement. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const deleteButton = (s: Settlement, className?: string, iconClass = "text-destructive") => {
    const deleting = isDeleting(s.id);
    return (
      <Button variant="ghost" size="icon" className={className} onClick={() => remove(s.id)} disabled={deleting} aria-busy={deleting} aria-label="Delete settlement">
        {deleting ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Trash2 className={cn("h-4 w-4", iconClass)} />}
      </Button>
    );
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Pending settlements</CardTitle>
          <p className="text-xs text-muted-foreground">Final amounts, trip expenses and personal lends combined</p>
        </CardHeader>
        {loading ? (
          <ul className="divide-y border-t" aria-busy>
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-5 py-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
              </li>
            ))}
          </ul>
        ) : pending.length === 0 ? (
          <CardContent><p className="text-sm text-muted-foreground">Everyone is settled up.</p></CardContent>
        ) : (
          <ul className="divide-y border-t">
            {pending.map((t) => (
              <li key={`${t.from}-${t.to}`} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
                <span className="min-w-0">{t.from} <span className="px-1 text-muted-foreground">→</span> {t.to}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="font-medium tabular-nums">{formatINR(t.amount)}</span>
                  <Button size="sm" variant="outline" onClick={() => applySuggestion(t)} aria-label={`Use: ${t.from} pays ${t.to} ${formatINR(t.amount)}`}>
                    Use
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        className={cn("scroll-mt-6 transition-shadow duration-300", flash && "shadow-[0_0_0_3px_hsl(var(--ring)/0.35)]")}
      >
        <CardHeader><CardTitle>Add settlement</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid grid-cols-2 gap-x-3 gap-y-4 lg:grid-cols-5 lg:items-end">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="sf">From (paid)</Label>
              <Select id="sf" value={from} onChange={(e) => setFrom(e.target.value)}>{PEOPLE.map((p) => <option key={p}>{p}</option>)}</Select>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="st">To (received)</Label>
              <Select id="st" value={to} onChange={(e) => setTo(e.target.value)}>{PEOPLE.map((p) => <option key={p}>{p}</option>)}</Select>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="sa">Amount (₹)</Label>
              <Input ref={amountInput} id="sa" type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="sn">Note</Label>
              <Input id="sn" value={note} onChange={(e) => setNote(e.target.value)} placeholder="UPI, cash…" />
            </div>
            <Button type="submit" className="col-span-2 lg:col-span-1" disabled={busy} aria-busy={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {busy ? "Adding…" : "Add"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Completed settlements</CardTitle></CardHeader>
        {/* Phones: stacked list (table from md up, where the Note column has room) */}
        <ul className="divide-y border-t md:hidden" aria-busy={loading}>
          {loading &&
            [0, 1].map((i) => (
              <li key={i} className="space-y-2 px-5 py-3"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></li>
            ))}
          {!loading && visible.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted-foreground">No settlements yet</li>}
          {!loading &&
            visible.map((s) => (
              <li key={s.id} className="flex items-start gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span>{s.fromPerson} <span className="px-1 text-muted-foreground">→</span> {s.toPerson}</span>
                    <span className="shrink-0 font-medium tabular-nums">{formatINR(Number(s.amount))}</span>
                  </div>
                  <div className="mt-0.5 break-words text-xs text-muted-foreground">
                    {formatDate(s.createdAt)}{s.note ? ` · ${s.note}` : ""}
                  </div>
                </div>
                {canDelete(me, s.createdBy) ? (
                  deleteButton(s, "-mr-2 -mt-2 shrink-0", "text-muted-foreground")
                ) : (
                  <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">by {s.createdBy ?? "—"}</span>
                )}
              </li>
            ))}
        </ul>
        {/* Tablet / desktop: table */}
        <CardContent className="hidden md:block">
          <Table className="table-fixed" aria-busy={loading}>
            <colgroup>
              <col className="w-[10.25rem] xl:w-[10.5rem]" />
              <col className="w-[5.75rem] xl:w-[6.5rem]" />
              <col className="w-[5.75rem] xl:w-[6.5rem]" />
              <col className="w-[6.25rem] xl:w-[7rem]" />
              <col />
              <col className="w-[4.5rem]" />
            </colgroup>
            <THead><TR><TH>Date</TH><TH>From</TH><TH>To</TH><TH className="text-right">Amount</TH><TH>Note</TH><TH><span className="sr-only">Actions</span></TH></TR></THead>
            <TBody>
              {loading &&
                [0, 1].map((i) => (
                  <TR key={i}>
                    {[0, 1, 2, 3, 4].map((c) => <TD key={c}><Skeleton className="h-4 w-3/4" /></TD>)}
                    <TD />
                  </TR>
                ))}
              {!loading && visible.length === 0 && <TR><TD colSpan={6} className="py-8 text-center text-muted-foreground">No settlements yet</TD></TR>}
              {!loading &&
                visible.map((s) => (
                  <TR key={s.id}>
                    <TD className="truncate text-xs" title={formatDate(s.createdAt)}>{formatDate(s.createdAt)}</TD>
                    <TD className="truncate">{s.fromPerson}</TD>
                    <TD className="truncate">{s.toPerson}</TD>
                    <TD className="whitespace-nowrap text-right tabular-nums">{formatINR(Number(s.amount))}</TD>
                    <TD className="text-muted-foreground" title={s.note ?? undefined}><span className="break-words">{s.note}</span></TD>
                    <TD className="py-1 text-right">
                      {canDelete(me, s.createdBy) ? (
                        deleteButton(s)
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
