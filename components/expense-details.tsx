"use client";
import { ChevronDown } from "lucide-react";
import { PEOPLE } from "@/lib/people";
import { categoryOf } from "@/lib/categories";
import { formatDate, formatINR } from "@/lib/format";
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
  return (
    <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

/** Full details of one expense: full description + every field. */
export function ExpenseDetails({ e, children }: { e: Expense; children?: React.ReactNode }) {
  const trip = e.type === "trip";
  const everyone = e.splitAmong.length === PEOPLE.length;
  const amount = Number(e.amount);
  return (
    <div className="mt-2 rounded-md bg-muted/50 px-3 py-2.5">
      <p className="whitespace-pre-wrap break-words text-sm font-medium">{e.description}</p>
      <div className="mt-1.5 divide-y divide-border/70">
        <DetailRow label={trip ? "Paid by" : "Lent by"}>{e.paidBy}</DetailRow>
        {trip ? (
          <>
            <DetailRow label="Split among">{everyone ? `Everyone (${PEOPLE.length})` : e.splitAmong.join(", ")}</DetailRow>
            <DetailRow label="Each person's share">{formatINR(amount / Math.max(1, e.splitAmong.length))}</DetailRow>
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
