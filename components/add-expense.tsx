"use client";
import { useEffect, useMemo, useState } from "react";
import { NAVEEN_PER_PERSON, naveenOverCap, naveenShares, type NaveenMode } from "@/lib/naveen";
import { formatINR } from "@/lib/format";
import { toastApiFailure, type Expense, type Reload } from "./types";
import { shareSummary } from "./expense-details";
import { useMe } from "./me";
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

export function AddExpense({ onSaved, expenses, loading = false }: { onSaved: Reload; expenses: Expense[]; loading?: boolean }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  // Starts empty and is filled on mount: during SSR `nowLocal()` would use the server's time zone
  // (UTC on Vercel), and React keeps that server value in the input on hydration.
  const [dateTime, setDateTime] = useState("");
  useEffect(() => setDateTime((v) => v || nowLocal()), []);
  const me = useMe();
  const [paidBy, setPaidBy] = useState(me.person);
  const [type, setType] = useState<"trip" | "personal">("trip");
  const [split, setSplit] = useState<string[]>([...PEOPLE]);
  const [owedTo, setOwedTo] = useState("");
  const [isNaveen, setIsNaveen] = useState(false);
  const [naveenMode, setNaveenMode] = useState<NaveenMode>("direct");
  const [pickedCategory, setPickedCategory] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);

  // Auto-guess from the description until the user picks one themselves.
  const category: Category = pickedCategory ?? guessCategory(description) ?? "other";

  const naveen = useMemo(() => naveenShares(PEOPLE, expenses), [expenses]);
  const naveenRemaining = NAVEEN_PER_PERSON * PEOPLE.length - naveen.total;

  const toggle = (p: string) => setSplit((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return toast.error("Add a description");
    if (!(Number(amount) > 0)) return toast.error("Enter a valid amount");
    // An empty or half-cleared datetime-local value would make toISOString() throw below.
    if (!dateTime || Number.isNaN(new Date(dateTime).getTime())) return toast.error("Pick a date and time");
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
    if (busy) return;
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
        await toastApiFailure(res, "Could not save expense"); // 401/403 redirect to sign-in
        return;
      }
      setDescription("");
      setAmount("");
      setDateTime(nowLocal());
      setSplit([...PEOPLE]);
      setOwedTo("");
      setIsNaveen(false);
      setNaveenMode("direct");
      setPickedCategory(null);
      await onSaved(); // lists/dashboard are fresh by the time we confirm
      toast.success("Expense added");
    } catch {
      toast.error("Could not save expense. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    // Full width like every other tab; on large screens the form splits into two columns
    // (what / when / kind on the left, who on the right) so fields don't stretch.
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={submit} className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-x-8">
          <div className="min-w-0 space-y-5">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="desc">Description</Label>
              <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Dinner at Rishikesh" />
            </div>
            {/* grid-cols-1 = minmax(0,1fr), so the datetime input's min-content width cannot widen the
                track at 320px. Side by side from sm; stacked again at lg, where this is half of a
                two-column form and Date & time would be too narrow for its value and picker icon. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="amt">Amount (₹)</Label>
                <Input id="amt" type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="dt">Date & time</Label>
                <Input id="dt" type="datetime-local" className="min-w-0" value={dateTime} onChange={(e) => setDateTime(e.target.value)} />
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
                      "flex h-10 items-center gap-2 rounded-full border px-3 text-sm transition-[color,background-color,border-color,transform] [-webkit-tap-highlight-color:transparent] active:scale-[0.97] motion-reduce:active:scale-100 lg:h-9",
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
                    className={cn(
                      "h-10 rounded-md text-sm transition [-webkit-tap-highlight-color:transparent] active:bg-card/70 lg:h-8",
                      type === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="min-w-0 space-y-5">
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
                <div className="grid gap-4 min-[420px]:grid-cols-2">
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
                  <div className="-my-2 -mr-3 flex">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSplit([...PEOPLE])} aria-pressed={split.length === PEOPLE.length}>All</Button>
                    <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setSplit([])}>None</Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PEOPLE.map((p) => (
                    <label key={p} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 text-sm transition-colors [-webkit-tap-highlight-color:transparent] hover:bg-muted/60 active:bg-muted lg:min-h-9">
                      <Checkbox checked={split.includes(p)} onCheckedChange={() => toggle(p)} />
                      {p}
                    </label>
                  ))}
                </div>
                {split.length > 0 && Number(amount) > 0 && (
                  <p className="text-xs text-muted-foreground">{shareSummary(amount, split).label} per person</p>
                )}
                <div className="mt-3 space-y-3 rounded-md border bg-muted/40 p-3">
                  <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium lg:min-h-8">
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
                            className={cn(
                              "min-h-10 rounded-md px-2 py-1 text-xs transition [-webkit-tap-highlight-color:transparent] active:bg-card/70 sm:text-sm lg:min-h-8",
                              naveenMode === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                            )}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                      {/* Totals come from loaded expenses; until then they would read as "₹0 paid", so hold them back. */}
                      <p className="text-xs text-muted-foreground" aria-live="polite">
                        {loading ? (
                          <>Loading Naveen totals… ({formatINR(NAVEEN_PER_PERSON)}/person cap)</>
                        ) : (
                          <>
                            Paid to Naveen so far: {formatINR(naveen.total)} · Remaining: {formatINR(naveenRemaining)} (
                            {formatINR(NAVEEN_PER_PERSON)}/person cap)
                          </>
                        )}
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="lg:col-span-2 lg:flex lg:justify-end lg:border-t lg:pt-4">
            <Button type="submit" className="w-full sm:w-auto sm:min-w-40" disabled={busy} aria-busy={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {busy ? "Saving…" : "Save expense"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
