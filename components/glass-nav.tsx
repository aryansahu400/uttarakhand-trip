"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as T from "@radix-ui/react-tabs";
import { ArrowLeftRight, ChartColumn, List, Mountain, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export const TABS = [
  { value: "add", label: "Add expense", short: "Add", icon: Plus },
  { value: "raw", label: "Expenses", short: "Expenses", icon: List },
  { value: "dash", label: "Dashboard", short: "Dashboard", icon: ChartColumn },
  { value: "settle", label: "Settlements", short: "Settle", icon: ArrowLeftRight },
] as const;

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** SVG refraction filter + Chromium detection. Render once per page. */
export function LiquidGlassDefs() {
  // Real refraction only works in Chromium (backdrop-filter: url(#svg)); elsewhere the frosted glass stays.
  useEffect(() => {
    const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands;
    if (brands?.some((b) => /chromium/i.test(b.brand))) document.documentElement.classList.add("refract");
  }, []);
  // Input modality: browsers may still match :focus-visible on a tab that was tapped (Radix moves focus
  // programmatically), which left a heavy ring around the tapped tab. `html.using-pointer` lets the nav
  // hide that ring until the keyboard is used again.
  useEffect(() => {
    const html = document.documentElement;
    const onPointer = () => html.classList.add("using-pointer");
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey && !e.altKey) html.classList.remove("using-pointer");
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);
  return (
    <svg aria-hidden="true" width="0" height="0" className="pointer-events-none absolute">
      <filter id="liquid-refract" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.03" numOctaves="2" seed="7" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
        <feDisplacementMap in="SourceGraphic" in2="soft" scale="22" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

/**
 * Liquid glass tab nav. Must be inside a Radix <Tabs> root.
 * - "bar":  floating bottom capsule (phones + tablets, hidden on lg+)
 * - "side": vertical side panel (desktop)
 */
export function GlassNav({ value, variant }: { value: string; variant: "bar" | "side" }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Slide the glass bubble under the active tab; re-measure whenever the list resizes or becomes visible.
  useIsoLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const el = list.querySelector<HTMLElement>(`[data-tab="${value}"]`);
      if (el && el.offsetWidth) setPill({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [value]);

  const side = variant === "side";

  return (
    <T.List
      ref={listRef}
      aria-label="Sections"
      className={cn(
        "glass",
        side
          ? "flex w-full flex-col gap-1 rounded-2xl p-2"
          : // Below 340px the four fixed-width tabs would touch the screen edges, so the capsule keeps the 16px
            // page gutter and the tabs share its width instead.
            "fixed bottom-[calc(12px+env(safe-area-inset-bottom))] left-1/2 z-30 flex -translate-x-1/2 items-center rounded-full p-1 max-[339px]:w-[calc(100vw-2rem)] lg:hidden"
      )}
    >
      {side && (
        <div className="flex items-center gap-2 px-3 pb-2 pt-1.5 text-xs font-medium text-[#3a4e66]">
          <Mountain className="h-3.5 w-3.5" strokeWidth={2} /> Trip menu
        </div>
      )}
      {pill && (
        <span
          aria-hidden="true"
          className={cn("glass-pill absolute left-0 top-0", side ? "rounded-xl" : "rounded-full")}
          style={{ width: pill.w, height: pill.h, transform: `translate(${pill.x}px, ${pill.y}px)` }}
        />
      )}
      {TABS.map(({ value: v, label, short, icon: Icon }) => (
        <T.Trigger
          key={v}
          value={v}
          data-tab={v}
          className={cn(
            // Active: tinted pill (globals.css .glass-pill) + darker, bolder label and thicker icon stroke.
            // Press: quick scale-down. Focus ring: keyboard only (see LiquidGlassDefs).
            "nav-trigger group relative z-10 flex select-none items-center text-[#3a4e66] outline-none transition-[color,transform] duration-150 [-webkit-tap-highlight-color:transparent] hover:text-[#0f2238] motion-safe:active:scale-95 focus-visible:ring-2 focus-visible:ring-[#0f2238]/50 focus-visible:ring-offset-0 data-[state=active]:font-semibold data-[state=active]:text-[#0f2238]",
            side
              ? "h-10 w-full gap-3 rounded-xl px-3 text-sm"
              : "h-14 w-[4.75rem] flex-col justify-center gap-0.5 rounded-full text-[11px] max-[339px]:w-auto max-[339px]:min-w-0 max-[339px]:flex-1"
          )}
        >
          <Icon
            className={cn(side ? "h-4 w-4" : "h-5 w-5", "[stroke-width:1.75] group-data-[state=active]:[stroke-width:2.4]")}
            aria-hidden="true"
          />
          {side ? label : short}
        </T.Trigger>
      ))}
    </T.List>
  );
}
