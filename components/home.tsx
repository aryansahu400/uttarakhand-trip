"use client";
import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CircleCheck,
  Equal,
  HandCoins,
  Mail,
  Medal,
  Mountain,
  PenLine,
  Plus,
  ReceiptText,
  ShieldCheck,
  Trophy,
  Wallet,
} from "lucide-react";
import { PEOPLE } from "@/lib/people";
import { dayKey, dayLabel, personalSummary, type ActivityItem, type PersonalSummary, type VsOthers } from "@/lib/analytics";
import { categoryOf } from "@/lib/categories";
import { NAVEEN_PER_PERSON, isNaveenMember } from "@/lib/naveen";
import { formatINR, formatINR0 } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Transfer } from "@/lib/balances";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "./avatar";
import { useMe, type Me } from "./me";
import type { Expense, Settlement } from "./types";

/* Data-viz colours (same validated palette as the Dashboard): "you" is the one highlighted series,
 * everyone else is a neutral grey, and the dashed line is a reference, not a series. */
const YOU = "#2a78d6";
const PEER = "#cdd3db";

/** "₹1,234" with an explicit + / − sign (true minus sign, not a hyphen). */
const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + formatINR(Math.abs(n));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** Positive balance = the group owes you; negative = you owe. Text colour carries the same meaning as the icon + words. */
const tone = (n: number) => (n > 0 ? "text-emerald-700" : n < 0 ? "text-red-700" : "text-[#0f2238]");

export type SettleSuggestion = Transfer;

/**
 * Home: the signed-in member's own summary of the whole trip — profile, balance (and how it is made up),
 * who to pay / who pays them, how they compare with the others, where their share went, day by day,
 * and their recent activity. Everything comes from personalSummary(), the same paise-exact maths as the
 * Dashboard and Settlements, and is drawn with plain HTML/CSS so this landing tab stays light.
 */
export function Home({
  expenses,
  settlements,
  loading = false,
  onNavigate,
  onSettle,
}: {
  expenses: Expense[];
  settlements: Settlement[];
  loading?: boolean;
  /** Switch to another tab ("add", "raw", "dash", "settle"). */
  onNavigate: (tab: string) => void;
  /** Open Settlements with this payment filled in. */
  onSettle: (t: SettleSuggestion) => void;
}) {
  const me = useMe();
  const s = useMemo(() => personalSummary(me.person, expenses, settlements), [me.person, expenses, settlements]);
  const nothingYet = !loading && expenses.length === 0 && settlements.length === 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <ProfileHero me={me} s={s} loading={loading} />

      {loading ? (
        <HomeSkeleton />
      ) : nothingYet ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f0fa] text-[#2a78d6]">
            <Mountain className="h-6 w-6" aria-hidden />
          </span>
          <p className="text-base font-semibold">No expenses yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add the first expense of the trip and your personal summary will appear here.
          </p>
          <Button onClick={() => onNavigate("add")} className="mt-1 gap-2">
            <Plus className="h-4 w-4" aria-hidden /> Add expense
          </Button>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-5">
            <BalanceCard s={s} className="lg:col-span-3" onSettle={onSettle} onNavigate={onNavigate} />
            <SettleCard s={s} className="lg:col-span-2" onSettle={onSettle} />
          </div>

          <KpiTiles s={s} />

          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-5">
            <CompareCard s={s} className="lg:col-span-3" />
            <CategoryCard s={s} className="lg:col-span-2" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-5">
            <DailyCard s={s} className="lg:col-span-2" />
            <RecentCard s={s} className="lg:col-span-3" onNavigate={onNavigate} />
          </div>

          {(s.awards.length > 0 || s.owesYouPersonally.length > 0 || s.youOwePersonally.length > 0) && (
            <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
              {(s.owesYouPersonally.length > 0 || s.youOwePersonally.length > 0) && <LendsCard s={s} />}
              {s.awards.length > 0 && <AwardsCard s={s} />}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ================================================================================================
 * Profile hero — a liquid-glass card that floats over the bottom of the mountain banner.
 * ============================================================================================== */

function ProfileHero({ me, s, loading }: { me: Me; s: PersonalSummary; loading: boolean }) {
  return (
    // Pulled up over the banner (which sits just above every tab) so the glass frosts the mountains.
    <section aria-label="Your profile" className="relative z-10 -mt-10 sm:-mt-14">
      <div className="glass overflow-hidden rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-3 sm:gap-4">
          <Avatar name={me.person} src={me.image} size={64} className="shadow-md ring-[3px] ring-white" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#3a4e66]">Your trip summary</p>
            <h2 className="truncate text-xl font-semibold tracking-tight text-[#0f2238] sm:text-2xl">{me.person}</h2>
            {me.email && (
              <p className="flex min-w-0 items-center gap-1.5 text-sm text-[#3a4e66]">
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{me.email}</span>
              </p>
            )}
          </div>
          <StatusPill s={s} loading={loading} className="hidden sm:inline-flex" />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {me.isAdmin && (
            <Chip>
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Trip admin
            </Chip>
          )}
          {loading ? (
            <Skeleton className="h-6 w-40 rounded-full" />
          ) : (
            <>
              {s.tripCount > 0 && <Chip>{plural(s.tripCount, "shared expense")}</Chip>}
              {s.activeDays > 0 && <Chip>{plural(s.activeDays, "trip day")}</Chip>}
              {s.awards.length > 0 && (
                <Chip>
                  <Trophy className="h-3.5 w-3.5 text-amber-600" aria-hidden /> {plural(s.awards.length, "award")}
                </Chip>
              )}
            </>
          )}
        </div>

      </div>
    </section>
  );
}

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/60 px-2.5 py-1 text-xs text-[#0f2238] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
    {children}
  </span>
);

/** Net position in words + icon + colour (never colour alone). */
function StatusPill({ s, loading, className }: { s: PersonalSummary; loading: boolean; className?: string }) {
  if (loading) return <Skeleton className={cn("h-10 w-44 rounded-full", className)} />;
  const n = s.net;
  const Icon = n > 0 ? HandCoins : n < 0 ? Wallet : CircleCheck;
  const text = n > 0 ? `You get back ${formatINR(n)}` : n < 0 ? `You owe ${formatINR(-n)}` : "All settled up";
  return (
    <span
      className={cn(
        "items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-sm ring-1 backdrop-blur",
        n > 0 ? "bg-emerald-50/90 text-emerald-800 ring-emerald-200" : n < 0 ? "bg-red-50/90 text-red-800 ring-red-200" : "bg-white/75 text-[#0f2238] ring-black/5",
        className
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="tabular-nums">{text}</span>
    </span>
  );
}

/* ================================================================================================
 * Balance — the headline, how it is made up, and what to do next.
 * ============================================================================================== */

function BalanceCard({
  s,
  className,
  onSettle,
  onNavigate,
}: {
  s: PersonalSummary;
  className?: string;
  onSettle: (t: SettleSuggestion) => void;
  onNavigate: (tab: string) => void;
}) {
  const n = s.net;
  const label = n > 0 ? "You get back" : n < 0 ? "You owe" : "Your balance";
  const counterparties = n > 0 ? s.getsFrom.map((t) => t.from) : s.paysTo.map((t) => t.to);
  const sentence =
    n > 0
      ? `${listNames(counterparties)} ${counterparties.length === 1 ? "pays" : "pay"} you — see Settle up.`
      : n < 0
        ? `Pay ${listNames(counterparties)} to be square with the group.`
        : "You're all square with the group.";
  // How much of the balance they started with (before any settlement) is cleared.
  const start = Math.abs(s.netBeforeSettlements);
  const cleared = start > 0 ? Math.round(start * s.settledPct * 100) / 100 : 0;

  const rows: { label: string; value: number; hint?: string }[] = [
    { label: "Paid for the group", value: s.paid },
    { label: "Your share of trip costs", value: -s.share },
    ...(s.lent ? [{ label: "Lent to friends", value: s.lent }] : []),
    ...(s.borrowed ? [{ label: "Borrowed from friends", value: -s.borrowed }] : []),
    ...(s.settledPaid ? [{ label: "Settlements you paid", value: s.settledPaid }] : []),
    ...(s.settledReceived ? [{ label: "Settlements you received", value: -s.settledReceived }] : []),
    ...(s.rounding ? [{ label: "Rounding", value: s.rounding, hint: "Balances are rounded to the paisa once for the whole group" }] : []),
  ];

  return (
    <Card className={cn("flex flex-col overflow-hidden", className)}>
      <div className="relative bg-gradient-to-br from-[#e9f1fb] via-[#f6f9fd] to-white px-5 pb-5 pt-5">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl", tone(n))}>{formatINR(Math.abs(n))}</p>
        <p className="mt-1 text-sm text-muted-foreground">{sentence}</p>
        {start > 0 && (
          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-muted-foreground">
                {formatINR(cleared)} of {formatINR(start)} settled
              </span>
              <span className="font-medium tabular-nums">{pct(s.settledPct)}</span>
            </div>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#dde6f1]"
              role="progressbar"
              aria-label="Your balance settled"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(s.settledPct * 100)}
            >
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: pct(s.settledPct), background: YOU }} />
            </div>
          </div>
        )}
      </div>

      {/* How the balance is made up — the same sums the app uses, so every number can be checked by hand. */}
      <dl className="flex-1 space-y-1 border-t px-5 py-4 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3" title={r.hint}>
            <dt className="min-w-0 text-muted-foreground">{r.label}</dt>
            <dd className="shrink-0 tabular-nums">{signed(r.value)}</dd>
          </div>
        ))}
        <div className="mt-2 flex items-baseline justify-between gap-3 border-t pt-2 font-semibold">
          <dt>Balance</dt>
          <dd className={cn("tabular-nums", tone(n))}>{signed(n)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2 border-t px-5 py-4">
        {s.paysTo.length > 0 && (
          <Button onClick={() => onSettle(s.paysTo[0])} className="gap-2">
            <Wallet className="h-4 w-4" aria-hidden /> Settle up with {s.paysTo[0].to}
          </Button>
        )}
        <Button variant="outline" onClick={() => onNavigate("add")} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden /> Add expense
        </Button>
      </div>
    </Card>
  );
}

const listNames = (names: string[]) =>
  names.length <= 1 ? names[0] ?? "" : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/* ================================================================================================
 * Settle up — the final transfers that involve you (trip + personal lends combined).
 * ============================================================================================== */

function SettleCard({ s, className, onSettle }: { s: PersonalSummary; className?: string; onSettle: (t: SettleSuggestion) => void }) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <CardTitle>Settle up</CardTitle>
        <p className="text-xs text-muted-foreground">Final amounts · trip expenses and personal lends combined</p>
      </CardHeader>
      <TransferGroup
        title="You pay"
        empty="You don't owe anyone."
        items={s.paysTo}
        name={(t) => t.to}
        amountClass="text-red-700"
        onRecord={onSettle}
        recordLabel={(t) => `Record: you pay ${t.to} ${formatINR(t.amount)}`}
      />
      <TransferGroup
        title="Pays you"
        empty="Nobody owes you."
        items={s.getsFrom}
        name={(t) => t.from}
        amountClass="text-emerald-700"
        onRecord={onSettle}
        recordLabel={(t) => `Record: ${t.from} pays you ${formatINR(t.amount)}`}
      />
    </Card>
  );
}

function TransferGroup({
  title,
  empty,
  items,
  name,
  amountClass,
  onRecord,
  recordLabel,
}: {
  title: string;
  empty: string;
  items: Transfer[];
  name: (t: Transfer) => string;
  amountClass: string;
  onRecord: (t: Transfer) => void;
  recordLabel: (t: Transfer) => string;
}) {
  return (
    <section className="border-t px-5 py-3" aria-label={title}>
      <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h4>
      {items.length === 0 ? (
        <p className="py-1.5 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y">
          {items.map((t) => (
            <li key={`${t.from}-${t.to}`} className="flex items-center gap-3 py-2">
              <Avatar name={name(t)} size={32} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{name(t)}</span>
              <span className={cn("shrink-0 text-sm font-semibold tabular-nums", amountClass)}>{formatINR(t.amount)}</span>
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => onRecord(t)} aria-label={recordLabel(t)}>
                Record
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ================================================================================================
 * KPI tiles
 * ============================================================================================== */

function KpiTiles({ s }: { s: PersonalSummary }) {
  const naveenPct = Math.min(1, s.naveenPaid / NAVEEN_PER_PERSON);
  return (
    <section aria-label="Your numbers" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
      <Tile icon={Wallet} label="You paid" value={formatINR0(s.paid)} sub={`${plural(s.paidCount, "payment")} for the group`}>
        <VsChip v={s.paidVsOthers} />
      </Tile>
      <Tile icon={ReceiptText} label="Your share" value={formatINR0(s.share)} sub={s.tripTotal > 0 ? `${pct(s.shareOfTrip)} of the ${formatINR0(s.tripTotal)} trip` : "No trip costs yet"}>
        <VsChip v={s.shareVsOthers} />
      </Tile>
      <Tile
        icon={CalendarDays}
        label="Per trip day"
        value={formatINR0(s.avgPerDay)}
        sub={s.activeDays ? `Your share over ${plural(s.activeDays, "day")} with spend` : "No days with spend yet"}
      />
      {isNaveenMember(s.person) ? (
        <Tile icon={Mountain} label="Naveen package" value={formatINR0(s.naveenPaid)} sub={`of ${formatINR0(NAVEEN_PER_PERSON)} · ${pct(naveenPct)} paid`} progress={naveenPct} />
      ) : (
        <Tile icon={Mountain} label="Naveen package" value="Not included" sub="You're not on Naveen's package" />
      )}
      <Tile
        icon={Medal}
        label="Payer rank"
        value={s.paid > 0 ? `#${s.payerRank}${s.payerRankTied ? " (tied)" : ""}` : "–"}
        sub={s.paid > 0 ? `of ${PEOPLE.length} by amount paid` : "You haven't paid for the group yet"}
      />
      <Tile
        icon={Trophy}
        label="Biggest payment"
        value={s.biggestPaid ? formatINR0(Number(s.biggestPaid.amount)) : "–"}
        sub={s.biggestPaid ? s.biggestPaid.description : "Nothing paid yet"}
      />
      <Tile icon={HandCoins} label="Personal lends" value={`Lent ${formatINR0(s.lent)}`} sub={`Borrowed ${formatINR0(s.borrowed)}`} />
      <Tile
        icon={PenLine}
        label="Entries you added"
        value={String(s.added.expenses + s.added.settlements)}
        sub={`${plural(s.added.expenses, "expense")} · ${plural(s.added.settlements, "settlement")}`}
      />
    </section>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  progress,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  sub?: string;
  progress?: number;
  children?: React.ReactNode;
}) {
  return (
    <Card className="flex min-w-0 flex-col gap-1 p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div className="truncate text-xl font-semibold tabular-nums tracking-tight">{value}</div>
      {sub && (
        <div className="line-clamp-2 text-xs text-muted-foreground" title={sub}>
          {sub}
        </div>
      )}
      {progress !== undefined && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full" style={{ width: pct(progress), background: YOU }} />
        </div>
      )}
      {children && <div className="mt-auto pt-1.5">{children}</div>}
    </Card>
  );
}

/**
 * "↗ 64% above others' avg" — short enough for a half-width tile on a phone (the exact rupee gap is in
 * "How you compare"). Neutral colour: paying more or less is not good or bad in itself.
 */
function VsChip({ v }: { v: VsOthers }) {
  const Icon = v.diff > 0 ? ArrowUpRight : v.diff < 0 ? ArrowDownRight : Equal;
  const dir = v.diff > 0 ? "above" : "below";
  const text =
    v.diff === 0
      ? "Same as others' avg"
      : v.pct !== null
        ? `${pct(Math.abs(v.pct))} ${dir} others' avg`
        : `${formatINR0(Math.abs(v.diff))} ${dir} others' avg`;
  return (
    <span
      className="inline-flex max-w-full items-start gap-1 rounded-lg bg-[#eef3f9] px-2 py-1 text-[11px] font-medium leading-tight text-[#1d3557]"
      title={`Others' average (${PEOPLE.length - 1} members): ${formatINR(v.avg)}`}
    >
      <Icon className="mt-px h-3 w-3 shrink-0" aria-hidden />
      <span>{text}</span>
    </span>
  );
}

/* ================================================================================================
 * How you compare — everyone's paid / share, you highlighted, the others' average as a dashed line.
 * ============================================================================================== */

function CompareCard({ s, className }: { s: PersonalSummary; className?: string }) {
  const [metric, setMetric] = useState<"paid" | "share">("paid");
  const v = metric === "paid" ? s.paidVsOthers : s.shareVsOthers;
  const mine = metric === "paid" ? s.paid : s.share;
  const rows = [...s.peers].sort((a, b) => b[metric] - a[metric] || PEOPLE.indexOf(a.person as (typeof PEOPLE)[number]) - PEOPLE.indexOf(b.person as (typeof PEOPLE)[number]));
  const max = Math.max(1, v.avg, ...rows.map((r) => r[metric]));
  const at = (x: number) => `${Math.min(100, (x / max) * 100)}%`;
  const verb = metric === "paid" ? "paid" : "your share is";
  const sentence =
    v.diff === 0
      ? `You're exactly at the others' average (${formatINR(v.avg)}).`
      : metric === "paid"
        ? `You paid ${formatINR(Math.abs(v.diff))} ${v.diff > 0 ? "more" : "less"} than the others' average of ${formatINR(v.avg)}.`
        : `Your share is ${formatINR(Math.abs(v.diff))} ${v.diff > 0 ? "more" : "less"} than the others' average of ${formatINR(v.avg)}.`;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>How you compare</CardTitle>
          <p className="text-xs text-muted-foreground">{sentence}</p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-xs" role="radiogroup" aria-label="Compare by">
          {(
            [
              ["paid", "Paid"],
              ["share", "Share"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={metric === k}
              onClick={() => setMetric(k)}
              className={cn(
                "min-h-9 rounded-md px-3 transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                metric === k ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="space-y-2.5" aria-label={`Everyone's ${metric === "paid" ? "amount paid" : "share"}; you ${verb} ${formatINR(mine)}`}>
          {rows.map((r) => {
            const you = r.person === s.person;
            return (
              <li key={r.person} className="grid grid-cols-[6.25rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[7rem_1fr_auto]">
                <span className={cn("flex min-w-0 items-center gap-2", you && "font-semibold")}>
                  <Avatar name={r.person} size={22} />
                  <span className="truncate">{you ? "You" : r.person}</span>
                </span>
                <span className="relative h-2.5 rounded-full bg-muted">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
                    style={{ width: at(r[metric]), background: you ? YOU : PEER }}
                  />
                  {/* The others' average, repeated on every row so it reads as one vertical line. */}
                  <span aria-hidden className="absolute -inset-y-1.5 w-0 border-l border-dashed border-[#0f2238]/45" style={{ left: at(v.avg) }} />
                </span>
                <span className={cn("w-16 text-right text-xs tabular-nums sm:w-20", you ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {formatINR0(r[metric])}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm" style={{ background: YOU }} /> You
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm" style={{ background: PEER }} /> Others
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-0 border-l border-dashed border-[#0f2238]/60" /> Others&apos; average {formatINR0(v.avg)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================================================
 * Where your share went — one stacked bar + legend.
 * ============================================================================================== */

function CategoryCard({ s, className }: { s: PersonalSummary; className?: string }) {
  const cats = s.byCategory.filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  const total = cats.reduce((x, c) => x + c.amount, 0);
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <CardTitle>Where your share went</CardTitle>
        <p className="text-xs text-muted-foreground">Your {formatINR0(s.share)} share of trip costs, by category</p>
      </CardHeader>
      <CardContent className="flex-1">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing in your share yet.</p>
        ) : (
          <>
            <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={cats.map((c) => `${c.label} ${pct(c.amount / total)}`).join(", ")}>
              {cats.map((c) => (
                <span key={c.value} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: pct(c.amount / total), minWidth: 3, background: c.color }} />
              ))}
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {cats.map((c) => (
                <li key={c.value} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  <span className="tabular-nums">{formatINR0(c.amount)}</span>
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{pct(c.amount / total)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ================================================================================================
 * Your daily share — small bar chart (no chart library), dashed line = your average per day.
 * ============================================================================================== */

function DailyCard({ s, className }: { s: PersonalSummary; className?: string }) {
  const days = s.daily;
  const max = Math.max(1, ...days.map((d) => d.share));
  const many = days.length > 8;
  // Far-apart days (only days with spend are listed) get a "…" slot so they don't look consecutive.
  const dayNum = (k: string) => Date.parse(k + "T00:00:00Z") / 86_400_000;
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <CardTitle>Your daily share</CardTitle>
        <p className="text-xs text-muted-foreground">
          {days.length ? `Average ${formatINR0(s.avgPerDay)} per day with spend` : "Nothing yet"}
        </p>
      </CardHeader>
      {/* The chart grows to fill the card when the card next to it (Recent activity) is taller. */}
      <CardContent className="flex flex-1 flex-col">
        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground">Your share per day will show here.</p>
        ) : (
          <div className="flex flex-1 flex-col">
            <div className="relative flex min-h-36 flex-1 items-end gap-1.5" role="img" aria-label={days.map((d) => `${d.label}: ${formatINR0(d.share)}`).join(", ")}>
              {days.map((d, i) => {
                const gap = i > 0 && dayNum(d.day) - dayNum(days[i - 1].day) > 1;
                return (
                  <div key={d.day} className="contents">
                    {gap && <span className="flex w-3 shrink-0 items-end justify-center pb-0.5 text-xs text-muted-foreground">…</span>}
                    <div className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${d.label}: ${formatINR(d.share)}`}>
                      <div
                        className="w-full rounded-t-[4px] transition-[height] duration-500"
                        style={{ height: d.share > 0 ? `max(3px, ${(d.share / max) * 100}%)` : 0, background: YOU, opacity: d.share > 0 ? 1 : 0 }}
                      />
                    </div>
                  </div>
                );
              })}
              {/* Your average per day with spend, measured against the bars' own height. */}
              {s.avgPerDay > 0 && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[#0f2238]/45"
                  style={{ bottom: `${Math.min(100, (s.avgPerDay / max) * 100)}%` }}
                />
              )}
            </div>
            <div className="mt-1.5 flex gap-1.5 text-[10px] text-muted-foreground">
              {days.map((d, i) => {
                const gap = i > 0 && dayNum(d.day) - dayNum(days[i - 1].day) > 1;
                const show = !many || i === 0 || i === days.length - 1 || i % 2 === 0;
                return (
                  <div key={d.day} className="contents">
                    {gap && <span className="w-3 shrink-0" />}
                    <span className="min-w-0 flex-1 truncate text-center">{show ? d.label : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ================================================================================================
 * Recent activity — what each recent row meant for you.
 * ============================================================================================== */

function RecentCard({ s, className, onNavigate }: { s: PersonalSummary; className?: string; onNavigate: (tab: string) => void }) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <CardTitle>Your recent activity</CardTitle>
        <p className="text-xs text-muted-foreground">The latest expenses you&apos;re part of</p>
      </CardHeader>
      {s.recent.length === 0 ? (
        <CardContent className="flex-1">
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        </CardContent>
      ) : (
        <ul className="flex-1 divide-y border-t">
          {s.recent.map((r) => (
            <ActivityRow key={r.expense.id} r={r} />
          ))}
        </ul>
      )}
      <div className="border-t px-5 py-3">
        <Button variant="ghost" className="h-10 gap-2 px-2 text-sm" onClick={() => onNavigate("raw")}>
          See all expenses <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </Card>
  );
}

function ActivityRow({ r }: { r: ActivityItem }) {
  const e = r.expense;
  const cat = categoryOf(e.category);
  const when = dayLabel(dayKey(e.dateTime));
  const meta =
    r.role === "paid"
      ? `${when} · you paid`
      : r.role === "share"
        ? `${when} · ${e.paidBy} paid`
        : r.role === "lent"
          ? `${when} · you lent to ${e.owedTo}`
          : `${when} · borrowed from ${e.paidBy}`;
  return (
    <li className="flex items-center gap-3 px-5 py-2.5">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.type === "trip" ? cat.color : "#a1a1aa" }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{e.description}</p>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      <div className="shrink-0 text-right">
        {r.role === "paid" ? (
          <>
            <p className="text-sm font-semibold tabular-nums">{formatINR(r.paid)}</p>
            <p className="text-[11px] tabular-nums text-muted-foreground">{r.share ? `your share ${formatINR(r.share)}` : "not in the split"}</p>
          </>
        ) : r.role === "share" ? (
          <>
            <p className="text-sm font-semibold tabular-nums">{formatINR(r.share)}</p>
            <p className="text-[11px] text-muted-foreground">your share</p>
          </>
        ) : (
          <>
            <p className={cn("text-sm font-semibold tabular-nums", r.role === "lent" ? "text-emerald-700" : "text-red-700")}>{formatINR(r.share)}</p>
            <p className="text-[11px] text-muted-foreground">{r.role === "lent" ? "you lent" : "you borrowed"}</p>
          </>
        )}
      </div>
    </li>
  );
}

/* ================================================================================================
 * Personal lends + awards
 * ============================================================================================== */

function LendsCard({ s }: { s: PersonalSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal lends</CardTitle>
        <p className="text-xs text-muted-foreground">Breakdown only · already included in Settle up</p>
      </CardHeader>
      <ul className="divide-y border-t">
        {s.owesYouPersonally.map((t) => (
          <li key={`in-${t.from}`} className="flex items-center gap-3 px-5 py-2.5 text-sm">
            <Avatar name={t.from} size={28} />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{t.from}</span> owes you
            </span>
            <span className="font-semibold tabular-nums text-emerald-700">{formatINR(t.amount)}</span>
          </li>
        ))}
        {s.youOwePersonally.map((t) => (
          <li key={`out-${t.to}`} className="flex items-center gap-3 px-5 py-2.5 text-sm">
            <Avatar name={t.to} size={28} />
            <span className="min-w-0 flex-1 truncate">
              You owe <span className="font-medium">{t.to}</span>
            </span>
            <span className="font-semibold tabular-nums text-red-700">{formatINR(t.amount)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AwardsCard({ s }: { s: PersonalSummary }) {
  const others = (winner: string) => winner.split(" & ").filter((p) => p !== s.person);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your trip awards</CardTitle>
        <p className="text-xs text-muted-foreground">Whole trip, shared on a tie</p>
      </CardHeader>
      <ul className="grid grid-cols-1 gap-2 px-5 pb-5 sm:grid-cols-2">
        {s.awards.map((a) => (
          <li key={a.title} className="flex items-start gap-3 rounded-xl border bg-gradient-to-br from-amber-50/80 to-white p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Trophy className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{a.title}</p>
              <p className="text-xs text-muted-foreground">{a.detail}</p>
              {others(a.winner).length > 0 && <p className="text-xs text-muted-foreground">Shared with {listNames(others(a.winner))}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ================================================================================================
 * Loading placeholder
 * ============================================================================================== */

function HomeSkeleton() {
  return (
    <div role="status" aria-label="Loading your summary" className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-5">
        <Skeleton className="h-72 rounded-lg lg:col-span-3" />
        <Skeleton className="h-72 rounded-lg lg:col-span-2" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
