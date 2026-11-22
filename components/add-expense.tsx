"use client";
import { useMemo, useState } from "react";
import { NAVEEN_PER_PERSON, naveenOverCap, naveenShares, type NaveenMode } from "@/lib/naveen";
import { formatINR } from "@/lib/format";
import type { Expense } from "./types";
import { CATEGORIES, guessCategory, type Category } from "@/lib/categories";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { PEOPLE } from "@/lib/people";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export function AddExpense({ onSaved, expenses }: { onSaved: () => void; expenses: Expense[] }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dateTime, setDateTime] = useState(nowLocal);
  const [paidBy, setPaidBy] = useState("");
  const [type, setType] = useState<"trip" | "personal">("trip");
  const [split, setSplit] = useState<string[]>([...PEOPLE]);
  const [owedTo, setOwedTo] = useState("");
  const [isNaveen, setIsNaveen] = useState(false);
  const [naveenMode, setNaveenMode] = useState<NaveenMode>("direct");
  const [pickedCategory, setPickedCategory] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);

  // Auto-guess from the description until the user picks one themselves.
  const category: Category = pickedCategory ?? guessCategory(description) ?? "other";

  const naveen =useMemo(() => naveenShares(PEOPLE, expenses), [expenses]);
  const naveenRemaining = NAVEEN_PER_PERSON * PEOPLE.length - naveen.total;

  const toggle = (p: string) => setSplit((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return toast.error("Add a description");
    if (!(Number(amount) > 0)) return toast.error("Enter a valid amount");
    if (!paidBy) return toast.error(type === "trip" ? "Select who paid" : "Select who lent the money");
    if (type === "trip" && split.length === 0) return toast.error("Select at least one person to split among");
    if (type === "personal" && (!owedTo || owedTo === paidBy)) return toast.error("Select who borrowed the money");
    const sendNaveen = type === "trip" && isNaveen ? naveenMode : null;
    if (sendNaveen) {
      const over = naveenOverCap(PEOPLE, expenses, { amount: Number(amount), type, splitAmong: split, naveenPayment: sendNaveen });
      if (over.length)
        return toast.error(
          `Naveen's payment would exceed ${formatINR(NAVEEN_PER_PERSON)}/person for ${over.map((o) => `${o.person} (+${formatINR(o.over)})`).join(", ")}`
        );
    }
    setBusy(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          amount: Number(amount),
          dateTime: new Date(dateTime).toISOString(),
          paidBy,
          type,
          splitAmong: type === "trip" ? split : [],
          owedTo: type === "personal" ? owedTo : null,
          naveenPayment: sendNaveen,
          category,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : "Could not save expense");
      }
      toast.success("Expense added");
      setDescription("");
      setAmount("");
      setDateTime(nowLocal());
      setSplit([...PEOPLE]);
      setOwedTo("");
      setIsNaveen(false);
      setNaveenMode("direct");
      setPickedCategory(null);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save expense");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardContent className="pt-5">
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="desc">Description</Label>
            <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Dinner at Rishikesh" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="amt">Amount (₹)</Label>
              <Input id="amt" type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dt">Date & time</Label>
              <Input id="dt" type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Category">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={category === c.value}
                  onClick={() => setPickedCategory(c.value)}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors",
                    category === c.value ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                  {c.label}
                </button>
              ))}
            </div>
            {!pickedCategory && guessCategory(description) && (
              <p className="text-xs text-muted-foreground">Picked automatically from the description. Tap to change.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup">
              {([["trip", "Trip Expense"], ["personal", "Personal Lend"]] as const).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={type === v}
                  onClick={() => setType(v)}
                  className={cn("rounded-md py-1.5 text-sm transition", type === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          {type === "trip" ? (
            <div className="space-y-2">
              <Label htmlFor="paid">Paid by</Label>
              <Select id="paid" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
                <option value="">Select person…</option>
                {PEOPLE.map((p) => <option key={p}>{p}</option>)}
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paid">Lent by</Label>
                  <Select id="paid" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
                    <option value="">Select person…</option>
                    {PEOPLE.map((p) => <option key={p}>{p}</option>)}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="owed">Borrowed by</Label>
                  <Select id="owed" value={owedTo} onChange={(e) => setOwedTo(e.target.value)}>
                    <option value="">Select person…</option>
                    {PEOPLE.filter((p) => p !== paidBy).map((p) => <option key={p}>{p}</option>)}
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {paidBy && owedTo
                  ? `${owedTo} owes ${paidBy}${Number(amount) > 0 ? ` ${formatINR(Number(amount))}` : ""}. Not part of the trip split.`
                  : "Money one person paid for another. Not part of the trip split."}
              </p>
            </div>
          )}
          {type === "trip" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Split among</Label>
                <div className="flex gap-3 text-xs">
                  <button type="button" className="text-foreground hover:underline" onClick={() => setSplit([...PEOPLE])}>All</button>
                  <button type="button" className="text-muted-foreground hover:underline" onClick={() => setSplit([])}>None</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PEOPLE.map((p) => (
                  <label key={p} className="flex cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm hover:bg-muted/60">
                    <Checkbox checked={split.includes(p)} onCheckedChange={() => toggle(p)} />
                    {p}
                  </label>
                ))}
              </div>
              {split.length > 0 && Number(amount) > 0 && (
                <p className="text-xs text-muted-foreground">≈ ₹{(Number(amount) / split.length).toFixed(2)} per person</p>
              )}
              <div className="mt-3 space-y-3 rounded-md border bg-muted/40 p-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <Checkbox checked={isNaveen} onCheckedChange={(c) => setIsNaveen(c === true)} />
                  Naveen&apos;s payment (travel agency)
                </label>
                {isNaveen && (
                  <>
                    <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Naveen payment kind">
                      {([["direct", "Direct (paid to him)"], ["indirect", "Indirect (hotel, petrol…)"]] as const).map(([v, l]) => (
                        <button
                          key={v}
                          type="button"
                          role="radio"
                          aria-checked={naveenMode === v}
                          onClick={() => setNaveenMode(v)}
                          className={cn("rounded-md px-2 py-1.5 text-xs transition sm:text-sm", naveenMode === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Paid to Naveen so far: {formatINR(naveen.total)} · Remaining: {formatINR(naveenRemaining)} (
                      {formatINR(NAVEEN_PER_PERSON)}/person cap)
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
          <Button type="submit" className="w-full sm:w-auto" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save expense
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
