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
import { formatINR } from "@/lib/format";
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

export const compactINR = (n: number) => {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1e7) return `${s}₹${+(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${s}₹${+(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${s}₹${+(a / 1e3).toFixed(1)}K`;
  return `${s}₹${Math.round(a)}`;
};

const axisProps = { tick: { fontSize: 11, fill: C.axis }, tickLine: false, axisLine: false } as const;

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

/* ---------- Daily spend (bars, click a day to filter) ---------- */
export function DailySpendChart({
  data,
  selected,
  onSelect,
}: {
  data: { day: string; label: string; total: number }[];
  selected: string | null;
  onSelect: (day: string) => void;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={12} />
        <YAxis {...axisProps} tickFormatter={compactINR} width={52} />
        <Tooltip
          cursor={{ fill: "rgba(0,0,0,0.04)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TipBox title={payload[0].payload.label} rows={[{ label: "Spent", value: formatINR(payload[0].payload.total), color: C.blue }]} />
            ) : null
          }
        />
        <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={36} className="cursor-pointer" onClick={(d: { day?: string }) => d.day && onSelect(d.day)}>
          {data.map((d) => (
            <Cell key={d.day} fill={C.blue} fillOpacity={selected && selected !== d.day ? 0.3 : 1} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---------- Running total ---------- */
export function CumulativeChart({ data }: { data: { label: string; cumulative: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.blue} stopOpacity={0.18} />
            <stop offset="100%" stopColor={C.blue} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={12} />
        <YAxis {...axisProps} tickFormatter={compactINR} width={52} />
        <Tooltip
          cursor={{ stroke: C.axis, strokeDasharray: "3 3" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TipBox title={payload[0].payload.label} rows={[{ label: "Total so far", value: formatINR(payload[0].payload.cumulative), color: C.blue }]} />
            ) : null
          }
        />
        <Area type="monotone" dataKey="cumulative" stroke={C.blue} strokeWidth={2} fill="url(#cumFill)" activeDot={{ r: 4, stroke: C.surface, strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
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
              const v = Number(value);
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
  return (
    <div className={cn("flex flex-col items-center gap-4", !stacked && "sm:flex-row")}>
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
      <ul className="w-full min-w-0 space-y-1 text-sm">
        {data.map((d) => (
          <li key={d.key}>
            <button
              type="button"
              disabled={!onSelect || d.amount === 0}
              onClick={() => onSelect?.(d.key)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-1.5 py-1 text-left enabled:hover:bg-muted",
                selected && selected !== d.key && "opacity-40",
                d.amount === 0 && "opacity-40"
              )}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
              <span className="truncate">{d.label}</span>
              <span className="ml-auto tabular-nums">{formatINR(d.amount)}</span>
              <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{total ? `${Math.round((d.amount / total) * 100)}%` : "–"}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
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
export function MoneyFlow({ transfers }: { transfers: Transfer[] }) {
  if (!transfers.length) return <p className="py-6 text-center text-sm text-muted-foreground">Everyone is settled up.</p>;
  const payers = [...new Set(transfers.map((t) => t.from))];
  const receivers = [...new Set(transfers.map((t) => t.to))];
  const nodes = [...payers.map((name) => ({ name, side: "pay" })), ...receivers.map((name) => ({ name, side: "get" }))];
  const links = transfers.map((t) => ({ source: payers.indexOf(t.from), target: payers.length + receivers.indexOf(t.to), value: t.amount }));
  const height = Math.max(200, Math.max(payers.length, receivers.length) * 56);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <Sankey
        data={{ nodes, links }}
        nodePadding={14}
        nodeWidth={10}
        margin={{ top: 12, right: 96, bottom: 24, left: 96 }}
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
