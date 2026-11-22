"use client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Sankey,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useRef, useState } from "react";
import { formatINR, formatINR0 } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Transfer } from "@/lib/balances";

// Reference palette (validated, light surface). Text never uses these.
export const C = {
  blue: "#2a78d6",
  orange: "#eb6834",
  red: "#e34948",
  track: "#ececee",
  grid: "#ececee",
  axis: "#71717a",
  surface: "#ffffff",
};

/** Round to `dp` decimals without toFixed's binary drift (1.65.toFixed(1) === "1.6"). */
const roundTo = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;

/**
 * Short INR for axes/labels: ₹950, ₹5.5K, ₹1.65L, ₹2.25Cr.
 * Lakh/crore keep up to 2 decimals (Indian readers say "1.65 lakh"); trailing zeros are dropped.
 */
export const compactINR = (n: number) => {
  const a = Math.abs(n);
  const s = n < 0 && roundTo(a, 0) !== 0 ? "-" : "";
  if (a >= 1e7) return `${s}₹${roundTo(a / 1e7, 2)}Cr`;
  if (a >= 1e5) return `${s}₹${roundTo(a / 1e5, 2)}L`;
  if (a >= 1e3) {
    const k = roundTo(a / 1e3, 1);
    // 99,960 rounds to 100K: show it as the next unit instead.
    return k >= 100 ? `${s}₹${roundTo(a / 1e5, 2)}L` : `${s}₹${k}K`;
  }
  return `${s}₹${Math.round(a)}`;
};

/**
 * "Nice" y-axis ticks from 0: steps of 1, 2, 2.5 or 5 × 10^k so labels read ₹50K, ₹1L, ₹1.5L…
 * rather than Recharts' default 0, 55K, 1.1L, 1.65L. Picks the step that gives 3–5 intervals with the
 * lowest top tick, so the bars/area use as much of the chart height as possible.
 */
export function niceTicks(max: number): number[] {
  if (!(max > 0)) return [0];
  const e = Math.floor(Math.log10(max / 4));
  let best = { step: 0, n: 0, top: Infinity };
  for (const mag of [10 ** (e - 1), 10 ** e, 10 ** (e + 1)])
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * mag;
      if (step < 1 || !Number.isInteger(step)) continue; // whole-rupee steps only: labels never repeat or round
      const n = Math.max(1, Math.ceil(max / step - 1e-9));
      const top = n * step;
      if (n >= 3 && n <= 5 && (top < best.top || (top === best.top && n < best.n))) best = { step, n, top };
    }
  // Tiny values (e.g. ₹2) can't make 3 whole-rupee intervals: fall back to ₹1 steps.
  if (!Number.isFinite(best.top)) best = { step: 1, n: Math.ceil(max), top: Math.ceil(max) };
  // i * step (not repeated +=) so float error never accumulates.
  return Array.from({ length: best.n + 1 }, (_, i) => roundTo(i * best.step, 2));
}

const axisProps = { tick: { fontSize: 11, fill: C.axis }, tickLine: false, axisLine: false } as const;

/**
 * Box for a time chart. Normally 220px tall. With `fill` it grows with its flex parent (a Panel with
 * `fill`), never below 220px; the chart is absolutely positioned so its own height never feeds back into
 * the row height (otherwise the row could grow but never shrink again on resize).
 */
function ChartBox({ fill, children }: { fill?: boolean; children: React.ReactElement }) {
  if (!fill) return <ResponsiveContainer width="100%" height={220}>{children}</ResponsiveContainer>;
  return (
    <div className="relative min-h-[220px] flex-1">
      <div className="absolute inset-0">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

type TipRow = { label: string; value: string; color?: string };
function TipBox({ title, rows }: { title?: string; rows: TipRow[] }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-sm">
      {title && <div className="mb-1 font-medium">{title}</div>}
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />}
          <span className="text-muted-foreground">{r.label}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Daily spend (bars; tap a day to filter, the other days stay visible but dimmed) ---------- */
export function DailySpendChart({
  data,
  selected,
  onSelect,
  fill,
}: {
  data: { day: string; label: string; total: number }[];
  selected: string | null;
  onSelect: (day: string) => void;
  /** Grow to the parent's height (min 220px). */
  fill?: boolean;
}) {
  const ticks = niceTicks(Math.max(0, ...data.map((d) => d.total)));
  const points = withGaps(data);
  return (
    <ChartBox fill={fill}>
      <BarChart data={points} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={12} />
        <YAxis {...axisProps} tickFormatter={compactINR} width={52} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} />
        <Tooltip
          cursor={{ fill: "rgba(0,0,0,0.04)" }}
          content={({ active, payload }) =>
            !active || !payload?.length ? null : isGap(payload[0].payload) ? (
              <TipBox rows={[{ label: gapText(payload[0].payload.skipped), value: "" }]} />
            ) : (
              <TipBox title={payload[0].payload.label} rows={[{ label: "Spent", value: formatINR(payload[0].payload.total), color: C.blue }]} />
            )
          }
        />
        <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={36} className="cursor-pointer" onClick={(d: { day?: string }) => d.day && !isGap(d) && onSelect(d.day)}>
          {points.map((d) => (
            <Cell key={d.day} fill={C.blue} fillOpacity={isGap(d) ? 0 : selected && selected !== d.day ? 0.3 : 1} />
          ))}
        </Bar>
      </BarChart>
    </ChartBox>
  );
}

/* ---------- Gap markers ----------
 * When the series skips days (span > MAX_FILLED_DAYS, e.g. an advance booking weeks before the trip),
 * insert one "…" slot between non-adjacent days so far-apart days don't look consecutive.
 * Gap slots have no bar (total null), carry the running total forward, and say how many days were skipped. */
type DayPoint = { day: string; label: string; total: number; cumulative?: number };
type GapPoint = { day: string; label: string; total: number | null; cumulative?: number; skipped?: number };
const dayNum = (k: string) => Date.parse(k + "T00:00:00Z") / 86_400_000;
export function withGaps<T extends DayPoint>(data: T[]): (T | GapPoint)[] {
  const out: (T | GapPoint)[] = [];
  data.forEach((d, i) => {
    const prev = data[i - 1];
    const skipped = prev ? Math.round(dayNum(d.day) - dayNum(prev.day)) - 1 : 0;
    if (skipped > 0) out.push({ day: `gap:${d.day}`, label: "…", total: null, cumulative: prev.cumulative, skipped });
    out.push(d);
  });
  return out;
}
const isGap = (d: { day?: string }) => !!d.day?.startsWith("gap:");
const gapText = (n?: number) => `${n} day${n === 1 ? "" : "s"} with no spending`;

/* ---------- Running total ---------- */
export function CumulativeChart({ data, fill }: { data: { day: string; label: string; total: number; cumulative: number }[]; fill?: boolean }) {
  const ticks = niceTicks(Math.max(0, ...data.map((d) => d.cumulative)));
  const points = withGaps(data);
  return (
    <ChartBox fill={fill}>
      <AreaChart data={points} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.blue} stopOpacity={0.18} />
            <stop offset="100%" stopColor={C.blue} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={12} />
        <YAxis {...axisProps} tickFormatter={compactINR} width={52} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} />
        <Tooltip
          cursor={{ stroke: C.axis, strokeDasharray: "3 3" }}
          content={({ active, payload }) =>
            !active || !payload?.length ? null : isGap(payload[0].payload) ? (
              <TipBox rows={[{ label: gapText(payload[0].payload.skipped), value: "" }]} />
            ) : (
              <TipBox title={payload[0].payload.label} rows={[{ label: "Total so far", value: formatINR(payload[0].payload.cumulative), color: C.blue }]} />
            )
          }
        />
        <Area type="monotone" dataKey="cumulative" stroke={C.blue} strokeWidth={2} fill="url(#cumFill)" activeDot={{ r: 4, stroke: C.surface, strokeWidth: 2 }} />
      </AreaChart>
    </ChartBox>
  );
}

/* ---------- Horizontal person bars (paid; click to filter) ---------- */
export function PersonBarChart({
  data,
  selected,
  onSelect,
}: {
  data: { person: string; amount: number }[];
  selected: string | null;
  onSelect: (p: string) => void;
}) {
  return (
    <ResponsiveContainer width="100%" height={data.length * 34 + 8}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barCategoryGap={6}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="person" {...axisProps} tick={{ fontSize: 12, fill: "#18181b" }} width={64} />
        <Tooltip
          cursor={{ fill: "rgba(0,0,0,0.04)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TipBox title={payload[0].payload.person} rows={[{ label: "Paid", value: formatINR(payload[0].payload.amount), color: C.blue }]} />
            ) : null
          }
        />
        <Bar dataKey="amount" radius={[0, 4, 4, 0]} className="cursor-pointer" onClick={(d: { person?: string }) => d.person && onSelect(d.person)}>
          {data.map((d) => (
            <Cell key={d.person} fill={C.blue} fillOpacity={selected && selected !== d.person ? 0.3 : 1} />
          ))}
          <LabelList dataKey="amount" position="right" formatter={(v: number) => compactINR(v)} style={{ fontSize: 11, fill: "#52525b" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---------- Net balance (diverging) ---------- */
export function NetBalanceChart({ data }: { data: { person: string; net: number }[] }) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d.net)));
  return (
    <ResponsiveContainer width="100%" height={data.length * 34 + 8}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barCategoryGap={6}>
        <XAxis type="number" hide domain={[-max, max]} />
        <YAxis type="category" dataKey="person" {...axisProps} tick={{ fontSize: 12, fill: "#18181b" }} width={64} />
        <ReferenceLine x={0} stroke="#a1a1aa" />
        <Tooltip
          cursor={{ fill: "rgba(0,0,0,0.04)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const n: number = payload[0].payload.net;
            return (
              <TipBox
                title={payload[0].payload.person}
                rows={[{ label: n > 0 ? "Gets back" : n < 0 ? "Owes" : "Settled", value: formatINR(Math.abs(n)), color: n >= 0 ? C.blue : C.red }]}
              />
            );
          }}
        />
        <Bar dataKey="net" radius={4}>
          {data.map((d) => (
            <Cell key={d.person} fill={d.net >= 0 ? C.blue : C.red} />
          ))}
          <LabelList
            dataKey="net"
            position="right"
            content={(p) => {
              const { x = 0, y = 0, width = 0, height = 0, value } = p as { x?: number; y?: number; width?: number; height?: number; value?: number };
              const v = Math.abs(Number(value)) < 0.005 ? 0 : Number(value); // never "+₹0" / "-₹0"
              const end = Math.max(Number(x), Number(x) + Number(width));
              return (
                <text x={end + 6} y={Number(y) + Number(height) / 2} dy={4} fontSize={11} fill="#52525b">
                  {v > 0 ? "+" : ""}
                  {compactINR(v)}
                </text>
              );
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---------- Donut with legend (category, direct/indirect) ---------- */
export function Donut({
  data,
  selected,
  onSelect,
  centerLabel,
  centerValue,
  stacked,
}: {
  data: { key: string; label: string; amount: number; color: string }[];
  selected?: string | null;
  onSelect?: (key: string) => void;
  centerLabel: string;
  centerValue: string;
  stacked?: boolean;
}) {
  const shown = data.filter((d) => d.amount > 0);
  const total = shown.reduce((s, d) => s + d.amount, 0);
  // Container-aware: put the legend beside the donut only when the card itself is wide enough
  // (a viewport breakpoint misfires in the 2-column grid at ~1024px and crushes the labels).
  const [box, width] = useWidth<HTMLDivElement>();
  const sideBySide = !stacked && width >= 440;
  return (
    <div ref={box} className={cn("flex items-center gap-4", sideBySide ? "flex-row" : "flex-col")}>
      <div className="relative h-[168px] w-[168px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={shown.length ? shown : [{ key: "none", label: "None", amount: 1, color: C.track }]}
              dataKey="amount"
              nameKey="label"
              innerRadius={56}
              outerRadius={80}
              paddingAngle={shown.length > 1 ? 2 : 0}
              stroke={C.surface}
              strokeWidth={2}
              isAnimationActive={false}
              onClick={(d: { key?: string }) => d.key && d.key !== "none" && onSelect?.(d.key)}
              className={onSelect ? "cursor-pointer" : ""}
            >
              {(shown.length ? shown : [{ key: "none", color: C.track }]).map((d) => (
                <Cell key={d.key} fill={d.color} fillOpacity={selected && selected !== d.key ? 0.3 : 1} />
              ))}
            </Pie>
            {shown.length > 0 && (
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <TipBox
                      rows={[
                        {
                          label: payload[0].payload.label,
                          value: `${formatINR(payload[0].payload.amount)} · ${Math.round((payload[0].payload.amount / total) * 100)}%`,
                          color: payload[0].payload.color,
                        },
                      ]}
                    />
                  ) : null
                }
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] text-muted-foreground">{centerLabel}</span>
          <span className="text-sm font-semibold tabular-nums">{centerValue}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-0.5 text-sm">
        {data.map((d) => (
          <li key={d.key}>
            <button
              type="button"
              disabled={!onSelect || d.amount === 0}
              onClick={() => onSelect?.(d.key)}
              className={cn(
                // 40px rows: a comfortable tap target on touch, with press feedback (hover only fires on a mouse).
                "flex min-h-10 w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors [-webkit-tap-highlight-color:transparent] enabled:hover:bg-muted enabled:active:bg-muted",
                selected && selected !== d.key && "opacity-40",
                d.amount === 0 && "opacity-40"
              )}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
              <span className="min-w-[5rem] flex-1 truncate" title={d.label}>{d.label}</span>
              <span className="shrink-0 tabular-nums">{formatINR0(d.amount)}</span>
              <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{total ? `${Math.round((d.amount / total) * 100)}%` : "–"}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Width of an element, kept up to date with a ResizeObserver (0 until mounted). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width); // measure now; the observer may not deliver until the next frame
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/* ---------- Half-circle gauge ---------- */
export function Gauge({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="relative mx-auto h-[120px] w-[220px]">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={[{ v: pct }, { v: 1 - pct }]}
            dataKey="v"
            startAngle={180}
            endAngle={0}
            cy={110}
            innerRadius={78}
            outerRadius={100}
            stroke="none"
            isAnimationActive={false}
          >
            <Cell fill={C.blue} />
            <Cell fill={C.track} />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="text-2xl font-semibold tabular-nums">{Math.round(pct * 100)}%</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

/* ---------- Money flow (who pays whom) ---------- */

/**
 * Each node label is two lines centred on the node: the name (12px, baseline 2px above centre) and the
 * amount (11px, baseline 12px below centre), so it spans about 14px above to 16px below the centre.
 * Recharts keeps at least `nodePadding` between neighbouring nodes in a column (resolveCollisions), so
 * neighbouring label centres are always at least SANKEY_GAP apart and labels can never overlap, however
 * lopsided the amounts are.
 */
const SANKEY_LABEL_ABOVE = 14;
const SANKEY_LABEL_BELOW = 16;
const SANKEY_GAP = SANKEY_LABEL_ABOVE + SANKEY_LABEL_BELOW + 4;
/** Minimum drawn height per node, so the bars stay readable once the gaps are taken out. */
const SANKEY_MIN_NODE = 26;
const SANKEY_MARGIN = { top: SANKEY_LABEL_ABOVE + 4, right: 96, bottom: SANKEY_LABEL_BELOW + 6, left: 96 };

/** Chart height for a column of `n` nodes: room for every gap plus a readable bar per node. */
export function moneyFlowHeight(n: number) {
  const inner = Math.max(0, n - 1) * SANKEY_GAP + Math.max(1, n) * SANKEY_MIN_NODE;
  return Math.max(200, inner + SANKEY_MARGIN.top + SANKEY_MARGIN.bottom);
}

export function MoneyFlow({ transfers }: { transfers: Transfer[] }) {
  if (!transfers.length) return <p className="py-6 text-center text-sm text-muted-foreground">Everyone is settled up.</p>;
  const payers = [...new Set(transfers.map((t) => t.from))];
  const receivers = [...new Set(transfers.map((t) => t.to))];
  const nodes = [...payers.map((name) => ({ name, side: "pay" })), ...receivers.map((name) => ({ name, side: "get" }))];
  const links = transfers.map((t) => ({ source: payers.indexOf(t.from), target: payers.length + receivers.indexOf(t.to), value: t.amount }));
  const height = moneyFlowHeight(Math.max(payers.length, receivers.length));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <Sankey
        data={{ nodes, links }}
        nodePadding={SANKEY_GAP}
        nodeWidth={10}
        margin={SANKEY_MARGIN}
        link={{ stroke: C.blue, strokeOpacity: 0.18 }}
        node={(props: { x: number; y: number; width: number; height: number; payload: { name: string; side: string; value: number } }) => {
          const { x, y, width, height, payload } = props;
          const left = payload.side === "pay";
          return (
            <g>
              <rect x={x} y={y} width={width} height={height} rx={2} fill={left ? C.red : C.blue} />
              <text x={left ? x - 8 : x + width + 8} y={y + height / 2} dy={-2} textAnchor={left ? "end" : "start"} fontSize={12} fill="#18181b">
                {payload.name}
              </text>
              <text x={left ? x - 8 : x + width + 8} y={y + height / 2} dy={12} textAnchor={left ? "end" : "start"} fontSize={11} fill="#71717a">
                {compactINR(payload.value)}
              </text>
            </g>
          );
        }}
      >
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { payload?: { source?: { name: string }; target?: { name: string }; value?: number; name?: string } };
            const d = p.payload;
            if (d?.source && d?.target) return <TipBox rows={[{ label: `${d.source.name} → ${d.target.name}`, value: formatINR(d.value ?? 0) }]} />;
            return null;
          }}
        />
      </Sankey>
    </ResponsiveContainer>
  );
}
