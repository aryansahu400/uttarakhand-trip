"use client";
import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { PEOPLE } from "@/lib/people";
import { categoryOf } from "@/lib/categories";
import { formatDate, formatINR } from "@/lib/format";
import { expenseShares } from "@/lib/balances";
import { cn } from "@/lib/utils";
import type { Expense } from "./types";
import { PersonName } from "./avatar";

export function Chevron({ open, className }: { open: boolean; className?: string }) {
  return <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180", className)} />;
}

export function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

/** Animated open/close wrapper (CSS grid rows 0fr ↔ 1fr). */
export function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  // A collapsed panel is only 0px tall, so its buttons would still be reachable by Tab and screen readers.
  // `inert` takes them out; it is set via the DOM because React 18 has no typed boolean `inert` prop.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.toggleAttribute("inert", !open);
  }, [open]);
  return (
    <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
      <div ref={ref} className="overflow-hidden">{children}</div>
    </div>
  );
}

const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * What each person is charged for a trip expense, from core's expenseShares (lib/balances), the same
 * maths the balances use (empty split = everyone, duplicates removed).
 * - divides evenly to the paisa: one amount ("₹50", "₹33.50"; formatINR: whole rupees bare, else 2 decimals)
 * - does not (₹100 ÷ 3): a range of the whole-paise parts, both ends in 2 decimals ("₹33.33–₹33.34"),
 *   with `detail` saying it is the total split equally, so no single rounded figure is presented as exact.
 */
export function shareSummary(amount: number | string, splitAmong: readonly string[]): { label: string; detail: string | null } {
  const e = { amount, paidBy: "", type: "trip" as const, splitAmong: [...splitAmong], owedTo: null };
  const parts = expenseShares(e, PEOPLE, { exactSum: true }).map(([, v]) => Math.round(v * 100));
  if (!parts.length) return { label: formatINR(0), detail: null };
  const lo = Math.min(...parts), hi = Math.max(...parts);
  if (lo === hi) return { label: formatINR(lo / 100), detail: null };
  return {
    label: `${inr2.format(lo / 100)}–${inr2.format(hi / 100)}`,
    detail: `${formatINR(Number(amount))} split equally ${parts.length} ways`,
  };
}

/** Full details of one expense: full description + every field. */
export function ExpenseDetails({ e, children }: { e: Expense; children?: React.ReactNode }) {
  const trip = e.type === "trip";
  // De-duplicate defensively: old rows may repeat a name, which must not read as "Everyone" or skew the share.
  const split = [...new Set(e.splitAmong)];
  // An empty list means "everyone" (same rule as the balances).
  const everyone = split.length === 0 || PEOPLE.every((p) => split.includes(p));
  const share = shareSummary(e.amount, split);
  return (
    <div className="mt-2 rounded-md bg-muted/50 px-3 py-2.5">
      <p className="whitespace-pre-wrap break-words text-sm font-medium">{e.description}</p>
      <div className="mt-1.5 divide-y divide-border/70">
        <DetailRow label={trip ? "Paid by" : "Lent by"}>{e.paidBy}</DetailRow>
        {trip ? (
          <>
            <DetailRow label="Split among">{everyone ? `Everyone (${PEOPLE.length})` : split.join(", ")}</DetailRow>
            <DetailRow label="Each person's share">
              <span className="tabular-nums">{share.label}</span>
              {share.detail && <span className="mt-0.5 block text-xs text-muted-foreground">{share.detail}</span>}
            </DetailRow>
          </>
        ) : (
          <DetailRow label="Borrowed by">{e.owedTo}</DetailRow>
        )}
        <DetailRow label="Date & time">{formatDate(e.dateTime)}</DetailRow>
        <DetailRow label="Category">{categoryOf(e.category).label}</DetailRow>
        <DetailRow label="Type">{trip ? "Trip expense" : "Personal lend"}</DetailRow>
        <DetailRow label="Added by">{e.createdBy ? <PersonName name={e.createdBy} size={18} /> : "—"}</DetailRow>
        {e.naveenPayment && (
          <DetailRow label="Naveen">{e.naveenPayment === "direct" ? "Direct (paid to him)" : "Indirect (adjusted)"}</DetailRow>
        )}
      </div>
      {children}
    </div>
  );
}
